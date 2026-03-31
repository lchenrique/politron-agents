# SPEC-03 — Times e Pipeline

## Modelo de dados

```ts
type AgentStatus = "idle" | "running" | "waiting" | "blocked" | "done" | "error"

interface Agent {
  id: string
  name: string
  role: string
  catalogSlug: string
  systemPromptPath: string
  status: AgentStatus
  color: string
  currentFiles: string[]
  sessionId?: string
  hiredAt: string
}

interface Team {
  id: string
  name: string
  projectPath: string
  techLeadAgentId: string
  agents: Agent[]
  status: "active" | "paused"
  pipeline: PipelineState
  createdAt: string
  templateId?: string
}

interface Workspace {
  globalCeoAgentId: string | null
  teams: Team[]
  activeTeamId: string | null
}

interface PipelineState {
  tasks: PipelineTask[]
  status: "idle" | "running" | "paused" | "done" | "failed"
  startedAt?: string
  finishedAt?: string
}

interface PipelineTask {
  id: string
  teamId: string
  agentId: string
  description: string
  files: string[]
  status: "pending" | "running" | "done" | "failed" | "blocked"
  dependsOn: string[]
  branchName?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

interface TeamTemplate {
  id: string
  name: string
  description: string
  icon: string
  agentSlugs: string[]
  suggestedTechLeadSlug?: string
  pipelineDescription: string
}
```

## Regras organizacionais

- O CEO é global e vive no nível de `Workspace`.
- O time não tem `ceoAgentId`.
- O time tem `techLeadAgentId`.
- O tech lead comanda o pipeline local.
- O CEO global coordena entre times.

## Criação de time

Ao criar um time:

- `agents` começa vazio
- `techLeadAgentId` começa vazio
- o pipeline inicia em `idle`
- se o projeto não tiver git, a aplicação pode inicializar o repositório

## Movimentação de agentes

Ao mover um agente entre times:

- a sessão do agente deve ser recriada com o novo contexto
- locks e arquivos atuais devem ser limpos
- o agente não pode continuar como tech lead do time antigo

## Pipeline em dois níveis

### Nível 1: CEO global

O CEO global decide:

- qual time executa cada frente
- dependências entre times
- ordem macro de execução

### Nível 2: Tech lead

O tech lead decide:

- subtarefas internas
- quais agentes do time executam cada item
- dependências locais
- branches e locks

## Parsing de saída estruturada

### CEO global

```txt
TEAM_TASK_START
id: team-task-001
team_id: team-frontend
description: construir fluxo de autenticação do app desktop
depends_on_teams: []
TEAM_TASK_END
```

### Tech lead

```txt
TASK_START
id: task-001
agent_id: agent-frontend-1
description: criar tela de login
files: [src/routes/login.tsx, src/features/auth/login-form.tsx]
depends_on: []
branch: feat/login-ui
TASK_END
```

## Executor de pipeline local

O executor local do time:

1. avalia dependências
2. checa conflito de arquivos
3. dispara tasks aptas
4. atualiza status
5. notifica o CEO global quando o bloco do time terminar

## Logs entre agentes

```ts
interface AgentLog {
  id: string
  timestamp: string
  fromAgentId: string
  toAgentId?: string
  type: "delegation" | "status" | "result" | "error" | "merge"
  content: string
  taskId?: string
  teamId?: string
}
```

## Templates

Templates devem sugerir composição de time, não CEO local.

Exemplo:

```ts
const DEFAULT_TEMPLATES: TeamTemplate[] = [
  {
    id: "saas-startup",
    name: "SaaS Startup",
    description: "Time completo para uma aplicação SaaS desktop",
    icon: "🚀",
    agentSlugs: [
      "engineering/frontend-developer",
      "engineering/backend-architect",
      "testing/qa-engineer",
    ],
    suggestedTechLeadSlug: "engineering/tech-lead",
    pipelineDescription:
      "Tech lead coordena frontend, backend e QA. O CEO global acompanha marcos e dependências entre times.",
  },
]
```

## Decisões fixas

1. `techLeadAgentId` substitui `ceoAgentId` em todos os times.
2. O CEO global existe uma única vez.
3. O pipeline local pertence ao time.
4. O CEO global só entra no detalhe operacional quando houver exceção ou bloqueio.
