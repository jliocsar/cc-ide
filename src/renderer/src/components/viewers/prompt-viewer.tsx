import { useEffect, useState } from 'react'
import { MarkdownFileEditor } from '@/components/editor/markdown-file-editor'
import { invoke } from '@/lib/ipc'

function promptTabId(workspaceId: string, relPath: string): string {
  return `prompt:${workspaceId}:${relPath}`
}

export function PromptViewer({
  workspaceId,
  relPath,
}: {
  workspaceId: string
  relPath: string
}): JSX.Element {
  const tabId = promptTabId(workspaceId, relPath)
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { content } = await invoke('prompts:read', { workspaceId, relPath })
        if (!cancelled) setContent(content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, relPath])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-destructive">
        {error}
      </div>
    )
  }
  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center bg-background font-mono text-xs text-muted-foreground">
        loading…
      </div>
    )
  }

  return (
    <div className="h-full bg-background">
      <MarkdownFileEditor
        tabId={tabId}
        initialContent={content}
        onSave={async (next) => {
          await invoke('prompts:write', { workspaceId, relPath, content: next })
        }}
      />
    </div>
  )
}
