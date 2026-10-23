import { memo, useId } from 'react'

type CapStyle = 'cap' | 'cap-flat' | 'cap-back'

/** Bonés desenhados para a cabeça de 240×200 do Boo, sem bico gigante ou painéis geométricos planos. */
export const BooCap = memo(function BooCap({ style }: { style: CapStyle }) {
  const uid = useId().replace(/:/g, '')
  const domeId = 'boo-cap-dome-' + uid
  const billId = 'boo-cap-bill-' + uid
  const isBack = style === 'cap-back'
  const isFlat = style === 'cap-flat'
  return <g aria-label={isBack ? 'Boné para trás do Boo' : isFlat ? 'Boné aba reta do Boo' : 'Boné do Boo'}>
    <defs>
      <linearGradient id={domeId} x1="16%" x2="87%" y1="0%" y2="96%">
        <stop offset="0" stopColor="#7597bb"/>
        <stop offset=".43" stopColor="#416789"/>
        <stop offset="1" stopColor="#233d59"/>
      </linearGradient>
      <linearGradient id={billId} x1="15%" x2="72%" y1="12%" y2="90%">
        <stop offset="0" stopColor="#496b8c"/>
        <stop offset=".65" stopColor="#284663"/>
        <stop offset="1" stopColor="#1d334e"/>
      </linearGradient>
    </defs>
    {isBack && <>
      {/* Aba traseira sai de trás do crânio; curva baixa e acabamento duplo. */}
      <path d="M72 56 Q43 49 25 62 Q22 66 27 71 Q45 79 76 73 L93 66Z" fill="#192e46" stroke="#14253a" strokeWidth="2"/>
      <path d="M31 63 Q52 58 73 60 L80 66 Q55 74 31 68Z" fill={`url(#${billId})`}/>
      <path d="M31 67 Q50 72 71 67" fill="none" stroke="#95abc2" strokeWidth="1.5" strokeDasharray="3 3" opacity=".55"/>
    </>}
    {/* Cúpula de seis painéis, com contorno e volume como um boné real. */}
    <path d="M64 60 Q62 35 79 21 Q95 7 119 8 Q145 7 163 22 Q178 38 177 60 Q121 70 64 60Z"
      fill={`url(#${domeId})`} stroke="#263e57" strokeWidth="2.4" strokeLinejoin="round"/>
    <path d="M72 52 Q75 23 111 15 Q101 32 100 59Z" fill="#9ab8d2" opacity=".16"/>
    <path d="M121 12 Q112 28 110 62 M121 12 Q147 25 148 62"
      fill="none" stroke="#223a56" strokeWidth="2.2" opacity=".78"/>
    <path d="M118 13 Q113 32 113 56 M125 13 Q146 29 145 56" fill="none" stroke="#9bb1c9" opacity=".52" strokeWidth="1.1"/>
    <path d="M68 52 Q121 64 174 52" fill="none" stroke="#b9cad8" opacity=".55" strokeDasharray="3 4" strokeWidth="1.3"/>
    <ellipse cx="120" cy="10" rx="8" ry="4" fill="#314d69" stroke="#9ab2c7" strokeWidth="1.4"/>
    {isBack
      ? <>
          <path d="M71 55 Q121 64 171 55 L172 63 Q121 74 70 63Z" fill="#294660" stroke="#1c334d" strokeWidth="1.8"/>
          <path d="M102 57 Q121 53 139 57 L137 65 Q121 67 104 65Z" fill="#192c44"/>
          <path d="M112 58 H128" stroke="#bdcad7" strokeWidth="2" strokeLinecap="round"/>
          <rect x="115" y="56" width="11" height="7" rx="2" fill="#acb6bf" stroke="#e1e5e8" strokeWidth=".8"/>
          <path d="M78 60 Q92 65 103 65 M139 65 Q156 64 165 60" stroke="#91a9bd" strokeWidth="1" strokeDasharray="2 3" fill="none"/>
        </>
      : <>
          {/* Aba com espessura visível e vista levemente de cima. */}
          <path d={isFlat
            ? 'M51 60 Q120 58 188 60 L205 67 Q209 73 196 77 Q121 82 47 77 Q36 73 40 68Z'
            : 'M62 59 Q121 48 180 59 Q191 62 195 70 Q177 83 124 85 Q72 84 46 71 Q48 65 62 59Z'}
            fill="#1c3047" stroke="#172b41" strokeWidth="2.2" strokeLinejoin="round"/>
          <path d={isFlat
            ? 'M51 62 Q121 58 187 62 L202 67 Q126 76 42 69Z'
            : 'M63 60 Q121 50 179 60 Q186 62 192 69 Q120 80 49 70 Q53 64 63 60Z'}
            fill={`url(#${billId})`}/>
          <path d={isFlat
            ? 'M46 74 Q121 80 197 73'
            : 'M55 72 Q121 82 185 71'}
            stroke="#a8bdcf" opacity=".6" strokeWidth="1.4" strokeDasharray="3.5 3.5" fill="none"/>
          <path d="M76 62 Q120 70 168 62" stroke="#172c44" strokeWidth="3" strokeLinecap="round" fill="none"/>
          {/* Emblema bordado pequeno; não substitui a forma do boné. */}
          <path d="M113 32 Q120 28 128 32 L126 43 Q120 48 114 43Z" fill="#d5c5a3" opacity=".9"/>
          <path d="M117 36 L120 33 L124 36 L120 42Z" fill="#49647e"/>
        </>}
  </g>
})
