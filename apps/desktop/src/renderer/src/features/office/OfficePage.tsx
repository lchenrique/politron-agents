import { useMemo, type CSSProperties } from 'react'
import type { Agent, Snapshot } from '../../../../shared/v9'
import { BooFigure, type BooMood } from '../app/BooFigure'
import { BooWorking } from '../app/BooWorking'
import { booColorsOf } from '../app/PoliAvatar'
import { deskOrder, officeDesks, type Desk, type DeskState } from './office-state'
import './office.css'

// Projeção isométrica 2:1: uma unidade de grade vira meio losango na tela.
const HALF_W = 165
const HALF_H = 100
const COLUMNS = 3
const LABEL: Record<DeskState, string> = { working: 'Trabalhando', thinking: 'Pensando', waiting: 'Aguardando você', queued: 'Na fila', idle: 'Livre' }
const MOOD: Record<Exclude<DeskState, 'working'>, BooMood> = { thinking: 'thinking', waiting: 'surprised', queued: 'idle', idle: 'sleep' }

const iso = (gx: number, gy: number) => ({ x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H })
/** Chief na ponta de cima; os demais em fileiras de três atrás dele. */
function slot(index: number, chief: boolean) {
  if (chief) return iso(-0.45, -0.45)
  return iso(index % COLUMNS, Math.floor(index / COLUMNS) + 1)
}

function DeskBox({ chief }: { chief: boolean }) {
  // Tampo em losango e duas faces laterais; o Chief ganha uma mesa mais larga.
  const w = chief ? 210 : 170, h = w / 2, d = 26
  return <svg className="office-desk__box" viewBox={`0 0 ${w} ${h + d}`} width={w} height={h + d} aria-hidden="true">
    <path className="office-desk__side-l" d={`M0 ${h / 2} L${w / 2} ${h} L${w / 2} ${h + d} L0 ${h / 2 + d} Z`} />
    <path className="office-desk__side-r" d={`M${w} ${h / 2} L${w / 2} ${h} L${w / 2} ${h + d} L${w} ${h / 2 + d} Z`} />
    <path className="office-desk__top" d={`M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`} />
  </svg>
}

function DeskView({ desk, x, y, onOpen }: { desk: Desk; x: number; y: number; onOpen: () => void }) {
  const chief = desk.agent.role === 'chief'
  const colors = booColorsOf(desk.agent)
  const custom = !!desk.agent.avatar
  return <button type="button" className="office-desk" data-state={desk.state} data-chief={chief || undefined} style={{ left: x, top: y, '--office-z': Math.round(y) + 1000 } as CSSProperties}
    onClick={onOpen} aria-label={`${desk.agent.name}: ${LABEL[desk.state]}. ${desk.detail}`} title={desk.detail}>
    {desk.state !== 'idle' && <span className="office-desk__bubble">{desk.detail}</span>}
    <span className="office-desk__figure">
      {custom ? <img src={desk.agent.avatar} alt="" className="office-desk__avatar" />
        : desk.state === 'working' ? <BooWorking size={chief ? 150 : 128} colors={colors} label={`${desk.agent.name} trabalhando`} />
          : <BooFigure mood={MOOD[desk.state]} size={chief ? 104 : 88} colors={colors} label={`${desk.agent.name}: ${LABEL[desk.state]}`} animate />}
      {desk.state === 'waiting' && <span className="office-desk__alert" aria-hidden="true">!</span>}
    </span>
    <DeskBox chief={chief} />
    <span className="office-desk__plate"><strong>{desk.agent.name}</strong><span>{LABEL[desk.state]}</span></span>
  </button>
}

/**
 * Escritório isométrico: cada Boo na sua mesa com o estado real das execuções (todas as conversas).
 * O Chief fica à frente; envelopes animados mostram as tarefas que ele delegou e ainda estão ativas.
 */
