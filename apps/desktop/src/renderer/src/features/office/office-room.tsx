import type { ReactNode } from 'react'
import type { OfficeLayout, Point } from './office-sim'

/** Projeção isométrica 2:1 da sala: (x, y) em ladrilhos para pixels do SVG. */
export const TILE_W = 64
export const TILE_H = 32
export const WALL = 170
export interface Projection { width: number; height: number; at: (point: Point, lift?: number) => { x: number; y: number } }
export function projection(layout: OfficeLayout): Projection {
  const at = (point: Point, lift = 0) => ({ x: (point.x - point.y) * TILE_W / 2 + layout.depth * TILE_W / 2, y: (point.x + point.y) * TILE_H / 2 + WALL - lift })
  return { width: (layout.width + layout.depth) * TILE_W / 2, height: (layout.width + layout.depth) * TILE_H / 2 + WALL + 24, at }
}

const poly = (points: { x: number; y: number }[]) => points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')

/** Caixa isométrica (móveis): tampo e as duas faces visíveis. Origem no canto de trás; w em x, d em y, h em px. */
export function IsoBox({ p, x, y, w, d, h, lift = 0, top, left, right }: { p: Projection; x: number; y: number; w: number; d: number; h: number; lift?: number; top: string; left: string; right: string }) {
  const c = (cx: number, cy: number, z: number) => p.at({ x: cx, y: cy }, lift + z)
  return <g>
    <polygon points={poly([c(x, y + d, 0), c(x + w, y + d, 0), c(x + w, y + d, h), c(x, y + d, h)])} fill={left} />
    <polygon points={poly([c(x + w, y, 0), c(x + w, y + d, 0), c(x + w, y + d, h), c(x + w, y, h)])} fill={right} />
    <polygon points={poly([c(x, y, h), c(x + w, y, h), c(x + w, y + d, h), c(x, y + d, h)])} fill={top} />
  </g>
}

export type Prop = { key: string; depth: number; node: ReactNode }

/** Piso de madeira e as duas paredes do fundo, com janela, quadro e prateleira. Sempre desenhado antes de tudo. */
export function RoomShell({ p, layout }: { p: Projection; layout: OfficeLayout }) {
  const { width: W, depth: D } = layout
  const floor = [p.at({ x: 0, y: 0 }), p.at({ x: W, y: 0 }), p.at({ x: W, y: D }), p.at({ x: 0, y: D })]
  const wallBack = [p.at({ x: 0, y: 0 }), p.at({ x: W, y: 0 }), p.at({ x: W, y: 0 }, WALL - 20), p.at({ x: 0, y: 0 }, WALL - 20)]
  const wallLeft = [p.at({ x: 0, y: 0 }), p.at({ x: 0, y: D }), p.at({ x: 0, y: D }, WALL - 20), p.at({ x: 0, y: 0 }, WALL - 20)]
  const onBack = (x0: number, x1: number, z0: number, z1: number) => poly([p.at({ x: x0, y: 0 }, z0), p.at({ x: x1, y: 0 }, z0), p.at({ x: x1, y: 0 }, z1), p.at({ x: x0, y: 0 }, z1)])
  const onLeft = (y0: number, y1: number, z0: number, z1: number) => poly([p.at({ x: 0, y: y0 }, z0), p.at({ x: 0, y: y1 }, z0), p.at({ x: 0, y: y1 }, z1), p.at({ x: 0, y: y0 }, z1)])
  const planks = Array.from({ length: Math.ceil(D * 2) }, (_, index) => index / 2).map(y => <line key={`p${y}`} {...pair(p.at({ x: 0, y }), p.at({ x: W, y }))} className="office-room__plank" />)
  const seams = Array.from({ length: W - 1 }, (_, index) => index + 1).map(x => <line key={`s${x}`} {...pair(p.at({ x, y: 0 }), p.at({ x, y: D }))} className="office-room__seam" />)
  return <g aria-hidden="true">
    <polygon points={poly(wallLeft)} className="office-room__wall-left" />
    <polygon points={poly(wallBack)} className="office-room__wall-back" />
    <polygon points={poly(floor)} className="office-room__floor" />
    {planks}{seams}
    <polygon points={poly([p.at({ x: 0, y: 0 }), p.at({ x: W, y: 0 }), p.at({ x: W, y: 0 }, 10), p.at({ x: 0, y: 0 }, 10)])} className="office-room__skirting" />
    <polygon points={poly([p.at({ x: 0, y: 0 }), p.at({ x: 0, y: D }), p.at({ x: 0, y: D }, 10), p.at({ x: 0, y: 0 }, 10)])} className="office-room__skirting-left" />
    {/* Janela grande na parede do fundo, com céu e caixilho. */}
    <polygon points={onBack(W * 0.55, W * 0.9, 50, 130)} className="office-room__window-frame" />
    <polygon points={onBack(W * 0.57, W * 0.88, 55, 125)} className="office-room__sky" />
    <line {...pair(p.at({ x: W * 0.725, y: 0 }, 55), p.at({ x: W * 0.725, y: 0 }, 125))} className="office-room__mullion" />
    <line {...pair(p.at({ x: W * 0.57, y: 0 }, 90), p.at({ x: W * 0.88, y: 0 }, 90))} className="office-room__mullion" />
    {/* Quadro branco com notas na parede da esquerda. */}
    <polygon points={onLeft(D * 0.2, D * 0.5, 60, 125)} className="office-room__board" />
    {[0.25, 0.33, 0.41].map((y, index) => <polygon key={y} points={onLeft(D * y, D * y + 0.5, 95 - index * 8, 112 - index * 8)} className={`office-room__note office-room__note--${index}`} />)}
    {/* Quadro decorativo na parede do fundo. */}
    <polygon points={onBack(W * 0.18, W * 0.38, 80, 125)} className="office-room__poster" />
    {/* Tapete da área de descanso. */}
    <polygon points={poly([p.at({ x: 0.4, y: D - 2.6 }), p.at({ x: 3.2, y: D - 2.6 }), p.at({ x: 3.2, y: D - 0.3 }), p.at({ x: 0.4, y: D - 0.3 })])} className="office-room__rug" />
  </g>
}
const pair = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })

