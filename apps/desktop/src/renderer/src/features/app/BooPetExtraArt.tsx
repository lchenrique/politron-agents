import type { ReactNode } from 'react'
import { mix } from './boo-pet-color'

type Palette = [label: string, color: string][]
type Brush = { c: string[]; id: (key: string) => string; url: (key: string) => string }
type Head = { label: string; colors: Palette; anchor: [number, number]; draw: (p: Brush) => ReactNode }
type Face = { x1: number; x2: number; y: number; r: number; mouthY: number; mouth: number }
type FaceItem = { label: string; colors: Palette; draw: (p: Brush, face: Face) => ReactNode }

const dark = (color: string) => mix(color, 0, .4)
function Fabric({ id, base }: { id: string; base: string }) {
  return <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
    <stop stopColor={mix(base, 255, .44)}/>
    <stop offset=".43" stopColor={base}/>
    <stop offset="1" stopColor={mix(base, 0, .38)}/>
  </linearGradient>
}
const Stitch = ({ d }: { d: string }) => <path d={d} fill="none" stroke="#fff" strokeWidth="1.3" strokeOpacity=".58" strokeDasharray="3 3" strokeLinecap="round"/>
const Shine = ({ d, width = 3 }: { d: string; width?: number }) => <path d={d} fill="none" stroke="#fff" strokeWidth={width} strokeOpacity=".45" strokeLinecap="round"/>

function CapFront({ p, flat }: { p: Brush; flat: boolean }) {
  const { c, id, url } = p
  return <>
    <defs><Fabric id={id('shell')} base={c[0]}/><Fabric id={id('brim')} base={c[1]}/></defs>
    <path d="M58 60 C57 24 83 5 120 5 C157 5 183 24 182 60 Q120 69 58 60Z"
      fill={url('shell')} stroke={dark(c[0])} strokeWidth="2.3"/>
    <path d="M120 8 Q102 30 100 61 M120 8 Q140 29 142 61" stroke={dark(c[0])} strokeWidth="2" fill="none" opacity=".6"/>
    <Shine d="M72 38 Q85 15 106 13"/>
    <Stitch d="M65 55 Q120 65 175 55"/>
    <ellipse cx="120" cy="7" rx="5" ry="4" fill={c[2]} stroke={dark(c[2])} strokeWidth="1.2"/>
    {flat ? <>
      <path d="M48 60 Q120 51 192 60 L208 68 Q203 76 194 77 Q120 84 46 77 Q37 73 34 68Z"
        fill={url('brim')} stroke={dark(c[1])} strokeWidth="2.2"/>
      <Stitch d="M45 69 Q120 79 197 69"/>
      <Shine d="M59 62 Q124 57 178 63" width={2}/>
    </> : <>
      <path d="M43 60 Q120 49 197 60 Q188 77 120 80 Q51 77 43 60Z"
        fill={url('brim')} stroke={dark(c[1])} strokeWidth="2.2"/>
      <Stitch d="M56 63 Q120 57 184 63"/>
    </>}
    <path d="M112 31 L128 31 L127 44 Q120 49 113 44Z" fill={c[2]} stroke={dark(c[2])} strokeWidth="1.5"/>
    <Shine d="M116 36 L120 34 L124 36" width={1.5}/>
  </>
}
const capColors: Palette = [['Copa', '#4a90e2'], ['Aba', '#2c6cb8'], ['Emblema', '#ffd166']]

