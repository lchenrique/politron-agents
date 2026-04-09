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

export interface GlobalAgentDefinition {
  id: string
  slug: string
  name: string
  role: "global-ceo" | "global-agent"
  systemPromptPath: string
}

export type OpenCodeAgentScope = "global" | "marketplace"

export interface OpenCodeAgentDefinition {
  slug: string
  name: string
  description: string
  mode: string
  color: string
  initials: string
  role: string
  systemPromptPath: string
  scope: OpenCodeAgentScope
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  
  const frontmatter: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  
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

function resolveProjectRoot(startDir: string = __dirname): string {
  const markers = ['.git', 'AGENTS.md', '.opencode']
  let current = startDir

  for (let i = 0; i < 10; i++) {
    if (markers.some((marker) => fs.existsSync(path.join(current, marker)))) {
      return current
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return process.cwd()
}

function toAbsoluteProjectPath(relativePath: string): string {
  return path.resolve(resolveProjectRoot(), relativePath)
}

export const GLOBAL_CEO_PROMPT = {
  slug: 'ceo',
  sourcePath: 'specialized/agents-orchestrator.md',
  targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/ceo.md`),
}

export const GLOBAL_AGENT_DEFINITIONS: GlobalAgentDefinition[] = [
  {
    id: 'ceo-global',
    slug: 'ceo',
    name: 'CEO Global',
    role: 'global-ceo',
    systemPromptPath: GLOBAL_CEO_PROMPT.targetPath,
  },
  {
    id: 'hr-global',
    slug: 'hr-global',
    name: 'RH Global',
    role: 'global-agent',
    systemPromptPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/hr-global.md`),
  },
]

const ABSOLUTE_OPENCODE_PROJECT_AGENTS_DIR = toAbsoluteProjectPath(OPENCODE_PROJECT_AGENTS_DIR)

export const OPENCODE_AGENT_TEMPLATES: AgentTemplateEntry[] = loadAgentTemplates(
  ABSOLUTE_OPENCODE_PROJECT_AGENTS_DIR
)

const GLOBAL_AGENT_SLUGS = new Set(GLOBAL_AGENT_DEFINITIONS.map((agent) => agent.slug))

export const OPENCODE_AGENT_REGISTRY: Record<string, OpenCodeAgentDefinition> = Object.fromEntries(
  OPENCODE_AGENT_TEMPLATES.map((template) => [
    template.slug,
    {
      ...template,
      scope: GLOBAL_AGENT_SLUGS.has(template.slug) ? "global" : "marketplace",
    } satisfies OpenCodeAgentDefinition,
  ])
)

export const OPENCODE_MARKETPLACE_AGENTS: OpenCodeAgentDefinition[] = Object.values(
  OPENCODE_AGENT_REGISTRY
).filter((agent) => agent.scope === "marketplace")

function normalizeAgentIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s/]+/g, "-")
}

const MARKETPLACE_AGENT_IDENTITY_ALIASES: Record<string, string> = {
  "frontend-dev": "frontend-developer",
  "backend-dev": "backend-architect",
  "qa-tester": "reality-checker",
  "qa-engineer": "reality-checker",
  "devops-eng": "devops-automator",
  "ux-designer": "ui-designer",
  "uiux-designer": "ui-designer",
  "ui-ux-designer": "ui-designer",
}