export function OfficePage({ snapshot, onOpenAgent, onOpenConversation }: { snapshot: Snapshot; onOpenAgent: (agent: Agent) => void; onOpenConversation: (id: string) => void }) {
  const desks = useMemo(() => deskOrder(officeDesks(snapshot)), [snapshot])
  const placed = useMemo(() => {
    let others = 0
    return desks.map(desk => { const chief = desk.agent.role === 'chief'; return { desk, ...slot(chief ? 0 : others++, chief) } })
  }, [desks])
  const xs = placed.map(item => item.x), ys = placed.map(item => item.y)
  const pad = { x: 190, top: 210, bottom: 150 }
  const minX = Math.min(0, ...xs) - pad.x, maxX = Math.max(0, ...xs) + pad.x
  const minY = Math.min(0, ...ys) - pad.top, maxY = Math.max(0, ...ys) + pad.bottom
  const width = maxX - minX, height = maxY - minY
  const at = (point: { x: number; y: number }) => ({ x: point.x - minX, y: point.y - minY })
  const chief = placed.find(item => item.desk.agent.role === 'chief')
  const links = chief ? placed.filter(item => item.desk.fromChief && item.desk.state !== 'idle') : []
  const counts = desks.reduce((total, desk) => ({ ...total, [desk.state]: (total[desk.state] || 0) + 1 }), {} as Partial<Record<DeskState, number>>)
  // Losango do piso cobrindo todas as mesas, com linhas de ladrilho.
  const floorRows = Math.max(2, Math.ceil(Math.max(0, desks.length - 1) / COLUMNS) + 1)
  const corner = (gx: number, gy: number) => at(iso(gx, gy))
  const floor = [corner(-1, -1), corner(COLUMNS, -1), corner(COLUMNS, floorRows + 0.2), corner(-1, floorRows + 0.2)]

  return <section className="office" aria-label="Escritório dos agentes">
    <header className="office__header">
      <div>
        <h1 className="office__title">Escritório</h1>
        <p className="office__summary">{desks.length ? Object.entries(LABEL).filter(([state]) => counts[state as DeskState]).map(([state, label]) => `${counts[state as DeskState]} ${label.toLocaleLowerCase('pt-BR')}`).join(' · ') : 'Crie um Boo para ver o escritório.'}</p>
      </div>
      <p className="office__hint">Clique em um Boo para abrir onde ele está trabalhando.</p>
    </header>
    <div className="office__viewport">
      <div className="office__scene" style={{ width, height }}>
        <svg className="office__floor" width={width} height={height} aria-hidden="true">
          <defs>
            <pattern id="office-tile" width={HALF_W * 2} height={HALF_H * 2} patternUnits="userSpaceOnUse" x={at({ x: 0, y: 0 }).x - HALF_W} y={at({ x: 0, y: 0 }).y}>
              <path d={`M0 ${HALF_H} L${HALF_W} 0 L${HALF_W * 2} ${HALF_H} L${HALF_W} ${HALF_H * 2} Z`} className="office__tile" />
            </pattern>
          </defs>
          <polygon points={floor.map(point => `${point.x},${point.y}`).join(' ')} className="office__floor-base" />
          <polygon points={floor.map(point => `${point.x},${point.y}`).join(' ')} fill="url(#office-tile)" />
          {chief && links.map(item => {
            const from = at(chief), to = at(item)
            const path = `M${from.x} ${from.y} Q${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 60} ${to.x} ${to.y}`
            return <g key={item.desk.agent.id} className="office__link">
              <path d={path} className="office__link-line" />
              <g className="office__envelope"><rect x="-9" y="-6" width="18" height="12" rx="2" /><path d="M-9 -6 L0 1 L9 -6" />
                <animateMotion dur="2.4s" repeatCount="indefinite" path={path} /></g>
            </g>
          })}
        </svg>
        {placed.map(item => {
          const point = at(item)
          return <DeskView key={item.desk.agent.id} desk={item.desk} x={point.x} y={point.y}
            onOpen={() => item.desk.conversationId ? onOpenConversation(item.desk.conversationId) : onOpenAgent(item.desk.agent)} />
        })}
      </div>
    </div>
  </section>
}