/** Os itens abaixo usam as mesmas âncoras proporcionais e o mesmo cálculo de contorno do Boo Pet. */
export const extraHeads: Record<string, Head> = {
  antenna: {
    label: 'Antena', colors: [['Haste', '#796dba'], ['Luz', '#ffbb69']], anchor: [120, 48],
    draw: ({ c, id, url }) => <>
      <defs><Fabric id={id('stem')} base={c[0]}/><radialGradient id={id('orb')} cx=".3" cy=".25" r=".85">
        <stop stopColor="#fff6d5"/><stop offset=".4" stopColor={c[1]}/><stop offset="1" stopColor={dark(c[1])}/>
      </radialGradient></defs>
      <path d="M107 51 Q108 35 117 22 Q128 5 116 -30 Q108 -43 116 -53" fill="none" stroke={dark(c[0])} strokeWidth="9" strokeLinecap="round"/>
      <path d="M107 51 Q109 34 117 22 Q128 4 116 -30" fill="none" stroke={url('stem')} strokeWidth="5" strokeLinecap="round"/>
      <path d="M105 51 Q116 57 128 50 L125 41 Q115 45 107 41Z" fill={dark(c[0])}/>
      <circle cx="116" cy="-56" r="14" fill={url('orb')} stroke={dark(c[1])} strokeWidth="2"/>
      <circle cx="111" cy="-62" r="5" fill="white" opacity=".7"/>
      <path d="M130 -65 l5 -4 M134 -52 l6 1 M116 -76 v-5" stroke={c[1]} strokeWidth="2" strokeLinecap="round"/>
    </>,
  },
  horns: {
    label: 'Chifres', colors: [['Chifres', '#8068a8'], ['Interior', '#c2a8e0']], anchor: [120, 62],
    draw: ({ c, id, url }) => <>
      <defs><Fabric id={id('horn')} base={c[0]}/><Fabric id={id('inner')} base={c[1]}/></defs>
      <path d="M63 62 Q34 53 33 21 Q33 0 22 -29 Q54 -18 72 8 Q92 32 91 55Z"
        fill={url('horn')} stroke={dark(c[0])} strokeWidth="2.7"/>
      <path d="M177 62 Q206 53 207 21 Q207 0 218 -29 Q186 -18 168 8 Q148 32 149 55Z"
        fill={url('horn')} stroke={dark(c[0])} strokeWidth="2.7"/>
      <path d="M37 -16 Q52 1 65 33 Q74 46 85 52 Q55 48 44 26Z" fill={url('inner')} opacity=".77"/>
      <path d="M203 -16 Q188 1 175 33 Q166 46 155 52 Q185 48 196 26Z" fill={url('inner')} opacity=".77"/>
      <Shine d="M32 -24 Q45 -4 48 13" width={3}/>
      <Shine d="M208 -24 Q195 -4 192 13" width={3}/>
      <Stitch d="M67 55 Q78 60 89 55 M151 55 Q162 60 173 55"/>
    </>,
  },
  'cap-flat': {
    label: 'Boné aba reta', colors: capColors, anchor: [120, 63],
    draw: p => <CapFront p={p} flat/>,
  },
  'cap-back': {
    label: 'Boné para trás', colors: capColors, anchor: [120, 63],
    draw: ({ c, id, url }) => <>
      <defs><Fabric id={id('shell')} base={c[0]}/><Fabric id={id('brim')} base={c[1]}/></defs>
      <path d="M69 58 Q45 53 27 60 Q17 65 28 72 Q51 80 81 71Z"
        fill={url('brim')} stroke={dark(c[1])} strokeWidth="2.2"/>
      <Stitch d="M31 67 Q52 74 71 68"/>
      <path d="M58 60 C57 24 83 5 120 5 C157 5 183 24 182 60 Q120 68 58 60Z"
        fill={url('shell')} stroke={dark(c[0])} strokeWidth="2.3"/>
      <path d="M120 8 Q101 29 100 60 M120 8 Q140 29 142 60" stroke={dark(c[0])} strokeWidth="2" fill="none" opacity=".6"/>
      <Shine d="M72 38 Q85 15 106 13"/>
      <Stitch d="M65 54 Q90 62 103 59 M137 59 Q156 61 175 54"/>
      <path d="M100 55 Q120 51 140 55 L138 65 Q120 67 102 65Z" fill={dark(c[0])}/>
      <rect x="114" y="56" width="12" height="7" rx="2" fill={c[2]} stroke={dark(c[2])} strokeWidth="1"/>
      <path d="M117 60 H123" stroke={dark(c[2])} strokeWidth="1.6"/>
    </>,
  },
  bucket: {
    label: 'Chapéu bucket', colors: [['Tecido', '#59a991'], ['Aba', '#367c70'], ['Emblema', '#f0dfaa']], anchor: [120, 66],
    draw: ({ c, id, url }) => <>
      <defs><Fabric id={id('shell')} base={c[0]}/><Fabric id={id('rim')} base={c[1]}/></defs>
      <path d="M75 7 Q120 -7 166 7 L181 54 Q120 67 59 54Z"
        fill={url('shell')} stroke={dark(c[0])} strokeWidth="2.4"/>
      <path d="M80 13 Q115 4 160 13 M69 48 Q120 60 172 48" fill="none" stroke={dark(c[0])} strokeWidth="1.5" opacity=".6"/>
      <path d="M60 53 Q120 44 180 53 L199 70 Q120 87 41 70Z"
        fill={url('rim')} stroke={dark(c[1])} strokeWidth="2.6"/>
      <Stitch d="M47 69 Q120 84 193 69"/>
      <Shine d="M81 15 Q95 7 115 6" width={3}/>
      <path d="M110 27 H130 L131 43 H109Z" fill={c[2]} stroke={dark(c[2])} strokeWidth="1.5"/>
      <path d="M114 34 l5 5 9 -10" stroke={dark(c[2])} strokeWidth="2" fill="none"/>
    </>,
  },
  headphones: {
    label: 'Fones de ouvido', colors: [['Arco', '#344961'], ['Conchas', '#75cbd8'], ['Detalhes', '#ecfaff']], anchor: [120, 83],
    draw: ({ c, id, url }) => <>
      <defs><Fabric id={id('band')} base={c[0]}/><Fabric id={id('cup')} base={c[1]}/></defs>
      <path d="M49 112 V76 C49 12 80 -8 120 -8 C160 -8 191 12 191 76 V112"
        fill="none" stroke={dark(c[0])} strokeWidth="16" strokeLinecap="round"/>
      <path d="M49 108 V76 C49 18 81 0 120 0 C159 0 191 18 191 76 V108"
        fill="none" stroke={url('band')} strokeWidth="11" strokeLinecap="round"/>
      <Shine d="M70 22 Q89 -3 118 -2" width={3}/>
      {[48, 192].map(x => <g key={x}>
        <rect x={x - 18} y="78" width="36" height="61" rx="16" fill={url('band')} stroke={dark(c[0])} strokeWidth="2"/>
        <rect x={x - 12} y="85" width="24" height="46" rx="11" fill={url('cup')} stroke={dark(c[1])} strokeWidth="1.8"/>
        <path d={`M${x - 5} 90 V123`} stroke={c[2]} strokeWidth="3" strokeLinecap="round" opacity=".85"/>
      </g>)}
      <path d="M191 132 Q188 145 171 142 Q165 140 158 133" fill="none" stroke={mix(c[0],255,.24)} strokeWidth="5" strokeLinecap="round"/>
      <ellipse cx="155" cy="132" rx="10" ry="5.5" fill={c[1]} stroke={dark(c[1])} strokeWidth="1.5"/>
      <path d="M151 130 h6" stroke={c[2]} strokeWidth="1.8" strokeLinecap="round"/>
    </>,
  },
}

