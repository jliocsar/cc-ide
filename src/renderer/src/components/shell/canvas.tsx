import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { invoke } from '@/lib/ipc'

export function Canvas(): JSX.Element {
  const [result, setResult] = useState<string>('—')

  async function ping() {
    const r = await invoke('app:ping', { at: Date.now() })
    setResult(`pong in ${r.roundTripFromClient}ms`)
  }

  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'radial-gradient(circle, oklch(1 0 0) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div className="relative flex flex-col items-center gap-3">
        <div className="font-mono text-xs text-muted-foreground">canvas stub · drop windows here</div>
        <Button variant="secondary" size="sm" onClick={ping}>
          Ping main
        </Button>
        <div className="font-mono text-xs text-muted-foreground">{result}</div>
      </div>
    </div>
  )
}
