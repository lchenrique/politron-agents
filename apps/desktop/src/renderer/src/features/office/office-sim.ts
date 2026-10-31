/**
 * Simulação visual do escritório: posições em coordenadas de piso (ladrilhos), sem relação com o processo principal.
 * O estado real das execuções decide o que cada Boo faz; aqui só se decide como ele anda até lá.
 */
export type Point = { x: number; y: number }
export type PoiKind = 'coffee' | 'plant' | 'sofa' | 'window' | 'board' | 'shelf'
export interface Poi { id: string; kind: PoiKind; at: Point }
export interface OfficeLayout { width: number; depth: number; desks: Record<string, Point>; chiefId?: string; pois: Poi[] }
export interface SimDesk { id: string; active: boolean; fromChief: boolean }
export type ActorMode = 'walking' | 'desk' | 'idle' | 'talk' | 'sleep' | 'errand'
export interface Actor {
  id: string; pos: Point; path: Point[]; mode: ActorMode; facing: 1 | -1; wait: number; poi?: string
  errand?: { kind: 'deliver' | 'report'; target: string; phase: 'go' | 'show' | 'back' }
  badge?: 'paper' | 'check'
}
export interface Sim { actors: Map<string, Actor>; previous: Map<string, SimDesk>; deliveries: string[] }

export const WALK_SPEED = 1.7 // ladrilhos por segundo
const SHOW_SECONDS = 1.8
const near = (a: Point, b: Point, radius = 0.05) => Math.hypot(a.x - b.x, a.y - b.y) <= radius
/** Onde o Boo fica ao trabalhar: atrás da mesa, de frente para quem olha. */
export const seatOf = (desk: Point): Point => ({ x: desk.x, y: desk.y - 0.85 })
/** Onde alguém para ao visitar a mesa: na frente dela. */
export const frontOf = (desk: Point): Point => ({ x: desk.x, y: desk.y + 0.95 })

export function createSim(): Sim { return { actors: new Map(), previous: new Map(), deliveries: [] } }

/** Caminho em L pelos eixos do piso: anda em x e depois em y, como pelos corredores. */
function route(actor: Actor, target: Point) {
  const corner = { x: target.x, y: actor.pos.y }
  actor.path = [corner, target].filter((point, index, list) => !near(point, index ? list[index - 1]! : actor.pos))
  actor.mode = actor.path.length ? 'walking' : actor.mode
}

function pickPoi(layout: OfficeLayout, actor: Actor, actors: Actor[], rng: () => number): Poi | undefined {
  const taken = new Set(actors.filter(other => other !== actor && other.mode === 'sleep').map(other => other.poi))
  const options = layout.pois.filter(poi => poi.id !== actor.poi && !(poi.kind === 'sofa' && taken.has(poi.id)))
  return options[Math.floor(rng() * options.length)]
}

/** Avança a simulação dt segundos. Mutável de propósito: roda a cada quadro sem criar objetos novos. */
export function stepSim(sim: Sim, layout: OfficeLayout, desks: SimDesk[], dt: number, rng: () => number = Math.random): Sim {
  const chief = layout.chiefId ? sim.actors.get(layout.chiefId) : undefined
  // Transições reais viram recados: delegação nova do Chief e entrega de resultado.
  for (const desk of desks) {
    const before = sim.previous.get(desk.id)
    if (before && !before.active && desk.active && desk.fromChief && layout.chiefId && desk.id !== layout.chiefId && !sim.deliveries.includes(desk.id)) sim.deliveries.push(desk.id)
    const actor = sim.actors.get(desk.id)
    if (before?.active && !desk.active && before.fromChief && layout.chiefId && desk.id !== layout.chiefId && actor) {
      actor.errand = { kind: 'report', target: layout.chiefId, phase: 'go' }
      route(actor, frontOf(layout.desks[layout.chiefId]!))
    }
    sim.previous.set(desk.id, desk)
  }
  const ids = new Set(desks.map(desk => desk.id))
  for (const id of sim.actors.keys()) if (!ids.has(id)) sim.actors.delete(id)
  for (const desk of desks) if (!sim.actors.has(desk.id)) {
    const home = layout.desks[desk.id]
    if (!home) continue
    const start = desk.active ? seatOf(home) : (layout.pois[Math.floor(rng() * layout.pois.length)]?.at || frontOf(home))
    sim.actors.set(desk.id, { id: desk.id, pos: { ...start }, path: [], mode: desk.active ? 'desk' : 'idle', facing: 1, wait: rng() * 4 })
  }
  const actors = [...sim.actors.values()]
  const active = new Map(desks.map(desk => [desk.id, desk.active]))
  if (chief && !chief.errand && sim.deliveries.length) {
    const target = sim.deliveries.shift()!
    if (layout.desks[target]) { chief.errand = { kind: 'deliver', target, phase: 'go' }; route(chief, frontOf(layout.desks[target]!)) }
  }

  for (const actor of actors) {
    const home = layout.desks[actor.id]!
    if (actor.path.length) {
      // Anda até o próximo ponto; o lado para onde olha segue o movimento na tela.
      const next = actor.path[0]!
      const dx = next.x - actor.pos.x, dy = next.y - actor.pos.y
      const distance = Math.hypot(dx, dy), stride = WALK_SPEED * dt
      if (dx - dy !== 0) actor.facing = dx - dy > 0 ? 1 : -1
      if (distance <= stride) { actor.pos = { ...next }; actor.path.shift() } else actor.pos = { x: actor.pos.x + dx / distance * stride, y: actor.pos.y + dy / distance * stride }
      actor.mode = 'walking'
      if (actor.path.length) continue
    }
    if (actor.errand) {
      const errand = actor.errand
      if (errand.phase === 'go') { errand.phase = 'show'; actor.wait = SHOW_SECONDS; actor.badge = errand.kind === 'deliver' ? 'paper' : 'check'; actor.mode = 'errand'; continue }
      if (errand.phase === 'show') {
        actor.wait -= dt; actor.mode = 'errand'
        if (actor.wait > 0) continue
        actor.badge = undefined; errand.phase = 'back'
        if (errand.kind === 'deliver') { route(actor, seatOf(home)); continue }
      }
      actor.errand = undefined; actor.wait = 0
    }
    if (active.get(actor.id)) {
      if (!near(actor.pos, seatOf(home))) route(actor, seatOf(home))
      else { actor.mode = 'desk'; actor.facing = 1; actor.poi = undefined }
      continue
    }
    // Livre: passeia entre os pontos da sala, conversa com quem encontrar e às vezes cochila no sofá.
    actor.wait -= dt
    if (actor.wait > 0) {
      if (actor.mode !== 'sleep') actor.mode = actors.some(other => other !== actor && other.mode !== 'walking' && !active.get(other.id) && near(other.pos, actor.pos, 1.3)) ? 'talk' : 'idle'
      continue
    }
    const poi = pickPoi(layout, actor, actors, rng)
    if (!poi) { actor.mode = 'idle'; actor.wait = 5; continue }
    actor.poi = poi.id
    route(actor, poi.at)
    if (!actor.path.length) actor.mode = poi.kind === 'sofa' ? 'sleep' : 'idle'
    actor.wait = poi.kind === 'sofa' ? 10 + rng() * 8 : 4 + rng() * 6
    if (poi.kind === 'sofa') actor.mode = actor.path.length ? 'walking' : 'sleep'
  }
  // Ao chegar no sofá, dorme durante a espera.
  for (const actor of actors) if (!actor.path.length && actor.mode === 'idle' && layout.pois.find(poi => poi.id === actor.poi)?.kind === 'sofa') actor.mode = 'sleep'
  return sim
}
