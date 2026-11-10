import type { ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Primitivas visuais do design Carbon & Graphite.
 * Marcas e avatares são SVG inline (iguais aos do HTML de referência) para
 * renderizarem nítidos em qualquer DPI e herdarem a cor de identidade do Boo.
 */

export type BooVariant = 'classic' | 'crown' | 'visor' | 'radar' | 'mono'

export const BOO_VARIANTS: ReadonlyArray<{ id: BooVariant; label: string; hint: string }> = [
  { id: 'classic', label: 'Padrão', hint: 'Boo neutro' },
  { id: 'crown', label: 'Líder', hint: 'Coroa do orquestrador' },
  { id: 'visor', label: 'Dev', hint: 'Visor de código' },
  { id: 'radar', label: 'QA', hint: 'Antena de testes' },
  { id: 'mono', label: 'Review', hint: 'Lente de auditoria' },
]

/** Paleta de acento compartilhada por Boos e pastas de workspace. */
export const FOLDER_COLORS: ReadonlyArray<{ id: string; hex: string; label: string }> = [
  { id: 'emerald', hex: '#10B981', label: 'Esmeralda' },
  { id: 'teal', hex: '#14B8A6', label: 'Turquesa' },
  { id: 'sky', hex: '#0EA5E9', label: 'Ciano' },
  { id: 'blue', hex: '#3B82F6', label: 'Azul' },
  { id: 'indigo', hex: '#6366F1', label: 'Índigo' },
  { id: 'violet', hex: '#8B5CF6', label: 'Violeta' },
  { id: 'purple', hex: '#A855F7', label: 'Roxo' },
  { id: 'pink', hex: '#EC4899', label: 'Rosa' },
  { id: 'rose', hex: '#F43F5E', label: 'Coral' },
  { id: 'orange', hex: '#F97316', label: 'Laranja' },
  { id: 'amber', hex: '#F59E0B', label: 'Âmbar' },
  { id: 'lime', hex: '#84CC16', label: 'Lima' },
]

export function normalizeVariant(value: string | null | undefined): BooVariant {
  const found = BOO_VARIANTS.find(variant => variant.id === value)
  return found ? found.id : 'classic'
}

/** Cor determinística para quem ainda não escolheu uma: mesma pasta, mesma cor. */
export function colorForId(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) % 100000
  return FOLDER_COLORS[hash % FOLDER_COLORS.length].hex
}

/** Hex válido ou o substituto informado. */
export function safeHex(value: string | null | undefined, fallback = '#10B981'): string {
  const text = String(value || '').trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback
}

function glyphFor(variant: BooVariant, color: string) {
  switch (variant) {
    case 'crown':
      return (
        <>
          <path d="M4.2 3.6L6.2 1.8L8 3.3L9.8 1.8L11.8 3.6" stroke={color} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="2.5" y="4.2" width="11" height="8.5" rx="3.4" fill={color} fillOpacity="0.26" stroke={color} strokeWidth="1.35" />
          <circle cx="6.1" cy="8.5" r="1.15" fill={color} />
          <circle cx="9.9" cy="8.5" r="1.15" fill={color} />
        </>
      )
    case 'visor':
      return (
        <>
          <rect x="2.5" y="3.8" width="11" height="8.8" rx="3.4" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.35" />
          <rect x="4.5" y="6.8" width="7" height="2.4" rx="1.2" fill={color} />
        </>
      )
    case 'radar':
      return (
        <>
          <line x1="8" y1="1.5" x2="8" y2="3.8" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="1.5" r="1" fill={color} />
          <rect x="2.5" y="3.8" width="11" height="8.8" rx="3.4" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.35" />
          <circle cx="6.1" cy="8.2" r="1.15" fill={color} />
          <circle cx="9.9" cy="8.2" r="1.15" fill={color} />
        </>
      )
    case 'mono':
      return (
        <>
          <rect x="2.5" y="3.8" width="11" height="8.8" rx="3.4" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.35" />
          <circle cx="8" cy="8.2" r="1.9" stroke={color} strokeWidth="1.25" fill={color} fillOpacity="0.35" />
          <circle cx="8" cy="8.2" r="0.8" fill={color} />
        </>
      )
    default:
      return (
        <>
          <rect x="2.5" y="3.8" width="11" height="8.8" rx="3.4" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.35" />
          <circle cx="6.1" cy="8.2" r="1.15" fill={color} />
          <circle cx="9.9" cy="8.2" r="1.15" fill={color} />
        </>
      )
  }
}

