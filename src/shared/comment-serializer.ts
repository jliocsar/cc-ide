export type CommentRange = {
  start: number
  len: number
  comment: string
}

export type CommentFile = {
  path: string
  ranges: CommentRange[]
}

// Wraps the path in double quotes when it contains whitespace so downstream
// parsers (Claude) treat it as a single token. Embedded `"` is escaped with
// `\"`. Paths without whitespace are emitted bare to keep the common case
// untouched.
export function formatDropPath(path: string): string {
  if (!/\s/.test(path)) return path
  return `"${path.replace(/"/g, '\\"')}"`
}

export function serializeComments(files: CommentFile[]): string {
  const withContent = files.filter((f) => f.ranges.length > 0)
  if (withContent.length === 0) return ''

  const orderedFiles = [...withContent].sort((a, b) => {
    if (a.path < b.path) return -1
    if (a.path > b.path) return 1
    return 0
  })

  const blocks: string[] = []
  for (const file of orderedFiles) {
    const orderedRanges = [...file.ranges]
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.start - b.r.start || a.i - b.i)
      .map(({ r }) => r)

    const lines: string[] = [`@${formatDropPath(file.path)}`]
    for (const range of orderedRanges) {
      lines.push(`@@ ${range.start},${range.len} @@`)
      lines.push(range.comment)
    }
    blocks.push(lines.join('\n'))
  }

  return blocks.join('\n') + '\n'
}
