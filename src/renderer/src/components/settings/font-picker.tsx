import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { useMemo, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { BUILTIN_FONTS, type BuiltinFontKey, fontLabel, useSystemFonts } from '@/lib/system-fonts'
import { cn } from '@/lib/utils'

type Props = {
  id?: string
  value: string | null
  onValueChange: (value: string | null) => void
  // Restrict built-in options. Default: all built-ins.
  builtins?: BuiltinFontKey[]
  // Show a "None" entry that emits null. Used by terminal fallback.
  allowClear?: boolean
  placeholder?: string
}

const ALL_BUILTINS = Object.keys(BUILTIN_FONTS) as BuiltinFontKey[]

export function FontPicker({
  id,
  value,
  onValueChange,
  builtins = ALL_BUILTINS,
  allowClear = false,
  placeholder = 'Select font…',
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const { fonts, loading } = useSystemFonts()

  const display = useMemo(() => {
    if (value === null) return placeholder
    return fontLabel(value)
  }, [value, placeholder])

  function pick(next: string | null): void {
    onValueChange(next)
    setOpen(false)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        id={id}
        type="button"
        className={cn(
          'flex h-9 w-[180px] items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
          value === null && 'text-muted-foreground',
        )}
      >
        <span className="line-clamp-1 flex-1 text-left">{display}</span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={4}
          className="z-50 w-[260px] origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover p-0 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <Command
            // cmdk's default filter does substring match. Good enough for fonts.
            loop
          >
            <CommandInput placeholder="Search fonts…" />
            <CommandList className="max-h-[280px]">
              <CommandEmpty>{loading ? 'Loading fonts…' : 'No fonts found.'}</CommandEmpty>
              {allowClear ? (
                <CommandGroup>
                  <CommandItem value="__none__" onSelect={() => pick(null)}>
                    <span className="flex-1 text-muted-foreground italic">None</span>
                    {value === null ? <CheckIcon className="size-4" /> : null}
                  </CommandItem>
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Built-in">
                {builtins.map((key) => (
                  <CommandItem
                    key={key}
                    value={`builtin:${BUILTIN_FONTS[key].label}`}
                    onSelect={() => pick(key)}
                  >
                    <span className="flex-1" style={{ fontFamily: BUILTIN_FONTS[key].cssVar }}>
                      {BUILTIN_FONTS[key].label}
                    </span>
                    {value === key ? <CheckIcon className="size-4" /> : null}
                  </CommandItem>
                ))}
                <CommandItem value="builtin:System default" onSelect={() => pick('system')}>
                  <span className="flex-1 text-muted-foreground">System default</span>
                  {value === 'system' ? <CheckIcon className="size-4" /> : null}
                </CommandItem>
              </CommandGroup>
              {fonts.length > 0 ? (
                <CommandGroup heading="System">
                  {fonts.map((family) => (
                    <CommandItem key={family} value={family} onSelect={() => pick(family)}>
                      <span
                        className="line-clamp-1 flex-1"
                        style={{ fontFamily: `'${family.replace(/'/g, "\\'")}'` }}
                      >
                        {family}
                      </span>
                      {value === family ? <CheckIcon className="size-4" /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
            {allowClear && value !== null ? (
              <button
                type="button"
                onClick={() => pick(null)}
                className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
              >
                <XIcon className="size-3" />
                Clear selection
              </button>
            ) : null}
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
