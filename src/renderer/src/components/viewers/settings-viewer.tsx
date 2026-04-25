import type { DiffFontDTO, EditorFontDTO, EditorKeybindsDTO, TerminalFontDTO } from '@shared/ipc'
import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DEFAULT_DATA_ROOT, useSettings, validateDataRoot } from '@/state/settings'

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20] as const

function SettingRow({
  id,
  label,
  description,
  children,
}: {
  id?: string
  label: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex cursor-default items-center gap-1.5">
              <label htmlFor={id} className="text-sm text-foreground">
                {label}
              </label>
              <Info className="size-3 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      ) : (
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
      )}
      {children}
    </div>
  )
}

function FontSizeSelect({
  id,
  value,
  onValueChange,
}: {
  id: string
  value: number
  onValueChange: (v: number) => void
}): JSX.Element {
  return (
    <Select value={String(value)} onValueChange={(v) => onValueChange(Number(v))}>
      <SelectTrigger id={id} className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}px
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function SettingsViewer(): JSX.Element {
  const editorKeybinds = useSettings((s) => s.settings.editor.keybinds)
  const editorFont = useSettings((s) => s.settings.editor.font)
  const editorFontSize = useSettings((s) => s.settings.editor.fontSize)
  const terminalFont = useSettings((s) => s.settings.terminal.font)
  const terminalFontSize = useSettings((s) => s.settings.terminal.fontSize)
  const diffFont = useSettings((s) => s.settings.diff.font)
  const diffFontSize = useSettings((s) => s.settings.diff.fontSize)
  const diffWrap = useSettings((s) => s.settings.diff.wrap)
  const diffStickyGutter = useSettings((s) => s.settings.diff.stickyGutter)
  const workspaceDataRoot = useSettings((s) => s.settings.workspace.dataRoot)
  const setEditorKeybinds = useSettings((s) => s.setEditorKeybinds)
  const setEditorFont = useSettings((s) => s.setEditorFont)
  const setEditorFontSize = useSettings((s) => s.setEditorFontSize)
  const setTerminalFont = useSettings((s) => s.setTerminalFont)
  const setTerminalFontSize = useSettings((s) => s.setTerminalFontSize)
  const setDiffFont = useSettings((s) => s.setDiffFont)
  const setDiffFontSize = useSettings((s) => s.setDiffFontSize)
  const setDiffWrap = useSettings((s) => s.setDiffWrap)
  const setDiffStickyGutter = useSettings((s) => s.setDiffStickyGutter)
  const setWorkspaceDataRoot = useSettings((s) => s.setWorkspaceDataRoot)

  const [dataRootDraft, setDataRootDraft] = useState(workspaceDataRoot)
  useEffect(() => {
    setDataRootDraft(workspaceDataRoot)
  }, [workspaceDataRoot])
  const dataRootError = validateDataRoot(dataRootDraft)
  const dataRootDirty = dataRootDraft !== workspaceDataRoot

  async function commitDataRoot(): Promise<void> {
    if (!dataRootDirty || dataRootError) return
    await setWorkspaceDataRoot(dataRootDraft)
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Terminal
          </h3>
          <SettingRow id="terminal-font" label="Font">
            <Select
              value={terminalFont}
              onValueChange={(v) => void setTerminalFont(v as TerminalFontDTO)}
            >
              <SelectTrigger id="terminal-font" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="geist-mono">Geist Mono</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="terminal-font-size" label="Font size">
            <FontSizeSelect
              id="terminal-font-size"
              value={terminalFontSize}
              onValueChange={(v) => void setTerminalFontSize(v)}
            />
          </SettingRow>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Editor
          </h3>
          <SettingRow id="editor-keybinds" label="Keybinds" description="Keymap for editor.">
            <Select
              value={editorKeybinds}
              onValueChange={(v) => void setEditorKeybinds(v as EditorKeybindsDTO)}
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
          </SettingRow>
          <SettingRow id="editor-font" label="Font">
            <Select
              value={editorFont}
              onValueChange={(v) => void setEditorFont(v as EditorFontDTO)}
            >
              <SelectTrigger id="editor-font" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="geist">Geist</SelectItem>
                  <SelectItem value="geist-mono">Geist Mono</SelectItem>
                  <SelectItem value="space-grotesk">Space Grotesk</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="editor-font-size" label="Font size">
            <FontSizeSelect
              id="editor-font-size"
              value={editorFontSize}
              onValueChange={(v) => void setEditorFontSize(v)}
            />
          </SettingRow>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Diff
          </h3>
          <SettingRow id="diff-font" label="Font">
            <Select value={diffFont} onValueChange={(v) => void setDiffFont(v as DiffFontDTO)}>
              <SelectTrigger id="diff-font" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="geist-mono">Geist Mono</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="diff-font-size" label="Font size">
            <FontSizeSelect
              id="diff-font-size"
              value={diffFontSize}
              onValueChange={(v) => void setDiffFontSize(v)}
            />
          </SettingRow>
          <SettingRow id="diff-wrap" label="Line wrap">
            <Select
              value={diffWrap ? 'wrap' : 'nowrap'}
              onValueChange={(v) => void setDiffWrap(v === 'wrap')}
            >
              <SelectTrigger id="diff-wrap" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="wrap">Wrap</SelectItem>
                  <SelectItem value="nowrap">No wrap</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            id="diff-sticky-gutter"
            label="Sticky gutter"
            description="Pin line numbers when scrolling horizontally."
          >
            <Select
              value={diffStickyGutter ? 'on' : 'off'}
              onValueChange={(v) => void setDiffStickyGutter(v === 'on')}
            >
              <SelectTrigger id="diff-sticky-gutter" className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingRow>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Plans &amp; Prompts
          </h3>
          <SettingRow
            id="workspace-data-root"
            label="Folder"
            description={`Relative folder inside each workspace for plans/ and prompts/. Default: ${DEFAULT_DATA_ROOT}. Existing files in the old location are not moved.`}
          >
            <div className="flex w-[180px] flex-col gap-1">
              <Input
                id="workspace-data-root"
                value={dataRootDraft}
                onChange={(e) => setDataRootDraft(e.target.value)}
                onBlur={() => void commitDataRoot()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitDataRoot()
                    ;(e.target as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    setDataRootDraft(workspaceDataRoot)
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                placeholder={DEFAULT_DATA_ROOT}
                aria-invalid={dataRootError !== null}
                className="font-mono text-xs"
              />
              {dataRootError ? (
                <span className="text-[10px] text-destructive">{dataRootError}</span>
              ) : null}
            </div>
          </SettingRow>
        </section>
      </div>
    </ScrollArea>
  )
}
