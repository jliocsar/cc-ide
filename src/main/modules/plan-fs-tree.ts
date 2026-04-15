import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { posix } from 'node:path'

export type PlanFile = {
  kind: 'file'
  name: string
  relPath: string
  size: number
  updatedAt: number
}

export type PlanDir = {
  kind: 'dir'
  name: string
  relPath: string
  children: PlanNode[]
}

export type PlanNode = PlanFile | PlanDir

let plansBaseOverride: string | null = null

export function __setRootForTests(path: string | null): void {
  plansBaseOverride = path
}

function plansRoot(): string {
  return plansBaseOverride ?? join(homedir(), '.cc-ide', 'plans')
}

function workspaceRoot(workspaceId: string): string {
  if (!workspaceId || workspaceId.includes('/') || workspaceId.includes('\\')) {
    throw new Error(`invalid workspaceId: ${workspaceId}`)
  }
  return join(plansRoot(), workspaceId)
}

function resolveSafe(workspaceId: string, relPath: string): string {
  if (typeof relPath !== 'string') throw new Error('relPath must be a string')
  if (relPath.includes('\0')) throw new Error('relPath contains null byte')
  const normalized = posix.normalize(relPath.replace(/\\/g, '/'))
  if (normalized.startsWith('/')) throw new Error(`relPath must not be absolute: ${relPath}`)
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`relPath escapes workspace root: ${relPath}`)
  }
  const root = workspaceRoot(workspaceId)
  const platformRel = normalized === '.' ? '' : normalized.split('/').join(sep)
  const abs = resolve(root, platformRel)
  const rootResolved = resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) {
    throw new Error(`relPath escapes workspace root: ${relPath}`)
  }
  return abs
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

async function readDirRecursive(absDir: string, relDir: string): Promise<PlanNode[]> {
  let entries
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const dirs: PlanDir[] = []
  const files: PlanFile[] = []
  for (const entry of entries) {
    const childAbs = join(absDir, entry.name)
    const childRel = relDir === '' ? entry.name : `${relDir}/${entry.name}`
    if (entry.isDirectory()) {
      const children = await readDirRecursive(childAbs, childRel)
      dirs.push({ kind: 'dir', name: entry.name, relPath: childRel, children })
    } else if (entry.isFile()) {
      const stat = await fs.stat(childAbs)
      files.push({
        kind: 'file',
        name: entry.name,
        relPath: childRel,
        size: stat.size,
        updatedAt: stat.mtimeMs,
      })
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

export async function listTree(workspaceId: string): Promise<PlanDir> {
  const root = workspaceRoot(workspaceId)
  await ensureDir(root)
  const children = await readDirRecursive(root, '')
  return { kind: 'dir', name: workspaceId, relPath: '', children }
}

export async function readPlan(workspaceId: string, relPath: string): Promise<string> {
  const abs = resolveSafe(workspaceId, relPath)
  return fs.readFile(abs, 'utf8')
}

export async function writePlan(workspaceId: string, relPath: string, content: string): Promise<void> {
  const abs = resolveSafe(workspaceId, relPath)
  await ensureDir(join(abs, '..'))
  const tmp = abs + '.tmp'
  await fs.writeFile(tmp, content, 'utf8')
  await fs.rename(tmp, abs)
}

export async function createPlan(workspaceId: string, relPath: string): Promise<void> {
  if (!relPath || !relPath.trim()) throw new Error('relPath is required')
  const withExt = relPath.endsWith('.md') ? relPath : `${relPath}.md`
  const abs = resolveSafe(workspaceId, withExt)
  await ensureDir(join(abs, '..'))
  try {
    const handle = await fs.open(abs, 'wx')
    await handle.close()
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`plan already exists: ${withExt}`)
    }
    throw err
  }
}

export async function createFolder(workspaceId: string, relPath: string): Promise<void> {
  if (!relPath || !relPath.trim()) throw new Error('relPath is required')
  const abs = resolveSafe(workspaceId, relPath)
  try {
    const stat = await fs.stat(abs).catch(() => null)
    if (stat && stat.isFile()) throw new Error(`path is a file, not a folder: ${relPath}`)
    if (stat && stat.isDirectory()) throw new Error(`folder already exists: ${relPath}`)
    await fs.mkdir(abs, { recursive: true })
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error(String(err))
  }
}

export async function rename(
  workspaceId: string,
  fromRel: string,
  toRel: string,
  opts?: { overwrite?: boolean },
): Promise<void> {
  if (!fromRel || !toRel) throw new Error('both fromRel and toRel are required')
  if (fromRel === toRel) return
  const fromAbs = resolveSafe(workspaceId, fromRel)
  const toAbs = resolveSafe(workspaceId, toRel)
  // Guard: moving a folder into itself or one of its descendants.
  if (toRel === fromRel || toRel.startsWith(fromRel + '/')) {
    throw new Error(`cannot move a folder into itself or one of its descendants`)
  }
  const existing = await fs.stat(toAbs).catch(() => null)
  if (existing) {
    if (!opts?.overwrite) throw new Error(`destination already exists: ${toRel}`)
    if (existing.isDirectory()) throw new Error(`cannot overwrite a folder: ${toRel}`)
  }
  await ensureDir(join(toAbs, '..'))
  await fs.rename(fromAbs, toAbs)
}

export async function deletePath(workspaceId: string, relPath: string): Promise<void> {
  if (!relPath || relPath === '') throw new Error('relPath is required')
  const abs = resolveSafe(workspaceId, relPath)
  await fs.rm(abs, { recursive: true, force: true })
}
