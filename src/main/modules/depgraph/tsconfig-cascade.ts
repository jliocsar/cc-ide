import { promises as fs } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

export interface CascadeEntry {
  tsconfigPath: string
  /** Directory containing the tsconfig — used for nearest-ancestor lookup. */
  dir: string
  options: ts.CompilerOptions
}

export class TsconfigCascade {
  private entries: CascadeEntry[] = []

  /** Paths of tsconfigs we've seen, by absolute path, for invalidation. */
  private readonly byPath = new Map<string, CascadeEntry>()

  /** Load every tsconfig in the workspace. Sorted longest-dir-first for fast lookup. */
  async load(workspacePath: string, relTsconfigs: string[]): Promise<void> {
    const entries: CascadeEntry[] = []
    for (const rel of relTsconfigs) {
      const abs = resolve(workspacePath, rel)
      const entry = await this.parseOne(abs)
      if (entry) entries.push(entry)
    }
    entries.sort((a, b) => b.dir.length - a.dir.length)
    this.entries = entries
    this.byPath.clear()
    for (const entry of entries) this.byPath.set(entry.tsconfigPath, entry)
  }

  /** Re-parse a single tsconfig (called when watcher fires on a tsconfig file). */
  async reload(absTsconfigPath: string): Promise<void> {
    const entry = await this.parseOne(absTsconfigPath)
    if (!entry) {
      // tsconfig removed or unparseable — drop it
      this.byPath.delete(absTsconfigPath)
    } else {
      this.byPath.set(absTsconfigPath, entry)
    }
    this.entries = [...this.byPath.values()].sort((a, b) => b.dir.length - a.dir.length)
  }

  /** Returns the nearest ancestor tsconfig for an absolute file path, or null. */
  nearest(absFilePath: string): CascadeEntry | null {
    const filePath = resolve(absFilePath)
    for (const entry of this.entries) {
      if (isDescendant(entry.dir, filePath)) return entry
    }
    return null
  }

  /** List of all loaded tsconfig absolute paths (used for watcher filtering). */
  tsconfigPaths(): string[] {
    return [...this.byPath.keys()]
  }

  private async parseOne(absTsconfigPath: string): Promise<CascadeEntry | null> {
    let raw: string
    try {
      raw = await fs.readFile(absTsconfigPath, 'utf8')
    } catch {
      return null
    }
    const jsonResult = ts.parseConfigFileTextToJson(absTsconfigPath, raw)
    if (jsonResult.error) return null
    const parsed = ts.parseJsonConfigFileContent(
      jsonResult.config ?? {},
      ts.sys,
      dirname(absTsconfigPath),
      /*existingOptions*/ undefined,
      absTsconfigPath,
    )
    return {
      tsconfigPath: absTsconfigPath,
      dir: dirname(absTsconfigPath),
      options: parsed.options,
    }
  }
}

function isDescendant(parentDir: string, childPath: string): boolean {
  const rel = relative(parentDir, childPath)
  if (rel === '') return true
  if (rel.startsWith('..')) return false
  if (rel.startsWith(sep + '..')) return false
  return !rel.startsWith('..' + sep)
}

/** Find all tsconfig*.json paths among a list of workspace-relative files. */
export function filterTsconfigCandidates(relPaths: string[]): string[] {
  return relPaths.filter((p) => {
    const base = p.split('/').pop() ?? ''
    return /^tsconfig.*\.json$/i.test(base)
  })
}

export { join as joinPath }
