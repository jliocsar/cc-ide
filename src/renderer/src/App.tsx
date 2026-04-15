import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { Shell } from './components/shell/shell'
import { bootstrapSettings } from './state/settings'

export function App(): JSX.Element {
  useEffect(() => {
    bootstrapSettings()
  }, [])

  return (
    <>
      <Shell />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  )
}
