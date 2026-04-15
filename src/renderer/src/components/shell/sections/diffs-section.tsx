import { useEffect } from 'react'
import { GitCompare, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarData, EMPTY_FILES } from '@/state/sidebar-data'
import { useTabs } from '@/state/tabs'
import { useWorkspaces } from '@/state/workspaces'
import { useReviewComments, diffTabId } from '@/state/review-comments'
import { setDropPayload } from '@/lib/drop-payload'
import { cn } from '@/lib/utils'
import type { WorktreeDTO, ChangedFileDTO } from '@shared/ipc'

export function DiffsSection({ worktrees }: { worktrees: WorktreeDTO[] }): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      {worktrees.length === 0 ? (
        <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
          no worktrees
        </div>
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

  useEffect(() => {
    void refresh(worktree.path)
  }, [worktree.path, refresh])

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="min-w-0 truncate rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] lowercase text-foreground">
          {worktree.branch ?? '(detached)'}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => void refresh(worktree.path)}
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

function ChangedFileRow({ file, worktreePath }: { file: ChangedFileDTO; worktreePath: string }): JSX.Element {
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
      <GitCompare className="size-3 shrink-0" />
      <div className="min-w-0 flex-1 truncate font-mono">{file.path}</div>
      {rangeCount > 0 ? (
        <span className="rounded bg-primary/20 px-1 font-mono text-[10px] text-primary">{rangeCount}</span>
      ) : null}
      <span
        className={cn(
          'rounded px-1 text-[9px] uppercase',
          file.stage === 'staged' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {file.stage[0]}
      </span>
      <span className="w-8 text-right font-mono tabular-nums text-[10px]">
        {file.additions + file.deletions}
      </span>
    </div>
  )
}
