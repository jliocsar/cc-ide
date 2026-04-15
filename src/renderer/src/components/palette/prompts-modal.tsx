import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Star, Trash2, Plus, Send } from 'lucide-react'
import { usePalette } from '@/state/palette'
import { usePrompts } from '@/state/prompts'
import { useLastTerminal } from '@/state/last-terminal'
import { invoke } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import type { PromptDTO } from '@shared/ipc'

export function PromptsModal(): JSX.Element {
  const open = usePalette((s) => s.promptsOpen)
  const setOpen = usePalette((s) => s.setPrompts)
  const prompts = usePrompts((s) => s.prompts)
  const query = usePrompts((s) => s.query)
  const sort = usePrompts((s) => s.sort)
  const loading = usePrompts((s) => s.loading)
  const error = usePrompts((s) => s.error)
  const setQuery = usePrompts((s) => s.setQuery)
  const setSort = usePrompts((s) => s.setSort)
  const refresh = usePrompts((s) => s.refresh)
  const create = usePrompts((s) => s.create)
  const update = usePrompts((s) => s.update)
  const remove = usePrompts((s) => s.remove)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      void refresh()
      setEditingId(null)
      setPasteError(null)
    }
  }, [open, refresh])

  async function startNew() {
    setPasteError(null)
    const created = await create({ title: 'untitled', body: '', favorite: false })
    setEditingId(created.id)
  }

  async function pasteIntoTerminal(prompt: PromptDTO) {
    const ptyId = useLastTerminal.getState().ptyId
    if (!ptyId) {
      setPasteError('No terminal focused. Click into a Claude window first.')
      return
    }
    await invoke('pty:write', { ptyId, data: prompt.body })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid h-[640px] max-h-[80vh] grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-[820px]">
        <DialogHeader className="border-b border-border p-3">
          <DialogTitle>Prompts</DialogTitle>
          <DialogDescription className="sr-only">Cross-project prompts library</DialogDescription>
          <div className="flex items-center gap-2 pt-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title or body…"
              className="flex-1"
            />
            <div className="flex h-9 items-center rounded-md border border-input bg-transparent text-[11px]">
              <button
                type="button"
                onClick={() => setSort('favorites-first')}
                className={cn(
                  'h-full rounded-l px-2 transition-colors',
                  sort === 'favorites-first' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                ★ first
              </button>
              <button
                type="button"
                onClick={() => setSort('title')}
                className={cn(
                  'h-full rounded-r px-2 transition-colors',
                  sort === 'title' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                A → Z
              </button>
            </div>
            <Button size="sm" onClick={startNew}>
              <Plus />
              New
            </Button>
          </div>
          {pasteError ? (
            <div className="mt-2 font-mono text-[11px] text-destructive">{pasteError}</div>
          ) : null}
          {error ? (
            <div className="mt-2 font-mono text-[11px] text-destructive">{error}</div>
          ) : null}
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[1fr_1fr]">
          <ScrollArea className="border-r border-border">
            <div className="flex flex-col">
              {loading ? (
                <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">loading…</div>
              ) : prompts.length === 0 ? (
                <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">no prompts</div>
              ) : (
                prompts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className={cn(
                      'flex items-start gap-2 border-b border-border px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent/50',
                      editingId === p.id && 'bg-accent/40',
                    )}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void update(p.id, { favorite: !p.favorite })
                      }}
                      className={cn(
                        'mt-0.5',
                        p.favorite ? 'text-yellow-500' : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-label={p.favorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <Star className={cn('size-3.5', p.favorite && 'fill-current')} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono">{p.title}</div>
                      <div className="line-clamp-2 text-[10px] text-muted-foreground">{p.body || '(empty)'}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>

          <PromptEditor
            key={editingId}
            promptId={editingId}
            prompts={prompts}
            onUpdate={update}
            onRemove={async (id) => {
              await remove(id)
              setEditingId(null)
            }}
            onPaste={pasteIntoTerminal}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PromptEditor({
  promptId,
  prompts,
  onUpdate,
  onRemove,
  onPaste,
}: {
  promptId: string | null
  prompts: PromptDTO[]
  onUpdate: (id: string, patch: Partial<Pick<PromptDTO, 'title' | 'body' | 'favorite'>>) => Promise<PromptDTO>
  onRemove: (id: string) => Promise<void>
  onPaste: (prompt: PromptDTO) => void
}): JSX.Element {
  const prompt = promptId ? prompts.find((p) => p.id === promptId) ?? null : null
  const [title, setTitle] = useState(prompt?.title ?? '')
  const [body, setBody] = useState(prompt?.body ?? '')

  useEffect(() => {
    setTitle(prompt?.title ?? '')
    setBody(prompt?.body ?? '')
    // intentionally only syncing on prompt id swap — syncing on title/body would
    // clobber the field the user is currently typing into after each blur-commit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id])

  if (!prompt) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted-foreground">
        select or create a prompt
      </div>
    )
  }

  async function commit(field: 'title' | 'body', value: string) {
    if (!prompt) return
    if (prompt[field] === value) return
    await onUpdate(prompt.id, { [field]: value })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => void commit('title', e.target.value)}
          placeholder="Title"
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label="Delete">
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{prompt.title || 'untitled'}&rdquo; will be permanently removed. This can&rsquo;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void onRemove(prompt.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={(e) => void commit('body', e.target.value)}
        placeholder="Prompt body…"
        className="flex-1 resize-none rounded-none border-0 font-mono text-[12px]"
      />
      <div className="flex items-center justify-end gap-2 border-t border-border p-3">
        <span className="mr-auto font-mono text-[10px] text-muted-foreground">
          updated {new Date(prompt.updatedAt).toLocaleString()}
        </span>
        <Button size="sm" onClick={() => onPaste(prompt)}>
          <Send />
          Send to terminal
        </Button>
      </div>
    </div>
  )
}