export const AGENCY_AGENT_SYNC_MAP: Record<string, { sourcePath: string; targetPath: string }> = {
  'tech-lead': {
    sourcePath: 'project-management/project-management-studio-producer.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/tech-lead.md`),
  },
  'frontend-dev': {
    sourcePath: 'engineering/engineering-frontend-developer.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/frontend-developer.md`),
  },
  'backend-dev': {
    sourcePath: 'engineering/engineering-backend-architect.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/backend-architect.md`),
  },
  'qa-tester': {
    sourcePath: 'testing/testing-reality-checker.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/reality-checker.md`),
  },
  'devops-eng': {
    sourcePath: 'engineering/engineering-devops-automator.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/devops-automator.md`),
  },
  'ux-designer': {
    sourcePath: 'design/design-ui-designer.md',
    targetPath: toAbsoluteProjectPath(`${OPENCODE_PROJECT_AGENTS_DIR}/ui-designer.md`),
  },
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    slug: 'tech-lead',
    name: 'Tech Lead',
    role: 'tech-lead',
    initials: 'TL',
    color: 'hsl(239 84% 67%)',
    bgColor: 'bg-ide-indigo/10',
    borderColor: 'border-ide-indigo/20',
    systemPromptPath: AGENCY_AGENT_SYNC_MAP['tech-lead'].targetPath,
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
    agentSlugs: ['tech-lead', 'frontend-dev', 'backend-dev'],
    suggestedTechLeadSlug: 'tech-lead',
    pipelineDescription: 'Desenvolvimento rápido de MVP com feedback contínuo',
  },
  {
    id: 'fullstack-squad',
    name: 'Fullstack Squad',
    description: 'Time equilibrado para produtos completos',
    icon: '⚡',
    agentSlugs: ['tech-lead', 'frontend-dev', 'backend-dev', 'qa-tester'],
    suggestedTechLeadSlug: 'tech-lead',
    pipelineDescription: 'Produto completo com testes e qualidade',
  },
  {
    id: 'platform-team',
    name: 'Platform Team',
    description: 'Time focado em infraestrutura e DX',
    icon: '🔧',
    agentSlugs: ['tech-lead', 'backend-dev', 'devops-eng'],
    suggestedTechLeadSlug: 'tech-lead',
    pipelineDescription: 'Infraestrutura, APIs e Developer Experience',
  },
  {
    id: 'quality-first',
    name: 'Quality First',
    description: 'Time com foco em qualidade e testes',
    icon: '✅',
    agentSlugs: ['tech-lead', 'frontend-dev', 'backend-dev', 'qa-tester', 'qa-tester'],
    suggestedTechLeadSlug: 'tech-lead',
    pipelineDescription: 'Testes extensivos e QA rigoroso',
  },
]

export function getAgentBySlug(slug: string): AgentCatalogEntry | undefined {
  const normalizedSlug =
    slug === 'studio-producer' || slug === 'software-architect'
      ? 'tech-lead'
      : slug

  return AGENT_CATALOG.find((agent) => agent.slug === normalizedSlug)
}

export function getAgentByIdentity(value: string): AgentCatalogEntry | undefined {
  const normalized = value.trim().toLowerCase().replace(/[_\s/]+/g, '-')
  return AGENT_CATALOG.find((agent) => {
    const normalizedSlug = agent.slug.toLowerCase().replace(/[_\s/]+/g, '-')
    const normalizedName = agent.name.toLowerCase().replace(/[_\s/]+/g, '-')
    const normalizedRole = agent.role.toLowerCase().replace(/[_\s/]+/g, '-')

    return (
      normalizedSlug === normalized ||
      normalizedName === normalized ||
      normalizedRole === normalized ||
      normalizedName.includes(normalized) ||
      normalized.includes(normalizedSlug) ||
      normalized.includes(normalizedRole)
    )
  })
}

export function getTemplateById(id: string): TeamTemplate | undefined {
  return TEAM_TEMPLATES.find((template) => template.id === id)
}

export function getGlobalAgentByIdentity(value: string): GlobalAgentDefinition | undefined {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, '-')
  return GLOBAL_AGENT_DEFINITIONS.find((agent) => {
    const normalizedName = agent.name.toLowerCase().replace(/[_\s]+/g, '-')
    return (
      agent.id === normalized ||
      agent.slug === normalized ||
      normalizedName === normalized ||
      normalizedName.includes(normalized) ||
      normalized.includes(agent.slug)
    )
  })
}

export function getMarketplaceAgentByIdentity(value: string): OpenCodeAgentDefinition | undefined {
  const normalized = normalizeAgentIdentity(value)
  const canonical = MARKETPLACE_AGENT_IDENTITY_ALIASES[normalized] ?? normalized

  return OPENCODE_MARKETPLACE_AGENTS.find((agent) => {
    const normalizedSlug = normalizeAgentIdentity(agent.slug)
    const normalizedName = normalizeAgentIdentity(agent.name)
    const normalizedRole = normalizeAgentIdentity(agent.role)

    return (
      normalizedSlug === canonical ||
      normalizedName === canonical ||
      normalizedRole === canonical ||
      normalizedName.includes(canonical) ||
      canonical.includes(normalizedSlug)
    )
  })
}

export function listMarketplaceAgentIdentities(): string[] {
  return OPENCODE_MARKETPLACE_AGENTS.map((agent) => `${agent.name} [${agent.slug}]`)
}
