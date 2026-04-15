import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings } from '@/state/settings'
import type { EditorKeybindsDTO } from '@shared/ipc'

export function SettingsModal(): JSX.Element {
  const open = useSettings((s) => s.settingsOpen)
  const setOpen = useSettings((s) => s.setSettingsOpen)
  const keybinds = useSettings((s) => s.settings.editor.keybinds)
  const setKeybinds = useSettings((s) => s.setEditorKeybinds)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Customize editor and UI preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Editor
            </h3>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <label
                  htmlFor="editor-keybinds"
                  className="text-sm text-foreground"
                >
                  Editor keybinds
                </label>
                <span className="text-xs text-muted-foreground">
                  Keymap used while editing plans.
                </span>
              </div>
              <Select
                value={keybinds}
                onValueChange={(v) => {
                  void setKeybinds(v as EditorKeybindsDTO)
                }}
              >
                <SelectTrigger id="editor-keybinds" className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="vscode">VSCode (Normal)</SelectItem>
                    <SelectItem value="vim">Vim</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
