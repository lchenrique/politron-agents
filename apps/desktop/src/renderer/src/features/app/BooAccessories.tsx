import { memo } from 'react'
import { BooCap } from './BooCaps'
import { ImportedBooPetAccessory, heads, faces } from './BooPetAccessories'

const PET_HEADS = new Set(['cap', 'beanie', 'top-hat', 'witch-hat', 'crown', 'party-hat', 'chef-hat', 'bow', 'flower', 'halo'])
const PET_FACES = new Set(['round-glasses', 'sunglasses', 'heart-glasses', 'star-glasses', 'monocle', 'mustache', 'star-mask'])

export type BooAccessoryProps = {
  kind: string
  shape?: string
  bodyWidth?: number
  bodyHeight?: number
  eyeSize?: number
  eyeSpacing?: number
  mouthSize?: number
}

function petLooks({ kind, shape = 'ghost-wave', bodyWidth = 1, bodyHeight = 1, eyeSize = 8, eyeSpacing = 26, mouthSize = 1 }: BooAccessoryProps, layer: 'head' | 'face') {
  return {
    shape, width: bodyWidth, height: bodyHeight, eyeSize, eyeSpacing, mouthSize,
    head: layer === 'head' ? kind : 'none',
    face: layer === 'face' ? kind : 'none',
    colors: {},
  }
}


