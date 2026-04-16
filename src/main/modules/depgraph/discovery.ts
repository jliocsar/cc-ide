import { spawn } from 'node:child_process'

/**
 * Run `git ls-files -z` in the given workspace. Returns POSIX-normalized
 * repo-relative paths. Uses NUL separators so paths with whitespace are safe.
 * Shelling out instead of adding a gitignore-aware globber: workspaces are
 * already gated on `git rev-parse --is-inside-work-tree`.
 */
export async function gitLsFiles(workspacePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const child = spawn('git', ['-C', workspacePath, 'ls-files', '-z'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git ls-files exited ${code}: ${stderr.trim()}`))
        return
      }
      const buf = Buffer.concat(chunks)
      if (buf.length === 0) {
        resolve([])
        return
      }
      const text = buf.toString('utf8')
      const parts = text.split('\0').filter((s) => s.length > 0)
      resolve(parts)
    })
  })
}
