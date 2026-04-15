import { Toaster } from 'sonner'
import { Shell } from './components/shell/shell'

export function App(): JSX.Element {
  return (
    <>
      <Shell />
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </>
  )
}
