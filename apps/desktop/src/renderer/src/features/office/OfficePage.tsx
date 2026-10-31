import { useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, Snapshot } from '../../../../shared/v9'
import { BooFigure, type BooMood } from '../app/BooFigure'
import { BooWorking } from '../app/BooWorking'
import { booColorsOf } from '../app/PoliAvatar'
import { deskOrder, officeDesks, type Desk, type DeskState } from './office-state'
import { createSim, seatOf, stepSim, type Actor } from './office-sim'
import { buildLayout, projection, roomProps, RoomShell, type Prop } from './office-room'
import './office.css'

const LABEL: Record<DeskState, string> = { working: 'Trabalhando', thinking: 'Pensando', waiting: 'Aguardando você', queued: 'Na fila', idle: 'Livre' }
const DESK_MOOD: Record<Exclude<DeskState, 'working'>, BooMood> = { thinking: 'thinking', waiting: 'surprised', queued: 'idle', idle: 'idle' }
const BOO = 64

type LabeledProp = Prop & { label: { actor: Actor; desk: Desk; x: number; head: number; name: number } }
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/** Humor do Boo conforme o que ele faz agora na sala (andando, conversando, dormindo, entregando). */
function moodOf(actor: Actor, desk: Desk): BooMood {
  if (actor.mode === 'desk') return DESK_MOOD[desk.state === 'working' ? 'thinking' : desk.state]
  if (actor.mode === 'sleep') return 'sleep'
  if (actor.mode === 'talk') return 'speaking'
  if (actor.mode === 'celebrate') return 'happy'
  if (actor.mode === 'dizzy') return 'dizzy'
  if (actor.mode === 'errand') return actor.badge === 'check' ? 'done' : actor.badge === 'eyes' ? 'thinking' : 'happy'
  return 'idle'
}

/**
 * Escritório vivo: a sala isométrica ilustrada e cada Boo andando por ela. Quem trabalha senta na mesa e digita;
 * quem está livre passeia, conversa e cochila no sofá; o Chief leva o papel a cada delegação nova e o Boo volta
 * com o ✓ ao terminar. O estado vem das execuções reais; só o caminhar é simulado.
 */