/** Acessórios em coordenadas do artboard 240×200: não alteram a silhueta do Boo. */
export const BooHeadAccessory = memo(function BooHeadAccessory(props: BooAccessoryProps) {
  const { kind } = props
  if (PET_HEADS.has(kind)) return <g aria-label={`${heads.find(([id]) => id === kind)?.[1] || kind} do Boo`}><ImportedBooPetAccessory looks={petLooks(props, 'head')} layer="head" /></g>
  switch (kind) {
    case 'antenna':
      return <g aria-label="Antena do Boo" strokeLinecap="round">
        <path d="M120 36 Q108 18 118 -4" fill="none" stroke="#3e3b61" strokeWidth="9"/>
        <path d="M119 32 Q115 16 122 1" fill="none" stroke="#a5a8ee" strokeWidth="3"/>
        <circle cx="119" cy="-5" r="13" fill="#f3af56" stroke="#b86a50" strokeWidth="2"/>
        <circle cx="115" cy="-10" r="5" fill="#fff4c9" opacity=".85"/>
      </g>
    case 'horns':
      return <g aria-label="Chifres do Boo">
        <path d="M60 60 Q34 25 45 0 Q51 27 89 43Z" fill="#74569c" stroke="#3f396a" strokeWidth="2.5"/>
        <path d="M180 60 Q206 25 195 0 Q189 27 151 43Z" fill="#74569c" stroke="#3f396a" strokeWidth="2.5"/>
        <path d="M52 18 Q53 39 70 47 M188 18 Q187 39 170 47" fill="none" stroke="#c9afe8" strokeWidth="5" strokeLinecap="round"/>
      </g>
    case 'cap-flat':
    case 'cap-back':
      return <BooCap style={kind} />
    case 'beanie':
      return <g aria-label="Gorro do Boo">
        <path d="M54 68 Q48 9 120 4 Q190 9 187 68Z" fill="#a765a5" stroke="#724578" strokeWidth="2"/>
        <path d="M66 47 Q68 16 94 11 M103 9 Q102 32 99 51 M123 9 V53 M143 12 Q146 36 146 53 M170 34 Q171 43 172 52" stroke="#dba4cb" strokeWidth="2" opacity=".55" fill="none"/>
        <rect x="54" y="52" width="132" height="23" rx="10" fill="#814778" stroke="#5f365d" strokeWidth="2"/>
        {Array.from({length:12},(_,i)=><path key={i} d={`M${62+i*11} 57 v12`} stroke="#d8a0c7" opacity=".48" strokeWidth="2"/>)}
        <circle cx="120" cy="2" r="12" fill="#e2abce" stroke="#a76a9e" strokeWidth="2"/>
        <circle cx="117" cy="-2" r="4" fill="#ffe0ef" opacity=".65"/>
      </g>
    case 'bucket':
      return <g aria-label="Chapéu bucket do Boo">
        <path d="M68 21 Q120 1 172 21 L185 60 Q120 75 55 60Z" fill="#529e89" stroke="#306c61" strokeWidth="2.5"/>
        <path d="M75 24 Q118 12 165 24 M64 50 Q121 62 177 50" fill="none" stroke="#b0dbc3" strokeWidth="2" opacity=".75"/>
        <path d="M51 60 Q120 47 189 60 L199 73 Q120 90 41 73Z" fill="#367766" stroke="#27594f" strokeWidth="2.5"/>
        <path d="M49 69 Q120 83 193 69" fill="none" stroke="#79b09c" strokeWidth="2" strokeDasharray="5 5"/>
        <rect x="107" y="30" width="26" height="16" rx="4" fill="#e6d6aa"/><path d="M114 38 H126" stroke="#5a7565" strokeWidth="2"/>
      </g>
    case 'top-hat':
      return <g aria-label="Cartola do Boo">
        <path d="M83 -35 H157 L164 45 H76Z" fill="#36344a" stroke="#242436" strokeWidth="3"/>
        <path d="M90 -28 H102 L98 32 H84Z" fill="#8a849c" opacity=".38"/>
        <rect x="76" y="28" width="88" height="16" rx="2" fill="#8b547d"/>
        <path d="M82 35 H155" stroke="#f0cba2" strokeWidth="2" opacity=".7"/>
        <rect x="51" y="45" width="138" height="13" rx="6.5" fill="#2b293e" stroke="#171a2a" strokeWidth="2"/>
        <rect x="113" y="31" width="14" height="12" rx="2" fill="#e6c178"/><rect x="118" y="33" width="5" height="8" fill="#5b3d60"/>
      </g>
    case 'witch-hat':
      return <g aria-label="Chapéu de bruxa do Boo">
        <path d="M121 -54 Q128 -15 146 24 Q153 41 163 54 L65 54 Q99 6 121 -54Z" fill="#684a90" stroke="#3f315e" strokeWidth="2.5"/>
        <path d="M118 -36 Q110 16 84 47" fill="none" stroke="#a287c5" strokeWidth="4" opacity=".6"/>
        <path d="M73 46 H166 L171 56 H69Z" fill="#2c263c"/>
        <rect x="115" y="45" width="19" height="13" rx="2" fill="#e7bb6a"/><rect x="121" y="48" width="7" height="7" fill="#332a4a"/>
        <path d="M59 53 Q123 42 183 53 Q196 54 204 64 Q120 85 38 64 Q46 55 59 53Z" fill="#45345f" stroke="#322848" strokeWidth="2"/>
        <path d="M55 63 Q124 78 188 63" fill="none" stroke="#9775b6" strokeWidth="2"/>
        <path d="M151 11 l3 6 6 2 -6 2 -3 6 -2 -6 -6 -2 6 -2Z" fill="#e8d2a5" opacity=".8"/>
      </g>
    case 'crown':
      return <g aria-label="Coroa do Boo">
        <path d="M64 52 L57 0 L87 22 L120 -13 L153 22 L183 0 L176 52Z" fill="#e4b953" stroke="#af772a" strokeWidth="3"/>
        <path d="M68 11 L84 29 L119 0 L154 29 L174 10 L171 44 H70Z" fill="#f9de8d" opacity=".65"/>
        <path d="M63 42 H178 V55 H63Z" fill="#bb8536" stroke="#9f6e2f" strokeWidth="1.5"/>
        <path d="M66 48 H175" stroke="#fff0ad" strokeWidth="2" strokeDasharray="8 6"/>
        <path d="M120 21 l10 11 -10 11 -10 -11Z" fill="#df5b9c" stroke="#a93b75" strokeWidth="2"/>
        <circle cx="85" cy="37" r="5" fill="#78bfe2"/><circle cx="156" cy="37" r="5" fill="#78bfe2"/>
        <circle cx="120" cy="-11" r="4" fill="#fff0bb"/>
      </g>
    case 'headphones':
      return <g aria-label="Fone de ouvido do Boo">
        <path d="M48 112 V77 Q48 7 120 7 Q192 7 192 77 V112" fill="none" stroke="#263347" strokeWidth="16" strokeLinecap="round"/>
        <path d="M56 68 Q58 17 120 17 Q182 17 184 68" fill="none" stroke="#90aac8" strokeWidth="5" strokeLinecap="round"/>
        <rect x="34" y="81" width="30" height="52" rx="13" fill="#354964" stroke="#202d43" strokeWidth="3"/>
        <rect x="176" y="81" width="30" height="52" rx="13" fill="#354964" stroke="#202d43" strokeWidth="3"/>
        <rect x="41" y="87" width="14" height="41" rx="7" fill="#79c5d9"/>
        <rect x="185" y="87" width="14" height="41" rx="7" fill="#79c5d9"/>
        <path d="M45 93 V119 M189 93 V119" stroke="#d4f1f7" strokeWidth="3" strokeLinecap="round"/>
        <path d="M193 131 Q194 151 172 155" fill="none" stroke="#3a4f69" strokeWidth="4" strokeLinecap="round"/>
        <ellipse cx="170" cy="154" rx="8" ry="4" fill="#6db8cb"/>
      </g>
    default: return null
  }
})

