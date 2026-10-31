/** Skills no formato SKILL.md (Codex/Claude Code): pasta com frontmatter name/description e instruções em markdown. */
/** `marketplace`: skills das equipes do Marketplace; só aparecem para Boos que as têm em `Agent.skillIds`. */
/** `marketplace`: skills das equipes do Marketplace; só chegam ao prompt de Boos que as têm em `Agent.skillIds`. */
export type SkillSource = 'codex' | 'claude' | 'custom' | 'learned' | 'marketplace' | 'marketplace'

export interface SkillInfo {
  id: string
  name: string
  description: string
  source: SkillSource
  /** Pasta que contém o SKILL.md; usada depois para ler o conteúdo completo sob demanda. */
  path: string
}

export interface SkillsAPI {
  list(): Promise<SkillInfo[]>
  /** Abre um seletor de pasta e cadastra como skill própria do Politron, se tiver um SKILL.md válido. */
  addFromFolder(): Promise<SkillInfo | null>
  remove(id: string): Promise<void>
  readContent(id: string): Promise<string>
}
