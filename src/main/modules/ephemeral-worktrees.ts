import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { atomicWriteFile } from './fs-atomic'

export type EphemeralEntry = {
  workspaceId: string
  worktreePath: string
  branch: string
  base: string
  windowName: string
  createdAt: number
}

type Registry = { version: 1; entries: EphemeralEntry[] }

let rootOverride: string | null = null
export function __setRootForTests(path: string | null): void {
  rootOverride = path
}

function root(): string {
  return rootOverride ?? join(homedir(), '.cc-ide', 'ephemeral-worktrees')
}

function fileFor(workspaceId: string): string {
  return join(root(), `${workspaceId}.json`)
}

async function readRegistry(workspaceId: string): Promise<Registry> {
  try {
    const raw = await fs.readFile(fileFor(workspaceId), 'utf8')
    const parsed = JSON.parse(raw) as Registry
    if (parsed && parsed.version === 1 && Array.isArray(parsed.entries)) return parsed
    return { version: 1, entries: [] }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] }
    console.error(`[ephemeral-worktrees] read failed for ${workspaceId}:`, err)
    return { version: 1, entries: [] }
  }
}

async function writeRegistry(workspaceId: string, reg: Registry): Promise<void> {
  const f = fileFor(workspaceId)
  await fs.mkdir(dirname(f), { recursive: true })
  await atomicWriteFile(f, JSON.stringify(reg, null, 2))
}

export async function add(entry: EphemeralEntry): Promise<void> {
  const reg = await readRegistry(entry.workspaceId)
  reg.entries = reg.entries.filter((e) => e.worktreePath !== entry.worktreePath)
  reg.entries.push(entry)
  await writeRegistry(entry.workspaceId, reg)
}

export async function renameWindow(
  workspaceId: string,
  oldWindowName: string,
  newWindowName: string,
): Promise<void> {
  const reg = await readRegistry(workspaceId)
  let changed = false
  reg.entries = reg.entries.map((e) => {
    if (e.windowName !== oldWindowName) return e
    changed = true
    return { ...e, windowName: newWindowName }
  })
  if (changed) await writeRegistry(workspaceId, reg)
}

export async function remove(workspaceId: string, worktreePath: string): Promise<void> {
  const reg = await readRegistry(workspaceId)
  const before = reg.entries.length
  reg.entries = reg.entries.filter((e) => e.worktreePath !== worktreePath)
  if (reg.entries.length !== before) await writeRegistry(workspaceId, reg)
}

export async function list(workspaceId: string): Promise<EphemeralEntry[]> {
  return (await readRegistry(workspaceId)).entries
}

export async function findByWindow(
  workspaceId: string,
  windowName: string,
): Promise<EphemeralEntry | null> {
  const entries = (await readRegistry(workspaceId)).entries
  return entries.find((e) => e.windowName === windowName) ?? null
}

export async function findByPath(
  workspaceId: string,
  worktreePath: string,
): Promise<EphemeralEntry | null> {
  const entries = (await readRegistry(workspaceId)).entries
  return entries.find((e) => e.worktreePath === worktreePath) ?? null
}
