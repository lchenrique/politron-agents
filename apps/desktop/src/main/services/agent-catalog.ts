import type { TeamTemplate } from '../types/team'

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

export const AGENCY_AGENTS_VENDOR_ROOT = '.vendor/agency-agents'
export const OPENCODE_PROJECT_AGENTS_DIR = '.opencode/agents'

export const GLOBAL_CEO_PROMPT = {
  slug: 'agents-orchestrator',
  sourcePath: 'specialized/agents-orchestrator.md',
  targetPath: `${OPENCODE_PROJECT_AGENTS_DIR}/agents-orchestrator.md`,
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
