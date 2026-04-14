# Rule · UI

## Dark-only, monochrome

- The app is dark by default (`<html class="dark">`). There is no light theme and no theme toggle.
- Backgrounds, text, borders, muted surfaces: semantic shadcn tokens only (`bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, etc.). The base color is `neutral` — zero chroma. Shadcn CSS variables live at `src/renderer/src/styles/globals.css`.
- Color (red/green/yellow/blue/magenta/cyan) is reserved for semantic signals: ANSI escapes in xterm, syntax highlighting, diff add/remove tints, status badges (live/exited/dormant), favorite stars.
- Do not introduce raw hex or oklch color literals in component code. Use tokens.

## Shadcn rules

The shadcn skill (see `~/.claude/skills/shadcn/SKILL.md` if running) documents these; summary of what bites us:

- `className` is for layout, not styling. Don't override component colors or typography.
- No `space-x-*` / `space-y-*` — use `flex ... gap-*`.
- Equal dimensions: `size-*`, not `w-* h-*`.
- Icons in `Button` use `data-icon="inline-start|inline-end"` with no sizing classes on the icon itself.
- Form layout: `FieldGroup` + `Field`, not raw `div` + `Label` (when a form is meaningful).
- Dialog/Sheet/Drawer always need a Title AND a Description. Use `className="sr-only"` for accessibility when visual hiding is desired. See `src/renderer/src/components/palette/command-palette.tsx` for the sr-only pattern.
- `CommandItem` must be inside `CommandGroup`. Same for `SelectItem`/`SelectGroup`, etc.
- Do NOT reinstall `src/renderer/src/components/ui/dialog.tsx` without re-applying the `React.forwardRef` wrappers — the default shadcn template uses function components that break when radix Slot tries to attach refs (React 18). See `references/lessons.md`.

## Keyboard shortcuts

Reserved in the Shell layer. Do not reassign without updating all three:

- `Ctrl+K` / `Cmd+K` — command palette
- `Ctrl+W` / `Cmd+W` — close active tab (Board is pinned and excluded)
- `Ctrl+B` / `Cmd+B` — toggle sidebar

Canvas-scoped (handled by `components/canvas/canvas.tsx`):

- `Ctrl+0` — reset camera
- `Ctrl+=` / `Ctrl+-` — zoom in/out on viewport center

## Canvas/pan guardrails

- Pan only starts when the pointerdown target IS the viewport root. Otherwise `setPointerCapture` hijacks `pointerup` from interactive children and their clicks never fire. See `references/lessons.md`.
- Windows stop pointerdown propagation to prevent pan from triggering when the user drags a titlebar.