/** Móveis da sala com a profundidade de cada um, para intercalar com os Boos. */
export function roomProps(p: Projection, layout: OfficeLayout, deskIds: string[], seated: Set<string>): Prop[] {
  const { width: W, depth: D } = layout
  const props: Prop[] = []
  for (const id of deskIds) {
    const at = layout.desks[id]!
    const chief = id === layout.chiefId
    const w = chief ? 1.9 : 1.5, d = 0.8
    props.push({ key: `desk-${id}`, depth: at.x + at.y, node: <g key={`desk-${id}`}>
      <IsoBox p={p} x={at.x - w / 2} y={at.y - d / 2} w={w} d={d} h={26} top={chief ? 'var(--office-desk-chief)' : 'var(--office-desk-top)'} left="var(--office-desk-left)" right="var(--office-desk-right)" />
      {/* Mesa vazia mostra o monitor desligado; quem está sentado usa o próprio notebook. */}
      {!seated.has(id) && <IsoBox p={p} x={at.x - 0.25} y={at.y - 0.3} w={0.5} d={0.08} h={22} lift={26} top="#3b4150" left="#2a2f3b" right="#1d212b" />}
    </g> })
  }
  props.push({ key: 'coffee', depth: W - 0.9 + 0.5, node: <g key="coffee">
    <IsoBox p={p} x={W - 1.3} y={0.15} w={0.9} d={0.6} h={34} top="#8c6f52" left="#6e5640" right="#5b4634" />
    <IsoBox p={p} x={W - 1.15} y={0.25} w={0.45} d={0.35} h={26} lift={34} top="#4a4f5c" left="#363a45" right="#2b2e37" />
    <circle {...center(p.at({ x: W - 0.9, y: 0.75 }, 40))} r="4" fill="#f4efe6" />
  </g> })
  props.push({ key: 'shelf', depth: 2.4, node: <g key="shelf">
    <IsoBox p={p} x={1.4} y={0.1} w={1.6} d={0.4} h={70} top="#a7835f" left="#8a6b4c" right="#76593e" />
    {[0, 1, 2, 3, 4].map(index => <IsoBox key={index} p={p} x={1.5 + index * 0.28} y={0.15} w={0.18} d={0.3} h={18 + (index % 2) * 6} lift={36} top={['#e86f6f', '#6fb6e8', '#e8c86f', '#7fd18e', '#b58ee8'][index]!} left={['#c95a5a', '#5a98c9', '#c9a95a', '#62b072', '#9774c9'][index]!} right={['#b04d4d', '#4d84b0', '#b0944d', '#539a62', '#8264b0'][index]!} />)}
  </g> })
  for (const [x, y] of [[0.55, 0.55], [W - 0.6, D - 0.6], [0.55, D * 0.62]] as const) props.push({ key: `plant-${x}-${y}`, depth: x + y, node: <g key={`plant-${x}-${y}`}>
    <IsoBox p={p} x={x - 0.25} y={y - 0.25} w={0.5} d={0.5} h={22} top="#a0624a" left="#83503c" right="#6f4333" />
    {[[0, 34, 16], [-9, 46, 12], [9, 44, 12], [0, 56, 10]].map(([dx, z, r], index) => <circle key={index} cx={p.at({ x, y }).x + dx!} cy={p.at({ x, y }, z!).y} r={r} className="office-room__leaf" />)}
  </g> })
  props.push({ key: 'sofa', depth: 1.6 + D - 1.2, node: <g key="sofa">
    <IsoBox p={p} x={0.5} y={D - 1.7} w={2.2} d={0.9} h={20} top="var(--office-sofa)" left="var(--office-sofa-dark)" right="var(--office-sofa-darker)" />
    <IsoBox p={p} x={0.5} y={D - 1.7} w={2.2} d={0.25} h={44} top="var(--office-sofa)" left="var(--office-sofa-dark)" right="var(--office-sofa-darker)" />
  </g> })
  return props
}
const center = (point: { x: number; y: number }) => ({ cx: point.x, cy: point.y })

