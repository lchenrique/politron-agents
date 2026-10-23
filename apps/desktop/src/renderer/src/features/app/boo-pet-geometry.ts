import { BOO_BODY_PATHS } from './boo-appearance'

/** Contorno do corpo como polígono, amostrando as curvas (o corpo só usa M, L, Q, C e Z absolutos). */
function outline(d: string): [number, number][] {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+/g) || []
  const points: [number, number][] = []
  let i = 0, x = 0, y = 0, command = 'M'
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[MLQCZ]/.test(tokens[i])) command = tokens[i++]
    if (command === 'Z') continue
    if (command === 'M' || command === 'L') { x = num(); y = num() }
    else {
      const control = Array.from({length: command === 'Q' ? 4 : 6}, num)
      const [x0, y0] = [x, y]
      ;[x, y] = control.slice(-2)
      for (let t = .1; t < 1; t += .1) {
        const u = 1 - t
        if (command === 'Q') points.push([u * u * x0 + 2 * u * t * control[0] + t * t * x, u * u * y0 + 2 * u * t * control[1] + t * t * y])
        else points.push([u ** 3 * x0 + 3 * u * u * t * control[0] + 3 * u * t * t * control[2] + t ** 3 * x, u ** 3 * y0 + 3 * u * u * t * control[1] + 3 * u * t * t * control[3] + t ** 3 * y])
      }
    }
    points.push([x, y])
  }
  return points
}

/** Largura contínua do corpo na linha y, passando pelo centro (x = 120). */
function widthAt(polygon: [number, number][], y: number): number {
  const xs: number[] = []
  polygon.forEach(([x1, y1], index) => {
    const [x2, y2] = polygon[(index + 1) % polygon.length]
    if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1))
  })
  xs.sort((a, b) => a - b)
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k] <= 120 && xs[k + 1] >= 120) return xs[k + 1] - xs[k]
  return 0
}

const outlines = new Map<string, [number, number][]>()
const boundsCache = new Map<string, {top: number; bottom: number; width: number}>()
const linesCache = new Map<string, number>()
const polygonOf = (shape: string) => {
  const paths: Record<string, string> = BOO_BODY_PATHS
  const key = paths[shape] ? shape : 'round'
  if (!outlines.has(key)) outlines.set(key, outline(paths[key]))
  return outlines.get(key)!
}

/** Largura do corpo na linha y (coordenadas do desenho, antes da escala de largura/altura). */
export const shapeWidthAt = (shape: string, y: number) => widthAt(polygonOf(shape), y)

/** Topo, base e largura máxima do corpo. */
export function shapeBounds(shape: string) {
  const existing = boundsCache.get(shape)
  if (existing) return existing
  const polygon = polygonOf(shape)
  const ys = polygon.map(([, y]) => y)
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)]
  let width = 0
  for (let y = top; y < bottom; y++) width = Math.max(width, widthAt(polygon, y))
  const bounds = {top, bottom, width}
  boundsCache.set(shape, bounds)
  return bounds
}

/**
 * Primeira linha, de cima para baixo, em que o corpo já tem `ratio` da largura máxima.
 * É o ponto equivalente entre formatos: a ponta da Gota e as orelhas do Gatinho não contam como cabeça.
 */
export function shapeLineAt(shape: string, ratio: number): number {
  const key = `${shape}:${ratio.toFixed(5)}`
  const cached = linesCache.get(key)
  if (cached !== undefined) return cached
  const {top, bottom, width} = shapeBounds(shape)
  let y = top
  while (y < bottom && shapeWidthAt(shape, y) < width * ratio) y += .5
  linesCache.set(key, y)
  return y
}
