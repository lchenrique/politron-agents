import type { TeamTemplate } from '../types/team'
import * as fs from 'fs'
import * as path from 'path'

export interface AgentCatalogEntry {
  slug: string
  name: string
  role: string
  initials: string
  color: string
  bgColor: string
  borderColor: string
  systemPromptPath?: string
}

export interface AgentTemplateEntry {
  slug: string
  name: string
  description: string
  mode: string
  color: string
  initials: string
  role: string
  systemPromptPath: string
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  
  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) frontmatter[key] = value
  }
  
  return frontmatter
}

/**
 * Generate initials from agent name
 */
function generateInitials(name: string): string {
  const words = name.split(' ')
  if (words.length === 1) {
    return name.slice(0, 2).toUpperCase()
  }
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/**
 * Convert color format from hex (from template) to hsl (for catalog)
 */
function convertColor(hexColor: string): string {
  // If already hsl, return as is
  if (hexColor.startsWith('hsl')) return hexColor
  
  // Convert hex to hsl
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

/**
 * Load all agent templates from the .opencode/agents directory
 */
export function loadAgentTemplates(agentsDir: string = OPENCODE_PROJECT_AGENTS_DIR): AgentTemplateEntry[] {
  const templates: AgentTemplateEntry[] = []
  
  // Check if directory exists
  if (!fs.existsSync(agentsDir)) {
    console.warn(`[agent-catalog] Agents directory not found: ${agentsDir}`)
    return templates
  }
  
  try {
    const files = fs.readdirSync(agentsDir)
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      
      const filePath = path.join(agentsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const frontmatter = parseFrontmatter(content)
      
      if (!frontmatter.name) continue
      
      const slug = file.replace('.md', '')
      const color = convertColor(frontmatter.color || '#6366f1')
      
      templates.push({
        slug,
        name: frontmatter.name,
        description: frontmatter.description || '',
        mode: frontmatter.mode || 'all',
        color,
        initials: generateInitials(frontmatter.name),
        role: slug, // Use slug as role since templates don't have a role field
        systemPromptPath: filePath,
      })
    }
  } catch (error) {
    console.error(`[agent-catalog] Error loading agent templates:`, error)
  }
  
  // Sort by name
  templates.sort((a, b) => a.name.localeCompare(b.name))
  
  return templates
}

export const AGENCY_AGENTS_VENDOR_ROOT = '.vendor/agency-agents'
export const OPENCODE_PROJECT_AGENTS_DIR = '.opencode/agents'

export const GLOBAL_CEO_PROMPT = {
  slug: 'ceo',
  sourcePath: 'specialized/agents-orchestrator.md',
  targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/ceo.md`,
}

export const AGENCY_AGENT_SYNC_MAP: Record<string, { sourcePath: string; targetPath: string }> = {
  'studio-producer': {
    sourcePath: 'project-management/project-management-studio-producer.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/studio-producer.md`,
  },
  'frontend-dev': {
    sourcePath: 'engineering/engineering-frontend-developer.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/frontend-developer.md`,
  },
  'backend-dev': {
    sourcePath: 'engineering/engineering-backend-architect.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/backend-architect.md`,
  },
  'qa-tester': {
    sourcePath: 'testing/testing-reality-checker.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/reality-checker.md`,
  },
  'devops-eng': {
    sourcePath: 'engineering/engineering-devops-automator.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/devops-automator.md`,
  },
  'ux-designer': {
    sourcePath: 'design/design-ui-designer.md',
    targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/ui-designer.md`,
  },
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    slug: 'studio-producer',
    name: 'Studio Producer',
    role: 'tech-lead',
    initials: 'SP',
    color: 'hsl(239 84% 67%)',
    bgColor: 'bg-ide-indigo/10',
    borderColor: 'border-ide-indigo/20',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['studio-producer'].targetPath,
  },
  {
    slug: 'frontend-dev',
    name: 'Frontend Dev',
    role: 'frontend',
    initials: 'FE',
    color: 'hsl(142 69% 58%)',
    bgColor: 'bg-ide-green/10',
    borderColor: 'border-ide-green/15',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['frontend-dev'].targetPath,
  },
  {
    slug: 'backend-dev',
    name: 'Backend Dev',
    role: 'backend',
    initials: 'BA',
    color: 'hsl(43 96% 56%)',
    bgColor: 'bg-ide-amber/10',
    borderColor: 'border-ide-amber/15',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['backend-dev'].targetPath,
  },
  {
    slug: 'qa-tester',
    name: 'QA Tester',
    role: 'qa',
    initials: 'QA',
    color: 'hsl(330 86% 70%)',
    bgColor: 'bg-ide-pink/10',
    borderColor: 'border-ide-pink/15',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['qa-tester'].targetPath,
  },
  {
    slug: 'devops-eng',
    name: 'DevOps Eng',
    role: 'devops',
    initials: 'DO',
    color: 'hsl(200 84% 60%)',
    bgColor: 'bg-ide-cyan/10',
    borderColor: 'border-ide-cyan/15',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['devops-eng'].targetPath,
  },
  {
    slug: 'ux-designer',
    name: 'UX Designer',
    role: 'design',
    initials: 'UX',
    color: 'hsl(280 84% 70%)',
    bgColor: 'bg-ide-purple/10',
    borderColor: 'border-ide-purple/15',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['ux-designer'].targetPath,
  },
]

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: 'mvp-startup',
    name: 'MVP Startup',
    description: 'Time enxuto para validar ideias rapidamente',
    icon: '🚀',
    agentSlugs: ['studio-producer', 'frontend-dev', 'backend-dev'],
    suggestedTechLeadSlug: 'studio-producer',
    pipelineDescription: 'Desenvolvimento rápido de MVP com feedback contínuo',
  },
  {
    id: 'fullstack-squad',
    name: 'Fullstack Squad',
    description: 'Time equilibrado para produtos completos',
    icon: '⚡',
    agentSlugs: ['studio-producer', 'frontend-dev', 'backend-dev', 'qa-tester'],
    suggestedTechLeadSlug: 'studio-producer',
    pipelineDescription: 'Produto completo com testes e qualidade',
  },
  {
    id: 'platform-team',
    name: 'Platform Team',
    description: 'Time focado em infraestrutura e DX',
    icon: '🔧',
    agentSlugs: ['studio-producer', 'backend-dev', 'devops-eng'],
    suggestedTechLeadSlug: 'studio-producer',
    pipelineDescription: 'Infraestrutura, APIs e Developer Experience',
  },
  {
    id: 'quality-first',
    name: 'Quality First',
    description: 'Time com foco em qualidade e testes',
    icon: '✅',
    agentSlugs: ['studio-producer', 'frontend-dev', 'backend-dev', 'qa-tester', 'qa-tester'],
    suggestedTechLeadSlug: 'studio-producer',
    pipelineDescription: 'Testes extensivos e QA rigoroso',
  },
]

export function getAgentBySlug(slug: string): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((agent) => agent.slug === slug)
}

export function getTemplateById(id: string): TeamTemplate | undefined {
  return TEAM_TEMPLATES.find((template) => template.id === id)
}
