import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFile } from './fs-atomic'

const CANVAS_DIR = join(homedir(), '.cc-ide', 'canvas')

function fileFor(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(CANVAS_DIR, `${safe}.json`)
}

export async function loadCanvas(workspaceId: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(fileFor(workspaceId), 'utf8')
    return JSON.parse(raw)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function saveCanvas(workspaceId: string, state: unknown): Promise<void> {
  await fs.mkdir(CANVAS_DIR, { recursive: true })
  await atomicWriteFile(fileFor(workspaceId), JSON.stringify(state, null, 2))
}
