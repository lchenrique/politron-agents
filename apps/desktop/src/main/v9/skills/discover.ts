import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { SkillInfo, SkillSource } from '../../../shared/skills'

/** Onde o Codex e o Claude Code já guardam skills; o Politron só lê, nunca escreve aqui. */
function builtinRoots(): { source: SkillSource; dir: string }[] {
  const home = homedir()
  return [
    { source: 'codex', dir: join(home, '.codex', 'skills') },
    { source: 'claude', dir: join(home, '.claude', 'skills') },
  ]
}

/**
 * Frontmatter de SKILL.md é YAML simples (chave: valor, com um nível de aninhamento em metadata).
 * Evita puxar uma dependência de YAML só para ler `name` e `description`.
 */
export function parseSkillFrontmatter(text: string): { name?: string; description?: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return null
  const result: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const field = /^([a-zA-Z_-]+):\s*(.*)$/.exec(lines[index]!)
    if (!field) continue
    let value = field[2].trim()
    // Bloco dobrado/literal do YAML (`description: >`): junta as linhas indentadas seguintes.
    if (/^[>|][+-]?$/.test(value)) {
      const block: string[] = []
      while (index + 1 < lines.length && (/^\s+\S/.test(lines[index + 1]!) || !lines[index + 1]!.trim())) block.push(lines[++index]!.trim())
      value = block.filter(Boolean).join(' ')
    }
    value = value.replace(/^["']|["']$/g, '')
    if (value) result[field[1]] = value
  }
  return result
}

async function readSkill(dir: string, source: SkillSource): Promise<SkillInfo | null> {
  const file = join(dir, 'SKILL.md')
  let text: string
  try { text = await fs.readFile(file, 'utf8') } catch { return null }
  const meta = parseSkillFrontmatter(text)
  const name = meta?.name || basename(dir)
  if (!meta?.description) return null
  return { id: `${source}:${dir}`, name, description: meta.description, source, path: dir }
}

/** Uma pasta de skills guarda uma subpasta por skill, cada uma com seu SKILL.md; ignora pastas de sistema como .system. */
async function scanSkillsDir(dir: string, source: SkillSource): Promise<SkillInfo[]> {
  let entries: string[]
  try { entries = (await fs.readdir(dir, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name) }
  catch { return [] }
  const skills = await Promise.all(entries.map(entry => readSkill(join(dir, entry), source)))
  return skills.filter((skill): skill is SkillInfo => !!skill)
}

export async function discoverSkills(customPaths: string[], learnedDir?: string, marketplaceDir?: string): Promise<SkillInfo[]> {
  const builtin = await Promise.all(builtinRoots().map(root => scanSkillsDir(root.dir, root.source)))
  const custom = await Promise.all(customPaths.map(path => readSkill(path, 'custom')))
  const learned = learnedDir ? await scanSkillsDir(learnedDir, 'learned') : []
  // Skills do Marketplace usam o nome da pasta como id estável (é o que fica em Agent.skillIds).
  const marketplace = marketplaceDir ? (await scanSkillsDir(marketplaceDir, 'marketplace')).map(skill => ({ ...skill, id: `marketplace:${basename(skill.path)}` })) : []
  return [...builtin.flat(), ...custom.filter((skill): skill is SkillInfo => !!skill), ...learned, ...marketplace]
}
