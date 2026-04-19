import { ChevronLeft, ChevronRight, Filter, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function Checkbox({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
}): JSX.Element {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className="size-3.5 accent-primary"
    />
  )
}

import type {
  GraphFilters,
  GraphStyle,
  LabelsMode,
  NodeColorMode,
  NodeSizeMode,
} from '@/state/board-ui'
import { ALL_EDGE_KINDS, getFilters, getStyle, useBoardUi } from '@/state/board-ui'
import type { EdgeKind } from '@/state/depgraph'

interface Props {
  workspaceId: string
}

const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  static: 'Static',
  type: 'Type',
  dynamic: 'Dynamic',
  reexport: 'Re-exports',
  asset: 'Assets',
}

export function GraphPanel({ workspaceId }: Props): JSX.Element {
  const collapsed = useBoardUi((s) => s.railCollapsedByWorkspace[workspaceId] ?? false)
  const setRailCollapsed = useBoardUi((s) => s.setRailCollapsed)
  if (collapsed) {
    return <CollapsedRail onExpand={() => setRailCollapsed(workspaceId, false)} />
  }
  return (
    <ExpandedPanel
      workspaceId={workspaceId}
      onCollapse={() => setRailCollapsed(workspaceId, true)}
    />
  )
}

function CollapsedRail({ onExpand }: { onExpand: () => void }): JSX.Element {
  return (
    <div className="flex h-full flex-col items-center gap-2 border-l border-border bg-card py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onExpand}
            aria-label="Expand graph options"
          >
            <ChevronLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Expand graph options</TooltipContent>
      </Tooltip>
      <Filter className="size-3 text-muted-foreground" />
      <Palette className="size-3 text-muted-foreground" />
    </div>
  )
}

function ExpandedPanel({
  workspaceId,
  onCollapse,
}: {
  workspaceId: string
  onCollapse: () => void
}): JSX.Element {
  const filters = useBoardUi((s) => getFilters(s, workspaceId))
  const style = useBoardUi((s) => getStyle(s, workspaceId))
  const setFilters = useBoardUi((s) => s.setFilters)
  const setStyle = useBoardUi((s) => s.setStyle)

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2 pr-3 text-[11px] text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCollapse}
              aria-label="Collapse graph options"
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
        <span className="font-mono uppercase">Graph options</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <FilterSection filters={filters} onSet={(patch) => setFilters(workspaceId, patch)} />
          <StyleSection style={style} onSet={(patch) => setStyle(workspaceId, patch)} />
        </div>
      </ScrollArea>
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

function FilterSection({
  filters,
  onSet,
}: {
  filters: GraphFilters
  onSet: (patch: Partial<GraphFilters>) => void
}): JSX.Element {
  function toggleKind(k: EdgeKind): void {
    const next = new Set(filters.edgeKinds)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    onSet({ edgeKinds: next })
  }

  function resetAll(): void {
    onSet({
      minInDegree: 0,
      minOutDegree: 0,
      showExternals: false,
      edgeKinds: new Set(ALL_EDGE_KINDS),
      pathInclude: null,
      pathExclude: null,
      neighborhoodDepth: 1,
    })
  }

  return (
    <Section icon={<Filter className="size-3" />} title="Filters">
      <div className="flex flex-col gap-3 font-mono text-[11px]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Min outgoing degree</span>
            <span className="tabular-nums">{filters.minOutDegree}</span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={filters.minOutDegree}
            onChange={(e) => onSet({ minOutDegree: Number(e.target.value) })}
            className="accent-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Min incoming degree</span>
            <span className="tabular-nums">{filters.minInDegree}</span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={filters.minInDegree}
            onChange={(e) => onSet({ minInDegree: Number(e.target.value) })}
            className="accent-primary"
          />
        </div>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={filters.showExternals}
            onCheckedChange={(v) => onSet({ showExternals: Boolean(v) })}
          />
          <span>Show externals (node_modules)</span>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Edge kinds</span>
          <div className="grid grid-cols-2 gap-1">
            {[...ALL_EDGE_KINDS].map((k) => (
              <label key={k} className="flex items-center gap-2">
                <Checkbox
                  checked={filters.edgeKinds.has(k)}
                  onCheckedChange={() => toggleKind(k)}
                />
                <span>{EDGE_KIND_LABELS[k]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Path include (glob)</span>
          <Input
            value={filters.pathInclude ?? ''}
            onChange={(e) => onSet({ pathInclude: e.target.value || null })}
            placeholder="src/**"
            className="h-7 font-mono text-[11px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Path exclude (glob)</span>
          <Input
            value={filters.pathExclude ?? ''}
            onChange={(e) => onSet({ pathExclude: e.target.value || null })}
            placeholder="**/*.test.ts"
            className="h-7 font-mono text-[11px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Neighborhood depth</span>
            <span className="tabular-nums">{filters.neighborhoodDepth}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={filters.neighborhoodDepth}
            onChange={(e) => onSet({ neighborhoodDepth: Number(e.target.value) })}
            className="accent-primary"
          />
        </div>

        <Button size="sm" variant="outline" onClick={resetAll}>
          Reset filters
        </Button>
      </div>
    </Section>
  )
}

function StyleSection({
  style,
  onSet,
}: {
  style: GraphStyle
  onSet: (patch: Partial<GraphStyle>) => void
}): JSX.Element {
  return (
    <Section icon={<Palette className="size-3" />} title="Style">
      <div className="flex flex-col gap-3 font-mono text-[11px]">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={style.mergedEdges}
            onCheckedChange={(v) => onSet({ mergedEdges: Boolean(v) })}
          />
          <span>Merge edges by (from, to)</span>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Node size</span>
          <Select
            value={style.nodeSize}
            onValueChange={(v) => onSet({ nodeSize: v as NodeSizeMode })}
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="degree">By degree</SelectItem>
                <SelectItem value="loc">By LOC</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Node color</span>
          <Select
            value={style.nodeColor}
            onValueChange={(v) => onSet({ nodeColor: v as NodeColorMode })}
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="folder">By folder</SelectItem>
                <SelectItem value="filetype">By file type</SelectItem>
                <SelectItem value="uniform">Uniform</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Labels</span>
          <Select value={style.labels} onValueChange={(v) => onSet({ labels: v as LabelsMode })}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="always">Always</SelectItem>
                <SelectItem value="hover">On hover</SelectItem>
                <SelectItem value="zoom">By zoom threshold</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  )
}
