/**
 * Boobot: o DSH desenha marcas de sites conhecidos com `simple-icons` (pacote grande).
 * Aqui não há marcas: todo link externo cai no globo genérico do LinkIcon.
 * shortcut: sem marcas de site; trazer simple-icons só se o chat pedir essa fidelidade.
 */
import type { ReactElement } from 'react'

/** Props aceitas pelo original. */
export interface SiteGlyphProps {
  href: string
  size?: number | undefined
  className?: string | undefined
}

/** @returns Sempre undefined (sem marca específica). */
export function siteGlyph(_props: SiteGlyphProps): ReactElement | undefined {
  return undefined
}
