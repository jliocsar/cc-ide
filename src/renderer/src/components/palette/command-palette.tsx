import { ArrowLeft, FolderGit2, MessageSquare, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { usePalette } from '@/state/palette'
import { useWorkspaces } from '@/state/workspaces'

type Page = 'root' | 'switch-workspace'

export function CommandPalette(): JSX.Element {
  const open = usePalette((s) => s.paletteOpen)
  const setOpen = usePalette((s) => s.setPalette)
  const setPrompts = usePalette((s) => s.setPrompts)
  const workspaces = useWorkspaces((s) => s.workspaces)
  const setActive = useWorkspaces((s) => s.setActive)
  const activeId = useWorkspaces((s) => s.activeId)
  const [page, setPage] = useState<Page>('root')

  useEffect(() => {
    if (!open) setPage('root')
  }, [open])

  function close(): void {
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Run a command, open the Global Prompt Store, or switch workspace.
        </DialogDescription>
        <Command shouldFilter className="bg-background">
          <CommandInput
            placeholder={page === 'root' ? 'Type a command…' : 'Switch to workspace…'}
            autoFocus
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No matches.</CommandEmpty>
            {page === 'root' ? (
              <CommandGroup heading="Commands">
                <CommandItem
                  onSelect={() => {
                    close()
                    setPrompts(true)
                  }}
                >
                  <MessageSquare className="mr-2 size-4" />
                  Open Global Prompt Store
                </CommandItem>
                <CommandItem onSelect={() => setPage('switch-workspace')}>
                  <FolderGit2 className="mr-2 size-4" />
                  Switch Workspace
                </CommandItem>
              </CommandGroup>
            ) : (
              <>
                <CommandGroup heading="Workspaces">
                  {workspaces.map((w) => (
                    <CommandItem
                      key={w.id}
                      value={`${w.name} ${w.path}`}
                      onSelect={() => {
                        setActive(w.id)
                        close()
                      }}
                    >
                      <Terminal className="mr-2 size-4" />
                      <span className="font-mono">{w.name}</span>
                      {w.id === activeId ? (
                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                          active
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => setPage('root')}>
                    <ArrowLeft className="mr-2 size-4" />
                    Back
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
