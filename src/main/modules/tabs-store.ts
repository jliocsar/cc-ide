import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

let root = join(homedir(), '.cc-ide', 'tabs')

export function __setRootForTests(path: string): void {
  root = path
}

function fileFor(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(root, `${safe}.json`)
}

export async function loadTabs(workspaceId: string): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(fileFor(workspaceId), 'utf8')
    return JSON.parse(raw)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function saveTabs(workspaceId: string, state: unknown): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  const target = fileFor(workspaceId)
  // See canvas-store.saveCanvas: unique tmp suffix avoids the
  // concurrent-save-rename ENOENT race on workspace switch.
  const tmp = `${target}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
