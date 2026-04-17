import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export type DiffStage = 'staged' | 'unstaged'

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked'

export type ChangedFile = {
  path: string
  oldPath: string | null
  status: FileStatus
  stage: DiffStage
  additions: number
  deletions: number
  binary: boolean
}

export type DiffHunkLine = {
  kind: 'context' | 'add' | 'remove'
  oldLineNo: number | null
  newLineNo: number | null
  content: string
}

export type DiffHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: DiffHunkLine[]
}

export type FileDiff = {
  file: ChangedFile
  hunks: DiffHunk[]
  binary: boolean
  tooLarge: boolean
}

const SIZE_LIMIT = 5 * 1024 * 1024 // 5 MB
const LINE_LIMIT = 20_000

function runGit(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    let byteCount = 0
    let tooLarge = false

    child.stdout.on('data', (d: Buffer) => {
      byteCount += d.length
      if (byteCount > SIZE_LIMIT) {
        tooLarge = true
        child.kill()
        return
      }
      chunks.push(d)
    })
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', () => resolve({ code: -1, stdout: '', stderr: 'git not found' }))
    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf8')
      resolve({ code: tooLarge ? -2 : (code ?? -1), stdout, stderr })
    })
  })
}

// Parses `git status --porcelain=v1 -z` output (NUL-delimited)
function parsePortcelain(raw: string): Array<{
  xy: string
  path: string
  origPath: string | null
}> {
  // porcelain v1 -z: each entry is `XY path` or `XY new\0old` for renames
  // fields separated by NUL, each entry is 3 chars (XY + space) + path
  const entries: Array<{ xy: string; path: string; origPath: string | null }> = []
  const parts = raw.split('\0')
  let i = 0
  while (i < parts.length) {
    const entry = parts[i]
    if (!entry || entry.length < 3) {
      i++
      continue
    }
    const xy = entry.slice(0, 2)
    const path = entry.slice(3)
    if (!path) {
      i++
      continue
    }
    // Renames/copies in porcelain v1 with -z: the orig path is the next NUL token
    const x = xy[0] ?? ' '
    const y = xy[1] ?? ' '
    const needsOrig = x === 'R' || x === 'C' || y === 'R' || y === 'C'
    if (needsOrig) {
      const origPath = parts[i + 1] ?? null
      entries.push({ xy, path, origPath })
      i += 2
    } else {
      entries.push({ xy, path, origPath: null })
      i++
    }
  }
  return entries
}

// Parses `git diff --numstat -z` output
function parseNumstat(
  raw: string,
): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const map = new Map<string, { additions: number; deletions: number; binary: boolean }>()
  if (!raw.trim()) return map
  // numstat -z: `<add>\t<del>\t<path>\0` or `<add>\t<del>\t<old>\0<new>\0` for renames
  // With -z, fields within each record are NUL-separated; entries separated by NUL too
  // Format: add TAB del TAB path NUL (or add TAB del TAB NUL old NUL new NUL for renames)
  const parts = raw.split('\0').filter((p) => p.length > 0)
  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (!part) {
      i++
      continue
    }
    const tabIdx = part.indexOf('\t')
    if (tabIdx === -1) {
      i++
      continue
    }
    const tab2 = part.indexOf('\t', tabIdx + 1)
    if (tab2 === -1) {
      i++
      continue
    }
    const addStr = part.slice(0, tabIdx)
    const delStr = part.slice(tabIdx + 1, tab2)
    const pathPart = part.slice(tab2 + 1)
    const binary = addStr === '-' || delStr === '-'
    const additions = binary ? 0 : parseInt(addStr, 10)
    const deletions = binary ? 0 : parseInt(delStr, 10)

    if (pathPart === '') {
      // rename: path is split across next two NUL tokens
      const oldPath = parts[i + 1]
      const newPath = parts[i + 2]
      if (newPath) map.set(newPath, { additions, deletions, binary })
      if (oldPath) map.set(oldPath, { additions, deletions, binary })
      i += 3
    } else {
      map.set(pathPart, { additions, deletions, binary })
      i++
    }
  }
  return map
}

export async function listChangedFiles(worktreePath: string): Promise<ChangedFile[]> {
  const [statusResult, stagedNumstatResult, unstagedNumstatResult] = await Promise.all([
    runGit(['status', '--porcelain=v1', '-z', '--untracked-files=all'], worktreePath),
    runGit(['diff', '--cached', '--numstat', '-z'], worktreePath),
    runGit(['diff', '--numstat', '-z'], worktreePath),
  ])

  const statusEntries = parsePortcelain(statusResult.stdout)
  const stagedCounts = parseNumstat(stagedNumstatResult.stdout)
  const unstagedCounts = parseNumstat(unstagedNumstatResult.stdout)

  const files: ChangedFile[] = []

  for (const entry of statusEntries) {
    const x = entry.xy[0] ?? ' ' // index (staged) status
    const y = entry.xy[1] ?? ' ' // working tree (unstaged) status

    // Staged entry
    if (x !== ' ' && x !== '?') {
      const counts = stagedCounts.get(entry.path) ?? { additions: 0, deletions: 0, binary: false }
      files.push({
        path: entry.path,
        oldPath: entry.origPath,
        status: xyToStatus(x),
        stage: 'staged',
        additions: counts.additions,
        deletions: counts.deletions,
        binary: counts.binary,
      })
    }

    // Unstaged / untracked entry
    if (y !== ' ') {
      if (y === '?') {
        files.push({
          path: entry.path,
          oldPath: null,
          status: 'untracked',
          stage: 'unstaged',
          additions: 0,
          deletions: 0,
          binary: false,
        })
      } else {
        const counts = unstagedCounts.get(entry.path) ?? {
          additions: 0,
          deletions: 0,
          binary: false,
        }
        files.push({
          path: entry.path,
          oldPath: null, // unstaged renames not common; origPath is for staged index
          status: xyToStatus(y),
          stage: 'unstaged',
          additions: counts.additions,
          deletions: counts.deletions,
          binary: counts.binary,
        })
      }
    }
  }

  return files
}