/** Avatar compacto de Boo: mesmo desenho do HTML, com a cor de identidade do agente. */
export function MiniBoo({ color, variant = 'classic', size = 22, className, label }: { color: string; variant?: BooVariant; size?: number; className?: string; label?: string }) {
  const hex = safeHex(color)
  const glyph = Math.max(12, Math.round(size * 0.62))
  return (
    <span
      aria-hidden={label ? undefined : true}
      data-slot="avatar"
      className={cn('flex shrink-0 items-center justify-center rounded-md transition', className)}
      style={{ width: size, height: size, background: `${hex}1A`, border: `1px solid ${hex}48`, boxShadow: `0 0 10px ${hex}18` }}
    >
      <svg viewBox="0 0 16 16" style={{ width: glyph, height: glyph }} fill="none" aria-label={label}>
        {glyphFor(variant, hex)}
      </svg>
    </span>
  )
}

/** Pasta colorida: aberta quando a lista de conversas está visível. */
export function ColoredFolder({ color, open, className }: { color: string; open: boolean; className?: string }) {
  const hex = safeHex(color)
  return open ? (
    <svg viewBox="0 0 18 18" className={cn('size-4 shrink-0', className)} fill="none" aria-hidden="true">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.6C7.05 3 7.47 3.2 7.75 3.55L8.6 4.6H14.5C15.33 4.6 16 5.27 16 6.1V7.2H2V4.5Z" fill={hex} fillOpacity="0.35" stroke={hex} strokeWidth="1.3" />
      <path d="M2 7.2H15.3C16.02 7.2 16.55 7.87 16.38 8.57L15.28 13.37C15.12 14.03 14.53 14.5 13.85 14.5H3.5C2.67 14.5 2 13.83 2 13V7.2Z" fill={hex} fillOpacity="0.22" stroke={hex} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" className={cn('size-4 shrink-0', className)} fill="none" aria-hidden="true">
      <path d="M2 4.8C2 3.97 2.67 3.3 3.5 3.3H6.6C7.05 3.3 7.47 3.5 7.75 3.85L8.6 4.9H14.5C15.33 4.9 16 5.57 16 6.4V13C16 13.83 15.33 14.5 14.5 14.5H3.5C2.67 14.5 2 13.83 2 13V4.8Z" fill={hex} fillOpacity="0.24" stroke={hex} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/** Rótulo de seção do sidebar (10.5px, mono, caixa alta). */
export function SectionLabel({ children, className, ...rest }: { children: ReactNode; className?: string } & SVGProps<never>) {
  return (
    <span className={cn('text-[10.5px] font-medium tracking-wider text-[var(--text-muted)] uppercase', className)} {...(rest as object)}>
      {children}
    </span>
  )
}

/** Tecla de atalho do chrome. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('rounded border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]', className)}>{children}</kbd>
}

/** Pílula de status do topo. */
export function StatusPill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'warning' | 'success' }) {
  const dot = tone === 'warning' ? 'bg-amber-400 animate-pulse-dot' : tone === 'success' ? 'bg-[var(--accent-primary)]' : 'bg-[var(--text-muted)]'
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] md:flex">
      <span className={cn('size-1.5 rounded-full', dot)} />
      {children}
    </div>
  )
}

/** Item de menu suspenso usado no top bar, no menu do painel e no menu do sidebar. */
export function MenuItem({ icon, label, onClick, danger, hint, disabled }: { icon?: ReactNode; label: ReactNode; onClick?: () => void; danger?: boolean; hint?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition',
        disabled ? 'pointer-events-none text-[var(--text-muted)] opacity-60' : 'hover:bg-[var(--bg-hover)]',
        danger ? 'text-rose-400' : 'text-[var(--text-primary)]',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon ? <span className="shrink-0 text-[var(--text-secondary)]">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      {hint ? <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{hint}</span> : null}
    </button>
  )
}

/** Divisor e cabeçalho dos menus. */
export function MenuSection({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1 font-mono text-[10px] tracking-wider text-[var(--text-muted)] uppercase">{children}</div>
}

export function MenuDivider() {
  return <div className="my-1 border-t border-[var(--border-subtle)]" />
}
