/**
 * Simulação visual do escritório: posições em coordenadas de piso (ladrilhos), sem relação com o processo principal.
 * O estado real das execuções decide o que cada Boo faz; aqui se decide como ele anda, descansa e reage.
 */
export type Point = { x: number; y: number }
export interface Rect { x: number; y: number; w: number; d: number }
export type PoiKind = 'coffee' | 'plant' | 'sofa' | 'window' | 'board' | 'shelf'
export interface Poi { id: string; kind: PoiKind; at: Point }
export interface OfficeLayout { width: number; depth: number; desks: Record<string, Point>; chiefId?: string; pois: Poi[]; blocked?: Rect[] }
export interface SimDesk { id: string; active: boolean; fromChief: boolean; failed?: boolean }
export type ActorMode = 'walking' | 'desk' | 'idle' | 'talk' | 'sleep' | 'errand' | 'celebrate' | 'dizzy'
export type ErrandKind = 'deliver' | 'report' | 'help' | 'rounds'
export interface Actor {
  id: string; pos: Point; path: Point[]; mode: ActorMode; facing: 1 | -1; wait: number; poi?: string; target?: Point
  /** Necessidades de 0 a 1: energia cai trabalhando; social cai sozinho. */
  energy: number; social: number
  /** Segundos restantes de uma reação (comemorar, tontura). */
  react: number
  prefer?: PoiKind
  errand?: { kind: ErrandKind; target: string; phase: 'go' | 'show' | 'back' }
  badge?: 'paper' | 'check' | 'help' | 'eyes'
}
export interface Sim { actors: Map<string, Actor>; previous: Map<string, SimDesk>; deliveries: string[]; helps: string[]; roundsIn: number }

export const WALK_SPEED = 1.7 // ladrilhos por segundo
const SHOW_SECONDS = 1.8
const CELL = 0.5
const MARGIN = 0.2
const near = (a: Point, b: Point, radius = 0.05) => Math.hypot(a.x - b.x, a.y - b.y) <= radius
/** Onde o Boo fica ao trabalhar: atrás da mesa, de frente para quem olha. */
export const seatOf = (desk: Point): Point => ({ x: desk.x, y: desk.y - 0.85 })
/** Onde alguém para ao visitar a mesa: na frente dela. */
export const frontOf = (desk: Point): Point => ({ x: desk.x, y: desk.y + 0.95 })
const BADGE: Record<ErrandKind, Actor['badge']> = { deliver: 'paper', report: 'check', help: 'help', rounds: 'eyes' }

export function createSim(): Sim { return { actors: new Map(), previous: new Map(), deliveries: [], helps: [], roundsIn: 10 } }

/** Ladrilho livre: dentro da sala e fora dos móveis (com folga). */
function free(layout: OfficeLayout, point: Point): boolean {
  if (point.x < MARGIN || point.y < MARGIN || point.x > layout.width - MARGIN || point.y > layout.depth - MARGIN) return false
  return !(layout.blocked || []).some(rect => point.x > rect.x - MARGIN && point.x < rect.x + rect.w + MARGIN && point.y > rect.y - MARGIN && point.y < rect.y + rect.d + MARGIN)
}

/** Caminho pelo piso desviando dos móveis: A* numa grade de meio ladrilho, depois só as viradas. */
export function findPath(layout: OfficeLayout, from: Point, to: Point): Point[] {
  const cols = Math.round(layout.width / CELL), rows = Math.round(layout.depth / CELL)
  const key = (x: number, y: number) => y * (cols + 1) + x
  const at = (x: number, y: number) => ({ x: x * CELL, y: y * CELL })
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x <= cols && y <= rows && free(layout, at(x, y))
  const nearest = (point: Point) => {
    const cx = Math.round(point.x / CELL), cy = Math.round(point.y / CELL)
    for (let radius = 0; radius < 6; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
      if (open(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy }
    }
    return undefined
  }
  const start = nearest(from), goal = nearest(to)
  if (!start || !goal) return [to]
  const g = new Map<number, number>([[key(start.x, start.y), 0]])
  const came = new Map<number, number>()
  const frontier: { x: number; y: number; f: number }[] = [{ ...start, f: 0 }]
  const done = new Set<number>()
  const h = (x: number, y: number) => Math.hypot(goal.x - x, goal.y - y)
  while (frontier.length) {
    frontier.sort((a, b) => a.f - b.f)
    const current = frontier.shift()!
    const ck = key(current.x, current.y)
    if (done.has(ck)) continue
    done.add(ck)
    if (current.x === goal.x && current.y === goal.y) break
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nx = current.x + dx, ny = current.y + dy
      // Diagonal só sem cortar a quina de um móvel.
      if (!open(nx, ny) || (dx && dy && (!open(current.x + dx, current.y) || !open(current.x, current.y + dy)))) continue
      const cost = g.get(ck)! + (dx && dy ? Math.SQRT2 : 1)
      const nk = key(nx, ny)
      if (cost < (g.get(nk) ?? Infinity)) { g.set(nk, cost); came.set(nk, ck); frontier.push({ x: nx, y: ny, f: cost + h(nx, ny) }) }
    }
  }
  const goalKey = key(goal.x, goal.y)
  if (!g.has(goalKey)) return [to]
  const cells: Point[] = []
  for (let k: number | undefined = goalKey; k !== undefined; k = came.get(k)) cells.unshift(at(k % (cols + 1), Math.floor(k / (cols + 1))))
  // Mantém só as viradas; o destino exato fecha o caminho.
  const turns = cells.filter((point, index) => {
    if (index === 0 || index === cells.length - 1) return index !== 0
    const a = cells[index - 1]!, b = cells[index + 1]!
    return Math.sign(point.x - a.x) !== Math.sign(b.x - point.x) || Math.sign(point.y - a.y) !== Math.sign(b.y - point.y)
  })
  return [...turns.filter(point => !near(point, from, 0.3)), to].filter((point, index, list) => index === list.length - 1 || !near(point, list[index + 1]!, 0.1))
}

