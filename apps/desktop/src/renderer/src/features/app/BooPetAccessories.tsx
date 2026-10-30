/** Imported from D:/projetos pessoais/boo-pet/src/accessories.tsx on 2026-10-23.
    Shape-sensitive artwork and transforms retained; original source untouched. */
// Acessórios em SVG, desenhados de frente (2D) sobre o Boo "Bolinha" padrão (viewBox 0 -58 240 265).
// Cada parte tem cor própria. Chapéus são reposicionados e escalados conforme o formato e as proporções;
// óculos, máscara e bigode são desenhados em volta dos olhos e da boca de cada Boo.
import {useId, type ReactNode} from 'react'
import { mix } from './boo-pet-color'
import {shapeBounds, shapeLineAt, shapeWidthAt} from './boo-pet-geometry'
import type { BooPetLooks as Looks } from './boo-pet-looks'
import { extraHeads, extraFaces } from './BooPetExtraArt'

type Paint = {c: string[]; id: (key: string) => string; url: (key: string) => string}
type Colors = [label: string, color: string][]

/** Estilo chapado (2D): o "gradiente" é uma cor sólida; light/dark ficam na assinatura por compatibilidade. */
function Shade({id, color}: {id: string; color: string; light?: number; dark?: number}) {
 return <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color}/><stop offset="1" stopColor={color}/></linearGradient>
}
const edge = (color: string) => mix(color, 0, .38)

function star(cx: number, cy: number, r: number, inner = .5): string {
 return Array.from({length: 10}, (_, i) => {
  const angle = -Math.PI / 2 + i * Math.PI / 5
  const radius = i % 2 ? r * inner : r
  return `${i ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`
 }).join(' ') + 'Z'
}

function heart(cx: number, cy: number, s: number): string {
 const p = (x: number, y: number) => `${(cx + x * s).toFixed(1)} ${(cy + y * s).toFixed(1)}`
 return `M${p(0, -.35)} C${p(-.25, -1.05)} ${p(-1.15, -.95)} ${p(-1.1, -.15)} C${p(-1.05, .45)} ${p(-.4, .75)} ${p(0, 1.05)} C${p(.4, .75)} ${p(1.05, .45)} ${p(1.1, -.15)} C${p(1.15, -.95)} ${p(.25, -1.05)} ${p(0, -.35)}Z`
}

/** Brilho branco em arco, o mesmo em todos os itens para parecerem da mesma coleção. */
const Gloss = ({d, width = 4}: {d: string; width?: number}) => <path d={d} fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth={width} strokeLinecap="round"/>

