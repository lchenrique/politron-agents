// Uso: node laptop-emit.cjs 30 22 108 30 198 128  |  node headset.cjs 34 8 (saída JSON vai para boo-working-art.ts)
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const [az, el, open, X0, BOTTOM, WIDTH] = process.argv.slice(2).map(Number)
const g = JSON.parse(execFileSync('node', [path.join(__dirname, 'laptop-model.cjs'), az, el, open]))
const all = g.faces.flatMap(f => f.pts), xs = all.map(p => p[0]), ys = all.map(p => p[1])
const k = WIDTH / (Math.max(...xs) - Math.min(...xs)), dx = X0 - Math.min(...xs) * k, dy = BOTTOM - Math.max(...ys) * k
const T = p => [+(p[0] * k + dx).toFixed(1), +(p[1] * k + dy).toFixed(1)]
const d = q => 'M' + q.map(T).map(p => p.join(' ')).join(' L') + ' Z'
const cls = f => f.part === 'lid' ? (f.tag === 'z1' ? 'lid' : 'edge') : (f.tag === 'z1' ? 'deck' : 'side')
const faces = g.faces.map(f => [cls(f), d(f.pts)])
// Logo: centro da tampa, 7 de 30 unidades de largura; o desenho do Boo mede ~163 px.
const o = g.logo.o, ex = [g.logo.x[0] - o[0], g.logo.x[1] - o[1]], es = [g.logo.s[0] - o[0], g.logo.s[1] - o[1]]
const c = T([o[0] + ex[0] * 15 + es[0] * 19 * .5, o[1] + ex[1] * 15 + es[1] * 19 * .5]), m = 7 / 163 * k
const a = ex[0] * m, b = ex[1] * m, cc = -es[0] * m, dd = -es[1] * m
const e = c[0] - a * 120 - cc * 100, f = c[1] - b * 120 - dd * 100
const top = [T([o[0] + es[0] * 19, o[1] + es[1] * 19]), T([o[0] + es[0] * 19 + ex[0] * 30, o[1] + es[1] * 19 + ex[1] * 30])]
console.log(JSON.stringify({ faces, logo: `matrix(${[a, b, cc, dd, e, f].map(v => +v.toFixed(4)).join(' ')})`, center: c, rim: `M${top[0].join(' ')} L${top[1].join(' ')}` }, null, 1))