export function OfficePage({ snapshot, onOpenAgent, onOpenConversation }: { snapshot: Snapshot; onOpenAgent: (agent: Agent) => void; onOpenConversation: (id: string) => void }) {
  const desks = useMemo(() => deskOrder(officeDesks(snapshot)), [snapshot])
  const chiefId = desks.find(desk => desk.agent.role === 'chief')?.agent.id
  const ids = desks.map(desk => desk.agent.id).join('|')
  const layout = useMemo(() => buildLayout(ids ? ids.split('|') : [], chiefId), [ids, chiefId])
  const p = useMemo(() => projection(layout), [layout])
  const sim = useRef(createSim())
  const desksRef = useRef(desks)
  desksRef.current = desks
  const [clock, setClock] = useState(0)

  useEffect(() => {
    const reduced = reducedMotion()
    let frame = 0, last = performance.now(), painted = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now
      stepSim(sim.current, layout, desksRef.current.map(desk => ({ id: desk.agent.id, active: desk.state !== 'idle', fromChief: desk.fromChief, failed: desk.failed })), reduced ? 0.1 : dt)
      // Movimento reduzido: cada Boo vai direto ao destino, sem caminhar.
      if (reduced) for (const actor of sim.current.actors.values()) if (actor.path.length) { actor.pos = { ...actor.path.at(-1)! }; actor.path = [] }
      if (now - painted > (reduced ? 1000 : 33)) { painted = now; setClock(now / 1000) }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [layout])

  const simDesks = desks.map(desk => ({ id: desk.agent.id, active: desk.state !== 'idle', fromChief: desk.fromChief, failed: desk.failed }))
  // Primeiro quadro já com todos na sala, antes do laço de animação começar.
  if (simDesks.some(desk => !sim.current.actors.has(desk.id))) stepSim(sim.current, layout, simDesks, 0)
  const byId = new Map(desks.map(desk => [desk.agent.id, desk]))
  const actors = [...sim.current.actors.values()].filter(actor => byId.has(actor.id))
  const seated = new Set(actors.filter(actor => actor.mode === 'desk').map(actor => actor.id))
  const props: Prop[] = roomProps(p, layout, desks.map(desk => desk.agent.id), seated)
  const booProps: Prop[] = actors.map(actor => {
    const desk = byId.get(actor.id)!
    const home = layout.desks[actor.id]!
    const working = actor.mode === 'desk' && desk.state === 'working' && !desk.agent.avatar
    // Sentado, o Boo fica sobre a própria mesa; andando, ordena pela posição no piso.
    // Digitando: o Boo e o notebook ficam sobre o tampo. Sentado sem notebook: atrás da mesa, que cobre o corpo.
    const behind = actor.mode === 'desk' && !working
    const depth = working ? home.x + home.y + 0.01 : behind ? home.x + home.y - 0.3 : actor.pos.x + actor.pos.y
    const foot = working ? p.at({ x: home.x, y: home.y }, 26) : behind ? p.at(seatOf(home)) : p.at(actor.pos)
    const bob = actor.mode === 'walking' ? -Math.abs(Math.sin(clock * 9 + home.x)) * 5 : 0
    const size = working ? BOO * 1.55 : BOO
    const colors = booColorsOf(desk.agent)
    const open = () => desk.conversationId ? onOpenConversation(desk.conversationId) : onOpenAgent(desk.agent)
    return { key: `boo-${actor.id}`, depth, node: <g key={`boo-${actor.id}`} className="office-boo" data-mode={actor.mode} data-state={desk.state} role="button" tabIndex={0}
      aria-label={`${desk.agent.name}: ${LABEL[desk.state]}. ${desk.detail}`} onClick={open} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open() } }}
      transform={`translate(${(foot.x - size / 2).toFixed(1)} ${(foot.y - size * (working ? 0.8 : 0.92) + bob).toFixed(1)})`}>
      <ellipse cx={size / 2} cy={size * (working ? 0.8 : 0.92)} rx={size * 0.28} ry={size * 0.08} className="office-boo__shadow" />
      {/* SVG do Boo dentro de foreignObject: mantém o tamanho e acompanha a escala da cena. */}
      <foreignObject width={size} height={size} overflow="visible">
        <div className="office-boo__figure" style={{ width: size, height: size, transform: actor.facing < 0 && !working ? 'scaleX(-1)' : undefined }}>
          {desk.agent.avatar
            ? <img src={desk.agent.avatar} alt="" className="office-boo__avatar" />
            : working ? <BooWorking size={size} colors={colors} label={`${desk.agent.name} trabalhando`} />
              : <BooFigure mood={moodOf(actor, desk)} size={size} colors={colors} label={`${desk.agent.name}: ${LABEL[desk.state]}`} animate />}
        </div>
      </foreignObject>
    </g>, label: { actor, desk, x: foot.x, head: foot.y - size * (working ? 0.8 : 0.92) + bob + size * (working ? 0.17 : 0.12), name: foot.y + (working ? 34 : behind ? 46 : 8) } } as LabeledProp
  })
  const scene = [...props, ...booProps].sort((a, b) => a.depth - b.depth)
  const labels = booProps.map(item => (item as LabeledProp).label)
  const counts = desks.reduce((total, desk) => ({ ...total, [desk.state]: (total[desk.state] || 0) + 1 }), {} as Partial<Record<DeskState, number>>)

  return <section className="office" aria-label="Escritório dos agentes">
    <header className="office__header">
      <div>
        <h1 className="office__title">Escritório</h1>
        <p className="office__summary">{desks.length ? Object.entries(LABEL).filter(([state]) => counts[state as DeskState]).map(([state, label]) => `${counts[state as DeskState]} ${label.toLocaleLowerCase('pt-BR')}`).join(' · ') : 'Crie um Boo para ver o escritório.'}</p>
      </div>
      <p className="office__hint">Clique em um Boo para abrir onde ele está trabalhando.</p>
    </header>
    <div className="office__viewport">
      <svg className="office__scene" viewBox={`0 0 ${p.width.toFixed(0)} ${p.height.toFixed(0)}`} preserveAspectRatio="xMidYMid meet">
        <RoomShell p={p} layout={layout} />
        {scene.map(item => item.node)}
        {/* Etiquetas por cima de tudo, em camadas: balões, nomes e, no topo, os alertas de aprovação. */}
        <g className="office__labels" pointerEvents="none">
          {labels.map(({ actor, desk, x, head }) => {
            const bubble = actor.badge === 'paper' ? '📄 Nova tarefa' : actor.badge === 'check' ? '✓ Concluído' : actor.badge === 'help' ? '🤝 Posso ajudar?' : actor.badge === 'eyes' ? '👀 Como está indo?'
              : actor.mode === 'celebrate' ? '🎉 Pronto!' : actor.mode === 'dizzy' ? 'Algo deu errado…' : actor.mode === 'talk' && actor.facing > 0 ? '💬' : actor.mode === 'desk' && desk.state === 'working' ? desk.detail.replace(/^[^·]*·\s*/, '') : ''
            return bubble ? <foreignObject key={`bubble-${actor.id}`} x={x - 90} y={head - 28} width={180} height={26}><div className="office__bubble">{bubble}</div></foreignObject> : null
          })}
          {labels.map(({ actor, desk, x, name }) => <foreignObject key={`name-${actor.id}`} x={x - 60} y={name} width={120} height={22}><div className="office__name" data-state={desk.state}>{desk.agent.name}</div></foreignObject>)}
          {labels.filter(({ actor, desk }) => actor.mode === 'desk' && desk.state === 'waiting').map(({ actor, x, head }) =>
            <g key={`alert-${actor.id}`} className="office__alert-badge" transform={`translate(${x + 24} ${head + 4})`}><circle r="10" className="office__alert" /><text y="4" textAnchor="middle" className="office__alert-text">!</text></g>)}
        </g>
      </svg>
    </div>
  </section>
}