/** Sala e pontos de interesse para um número qualquer de Boos: fileiras de três mesas atrás da mesa do Chief. */
export function buildLayout(agentIds: string[], chiefId?: string): OfficeLayout {
  const others = agentIds.filter(id => id !== chiefId)
  const rows = Math.max(1, Math.ceil(others.length / 3))
  const width = 11, depth = Math.max(9, Math.round(5 + rows * 2.4 + 2.4))
  const desks: OfficeLayout['desks'] = {}
  if (chiefId) desks[chiefId] = { x: width / 2 + 0.6, y: 2.4 }
  others.forEach((id, index) => { desks[id] = { x: [3.3, 5.9, 8.5][index % 3]!, y: 5 + Math.floor(index / 3) * 2.4 } })
  // Obstáculos para o caminho: mesas, cafeteira, estante, plantas e sofá (mesmas medidas do desenho).
  const blocked = [
    ...Object.entries(desks).map(([id, at]) => { const w = id === chiefId ? 1.9 : 1.5; return { x: at.x - w / 2, y: at.y - 0.4, w, d: 0.8 } }),
    { x: width - 1.3, y: 0.15, w: 0.9, d: 0.6 }, { x: 1.4, y: 0.1, w: 1.6, d: 0.4 },
    ...[[0.55, 0.55], [width - 0.6, depth - 0.6], [0.55, depth * 0.62]].map(([x, y]) => ({ x: x! - 0.25, y: y! - 0.25, w: 0.5, d: 0.5 })),
    { x: 0.5, y: depth - 1.7, w: 2.2, d: 0.9 },
  ]
  return {
    width, depth, desks, chiefId, blocked,
    pois: [
      { id: 'coffee', kind: 'coffee', at: { x: width - 0.9, y: 1.25 } },
      { id: 'window', kind: 'window', at: { x: width * 0.72, y: 0.9 } },
      { id: 'board', kind: 'board', at: { x: 1.1, y: depth * 0.35 } },
      { id: 'shelf', kind: 'shelf', at: { x: 2.2, y: 1 } },
      { id: 'plant', kind: 'plant', at: { x: width - 1.4, y: depth - 1.3 } },
      { id: 'sofa', kind: 'sofa', at: { x: 1.6, y: depth - 1.15 } },
    ],
  }
}
