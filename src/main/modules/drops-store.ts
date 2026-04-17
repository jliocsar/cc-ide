import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type DropEntryDTO, dropEntrySchema } from '@shared/ipc'
import { z } from 'zod'

const DEFAULT_DATA_DIR = join(homedir(), '.cc-ide', 'drops')
let DATA_DIR = DEFAULT_DATA_DIR

/** Test-only: override the storage root. */
export function __setDataDirForTests(path: string): void {
  DATA_DIR = path
}

const fileSchema = z.object({
  version: z.literal(1),
  entries: z.array(dropEntrySchema),
})

function pathFor(workspaceId: string): string {
  return join(DATA_DIR, `${workspaceId}.json`)
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

export async function listDrops(workspaceId: string): Promise<DropEntryDTO[]> {
  try {
    const raw = await fs.readFile(pathFor(workspaceId), 'utf8')
    const parsed = fileSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return []
    return parsed.data.entries
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }
}

export async function writeDrops(workspaceId: string, entries: DropEntryDTO[]): Promise<void> {
  await ensureDir()
  const target = pathFor(workspaceId)
  const tmp = `${target}.${randomUUID()}.tmp`
  const body = JSON.stringify({ version: 1, entries }, null, 2)
  try {
    await fs.writeFile(tmp, body, 'utf8')
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
