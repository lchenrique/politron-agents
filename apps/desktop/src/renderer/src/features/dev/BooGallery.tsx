/**
 * Galeria de desenvolvimento do Boo (#/boo-gallery): os 11 estados em 64 px e 200 px,
 * em fundo claro e escuro, com dois esquemas de cor. Só existe em `import.meta.env.DEV`.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BOO_MOODS, BooFigure, type BooColors, type BooMood } from '../app/BooFigure'
import { BooWorking } from '../app/BooWorking'
import '../app/PoliAvatar.css'

const LABELS: Record<BooMood, string> = {
  idle: 'Disponível', coding: 'Programando', thinking: 'Pensando', speaking: 'Falando', done: 'Concluído',
  happy: 'Feliz', boop: 'Boop', dizzy: 'Tonto', love: 'Apaixonado', surprised: 'Surpreso', sleep: 'Dormindo',
}
const SCHEMES: { name: string; colors: Partial<BooColors> }[] = [
  { name: 'Padrão', colors: {} },
  { name: 'Roxo com destaque laranja', colors: { body: '#8f7bf0', eye: '#15112b', blush: '#ff9ec0', accent: '#ff9a3c', accent2: '#ff4f7b' } },
]
const THEMES = [
  { name: 'Claro', background: '#f6f7fb', color: '#1a1a1f' },
  { name: 'Escuro', background: '#101218', color: '#e9eaf0' },
]

export default function BooGallery() {
  const [animate, setAnimate] = useState(true)
  const [scheme, setScheme] = useState(0)
  const [round, setRound] = useState(0)
  const colors = SCHEMES[scheme].colors
  return <div style={{ height: '100vh', overflow: 'auto', background: 'var(--background)', color: 'var(--foreground)' }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 12, position: 'sticky', top: 0, zIndex: 1, background: 'var(--background)' }}>
      <strong>Boo: estados</strong>
      {SCHEMES.map((item, index) => <Button key={item.name} size="sm" variant={scheme === index ? 'default' : 'outline'} onClick={() => setScheme(index)}>{item.name}</Button>)}
      <Button size="sm" variant="outline" onClick={() => setAnimate(value => !value)}>{animate ? 'Parar animação' : 'Animar'}</Button>
      <Button size="sm" variant="outline" onClick={() => setRound(value => value + 1)}>Reiniciar animações</Button>
    </header>
    {THEMES.map(theme => <section key={theme.name} data-theme-sample={theme.name} style={{ background: theme.background, color: theme.color, padding: '20px 16px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 14 }}>{theme.name} · {SCHEMES[scheme].name}</h2>
      <div data-boo-working style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 24, marginBottom: 20 }}>
        {[220, 132, 96].map(size => <BooWorking key={size} size={size} colors={colors} label={`Trabalhando em ${size} px`} animate={animate} />)}
      </div>
      <div key={round} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {BOO_MOODS.map(mood => <figure key={mood} style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 6 }}>
          <BooFigure mood={mood} size={200} colors={colors} label={LABELS[mood]} animate={animate} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <BooFigure mood={mood} size={64} colors={colors} label={`${LABELS[mood]} em 64 px`} animate={animate} />
            <BooFigure mood={mood} size={28} colors={colors} label={`${LABELS[mood]} em 28 px`} animate={animate} />
            <BooFigure mood={mood} size={20} colors={colors} label={`${LABELS[mood]} em 20 px`} animate={animate} />
          </div>
          <figcaption style={{ fontSize: 12, opacity: .75 }}>{LABELS[mood]}</figcaption>
        </figure>)}
      </div>
    </section>)}
  </div>
}
