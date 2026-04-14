import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { z } from 'zod'
import { workspaceSchema, type Workspace } from '@shared/ipc'

const DATA_DIR = join(homedir(), '.cc-ide')
const REGISTRY_PATH = join(DATA_DIR, 'workspaces.json')

const registryFileSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(workspaceSchema),
})

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readRegistry(): Promise<Workspace[]> {
  try {
    const raw = await fs.readFile(REGISTRY_PATH, 'utf8')
    const parsed = registryFileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.workspaces
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function writeRegistry(workspaces: Workspace[]): Promise<void> {
  await ensureDir()
  const tmp = REGISTRY_PATH + '.tmp'
  const body = JSON.stringify({ version: 1, workspaces }, null, 2)
  await fs.writeFile(tmp, body, 'utf8')
  await fs.rename(tmp, REGISTRY_PATH)
}

async function isGitRepo(path: string): Promise<boolean> {
  return new Promise((res) => {
    const child = spawn('git', ['-C', path, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
    child.on('error', () => res(false))
    child.on('exit', (code) => res(code === 0))
  })
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return readRegistry()
}

export async function addWorkspace(path: string): Promise<Workspace> {
  const abs = resolve(path)
  const ok = await isGitRepo(abs)
  if (!ok) throw new Error(`Not a git repository: ${abs}`)
  const existing = await readRegistry()
  const already = existing.find((w) => w.path === abs)
  if (already) return already
  const workspace: Workspace = {
    id: randomUUID(),
    name: basename(abs),
    path: abs,
    addedAt: Date.now(),
  }
  await writeRegistry([...existing, workspace])
  return workspace
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const all = await readRegistry()
  return all.find((w) => w.id === id) ?? null
}
