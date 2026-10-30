// Gera polígonos de um notebook 3D (base + tampa) em projeção ortográfica.
const [az = 35, el = 22, open = 108] = process.argv.slice(2).map(Number)
const W = 30, D = 20, tb = 1.4, H = 19, tl = 0.8
const rad = a => a * Math.PI / 180
const add = (a, b) => a.map((v, i) => v + b[i]), mul = (a, k) => a.map(v => v * k)
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const norm = a => mul(a, 1 / Math.hypot(...a))
// Observador atrás (+y), à esquerda (-x) e acima (+z) do notebook; o Boo fica do lado -y.
const view = norm([-Math.sin(rad(az)) * Math.cos(rad(el)), Math.cos(rad(az)) * Math.cos(rad(el)), Math.sin(rad(el))])
const fwd = mul(view, -1), right = norm(cross(fwd, [0, 0, 1])), up = cross(right, fwd)
const proj = p => [dot(p, right), -dot(p, up)]
function box(o, ex, ey, ez) { // paralelepípedo: origem + 3 arestas
  const P = (i, j, k) => add(add(add(o, mul(ex, i)), mul(ey, j)), mul(ez, k))
  return [
    { n: mul(ez, -1), q: [P(0,0,0), P(1,0,0), P(1,1,0), P(0,1,0)], tag: 'z0' }, { n: ez, q: [P(0,0,1), P(1,0,1), P(1,1,1), P(0,1,1)], tag: 'z1' },
    { n: mul(ey, -1), q: [P(0,0,0), P(1,0,0), P(1,0,1), P(0,0,1)], tag: 'y0' }, { n: ey, q: [P(0,1,0), P(1,1,0), P(1,1,1), P(0,1,1)], tag: 'y1' },
    { n: mul(ex, -1), q: [P(0,0,0), P(0,1,0), P(0,1,1), P(0,0,1)], tag: 'x0' }, { n: ex, q: [P(1,0,0), P(1,1,0), P(1,1,1), P(1,0,1)], tag: 'x1' },
  ].filter(f => dot(f.n, view) > 1e-6)
}
const base = box([0, 0, 0], [W, 0, 0], [0, D, 0], [0, 0, tb])
const th = rad(open), d = [0, -Math.cos(th), Math.sin(th)], n = [0, Math.sin(th), Math.cos(th)]
const lid = box([0, D, tb], [W, 0, 0], mul(d, H), mul(n, tl))
const faces = [...base.map(f => ({ ...f, part: 'base' })), ...lid.map(f => ({ ...f, part: 'lid' }))]
// Plano de trás da tampa para o logo: origem, eixo x (largura) e eixo s (altura).
const backO = add([0, D, tb], mul(n, tl))
const out = { view, faces: faces.map(f => ({ part: f.part, tag: f.tag, light: +dot(norm(f.n), norm([-0.4, 0.5, 0.8])).toFixed(3), pts: f.q.map(proj) })),
  logo: { o: proj(backO), x: proj(add(backO, [1, 0, 0])), s: proj(add(backO, d)) } }
console.log(JSON.stringify(out))
