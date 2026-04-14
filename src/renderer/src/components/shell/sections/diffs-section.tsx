import { useEffect } from 'react'
import { GitCompare, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebarData } from '@/state/sidebar-data'
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
  const files = useSidebarData((s) => s.diffsByWorktree[worktree.path] ?? [])
  const status = useSidebarData((s) => s.diffsStatus[worktree.path] ?? 'idle')
  const refresh = useSidebarData((s) => s.refreshDiffsFor)

  useEffect(() => {
    void refresh(worktree.path)
  }, [worktree.path, refresh])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="truncate font-mono lowercase">{worktree.branch ?? '(detached)'}</span>
          <span>·</span>
          <span>{files.length} file{files.length === 1 ? '' : 's'}</span>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => void refresh(worktree.path)}
          aria-label="Refresh diffs"
        >
          <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
        </Button>
      </div>
      <div className="flex flex-col gap-px">
        {files.map((f) => (
          <ChangedFileRow key={`${f.stage}:${f.path}`} file={f} />
        ))}
        {status === 'ready' && files.length === 0 ? (
          <div className="px-2 py-1 font-mono text-[11px] text-muted-foreground">clean</div>
        ) : null}
      </div>
    </div>
  )
}

function ChangedFileRow({ file }: { file: ChangedFileDTO }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground">
      <GitCompare className="size-3 shrink-0" />
      <div className="min-w-0 flex-1 truncate font-mono">{file.path}</div>
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
