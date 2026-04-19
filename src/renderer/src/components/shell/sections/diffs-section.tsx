import type { ChangedFileDTO, WorktreeDTO } from '@shared/ipc'
import { FileDiff, MessageSquare, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { setDropPayload } from '@/lib/drop-payload'
import { cn } from '@/lib/utils'
import { diffTabId, useReviewComments } from '@/state/review-comments'
import { EMPTY_FILES, useSidebarData } from '@/state/sidebar-data'
import { useTabs } from '@/state/tabs'
import { useWorkspaces } from '@/state/workspaces'

export function DiffsSection({ worktrees }: { worktrees: WorktreeDTO[] }): JSX.Element {
  return (
    <div className="flex flex-col">
      {worktrees.length === 0 ? (
        <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">no worktrees</div>
      ) : null}
      {worktrees.map((w) => (
        <DiffsForWorktree key={w.path} worktree={w} />
      ))}
    </div>
  )
}

function DiffsForWorktree({ worktree }: { worktree: WorktreeDTO }): JSX.Element {
  const files = useSidebarData(
    (s) => (s.diffsByWorktree[worktree.path] ?? EMPTY_FILES) as ChangedFileDTO[],
  )
  const status = useSidebarData((s) => s.diffsStatus[worktree.path] ?? 'idle')
  const refresh = useSidebarData((s) => s.refreshDiffsFor)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const totalComments = useReviewComments((s) =>
    files.reduce(
      (sum, f) => sum + (s.byTab[diffTabId(worktree.path, f.path, f.stage)]?.length ?? 0),
      0,
    ),
  )

  useEffect(() => {
    void refresh(worktree.path)
  }, [worktree.path, refresh])

  return (
    <div className={cn('flex min-w-0 flex-col', files.length > 0 ? 'mb-2' : 'mb-0.5')}>
      <div
        draggable={totalComments > 0}
        onDragStart={(e) => {
          if (!activeWorkspaceId || totalComments === 0) return
          setDropPayload(e.dataTransfer, {
            kind: 'diff-batch',
            workspaceId: activeWorkspaceId,
            worktreePath: worktree.path,
            files: files.map((f) => ({ path: f.path, stage: f.stage })),
          })
        }}
        className={cn(
          'flex items-center gap-2 px-3 py-1',
          totalComments > 0 && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <div className="flex min-w-0 items-center font-mono text-[10px] text-foreground/50">
          <span className="max-w-[22ch] truncate lowercase">{worktree.branch ?? '(detached)'}</span>
          <span className="mx-1 shrink-0 text-foreground/40">·</span>
          <span className="shrink-0 uppercase tracking-wider">
            {files.length} file{files.length === 1 ? '' : 's'}
          </span>
          {totalComments > 0 ? (
            <>
              <span className="mx-1 shrink-0 text-foreground/40">·</span>
              <span className="flex shrink-0 items-center gap-0.5 tabular-nums text-yellow-400">
                {totalComments}
                <MessageSquare className="mb-0.5 size-2.5" />
              </span>
            </>
          ) : null}
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto text-foreground/50 hover:text-foreground/60"
          onClick={() => void refresh(worktree.path)}
          onDragStart={(e) => e.stopPropagation()}
          aria-label="Refresh diffs"
        >
          <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
        </Button>
      </div>
      <div className="flex flex-col">
        {files.map((f) => (
          <ChangedFileRow key={`${f.stage}:${f.path}`} file={f} worktreePath={worktree.path} />
        ))}
      </div>
    </div>
  )
}

function ChangedFileRow({
  file,
  worktreePath,
}: {
  file: ChangedFileDTO
  worktreePath: string
}): JSX.Element {
  const openDiff = useTabs((s) => s.openDiff)
  const activeWorkspaceId = useWorkspaces((s) => s.activeId)
  const tabId = diffTabId(worktreePath, file.path, file.stage)
  const rangeCount = useReviewComments((s) => s.byTab[tabId]?.length ?? 0)

  return (
    <div
      draggable
      onDragStart={(e) => {
        if (!activeWorkspaceId) return
        setDropPayload(e.dataTransfer, {
          kind: 'diff',
          workspaceId: activeWorkspaceId,
          worktreePath,
          path: file.path,
          stage: file.stage,
        })
      }}
      onClick={() => {
        if (!activeWorkspaceId) return
        openDiff(activeWorkspaceId, worktreePath, file.path, file.stage)
      }}
      className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground"
    >
      <FileDiff className="size-3 shrink-0" />
      <div className="min-w-0 flex-1 truncate font-mono text-[10px]">{file.path}</div>
      <span
        className={cn(
          'shrink-0 rounded px-1 text-[9px] uppercase',
          file.stage === 'staged' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {file.stage[0]}
      </span>
      {rangeCount > 0 ? (
        <span className="shrink-0 font-mono tabular-nums text-[10px] text-yellow-400">
          {rangeCount}
        </span>
      ) : null}
      {file.additions > 0 ? (
        <span className="shrink-0 font-mono tabular-nums text-[10px] text-green-400">
          +{file.additions}
        </span>
      ) : null}
      {file.deletions > 0 ? (
        <span className="shrink-0 font-mono tabular-nums text-[10px] text-red-400">
          -{file.deletions}
        </span>
      ) : null}
    </div>
  )
}