/** Chapéus: `anchor` é o ponto onde o item apoia na cabeça do Boo "Bolinha". */
type Head = {label: string; colors: Colors; anchor: [number, number]; lift?: number; draw: (p: Paint) => ReactNode}
const HEADS: Record<string, Head> = {
 ...extraHeads,
 'cap': {label: 'Boné', colors: [['Copa', '#4a90e2'], ['Aba', '#2c6cb8'], ['Detalhes', '#ffd166']], anchor: [120, 58], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]}/><Shade id={id('b')} color={c[1]}/></defs>
  <path d="M56 60 C56 20 84 4 120 4 C156 4 184 20 184 60 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <path d="M120 7 Q101 30 96 60 M120 7 Q139 30 144 60" fill="none" stroke={edge(c[0])} strokeWidth="2" opacity=".45"/>
  <Gloss d="M72 38 Q82 16 106 10"/>
  <path d={star(120, 36, 9)} fill={c[2]} stroke={edge(c[2])} strokeWidth="1.2" strokeLinejoin="round"/>
  <circle cx="120" cy="6" r="5" fill={c[2]} stroke={edge(c[2])} strokeWidth="1.2"/>
  <path d="M42 60 Q120 46 198 60 Q194 76 120 78 Q46 76 42 60 Z" fill={url('b')} stroke={edge(c[1])} strokeWidth="2"/>
  <path d="M56 64 Q120 54 184 64" fill="none" stroke={mix(c[1], 255, .45)} strokeWidth="1.6" strokeDasharray="4 4"/>
 </>},
 'beanie': {label: 'Gorro', colors: [['Gorro', '#9b6bd6'], ['Barra', '#7a4fb8'], ['Pompom', '#ffd1e8']], anchor: [120, 66], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]}/><Shade id={id('b')} color={c[1]}/><clipPath id={id('clip')}><path d="M58 60 C56 16 86 0 120 0 C154 0 184 16 182 60 Z"/></clipPath></defs>
  <path d="M58 60 C56 16 86 0 120 0 C154 0 184 16 182 60 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <g clipPath={`url(#${id('clip')})`} stroke={edge(c[0])} strokeWidth="3" opacity=".22">{[66, 80, 94, 108, 120, 132, 146, 160, 174].map(x => <path key={x} d={`M${x} 60 Q${x + (120 - x) * .25} 24 120 0`} fill="none"/>)}</g>
  <Gloss d="M74 38 Q84 16 108 8"/>
  <rect x="52" y="46" width="136" height="22" rx="11" fill={url('b')} stroke={edge(c[1])} strokeWidth="2"/>
  <g stroke={edge(c[1])} strokeWidth="2.5" opacity=".35">{Array.from({length: 15}, (_, i) => <path key={i} d={`M${62 + i * 8} 50 V64`}/>)}</g>
  <g fill={c[2]} stroke={edge(c[2])} strokeWidth="1.2">{[0, 60, 120, 180, 240, 300].map(a => <circle key={a} cx={120 + 11 * Math.cos(a * Math.PI / 180)} cy={-6 + 11 * Math.sin(a * Math.PI / 180)} r="7"/>)}</g>
  <circle cx="120" cy="-6" r="12" fill={c[2]}/>
 </>},
 'top-hat': {label: 'Cartola', colors: [['Cartola', '#3a3150'], ['Faixa', '#e0457b'], ['Estrela', '#ffd166']], anchor: [120, 50], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]} light={.3}/><Shade id={id('b')} color={c[1]}/></defs>
  <path d="M86 -44 H154 Q159 -44 158 -39 L153 40 H87 L82 -39 Q81 -44 86 -44 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <path d="M87.2 22 H152.8 L152 40 H88 Z" fill={url('b')} stroke={edge(c[1])} strokeWidth="1.5"/>
  <path d={star(120, 31, 8)} fill={c[2]} stroke={edge(c[2])} strokeWidth="1.2" strokeLinejoin="round"/>
  <rect x="54" y="38" width="132" height="13" rx="6.5" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <Gloss d="M64 42 H96" width={3}/>
 </>},
 'witch-hat': {label: 'Bruxa', colors: [['Chapéu', '#6b46c1'], ['Faixa', '#2d1f4f'], ['Fivela', '#f5c542']], anchor: [120, 54], lift: 8, draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]}/><clipPath id={id('clip')}><path d="M72 46 Q96 18 106 -14 Q114 -42 140 -56 Q158 -62 162 -48 Q146 -50 138 -36 Q130 -12 138 12 Q144 30 168 46 Z"/></clipPath></defs>
  <path d="M72 46 Q96 18 106 -14 Q114 -42 140 -56 Q158 -62 162 -48 Q146 -50 138 -36 Q130 -12 138 12 Q144 30 168 46 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <Gloss d="M98 20 Q106 -6 114 -30"/>
  <rect x="60" y="28" width="120" height="18" fill={c[1]} clipPath={`url(#${id('clip')})`}/>
  <rect x="108" y="28" width="24" height="18" rx="3" fill="none" stroke={c[2]} strokeWidth="4"/>
  <path d="M28 52 Q120 30 212 52 Q200 66 120 64 Q40 66 28 52 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2"/>
  <Gloss d="M44 52 Q80 42 104 40" width={3}/>
 </>},
 'crown': {label: 'Coroa', colors: [['Ouro', '#f5c542'], ['Joias', '#e8508a']], anchor: [120, 50], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]}/></defs>
  <path d="M58 50 L54 4 L84 26 L102 -6 L120 18 L138 -6 L156 26 L186 4 L182 50 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2" strokeLinejoin="round"/>
  <rect x="58" y="36" width="124" height="14" rx="4" fill={mix(c[0], 0, .1)} stroke={edge(c[0])} strokeWidth="1.5"/>
  <g fill={mix(c[0], 255, .3)} stroke={edge(c[0])} strokeWidth="1.2">{[[54, 4], [102, -6], [138, -6], [186, 4]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="5"/>)}</g>
  <path d="M120 36 L127 43 L120 50 L113 43 Z" fill={c[1]} stroke={edge(c[1])} strokeWidth="1.2"/>
  <g fill={c[1]} stroke={edge(c[1])} strokeWidth="1">{[82, 158].map(x => <circle key={x} cx={x} cy="43" r="4"/>)}</g>
  <Gloss d="M66 30 L64 12" width={3}/>
 </>},
 'party-hat': {label: 'Chapéu de festa', colors: [['Chapéu', '#ff7eb6'], ['Listras', '#7ad3ff'], ['Pompom', '#ffe066']], anchor: [120, 48], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]}/><clipPath id={id('clip')}><path d="M84 48 L120 -38 L156 48 Q120 54 84 48 Z"/></clipPath></defs>
  <path d="M84 48 L120 -38 L156 48 Q120 54 84 48 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="2" strokeLinejoin="round"/>
  <g clipPath={`url(#${id('clip')})`} stroke={c[1]} strokeWidth="7">{[-10, 14, 38, 62, 86].map(y => <path key={y} d={`M70 ${y + 20} L170 ${y - 20}`}/>)}</g>
  <Gloss d="M110 -12 L98 26" width={3}/>
  <g fill={c[2]} stroke={edge(c[2])} strokeWidth="1">{[88, 99, 110, 121, 132, 143, 152].map(x => <circle key={x} cx={x} cy={48 + (x === 88 || x === 152 ? -1 : 1)} r="5.5"/>)}</g>
  <circle cx="120" cy="-40" r="9" fill={c[2]} stroke={edge(c[2])} strokeWidth="1.2"/>
 </>},
 'chef-hat': {label: 'Chapéu de chef', colors: [['Chapéu', '#ffffff'], ['Faixa', '#d9def2']], anchor: [120, 56], draw: ({c, id, url}) => <>
  <defs><Shade id={id('d')} color={c[0]} light={0} dark={.16}/><Shade id={id('b')} color={c[1]}/></defs>
  <path d="M76 44 L76 10 C60 2 62 -26 88 -26 C92 -42 110 -48 120 -42 C132 -48 150 -42 152 -26 C178 -26 180 2 164 10 L164 44 Z" fill={url('d')} stroke={mix(c[0], 0, .22)} strokeWidth="2" strokeLinejoin="round"/>
  <g stroke={mix(c[0], 0, .18)} strokeWidth="2" opacity=".6">{[98, 120, 142].map(x => <path key={x} d={`M${x} 8 V40`}/>)}</g>
  <Gloss d="M78 -14 Q82 -24 92 -24"/>
  <rect x="70" y="38" width="100" height="18" rx="8" fill={url('b')} stroke={edge(c[1])} strokeWidth="1.5"/>
 </>},
 'bow': {label: 'Laço', colors: [['Laço', '#ff6fae'], ['Bolinhas', '#ffffff']], anchor: [160, 30], draw: ({c, id, url}) => <g transform="translate(160 26) rotate(18)">
  <defs><Shade id={id('d')} color={c[0]}/></defs>
  <g fill={url('d')} stroke={edge(c[0])} strokeWidth="1.8" strokeLinejoin="round">
   <path d="M-4 4 L-14 26 L-6 23 L-1 29 L3 6 Z"/><path d="M4 4 L14 26 L6 23 L1 29 L-3 6 Z"/>
   <path d="M0 0 C-8 -20 -38 -26 -40 -6 C-42 12 -12 14 0 0 Z"/><path d="M0 0 C8 -20 38 -26 40 -6 C42 12 12 14 0 0 Z"/>
  </g>
  <g fill={c[1]} opacity=".9">{[[-28, -8], [-16, -12], [-22, 3], [28, -8], [16, -12], [22, 3]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6"/>)}</g>
  <ellipse cx="0" cy="1" rx="7" ry="8" fill={mix(c[0], 0, .12)} stroke={edge(c[0])} strokeWidth="1.8"/>
  <Gloss d="M-30 -14 Q-22 -20 -12 -16" width={2.5}/>
 </g>},
 'flower': {label: 'Flor', colors: [['Pétalas', '#ff9ec7'], ['Miolo', '#ffd166']], anchor: [80, 36], draw: ({c, id, url}) => <g transform="translate(80 30) rotate(-14)">
  <defs><Shade id={id('d')} color={c[0]}/></defs>
  <path d="M6 10 Q22 14 26 4 Q14 0 6 10 Z" fill="#6cc46f" stroke="#3f8f45" strokeWidth="1.2"/>
  <g fill={url('d')} stroke={edge(c[0])} strokeWidth="1.5">{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-11" rx="9" ry="12" transform={`rotate(${a})`}/>)}</g>
  <circle r="8" fill={c[1]} stroke={edge(c[1])} strokeWidth="1.5"/>
  <g fill={mix(c[1], 0, .3)}>{[[-3, -2], [3, -1], [0, 3]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3"/>)}</g>
  
 </g>},
 'halo': {label: 'Auréola', colors: [['Auréola', '#ffd95e']], anchor: [120, 30], draw: ({c}) => <>
  <ellipse cx="120" cy="-8" rx="40" ry="10" fill="none" stroke={c[0]} strokeOpacity=".25" strokeWidth="13"/>
  <ellipse cx="120" cy="-8" rx="40" ry="10" fill="none" stroke={mix(c[0], 0, .15)} strokeWidth="6"/>
  <ellipse cx="120" cy="-9" rx="40" ry="10" fill="none" stroke={mix(c[0], 255, .5)} strokeWidth="2"/>
 </>},
}

/** Medidas do rosto já com as proporções do Boo aplicadas. */
type Face = {x1: number; x2: number; y: number; r: number; mouthY: number; mouth: number}
type FaceItem = {label: string; colors: Colors; draw: (p: Paint, f: Face) => ReactNode}

const FACES: Record<string, FaceItem> = {
 ...extraFaces,
 'round-glasses': {label: 'Redondos', colors: [['Armação', '#c07a3a'], ['Lente', '#bfe6ff']], draw: ({c}, {x1, x2, y, r}) => <g fill="none" stroke={c[0]} strokeWidth="4" strokeLinecap="round">
  {[x1, x2].map(x => <circle key={x} cx={x} cy={y} r={r} fill={c[1]} fillOpacity=".22"/>)}
  <path d={`M${x1 + r} ${y - 3} Q120 ${y - 9} ${x2 - r} ${y - 3} M${x1 - r} ${y - 4} L${x1 - r - 13} ${y - 8} M${x2 + r} ${y - 4} L${x2 + r + 13} ${y - 8}`}/>
  {[x1, x2].map(x => <path key={x} d={`M${x - r * .55} ${y - r * .3} Q${x - r * .4} ${y - r * .65} ${x - r * .05} ${y - r * .7}`} stroke="#fff" strokeOpacity=".7" strokeWidth="2.2"/>)}
 </g>},
 'sunglasses': {label: 'Óculos escuros', colors: [['Armação', '#1f2430'], ['Lente', '#27324d']], draw: ({c, id, url}, {x1, x2, y, r}) => <g>
  <defs><linearGradient id={id('l')} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c[1]}/><stop offset="1" stopColor={c[1]}/></linearGradient></defs>
  {[x1, x2].map(x => <rect key={x} x={x - r - 2} y={y - r * .8} width={2 * r + 4} height={r * 1.65} rx={r * .55} fill={url('l')} stroke={c[0]} strokeWidth="3.5"/>)}
  <path d={`M${x1 + r + 2} ${y - r * .45} Q120 ${y - r * .75} ${x2 - r - 2} ${y - r * .45} M${x1 - r - 2} ${y - r * .4} L${x1 - r - 15} ${y - r * .6} M${x2 + r + 2} ${y - r * .4} L${x2 + r + 15} ${y - r * .6}`} fill="none" stroke={c[0]} strokeWidth="3.5" strokeLinecap="round"/>
  {[x1, x2].map(x => <path key={x} d={`M${x - r * .6} ${y + r * .1} L${x - r * .05} ${y - r * .5} M${x - r * .1} ${y + r * .35} L${x + r * .35} ${y - r * .15}`} stroke="#fff" strokeOpacity=".55" strokeWidth="2.4" strokeLinecap="round"/>)}
 </g>},
 'heart-glasses': {label: 'Óculos de coração', colors: [['Armação', '#ff5fa2'], ['Lente', '#ffc2dc']], draw: ({c}, {x1, x2, y, r}) => <g fill="none" stroke={c[0]} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
  {[x1, x2].map(x => <path key={x} d={heart(x, y, r * .95)} fill={c[1]} fillOpacity=".3"/>)}
  <path d={`M${x1 + r} ${y - r * .3} Q120 ${y - r * .7} ${x2 - r} ${y - r * .3} M${x1 - r} ${y - r * .3} L${x1 - r - 12} ${y - r * .55} M${x2 + r} ${y - r * .3} L${x2 + r + 12} ${y - r * .55}`}/>
 </g>},
 'star-glasses': {label: 'Óculos de estrela', colors: [['Armação', '#ffc83d'], ['Lente', '#fff3b0']], draw: ({c}, {x1, x2, y, r}) => <g fill="none" stroke={c[0]} strokeWidth="3.6" strokeLinejoin="round" strokeLinecap="round">
  {[x1, x2].map(x => <path key={x} d={star(x, y + 1, r * 1.25, .58)} fill={c[1]} fillOpacity=".3"/>)}
  <path d={`M${x1 + r * .7} ${y - r * .25} Q120 ${y - r * .6} ${x2 - r * .7} ${y - r * .25} M${x1 - r * 1.15} ${y - r * .4} L${x1 - r - 14} ${y - r * .6} M${x2 + r * 1.15} ${y - r * .4} L${x2 + r + 14} ${y - r * .6}`}/>
 </g>},
 'monocle': {label: 'Monóculo', colors: [['Ouro', '#e8b84a']], draw: ({c}, {x1, y, r}) => <g fill="none" stroke={c[0]} strokeLinecap="round">
  <circle cx={x1} cy={y} r={r} strokeWidth="4" fill="#fff" fillOpacity=".15"/>
  <path d={`M${x1 - r * .7} ${y + r * .7} Q${x1 - r * 1.6} ${y + r * 2} ${x1 - r * 1.1} ${y + r * 3.2}`} strokeWidth="2" strokeDasharray="2 3"/>
  <path d={`M${x1 - r * .5} ${y - r * .35} Q${x1 - r * .35} ${y - r * .7} ${x1} ${y - r * .72}`} stroke="#fff" strokeOpacity=".7" strokeWidth="2"/>
 </g>},
 'mustache': {label: 'Bigode', colors: [['Bigode', '#6b3f22']], draw: ({c, id, url}, {mouthY, mouth}) => <g transform={`translate(120 ${mouthY - 9}) scale(${mouth})`}>
  <defs><Shade id={id('d')} color={c[0]} light={.25}/></defs>
  <path d="M0 0 C-6 -8 -20 -10 -30 -2 C-36 3 -42 1 -44 -5 C-47 6 -37 14 -24 10 C-14 7 -6 4 0 3 C6 4 14 7 24 10 C37 14 47 6 44 -5 C42 1 36 3 30 -2 C20 -10 6 -8 0 0 Z" fill={url('d')} stroke={edge(c[0])} strokeWidth="1.5" strokeLinejoin="round"/>
  <Gloss d="M-26 -4 Q-16 -7 -8 -3" width={2}/>
 </g>},
 'star-mask': {label: 'Máscara de herói', colors: [['Máscara', '#7b4dd6'], ['Estrela', '#ffd166']], draw: ({c, id, url}, {x1, x2, y, r}) => {
  const left = x1 - r - 12, right = x2 + r + 12, top = y - r - 2, bottom = y + r + 2
  return <g>
   <defs><Shade id={id('d')} color={c[0]}/></defs>
   <path fillRule="evenodd" fill={url('d')} stroke={edge(c[0])} strokeWidth="2" strokeLinejoin="round"
    d={`M${left - 6} ${top - 4} Q120 ${top - 8} ${right + 6} ${top - 4} Q${right} ${y} ${right - 6} ${bottom} Q${x2} ${bottom + 6} 120 ${y + 4} Q${x1} ${bottom + 6} ${left + 6} ${bottom} Q${left} ${y} ${left - 6} ${top - 4} Z
     M${x1 - r * .85} ${y} a${r * .85} ${r * .95} 0 1 0 ${r * 1.7} 0 a${r * .85} ${r * .95} 0 1 0 ${-r * 1.7} 0 Z
     M${x2 - r * .85} ${y} a${r * .85} ${r * .95} 0 1 0 ${r * 1.7} 0 a${r * .85} ${r * .95} 0 1 0 ${-r * 1.7} 0 Z`}/>
   <path d={star(120, top - 2, 7)} fill={c[1]} stroke={edge(c[1])} strokeWidth="1.2" strokeLinejoin="round"/>
  </g>
 }},
}

export const heads = [['none', 'Sem chapéu'], ...Object.entries(HEADS).map(([key, item]) => [key, item.label])] as [string, string][]
export const faces = [['none', 'Sem óculos'], ...Object.entries(FACES).map(([key, item]) => [key, item.label])] as [string, string][]
/** Partes que podem mudar de cor, com a cor padrão. */
export const colorsOf = (layer: 'head' | 'face', name: string): Colors => (layer === 'head' ? HEADS[name] : FACES[name])?.colors ?? []

const REF = shapeBounds('round')
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
/** Coordenada do corpo depois da escala de largura/altura do Boo (pivô em 120,100). */
const bodyY = (y: number, looks: Looks) => 100 + (y - 100) * looks.height

export function ImportedBooPetAccessory({looks, layer}: {looks: Looks; layer: 'head' | 'face'}) {
 const uid = 'acc' + useId().replace(/:/g, '')
 const name = layer === 'head' ? looks.head : looks.face
 const item = layer === 'head' ? HEADS[name] : FACES[name]
 if (!item) return null
 const saved = looks.colors?.[name] || []
 const paint: Paint = {c: item.colors.map(([, color], i) => saved[i] || color), id: key => `${uid}-${key}`, url: key => `url(#${uid}-${key})`}
 if (layer === 'face') {
  const spacing = looks.eyeSpacing * looks.width
  // Lente cobre o olho com folga, sem encostar na outra quando os olhos estão juntos.
  const r = clamp(looks.eyeSize * looks.width * 1.9 + 2, looks.eyeSize * 1.3, Math.max(spacing - 2, looks.eyeSize * 1.3))
  const face: Face = {x1: 120 - spacing, x2: 120 + spacing, y: bodyY(94, looks), r, mouthY: bodyY(128, looks), mouth: clamp(looks.mouthSize * looks.width, .6, 1.5)}
  return <g aria-label={(item as FaceItem).label}>{(item as FaceItem).draw(paint, face)}</g>
 }
 const head = item as Head
 const [ax, ay] = head.anchor
 const refWidth = shapeWidthAt('round', ay)
 // Mesma altura relativa da cabeça em qualquer formato: onde o corpo tem a mesma fração da largura máxima.
 const y = shapeLineAt(looks.shape, refWidth / REF.width)
 const scale = clamp(shapeWidthAt(looks.shape, y) * looks.width / refWidth, .7, 1.45)
 return <g aria-label={head.label} transform={`translate(${120 + (ax - 120) * scale} ${bodyY(y, looks) - (head.lift || 0) * looks.height}) scale(${scale}) translate(${-ax} ${-ay})`}>{head.draw(paint)}</g>
}