function route(layout: OfficeLayout, actor: Actor, target: Point) {
  actor.target = target
  actor.path = near(actor.pos, target) ? [] : findPath(layout, actor.pos, target)
  if (actor.path.length) actor.mode = 'walking'
}

/** Lugar livre em volta do ponto de interesse, para os Boos não ficarem um em cima do outro. */
function spotNear(poi: Poi, actor: Actor, actors: Actor[]): Point {
  const offsets = [[0, 0], [0.7, 0.35], [-0.7, 0.35], [0.35, 0.75], [-0.35, 0.75]]
  for (const [dx, dy] of offsets) {
    const spot = { x: poi.at.x + dx!, y: poi.at.y + dy! }
    if (!actors.some(other => other !== actor && near(other.target || other.pos, spot, 0.4))) return spot
  }
  return poi.at
}

/** Escolhe o próximo lugar pelas necessidades: cansado vai ao sofá; sozinho procura o café (melhor se já tem alguém). */
function nextPoi(layout: OfficeLayout, actor: Actor, actors: Actor[], rng: () => number): Poi | undefined {
  const sofaTaken = actors.some(other => other !== actor && other.mode === 'sleep')
  const byKind = (kind: PoiKind) => layout.pois.find(poi => poi.kind === kind)
  if (actor.prefer) { const preferred = byKind(actor.prefer); actor.prefer = undefined; if (preferred) return preferred }
  if (actor.energy < 0.3 && !sofaTaken) return byKind('sofa')
  const coffee = byKind('coffee')
  const company = coffee && actors.some(other => other !== actor && other.mode !== 'desk' && near(other.pos, coffee.at, 1.4))
  if (coffee && actor.social < 0.5 && (company || rng() < 0.6)) return coffee
  const options = layout.pois.filter(poi => poi.id !== actor.poi && poi.kind !== 'sofa')
  return options[Math.floor(rng() * options.length)]
}

function startErrand(layout: OfficeLayout, actor: Actor, kind: ErrandKind, target: string) {
  actor.errand = { kind, target, phase: 'go' }
  route(layout, actor, frontOf(layout.desks[target]!))
}

