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
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line)
    if (!field) continue
    const value = field[2].trim().replace(/^["']|["']$/g, '')
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

export async function discoverSkills(customPaths: string[], learnedDir?: string): Promise<SkillInfo[]> {
  const builtin = await Promise.all(builtinRoots().map(root => scanSkillsDir(root.dir, root.source)))
  const custom = await Promise.all(customPaths.map(path => readSkill(path, 'custom')))
  const learned = learnedDir ? await scanSkillsDir(learnedDir, 'learned') : []
  return [...builtin.flat(), ...custom.filter((skill): skill is SkillInfo => !!skill), ...learned]
}