function xyToStatus(code: string): FileStatus {
  switch (code) {
    case 'A':
      return 'added'
    case 'M':
      return 'modified'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    default:
      return 'modified'
  }
}

// Hunk header regex: @@ -oldStart[,oldLines] +newStart[,newLines] @@
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function parseHunks(text: string): DiffHunk[] {
  const lines = text.split('\n')
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const raw of lines) {
    if (raw.startsWith('@@ ')) {
      const m = HUNK_HEADER_RE.exec(raw)
      if (!m) continue
      const oldStart = parseInt(m[1] ?? '1', 10)
      const oldLines = m[2] !== undefined ? parseInt(m[2], 10) : 1
      const newStart = parseInt(m[3] ?? '1', 10)
      const newLines = m[4] !== undefined ? parseInt(m[4], 10) : 1
      current = { oldStart, oldLines, newStart, newLines, header: raw, lines: [] }
      hunks.push(current)
      oldLine = oldStart
      newLine = newStart
      continue
    }

    if (!current) continue

    // Skip "\ No newline at end of file"
    if (raw.startsWith('\\ ')) continue

    const sigil = raw[0]
    const content = raw.slice(1)

    if (sigil === '+') {
      current.lines.push({ kind: 'add', oldLineNo: null, newLineNo: newLine, content })
      newLine++
    } else if (sigil === '-') {
      current.lines.push({ kind: 'remove', oldLineNo: oldLine, newLineNo: null, content })
      oldLine++
    } else {
      // context line (space) or unexpected — treat as context
      // Empty string at end of diff output (after last newline) — skip
      if (raw === '' && current.lines.length > 0) continue
      current.lines.push({ kind: 'context', oldLineNo: oldLine, newLineNo: newLine, content })
      oldLine++
      newLine++
    }
  }

  return hunks
}

export async function getFileDiff(
  worktreePath: string,
  relPath: string,
  stage: DiffStage,
): Promise<FileDiff> {
  // Build a minimal ChangedFile from listChangedFiles output for the response
  const allFiles = await listChangedFiles(worktreePath)
  const fileEntry =
    allFiles.find((f) => f.path === relPath && f.stage === stage) ??
    allFiles.find((f) => f.path === relPath)

  const placeholderFile: ChangedFile = fileEntry ?? {
    path: relPath,
    oldPath: null,
    status: 'modified',
    stage,
    additions: 0,
    deletions: 0,
    binary: false,
  }

  // Untracked: synthesize diff from raw file contents
  if (placeholderFile.status === 'untracked') {
    return synthesizeUntrackedDiff(worktreePath, relPath, placeholderFile)
  }

  if (placeholderFile.binary) {
    return { file: placeholderFile, hunks: [], binary: true, tooLarge: false }
  }

  const gitArgs =
    stage === 'staged'
      ? ['diff', '--cached', '--no-color', '-U3', '--', relPath]
      : ['diff', '--no-color', '-U3', '--', relPath]

  const result = await runGit(gitArgs, worktreePath)

  // -2 = killed due to size
  if (result.code === -2) {
    return { file: placeholderFile, hunks: [], binary: false, tooLarge: true }
  }

  const lineCount = result.stdout.split('\n').length
  if (lineCount > LINE_LIMIT) {
    return { file: placeholderFile, hunks: [], binary: false, tooLarge: true }
  }

  const hunks = parseHunks(result.stdout)
  return { file: placeholderFile, hunks, binary: false, tooLarge: false }
}

async function synthesizeUntrackedDiff(
  worktreePath: string,
  relPath: string,
  file: ChangedFile,
): Promise<FileDiff> {
  const absPath = join(worktreePath, relPath)
  let raw: string
  try {
    raw = await fs.readFile(absPath, 'utf8')
  } catch {
    return { file, hunks: [], binary: false, tooLarge: false }
  }

  const contentLines = raw.split('\n')
  // Remove trailing empty string caused by final newline
  if (contentLines[contentLines.length - 1] === '') {
    contentLines.pop()
  }

  const n = contentLines.length

  if (n > LINE_LIMIT) {
    return { file: { ...file, additions: n }, hunks: [], binary: false, tooLarge: true }
  }

  const hunkLines: DiffHunkLine[] = contentLines.map((content, idx) => ({
    kind: 'add' as const,
    oldLineNo: null,
    newLineNo: idx + 1,
    content,
  }))

  const header = `@@ -0,0 +1,${n} @@`
  const hunk: DiffHunk = {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: n,
    header,
    lines: hunkLines,
  }

  const updatedFile: ChangedFile = { ...file, additions: n }

  return { file: updatedFile, hunks: [hunk], binary: false, tooLarge: false }
}