export const extraFaces: Record<string, FaceItem> = {
  glasses: {
    label: 'Óculos', colors: [['Armação', '#304762'], ['Lentes', '#bfe6ff']],
    draw: ({ c, id, url }, { x1, x2, y, r }) => <>
      <defs><Fabric id={id('frame')} base={c[0]}/><linearGradient id={id('lens')} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#fff" stopOpacity=".65"/><stop offset=".5" stopColor={c[1]} stopOpacity=".2"/><stop offset="1" stopColor={c[1]} stopOpacity=".45"/>
      </linearGradient></defs>
      {[x1, x2].map(x => <g key={x}>
        <rect x={x-r-2} y={y-r*.85} width={2*r+4} height={1.7*r} rx={r*.45}
          fill={url('lens')} stroke={url('frame')} strokeWidth="4"/>
        <Shine d={`M${x-r*.62} ${y-r*.45} Q${x-r*.35} ${y-r*.72} ${x+r*.1} ${y-r*.63}`} width={2.2}/>
      </g>)}
      <path d={`M${x1+r+2} ${y-r*.28} Q120 ${y-r*.65} ${x2-r-2} ${y-r*.28} M${x1-r-2} ${y-r*.25} l-13 -4 M${x2+r+2} ${y-r*.25} l13 -4`}
        fill="none" stroke={c[0]} strokeWidth="4.5" strokeLinecap="round"/>
    </>,
  },
}