export const BooFaceAccessory = memo(function BooFaceAccessory(props: BooAccessoryProps) {
  const { kind } = props
  if (PET_FACES.has(kind)) return <g aria-label={kind === 'round-glasses' ? 'Óculos redondos do Boo' : kind === 'sunglasses' ? 'Óculos escuros do Boo' : `${faces.find(([id]) => id === kind)?.[1] || kind} do Boo`}><ImportedBooPetAccessory looks={petLooks(props, 'face')} layer="face" /></g>
  if (kind === 'glasses') {
    const round = false // Round glasses are handled by the imported Boo Pet artwork.
    return <g aria-label={round ? 'Óculos redondos do Boo' : 'Óculos do Boo'} fill="none">
      <g stroke={round ? '#73533e' : '#26354b'} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {round
          ? <><circle cx="94" cy="95" r="20"/><circle cx="146" cy="95" r="20"/></>
          : <><rect x="75" y="79" width="38" height="35" rx="11"/><rect x="127" y="79" width="38" height="35" rx="11"/></>}
        <path d="M113 90 Q120 84 127 90 M75 90 L59 86 M165 90 L181 86"/>
      </g>
      <path d={round ? 'M82 86 Q87 79 95 80 M135 86 Q140 79 148 80' : 'M81 87 Q85 83 95 83 M133 87 Q138 83 148 83'} stroke="#fff" strokeWidth="3" opacity=".7" strokeLinecap="round"/>
      <path d="M62 87 l10 2 M168 89 l10 -2" stroke="#a5acc9" strokeWidth="2" opacity=".7"/>
    </g>
  }
  if (kind === 'sunglasses') {
    return <g aria-label="Óculos escuros do Boo">
      <rect x="74" y="79" width="40" height="33" rx="11" fill="#1b2c41" stroke="#101c2d" strokeWidth="3"/>
      <rect x="126" y="79" width="40" height="33" rx="11" fill="#1b2c41" stroke="#101c2d" strokeWidth="3"/>
      <path d="M113 88 Q120 84 127 88 M74 89 L58 85 M166 89 L182 85" fill="none" stroke="#1a293c" strokeWidth="5" strokeLinecap="round"/>
      <path d="M81 86 Q90 82 102 83 M133 86 Q142 82 154 83" fill="none" stroke="#a6d9f1" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
      <path d="M82 106 L105 87 M134 106 L157 87" stroke="#6489ac" strokeWidth="3" opacity=".3"/>
    </g>
  }
  return null
})
