/** Skills no formato SKILL.md (Codex/Claude Code): pasta com frontmatter name/description e instruções em markdown. */
export type SkillSource = 'codex' | 'claude' | 'custom' | 'learned'

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
