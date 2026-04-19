import claudeSymbolUrl from '@/assets/claude-symbol.svg'
import { cn } from '@/lib/utils'

export function ClaudeCodeIcon({ className }: { className?: string }): JSX.Element {
  return <img src={claudeSymbolUrl} alt="" draggable={false} className={cn(className)} />
}
