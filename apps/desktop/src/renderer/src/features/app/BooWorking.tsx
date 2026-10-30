import { memo, useId, type CSSProperties } from 'react'
import { BOO_REFERENCE_ART } from './boo-reference-art'
import { booColorVars, type BooColors } from './BooFigure'
import { HEADSET, LAPTOP_FACES, LAPTOP_LOGO, LAPTOP_RIM } from './boo-working-art'
import './BooFigure.css'
import './BooWorking.css'

const ART = BOO_REFERENCE_ART
const HANDS: [x: number, y: number, angle: number][] = [[88, 141, 2], [107, 145, 20]]

/** Boo de perfil digitando no laptop; cores do agente via as mesmas variáveis do BooFigure. */
export const BooWorking = memo(function BooWorking({ size = 132, colors, label, animate = true }: {
  size?: number
  colors?: Partial<BooColors>
  label: string
  animate?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const style = { width: size, height: size * 200 / 240, ...booColorVars(colors),
    '--boo-liquid-rest': `path('${ART.focus.body}')`, '--boo-liquid-a': `path('${ART.focus.liquidA}')`, '--boo-liquid-b': `path('${ART.focus.liquidB}')` }
  return <svg viewBox="14 0 240 200" className="boo boo-work" data-mood="coding" data-size="m" data-animate={animate} data-liquid={animate} style={style as CSSProperties} role="img" aria-label={label}>
    <defs>
      <clipPath id={`${id}-body`}><path d={ART.focus.body} /></clipPath>
      <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--boo-accent) 26%, #2c3140)' }} />
        <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--boo-accent) 8%, #12141b)' }} />
      </linearGradient>
      <radialGradient id={`${id}-glow`}><stop offset="0" stopColor="var(--boo-accent)" stopOpacity=".55" /><stop offset="1" stopColor="var(--boo-accent)" stopOpacity="0" /></radialGradient>
    </defs>
    <g className="boo__float">
      <g transform="translate(54 10) scale(.84) rotate(-5 120 180)">
        <g className="boo-work__headset" aria-hidden="true">
          <path className="boo-work__band" d={HEADSET.bandBack} />
          <path className="boo-work__shell" d={HEADSET.backCup.shell} />
        </g>
        <path className="boo__body" d={ART.focus.body} />
        {/* Luz da tela refletida no corpo, do lado do laptop. */}
        <ellipse clipPath={`url(#${id}-body)`} cx="62" cy="150" rx="78" ry="56" fill={`url(#${id}-glow)`} />
        <g className="boo__face" transform="translate(-14 8)">
          <g className="boo__eyes">
            {ART.focus.eyes.map((d, i) => <path key={i} className="boo__eye" d={d} />)}
            {ART.focus.glints.map((d, i) => <path key={i} className="boo__shine" d={d} />)}
          </g>
          <path className="boo__reference-mouth" d={ART.idle.mouth} />
        </g>
        <g className="boo-work__headset" aria-hidden="true">
          <path className="boo-work__band" d={HEADSET.bandFront} />
          <path className="boo-work__band-shine" d={HEADSET.shine} />
          <path className="boo-work__shell" d={HEADSET.frontCup.shell} />
          <path className="boo-work__cap" d={HEADSET.frontCup.cap} />
          <path className="boo-work__cap-face" d={HEADSET.frontCup.face} />
        </g>
      </g>
      {HANDS.map(([x, y, angle], side) => <g key={side} className={`boo__hand-position boo__hand-position--${side}`} style={{ transform: `translate(${x}px, ${y}px) rotate(${angle}deg)` }}>
        <path className="boo__hand" d={ART.happy.hands[side].path} />
      </g>)}
    </g>
    <g className="boo-work__laptop" aria-hidden="true">
      {LAPTOP_FACES.map(([part, d]) => <path key={d} className={`boo-work__${part}`} d={d} fill={part === 'lid' ? `url(#${id}-lid)` : undefined} />)}
      <path className="boo-work__rim" d={LAPTOP_RIM} />
      <circle className="boo-work__logo-glow" cx="77" cy="162" r="13" />
      <path className="boo-work__logo" d={ART.idle.body} transform={LAPTOP_LOGO} />
    </g>
    {animate && <g className="boo-work__code" aria-hidden="true">
      {[0, 1, 2].map(i => <rect key={i} x={70 + i * 16} y="126" width={10 + (i % 2) * 6} height="3.4" rx="1.7" style={{ animationDelay: `${i * .55}s` }} />)}
    </g>}
  </svg>
})
