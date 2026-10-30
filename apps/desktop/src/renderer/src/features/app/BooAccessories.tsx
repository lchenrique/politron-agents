import { memo } from 'react'
import { BOO_DETAILS, booDetailId } from '../../../../shared/boo-details'

export type BooAccessoryProps = {
  kind: string
  shape?: string
  bodyWidth?: number
  bodyHeight?: number
  eyeSize?: number
  eyeSpacing?: number
  mouthSize?: number
  colors?: Record<string, string[]>
}

/** Detalhes originais ancorados no domo do filhotinho, sem deformar o rosto. */
export const BooHeadAccessory = memo(function BooHeadAccessory({ kind }: BooAccessoryProps) {
  const id = booDetailId(kind)
  if (id === 'none') return null
  return <g data-boo-accessory={id} data-boo-layer="head" aria-label={`${BOO_DETAILS.find(detail => detail.id === id)!.label} do Boo`}>
    {id === 'boo-sprout' && <>
      <path d="M143 33 C142 25 146 21 150 16" fill="none" stroke="#5d9276" strokeWidth="2.7" strokeLinecap="round" />
      <path d="M145 26 C134 28 127 21 130 14 C139 12 148 17 145 26Z" fill="#a9d6ad" />
      <path d="M145 23 C143 13 151 7 160 8 C162 16 155 24 145 23Z" fill="#78b895" />
      <path d="M145 23 L153 14 M142 24 L135 18" fill="none" stroke="#c7e8c9" strokeWidth="1.1" strokeLinecap="round" />
    </>}
    {id === 'boo-star' && <g transform="translate(169 55) rotate(12)">
      <path d="M0 -11 Q1 -12 2 -9 L4 -4 10 -3 Q13 -3 10 0 L6 4 7 10 Q7 12 4 11 L0 8 -5 11 Q-8 12 -7 9 L-6 3 -11 -1 Q-13 -3 -10 -4 L-4 -5 -2 -10 Q-1 -12 0 -11Z" fill="#dfb466" />
      <path d="M0 -9 3 -3 10 -2 5 3 6 9 0 6 -6 9 -5 2 -10 -2 -3 -3Z" fill="#f6d898" />
      <path d="M-2 -5 -4 -1" fill="none" stroke="#fff1cf" strokeWidth="1.7" strokeLinecap="round" />
    </g>}
    {id === 'boo-king-crown' && <g transform="translate(120 27) rotate(-4)">
      <path d="M-20 7 L-17 -6 Q-16 -9 -13 -6 L-7 0 -2 -9 Q0 -13 2 -9 L7 0 13 -6 Q16 -9 17 -6 L20 7 Q0 11 -20 7Z" fill="#d8ac58" />
      <path d="M-19 8 Q0 12 19 8 V12 Q19 15 16 15 H-16 Q-19 15 -19 12Z" fill="#bc8441" />
      <path d="M-14 8 Q0 10 14 8 L14 10 Q0 12 -14 10Z" fill="#f1d68f" />
      <circle cx="0" cy="4.5" r="2.2" fill="#cd6878" />
      <circle cx="-0.7" cy="3.8" r="0.7" fill="#ffe6e4" />
    </g>}
    {id === 'boo-halo' && <g transform="translate(120 16) rotate(-4)">
      <path d="M-21 0 C-14 -7 14 -7 21 0 C14 7 -14 7 -21 0Z M-13 0 C-9 -3 9 -3 13 0 C9 3 -9 3 -13 0Z" fill="#abc9e8" fillRule="evenodd" />
      <path d="M-14 -1 C-8 -5 8 -5 14 -1" fill="none" stroke="#f2fbff" strokeWidth="1.8" strokeLinecap="round" />
    </g>}
    {id === 'boo-noel' && <g transform="translate(145 27) rotate(15)">
      <path d="M-24 2 C-19 -13 -6 -25 8 -20 C19 -17 25 -11 24 -2 C17 -10 12 -10 8 -5 L12 3Z" fill="#b94e58" />
      <path d="M-19 -2 C-13 -14 -4 -18 5 -17" fill="none" stroke="#d57c82" strokeWidth="2" strokeLinecap="round" />
      <rect x="-25" y="0" width="44" height="10" rx="5" fill="#f5ebe2" />
      <path d="M-18 5 H12" stroke="#e3d3c8" strokeWidth="1" strokeLinecap="round" />
      <circle cx="24" cy="-2" r="7" fill="#f5ebe2" /><circle cx="22" cy="-4" r="2.2" fill="#ffffff" />
    </g>}
  </g>
})

/** Contrato conservado para callers legados; o Boo atual não usa acessórios no rosto. */
export const BooFaceAccessory = memo(function BooFaceAccessory(_props: BooAccessoryProps) { return null })
