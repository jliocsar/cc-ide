import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type InlineRenameValidation = { ok: true } | { ok: false; reason: string }

type Props = {
  value: string
  validate: (name: string) => InlineRenameValidation
  onCommit: (next: string) => void | Promise<void>
  onCancel: () => void
  className?: string
}

export function InlineRenameInput({
  value: initial,
  validate,
  onCommit,
  onCancel,
  className,
}: Props): JSX.Element {
  const [value, setValue] = useState(initial)
  const [pending, setPending] = useState(false)
  const [touched, setTouched] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const validation = validate(value)
  const valid = validation.ok
  const reason = valid ? null : (validation as { ok: false; reason: string }).reason
  const showTooltip = !valid && touched

  async function commit() {
    if (!valid || value === initial || pending) return
    setPending(true)
    try {
      await onCommit(value)
    } finally {
      setPending(false)
    }
  }

  const input = (
    <input
      ref={ref}
      value={value}
      disabled={pending}
      onChange={(e) => {
        setValue(e.target.value)
        setTouched(true)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void commit()
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => {
        if (!pending) onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'min-w-0 rounded-sm border bg-background px-1 py-px font-mono text-[11px] outline-none focus:ring-1',
        valid ? 'border-border focus:ring-ring' : 'border-destructive focus:ring-destructive',
        pending && 'opacity-60',
        className,
      )}
    />
  )

  return (
    <Tooltip open={showTooltip}>
      <TooltipTrigger asChild>{input}</TooltipTrigger>
      <TooltipContent side="bottom" className="bg-destructive text-destructive-foreground">
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}
