import { serializeComments, type CommentRange } from '@shared/comment-serializer'

export type DropPayload =
  | { kind: 'plan'; workspaceId: string; relPath: string }
  | {
      kind: 'diff'
      workspaceId: string
      worktreePath: string
      path: string
      stage: 'staged' | 'unstaged'
    }

export const DROP_MIME = 'application/x-cc-ide-drop'

export function setDropPayload(dt: DataTransfer, payload: DropPayload): void {
  dt.setData(DROP_MIME, JSON.stringify(payload))
  dt.setData('text/plain', dropPathFor(payload))
  dt.effectAllowed = 'copy'
}

export function readDropPayload(dt: DataTransfer): DropPayload | null {
  const raw = dt.getData(DROP_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DropPayload
  } catch {
    return null
  }
}

export function dropPathFor(payload: DropPayload): string {
  if (payload.kind === 'plan') return `.cc-ide/plans/${payload.relPath}`
  return payload.path
}

export function buildDropString(payload: DropPayload, ranges: CommentRange[]): string {
  const path = dropPathFor(payload)
  if (ranges.length === 0) return `@${path}\n`
  return serializeComments([{ path, ranges }])
}