/** Avança a simulação dt segundos. Mutável de propósito: roda a cada quadro sem criar objetos novos. */
export function stepSim(sim: Sim, layout: OfficeLayout, desks: SimDesk[], dt: number, rng: () => number = Math.random): Sim {
  const ids = new Set(desks.map(desk => desk.id))
  for (const id of sim.actors.keys()) if (!ids.has(id)) sim.actors.delete(id)
  for (const desk of desks) if (!sim.actors.has(desk.id)) {
    const home = layout.desks[desk.id]
    if (!home) continue
    const start = desk.active ? seatOf(home) : (layout.pois.filter(poi => poi.kind !== 'sofa')[Math.floor(rng() * Math.max(1, layout.pois.length - 1))]?.at || frontOf(home))
    sim.actors.set(desk.id, { id: desk.id, pos: { ...start }, path: [], mode: desk.active ? 'desk' : 'idle', facing: 1, wait: rng() * 4, energy: 0.6 + rng() * 0.4, social: 0.5 + rng() * 0.5, react: 0 })
  }
  const chiefId = layout.chiefId
  // Transições reais: delegação nova do Chief, entrega do resultado, comemoração ou tontura quando falha.
  for (const desk of desks) {
    const before = sim.previous.get(desk.id)
    const actor = sim.actors.get(desk.id)
    if (before && !before.active && desk.active && desk.fromChief && chiefId && desk.id !== chiefId && !sim.deliveries.includes(desk.id)) sim.deliveries.push(desk.id)
    if (before?.active && !desk.active && actor) {
      if (desk.failed) { actor.mode = 'dizzy'; actor.react = 2.5; actor.path = []; if (!sim.helps.includes(desk.id)) sim.helps.push(desk.id) }
      else if (before.fromChief && chiefId && desk.id !== chiefId) startErrand(layout, actor, 'report', chiefId)
      else { actor.mode = 'celebrate'; actor.react = 1.6; actor.path = []; actor.prefer = 'coffee' }
    }
    sim.previous.set(desk.id, desk)
  }
  const actors = [...sim.actors.values()]
  const active = new Map(desks.map(desk => [desk.id, desk.active]))
  const chief = chiefId ? sim.actors.get(chiefId) : undefined
  if (chief && !chief.errand && sim.deliveries.length) {
    const target = sim.deliveries.shift()!
    if (layout.desks[target]) startErrand(layout, chief, 'deliver', target)
  }
  // Quem falhou recebe a visita de um Boo livre e acordado, o mais perto.
  if (sim.helps.length) {
    const target = sim.helps[0]!
    const helper = actors.filter(other => other.id !== target && !active.get(other.id) && !other.errand && other.mode !== 'sleep' && other.react <= 0)
      .sort((a, b) => Math.hypot(a.pos.x - layout.desks[target]!.x, a.pos.y - layout.desks[target]!.y) - Math.hypot(b.pos.x - layout.desks[target]!.x, b.pos.y - layout.desks[target]!.y))[0]
    if (helper) { sim.helps.shift(); startErrand(layout, helper, 'help', target) }
  }
  // Chief livre faz rondas pelas mesas de quem está trabalhando.
  if (chief && chiefId && !active.get(chiefId) && !chief.errand && chief.react <= 0) {
    sim.roundsIn -= dt
    const working = actors.filter(other => other.id !== chiefId && other.mode === 'desk')
    if (sim.roundsIn <= 0 && working.length) { startErrand(layout, chief, 'rounds', working[Math.floor(rng() * working.length)]!.id); sim.roundsIn = 14 + rng() * 8 }
  }

  for (const actor of actors) {
    const home = layout.desks[actor.id]!
    const working = !!active.get(actor.id)
    // Começou a trabalhar: larga recado de cortesia e vai para a mesa (entregas do Chief continuam).
    if (working && actor.errand && actor.errand.kind !== 'deliver') { actor.errand = undefined; actor.badge = undefined; actor.path = [] }
    if (working) actor.energy = Math.max(0, actor.energy - 0.01 * dt)
    if (actor.react > 0) { actor.react -= dt; if (actor.react > 0) continue; actor.mode = 'idle'; actor.wait = 0 }
    if (actor.path.length) {
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
      if (errand.phase === 'go') { errand.phase = 'show'; actor.wait = SHOW_SECONDS; actor.badge = BADGE[errand.kind]; actor.mode = 'errand'; continue }
      if (errand.phase === 'show') {
        actor.wait -= dt; actor.mode = 'errand'
        if (actor.wait > 0) continue
        actor.badge = undefined; errand.phase = 'back'
        if (errand.kind === 'deliver' && working) { route(layout, actor, seatOf(home)); continue }
        if (errand.kind === 'report') actor.prefer = 'coffee'
      }
      actor.errand = undefined; actor.wait = 0
    }
    if (working) {
      if (!near(actor.pos, seatOf(home))) route(layout, actor, seatOf(home))
      else { actor.mode = 'desk'; actor.facing = 1; actor.poi = undefined; actor.target = undefined }
      continue
    }
    // Livre: dorme até recuperar a energia, conversa quando tem alguém perto, senão vai para o próximo lugar.
    if (actor.mode === 'sleep') {
      actor.energy = Math.min(1, actor.energy + 0.06 * dt)
      if (actor.energy < 0.95) continue
      actor.wait = 0
    } else actor.energy = Math.min(1, actor.energy + 0.004 * dt)
    const partner = actors.find(other => other !== actor && !active.get(other.id) && !other.path.length && other.mode !== 'sleep' && other.react <= 0 && near(other.pos, actor.pos, 1.3))
    actor.social = Math.max(0, Math.min(1, actor.social + (partner ? 0.08 : -0.01) * dt))
    actor.wait -= dt
    if (actor.wait > 0 && actor.mode !== 'sleep') {
      actor.mode = partner ? 'talk' : 'idle'
      if (partner) { const dx = partner.pos.x - actor.pos.x - (partner.pos.y - actor.pos.y); if (dx) actor.facing = dx > 0 ? 1 : -1 }
      continue
    }
    const poi = nextPoi(layout, actor, actors, rng)
    if (!poi) { actor.mode = 'idle'; actor.wait = 5; continue }
    actor.poi = poi.id
    route(layout, actor, poi.kind === 'sofa' ? poi.at : spotNear(poi, actor, actors))
    actor.wait = 5 + rng() * 5
    if (!actor.path.length) actor.mode = poi.kind === 'sofa' ? 'sleep' : 'idle'
  }
  // Ao chegar no sofá, dorme.
  for (const actor of actors) if (!actor.path.length && actor.mode === 'idle' && layout.pois.find(poi => poi.id === actor.poi)?.kind === 'sofa') actor.mode = 'sleep'
  return sim
}
