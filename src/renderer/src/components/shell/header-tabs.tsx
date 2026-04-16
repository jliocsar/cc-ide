import { useState } from "react";
import {
  LayoutGrid,
  X,
  FileText,
  GitCompare,
  MessageSquare,
  ChevronDown,
  Network,
  Copy,
  Minus,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invoke } from "@/lib/ipc";
import { useTabs, type Tab } from "@/state/tabs";
import { usePlanTabUi } from "@/state/plan-tab-ui";
import { useBoardUi, type BoardMode } from "@/state/board-ui";
import { useWorkspaces } from "@/state/workspaces";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setDropPayload, type DropPayload } from "@/lib/drop-payload";

const TAB_REORDER_MIME = "application/x-cc-ide-tab-reorder";

let cachedTransparentDragImage: HTMLImageElement | null = null;

function transparentDragImage(): HTMLImageElement {
  if (cachedTransparentDragImage) return cachedTransparentDragImage;
  const img = new Image();
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  cachedTransparentDragImage = img;
  return img;
}

function dragPayloadFor(tab: Tab): DropPayload | null {
  if (tab.kind === "plan")
    return {
      kind: "plan",
      workspaceId: tab.meta.workspaceId,
      relPath: tab.meta.relPath,
    };
  if (tab.kind === "diff")
    return {
      kind: "diff",
      workspaceId: tab.meta.workspaceId,
      worktreePath: tab.meta.worktreePath,
      path: tab.meta.path,
      stage: tab.meta.stage,
    };
  return null;
}

const ICON_BY_KIND: Record<
  Tab["kind"],
  React.ComponentType<{ className?: string }>
> = {
  board: LayoutGrid,
  plan: FileText,
  diff: GitCompare,
  prompt: MessageSquare,
};

export function HeaderTabs({ maximized }: { maximized: boolean }): JSX.Element {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const setActive = useTabs((s) => s.setActive);
  const closeTab = useTabs((s) => s.closeTab);
  const reorderTab = useTabs((s) => s.reorderTab);
  const dirtyMap = usePlanTabUi((s) => s.byTab);
  const pendingCloseId = usePlanTabUi((s) => s.pendingCloseId);
  const setPendingCloseId = usePlanTabUi((s) => s.setPendingCloseId);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function requestClose(id: string): void {
    const isDirty = dirtyMap[id]?.dirty ?? false;
    if (isDirty) {
      setPendingCloseId(id);
      return;
    }
    closeTab(id);
  }

  const noDrag: React.CSSProperties & Record<string, string> = {
    WebkitAppRegion: "no-drag",
  };
  const drag: React.CSSProperties & Record<string, string> = {
    WebkitAppRegion: "drag",
  };

  return (
    <div
      className="flex h-10 items-center border-b border-border bg-card"
      style={drag}
    >
      <div
        className="flex h-full min-w-0 items-center overflow-x-auto scrollbar-none max-w-content"
        style={noDrag}
      >
        {tabs.map((tab) => {
          const Icon = ICON_BY_KIND[tab.kind];
          const active = tab.id === activeId;
          const payload = dragPayloadFor(tab);
          const canReorder = !tab.pinned;
          const dirty = dirtyMap[tab.id]?.dirty ?? false;
          return (
            <div
              key={tab.id}
              draggable={!!payload || canReorder}
              onDragStart={(e) => {
                if (payload) setDropPayload(e.dataTransfer, payload);
                if (canReorder) {
                  e.dataTransfer.setData(TAB_REORDER_MIME, tab.id);
                  e.dataTransfer.setDragImage(transparentDragImage(), 0, 0);
                  setDraggingId(tab.id);
                }
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TAB_REORDER_MIME)) return;
                if (tab.pinned) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (draggingId && draggingId !== tab.id) {
                  reorderTab(draggingId, tab.id);
                }
              }}
              onDrop={(e) => {
                const srcId = e.dataTransfer.getData(TAB_REORDER_MIME);
                setDraggingId(null);
                if (!srcId) return;
                e.preventDefault();
                if (srcId !== tab.id) reorderTab(srcId, tab.id);
              }}
              onClick={() => setActive(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && !tab.pinned) requestClose(tab.id);
              }}
              className={cn(
                "relative flex h-full shrink-0 cursor-pointer select-none items-center gap-2 border-r border-border px-3 text-xs",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                draggingId === tab.id ? "opacity-60" : null,
              )}
            >
              <Icon className="size-3.5" />
              <span className="max-w-[200px] truncate font-mono">
                {dirty ? <span className="mr-1 text-foreground">•</span> : null}
                {tab.title}
              </span>
              {tab.kind === "board" ? <BoardModeChevron /> : null}
              {!tab.pinned ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestClose(tab.id);
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close tab"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="flex-1" />
      {/* Window controls */}
      <div className="flex h-full shrink-0 items-center" style={noDrag}>
        <button
          type="button"
          onClick={() => void invoke("window:minimize", {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Minimize"
        >
          <Minus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void invoke("window:maximize", {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? (
            <Copy className="size-3" />
          ) : (
            <Square className="size-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void invoke("window:close", {})}
          className="flex size-10 items-center justify-center text-muted-foreground hover:bg-red-500/80 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <AlertDialog
        open={pendingCloseId !== null}
        onOpenChange={(v) => {
          if (!v) setPendingCloseId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This plan tab has unsaved edits. Closing it will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCloseId) closeTab(pendingCloseId);
                setPendingCloseId(null);
              }}
            >
              Discard & close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BoardModeChevron(): JSX.Element | null {
  const workspaceId = useWorkspaces((s) => s.activeId);
  const mode = useBoardUi((s) =>
    workspaceId ? (s.modeByWorkspace[workspaceId] ?? "sessions") : "sessions",
  );
  const setMode = useBoardUi((s) => s.setMode);
  if (!workspaceId) return null;

  function pick(next: BoardMode): void {
    if (!workspaceId) return;
    setMode(workspaceId, next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Switch board mode"
        >
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        <DropdownMenuItem onClick={() => pick("sessions")}>
          <LayoutGrid />
          Sessions {mode === "sessions" ? "•" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pick("graph")}>
          <Network />
          Dependency Graph {mode === "graph" ? "•" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
