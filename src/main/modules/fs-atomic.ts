import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'

/**
 * Write `data` to `target` atomically via a UUID-suffixed tmp file + rename.
 * Concurrent writers to the same target get distinct tmp paths, so each
 * rename succeeds — last writer wins at the target path. On failure, the
 * tmp file is best-effort removed and the original error rethrown.
 */
export async function atomicWriteFile(
  target: string,
  data: string | Uint8Array,
): Promise<void> {
  const tmp = `${target}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, target)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
