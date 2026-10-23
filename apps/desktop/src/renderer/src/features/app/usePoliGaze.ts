import { useEffect, useSyncExternalStore, type RefObject } from 'react'

/** Avatares registrados; um único listener de ponteiro atende todos, sem re-render do React. */
const tracked = new Set<HTMLElement>()
let pointer: { x: number; y: number } | null = null
let speed = 0
let lastMove: { x: number; y: number; at: number } | null = null
let frame = 0

const MAX_LOOK_X = 7
const MAX_LOOK_Y = 5
const MAX_LEAN = 7
/** Ponteiro mais rápido que isso (px/ms) ao entrar no raio assusta o avatar. */
export const STARTLE_SPEED = 1.8
/** Sem mexer mouse nem teclado por esse tempo, os avatares cochilam. */
export const SLEEP_AFTER_MS = 45_000
export const STARTLE_EVENT = 'poli-startle'
export const GAZE_EVENT = 'poli-gaze'

function reset(element: HTMLElement) {
  if (element.dataset.near === 'false') return
  element.style.setProperty('--poli-look-x', '0')
  element.style.setProperty('--poli-look-y', '0')
  element.style.setProperty('--poli-lean', '0deg')
  element.dataset.near = 'false'
  if (element.dataset.riveActive === 'true') element.dispatchEvent(new CustomEvent(GAZE_EVENT, { detail: { x: 0, y: 0 } }))
}

/** Olhos apontam para o cursor e o corpo inclina mais quanto mais perto ele está. */
export function applyGaze(element: HTMLElement, x: number, y: number, pointerSpeed = 0, box = element.getBoundingClientRect()) {
  if (!box.width) return reset(element)
  const dx = x - (box.left + box.width / 2)
  const dy = y - (box.top + box.height / 2)
  const distance = Math.hypot(dx, dy)
  const radius = Math.max(160, box.width * 3)
  if (distance > radius) return reset(element)
  const reach = Math.min(1, distance / (box.width / 2))
  const unitX = distance ? dx / distance : 0
  const unitY = distance ? dy / distance : 0
  const closeness = 1 - distance / radius
  const gazeX = unitX * reach * MAX_LOOK_X
  const gazeY = unitY * reach * MAX_LOOK_Y
  element.style.setProperty('--poli-look-x', gazeX.toFixed(2))
  element.style.setProperty('--poli-look-y', gazeY.toFixed(2))
  if (element.dataset.riveActive === 'true') element.dispatchEvent(new CustomEvent(GAZE_EVENT, { detail: { x: gazeX, y: gazeY } }))
  element.style.setProperty('--poli-lean', `${(unitX * closeness * MAX_LEAN).toFixed(2)}deg`)
  if (element.dataset.near !== 'true' && pointerSpeed > STARTLE_SPEED) element.dispatchEvent(new CustomEvent(STARTLE_EVENT))
  element.dataset.near = 'true'
}

function flush() {
  frame = 0
  // Ler todas as posições antes de alterar estilos evita reflows entre avatares.
  const elements = [...tracked]
  const boxes = pointer ? elements.map(element => element.getBoundingClientRect()) : []
  elements.forEach((element, index) => pointer ? applyGaze(element, pointer.x, pointer.y, speed, boxes[index]) : reset(element))
}

/* Sonolência compartilhada: um relógio só para todos os avatares. */
let drowsy = false
let lastActivity = Date.now()
let sleepTimer: ReturnType<typeof setInterval> | null = null
const sleepers = new Set<() => void>()

function setDrowsy(value: boolean) {
  if (drowsy === value) return
  drowsy = value
  for (const notify of sleepers) notify()
}

function wake() { lastActivity = Date.now(); setDrowsy(false) }
function checkSleep() { if (Date.now() - lastActivity >= SLEEP_AFTER_MS) setDrowsy(true) }

function schedule() { if (!frame) frame = requestAnimationFrame(flush) }
function onMove(event: PointerEvent) {
  const now = performance.now()
  if (lastMove && now > lastMove.at) speed = Math.hypot(event.clientX - lastMove.x, event.clientY - lastMove.y) / (now - lastMove.at)
  lastMove = { x: event.clientX, y: event.clientY, at: now }
  pointer = { x: event.clientX, y: event.clientY }
  wake()
  schedule()
}
function onLeave() { pointer = null; lastMove = null; speed = 0; schedule() }

function listen() {
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('keydown', wake)
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onLeave)
  lastActivity = Date.now()
  sleepTimer = setInterval(checkSleep, 5_000)
}

function unlisten() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('keydown', wake)
  document.documentElement.removeEventListener('pointerleave', onLeave)
  window.removeEventListener('blur', onLeave)
  if (frame) cancelAnimationFrame(frame)
  if (sleepTimer) clearInterval(sleepTimer)
  frame = 0
  sleepTimer = null
  setDrowsy(false)
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function usePoliGaze(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled || reducedMotion()) return
    if (!tracked.size) listen()
    tracked.add(element)
    if (pointer) applyGaze(element, pointer.x, pointer.y)
    return () => {
      tracked.delete(element)
      reset(element)
      if (!tracked.size) unlisten()
    }
  }, [ref, enabled])
}

function subscribeDrowsy(notify: () => void) { sleepers.add(notify); return () => { sleepers.delete(notify) } }
const subscribeInactive = () => () => undefined
const awakeSnapshot = () => false

/** Verdadeiro quando o usuário ficou parado tempo suficiente para os avatares cochilarem. */
export function usePoliDrowsy(enabled: boolean) {
  return useSyncExternalStore(enabled ? subscribeDrowsy : subscribeInactive, enabled ? () => drowsy : awakeSnapshot, awakeSnapshot)
}
