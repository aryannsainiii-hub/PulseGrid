import { useEffect, useMemo } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ModelEdge, ModelNode, Status } from '../../types'
import { STATUS } from '../../utils/format'
import { useState } from 'react'

export interface NodeView { status: Status; capacity: number; onBuffer?: boolean }
export type GraphFilter = 'all' | 'infrastructure' | 'department' | 'affected'

function SystemNode({ data }: NodeProps) {
  const d = data as { label: string; status: Status; capacity: number; onBuffer?: boolean; selected: boolean; highlighted: boolean; dept: boolean }
  const s = STATUS[d.status]
  return (
    <div role="button" aria-label={`${d.label}, ${s.label}, ${Math.round(d.capacity)} percent`}
      className="rounded-2xl bg-white px-3 py-2 text-xs shadow-card min-w-[132px]"
      style={{ border: `2px solid ${s.color}`, outline: d.selected ? '3px solid #087F83' : d.highlighted ? `3px solid ${s.color}33` : 'none', background: d.dept ? '#fff' : '#FBFCFA' }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="font-semibold text-navy leading-tight">{d.label}</div>
      <div className="flex items-center justify-between mt-1" style={{ color: s.color }}>
        <span>{d.onBuffer ? 'On reserve' : s.label}</span><span className="font-medium">{Math.round(d.capacity)}%</span>
      </div>
      <div className="h-1 rounded bg-[#EEF1EC] mt-1"><div className="h-1 rounded" style={{ width: `${Math.max(2, d.capacity)}%`, background: s.color }} /></div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}
const nodeTypes = { system: SystemNode }

interface Props {
  nodes: ModelNode[]; edges: ModelEdge[]; view?: Record<string, NodeView>; selectedId?: string | null
  onSelect?: (id: string | null) => void; filter?: GraphFilter; height?: number | string
  propagated?: Set<string>; pulsing?: Set<string>; minimap?: boolean; onInit?: (rf: ReactFlowInstance) => void
}

export default function HospitalGraph({ nodes, edges, view = {}, selectedId, onSelect, filter = 'all', height = 520, propagated, pulsing, minimap, onInit }: Props) {
  const [rf, setRf] = useState<ReactFlowInstance | null>(null)
  const visible = useMemo(() => new Set(nodes.filter((n) => {
    if (filter === 'infrastructure') return n.category === 'infrastructure'
    if (filter === 'department') return n.category === 'department'
    if (filter === 'affected') return (view[n.id]?.status ?? 'healthy') !== 'healthy'
    return true
  }).map((n) => n.id)), [nodes, filter, view])

  const rfNodes: Node[] = useMemo(() => nodes.filter((n) => visible.has(n.id)).map((n) => {
    const v = view[n.id] ?? { status: 'healthy' as Status, capacity: 100 }
    return { id: n.id, type: 'system', position: { x: n.layout[0], y: n.layout[1] }, draggable: false,
      data: { label: n.name, status: v.status, capacity: v.capacity, onBuffer: v.onBuffer, selected: n.id === selectedId, highlighted: v.status !== 'healthy', dept: n.category === 'department' } }
  }), [nodes, visible, view, selectedId])

  const rfEdges: Edge[] = useMemo(() => edges.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => {
    const id = `${e.source}->${e.target}`
    const hot = propagated?.has(id), pulse = pulsing?.has(id)
    const srcStatus = view[e.source]?.status ?? 'healthy'
    const color = hot ? STATUS[srcStatus === 'healthy' ? 'at_risk' : srcStatus].color : '#B8C5BC'
    return { id, source: e.source, target: e.target, animated: !!pulse, style: { stroke: color, strokeWidth: hot ? 2.5 : 1.2, strokeDasharray: e.dependency_type === 'standby_trigger' ? '4 4' : undefined, opacity: hot || !propagated?.size ? 1 : 0.45 },
      markerEnd: { type: MarkerType.ArrowClosed, color } }
  }), [edges, visible, view, propagated, pulsing])

  useEffect(() => { rf?.fitView({ padding: 0.15, duration: 250 }) }, [filter, rf])

  return (
    <div style={{ height }} className="rounded-2xl border border-[#E3E8E2] bg-[#FBFCFA] overflow-hidden" data-testid="hospital-graph">
      <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} maxZoom={1.8}
        nodesConnectable={false} proOptions={{ hideAttribution: true }}
        onInit={(i) => { setRf(i); onInit?.(i) }} onNodeClick={(_, n) => onSelect?.(n.id)} onPaneClick={() => onSelect?.(null)}>
        <Background color="#E3E8E2" gap={20} />
        <Controls showInteractive={false} />
        {minimap && <MiniMap pannable zoomable nodeColor={(n) => STATUS[((n.data as any)?.status ?? 'healthy') as Status].color} />}
      </ReactFlow>
    </div>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-navy/70" aria-label="Legend">
      {(['healthy', 'at_risk', 'critical'] as Status[]).map((s) => <span key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS[s].color }} />{STATUS[s].label}</span>)}
      <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-warn" />Propagated impact</span>
      <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-navy/40" />Standby trigger</span>
    </div>
  )
}
