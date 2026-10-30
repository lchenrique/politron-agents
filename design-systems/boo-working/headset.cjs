// Fone 3D em volta da cabeça do Boo (coordenadas do desenho de referência), projetado de frente.
const [yawDeg = 22, pitchDeg = 8] = process.argv.slice(2).map(Number)
const C = [121, 97], RB = [78, 80], EAR_X = 70, CUP_R = 21, CUP_D = 9, BAND_W = 11, BAND_T = 5
const rad = a => a * Math.PI / 180, yaw = rad(yawDeg), pitch = rad(pitchDeg)
// Rosto vira para a esquerda: a orelha direita (+x) vem para frente.
const rot = ([x, y, z]) => { let X = x * Math.cos(yaw) + z * Math.sin(yaw), Z = -x * Math.sin(yaw) + z * Math.cos(yaw)
  const Y = y * Math.cos(pitch) - Z * Math.sin(pitch); Z = y * Math.sin(pitch) + Z * Math.cos(pitch); return [X, Y, -Z] }
const scr = p => [+(C[0] + p[0]).toFixed(1), +(C[1] - p[1]).toFixed(1)]
const path = pts => 'M' + pts.map(scr).map(p => p.join(' ')).join(' L') + ' Z'
const hull = pts => { const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); const c = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
  const lo = [], up = []; for (const p of P) { while (lo.length > 1 && c(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p) }
  for (const p of P.reverse()) { while (up.length > 1 && c(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p) } return [...lo.slice(0, -1), ...up.slice(0, -1)] }
// Arco: fita com largura (z) e espessura (radial); metade com z<0 fica atrás da cabeça.
const N = 40, band = { front: [], back: [] }
for (const side of [-1, 1]) {
  const outer = [], inner = []
  for (let i = 0; i <= N; i++) {
    const phi = side * rad(90) * i / N, r = 1 + BAND_T / RB[0]
    const at = (k, z) => rot([RB[0] * k * Math.sin(phi), RB[1] * k * Math.cos(phi) - 0, z])
    outer.push(at(r, BAND_W / 2), at(r, -BAND_W / 2)); inner.push(at(1, BAND_W / 2), at(1, -BAND_W / 2))
  }
  const z = rot([side * RB[0], 0, 0])[2]
  band[z > 0 ? 'front' : 'back'].push(hullStrip(outer, inner))
}
function hullStrip(outer, inner) { // fita como união de quadriláteros consecutivos via casco de cada segmento
  const segs = []; for (let i = 0; i + 3 < outer.length; i += 2) segs.push(path(hull([outer[i], outer[i+1], outer[i+2], outer[i+3], inner[i], inner[i+1], inner[i+2], inner[i+3]].map(p => [p[0], p[1], p[2]])).map(p => p)))
  return segs.join(' ')
}
const shine = []; for (let i = 6; i <= 34; i++) { const phi = rad(-90 + 180 * i / 40); shine.push(rot([(RB[0] + BAND_T + .5) * Math.sin(phi), (RB[1] + BAND_T + .5) * Math.cos(phi), BAND_W * .1])) }
// Conchas: cilindro no eixo x, almofada encostada na cabeça e tampa por fora.
const circle = (x, r) => Array.from({ length: 48 }, (_, i) => { const t = 2 * Math.PI * i / 48; return rot([x, r * 1.12 * Math.sin(t), r * Math.cos(t)]) })
const cups = [-1, 1].map(side => {
  const pad = circle(side * EAR_X, CUP_R), cap = circle(side * (EAR_X + CUP_D), CUP_R * .92), face = circle(side * (EAR_X + CUP_D + .2), CUP_R * .62)
  const front = rot([side, 0, 0])[2] > 0
  return { side, front, shell: path(hull([...pad, ...cap])), cap: path(cap), face: path(face) }
})
const shineD = 'M' + shine.map(scr).map(p => p.join(' ')).join(' L')
console.log(JSON.stringify({ band, shine: shineD, cups }))
