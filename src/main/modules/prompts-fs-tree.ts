import { randomUUID } from 'node:crypto'
import { type Dirent, promises as fs } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'

export type PromptFile = {
  kind: 'file'
  name: string
  relPath: string
  size: number
  updatedAt: number
}

export type PromptDir = {
  kind: 'dir'
  name: string
  relPath: string
  children: PromptNode[]
}

export type PromptNode = PromptFile | PromptDir

function promptsRoot(workspacePath: string): string {
  if (!workspacePath) throw new Error('workspacePath is required')
  return join(workspacePath, '.cc-ide', 'prompts')
}

function resolveSafe(workspacePath: string, relPath: string): string {
  if (typeof relPath !== 'string') throw new Error('relPath must be a string')
  if (relPath.includes('\0')) throw new Error('relPath contains null byte')
  const normalized = posix.normalize(relPath.replace(/\\/g, '/'))
  if (normalized.startsWith('/')) throw new Error(`relPath must not be absolute: ${relPath}`)
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`relPath escapes prompts root: ${relPath}`)
  }
  const root = promptsRoot(workspacePath)
  const platformRel = normalized === '.' ? '' : normalized.split('/').join(sep)
  const abs = resolve(root, platformRel)
  const rootResolved = resolve(root)
  if (abs !== rootResolved && !abs.startsWith(rootResolved + sep)) {
    throw new Error(`relPath escapes prompts root: ${relPath}`)
  }
  return abs
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true })
}

async function readDirRecursive(absDir: string, relDir: string): Promise<PromptNode[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(absDir, { withFileTypes: true })
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const dirs: PromptDir[] = []
  const files: PromptFile[] = []
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

export async function listTree(workspacePath: string): Promise<PromptDir> {
  const root = promptsRoot(workspacePath)
  await ensureDir(root)
  const children = await readDirRecursive(root, '')
  return { kind: 'dir', name: '', relPath: '', children }
}

export async function readPrompt(workspacePath: string, relPath: string): Promise<string> {
  const abs = resolveSafe(workspacePath, relPath)
  return fs.readFile(abs, 'utf8')
}

export async function writePrompt(
  workspacePath: string,
  relPath: string,
  content: string,
): Promise<void> {
  const abs = resolveSafe(workspacePath, relPath)
  await ensureDir(join(abs, '..'))
  const tmp = `${abs}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, abs)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}

export async function createPrompt(workspacePath: string, relPath: string): Promise<void> {
  if (!relPath || !relPath.trim()) throw new Error('relPath is required')
  if (!/\.md$/i.test(relPath)) throw new Error(`prompt filename must end in .md: ${relPath}`)
  const abs = resolveSafe(workspacePath, relPath)
  await ensureDir(join(abs, '..'))
  try {
    const handle = await fs.open(abs, 'wx')
    await handle.close()
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`prompt already exists: ${relPath}`)
    }
    throw err
  }
}

export async function createFolder(workspacePath: string, relPath: string): Promise<void> {
  if (!relPath || !relPath.trim()) throw new Error('relPath is required')
  const abs = resolveSafe(workspacePath, relPath)
  const stat = await fs.stat(abs).catch(() => null)
  if (stat && stat.isFile()) throw new Error(`path is a file, not a folder: ${relPath}`)
  if (stat && stat.isDirectory()) throw new Error(`folder already exists: ${relPath}`)
  await fs.mkdir(abs, { recursive: true })
}

export async function rename(
  workspacePath: string,
  fromRel: string,
  toRel: string,
  opts?: { overwrite?: boolean },
): Promise<void> {
  if (!fromRel || !toRel) throw new Error('both fromRel and toRel are required')
  if (fromRel === toRel) return
  const fromAbs = resolveSafe(workspacePath, fromRel)
  const toAbs = resolveSafe(workspacePath, toRel)
  if (toRel === fromRel || toRel.startsWith(fromRel + '/')) {
    throw new Error('cannot move a folder into itself or one of its descendants')
  }
  const existing = await fs.stat(toAbs).catch(() => null)
  if (existing) {
    if (!opts?.overwrite) throw new Error(`destination already exists: ${toRel}`)
    if (existing.isDirectory()) throw new Error(`cannot overwrite a folder: ${toRel}`)
  }
  const fromStat = await fs.stat(fromAbs).catch(() => null)
  if (fromStat?.isFile() && !/\.md$/i.test(toRel)) {
    throw new Error(`prompt filename must end in .md: ${toRel}`)
  }
  await ensureDir(join(toAbs, '..'))
  await fs.rename(fromAbs, toAbs)
}

export async function deletePath(workspacePath: string, relPath: string): Promise<void> {
  if (!relPath || relPath === '') throw new Error('relPath is required')
  const abs = resolveSafe(workspacePath, relPath)
  await fs.rm(abs, { recursive: true, force: true })
}
