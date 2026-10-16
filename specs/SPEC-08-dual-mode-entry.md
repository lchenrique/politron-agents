# SPEC-08 — Dual-Mode Entry Architecture

## Objetivo

Formalizar e documentar a arquitetura de dois modos de entrada no Politron:

1. **Modo Hierárquico** — usado quando o usuário fala com CEO Global ou Tech Lead
2. **Modo Direto** — usado quando o usuário fala diretamente com um agente específico

## Princípios Fundamentais

- O sistema deve ser **inteligente e autônomo**
- O sistema deve **aceitar tanto coordenação hierárquica quanto instrução direta**
- O **fluxo hierárquico não é obrigatório** para toda solicitação
- O **mercado interno** do frontend deve ser usado como base de agentes disponíveis para contratação
- O **HR Global só participa** quando houver necessidade real de reforço de time
- **Agentes específicos podem receber e executar instruções diretamente**

## Modelo de Dois Modos

### Modo Hierárquico

Usado quando:
- O usuário fala explicitamente com **CEO Global** ou **Tech Lead**
- A tarefa requer **coordenação entre múltiplos agentes**
- É necessário **staffing/hiring** de novos agentes
- A tarefa está fora do escopo do agente atual

Fluxo:
```
Usuário → CEO Global/Tech Lead
  ↓
Tech Lead avalia capacidade do time
  ↓
Se faltar especialização?
  → SIM: Aciona HR Global
  → NÃO: Delega diretamente para agente do time
  ↓
HR Global escolhe agente disponível no mercado interno
  ↓
Agente é contratado (se necessário) e entra no time
  ↓
Agente recebe a tarefa
```

Responsabilidades:
- **CEO Global**: Coordena estratégia entre times, delega para Tech Leads, avalia necessidades organizacionais
- **Tech Lead**: Avalia capacidade técnica do time, identifica gaps, planeja trabalho, delega tarefas
- **HR Global**: Gerencia contratação e alocação de agentes do mercado interno

### Modo Direto

Usado quando:
- O usuário fala **diretamente com um agente específico**
- A tarefa está **dentro do escopo** do agente
- Não há necessidade de coordenação hierárquica

Fluxo:
```
Usuário → Agente Específico
  ↓
Agente avalia se tarefa está dentro do escopo
  ↓
Se dentro do escopo?
  → SIM: Executa diretamente
  → NÃO: Escala para Tech Lead ou pede reforço
  ↓
TaskBoard atualiza status em tempo real
```

Responsabilidades:
- **Agente Executor**: Avalia scope da tarefa, executa se capaz, escalona se necessário
- **Sistema**: Não deve forçar passagem pelo CEO ou Tech Lead desnecessariamente

## Regras de Escalonamento

### Quando um agente deve escalar?

1. **Task fora do escopo**: A tarefa requer specialização que o agente não possui
2. **Dependência externa**: A tarefa depende de outra tarefa ou agente
3. **Bloqueio**: Agente está esperando input ou recurso
4. **Coordenação needed**: A tarefa requer múltiplos agentes ou times

### Quando um agente pode executar diretamente?

1. **Scope match**: A tarefa está explicitamente no ExecutionScope do agente
2. **Capacidade disponível**: Agente está idle e capaz
3. **Contexto claro**: Tarefa tem escopo bem definido
4. **Sem dependências**: Não há dependências bloqueantes

## Escopos de Execução por Agente

Definidos em `agent-capability.ts`:

```typescript
type ExecutionScope =
  | "frontend"   // Frontend development tasks
  | "backend"    // Backend/API development tasks
  | "design"     // UI/UX design tasks
  | "qa"         // QA/testing tasks
  | "devops"     // DevOps/infrastructure tasks
  | "architecture" // Architecture/planning tasks
  | "general"    // Any task (general purpose agents)
```

### Mapeamento Executor → Scope

| Agente | Scopes |
|--------|--------|
| frontend-developer | frontend, general |
| backend-architect | backend, architecture, general |
| ui-designer | design, general |
| reality-checker | qa, general |
| devops-automator | devops, general |

## Componentes de Roteamento

### entry-point-router.ts

Responsável por determinar qual modo usar para cada requisição:

```typescript
interface RoutingDecision {
  flow: "hierarchical" | "direct"
  targetAgent: Agent | null
  reason: string
  canExecuteDirectly: boolean
  shouldQueueBoardTask: boolean
  taskScope: ExecutionScope
}
```

### agent-capability.ts

Responsável por:
- Determinar se um agente é `coordinator` ou `executor`
- Mapear scopes para agentes executores
- Inferir scope de uma descrição de tarefa

### Hierarquia de Coordenadores

```typescript
const COORDINATOR_SLUGS = new Set([
  "ceo",           // CEO Global - coordena organização
  "hr-global",     // HR Global - staffing
  "tech-lead",     // Tech Lead - coordena time
  "studio-producer", // Studio Producer - coordena produção
  "software-architect" // Arquiteto - coaching, não execução
])
```

### Hierarquia de Executores

Todos os agentes que **não são** coordenadores são executores potenciais.

## Fluxo de Decisão

```
User Input
    ↓
isLeadershipRequest(message)?
    ↓
    SIM → Modo Hierárquico
    ↓
    NÃO → isDirectExecutionRequest(message)?
              ↓
              SIM → Determinar agente alvo
              ↓
              NÃO → Entry point determina modo
```

### Detecção de Request

`isLeadershipRequest()`:
- Detecta quando usuário quer falar com liderança
- Termos: "ceo", "tech lead", "rh global", "gerir", "liderança"

`isDirectExecutionRequest()`:
- Detecta quando usuário quer execução direta
- Requer verbo de ação + menção de agente

## Mercado Interno de Agentes

### Conceito

O Politron mantém um marketplace de agentes internos (já contratados) e externos (disponíveis para contratação).

### Catálogo de Agentes

```typescript
// AgentCatalogEntry - agentes já no sistema
const AGENT_CATALOG: AgentCatalogEntry[] = [...]

// OpenCodeAgentDefinition - agentes do marketplace
const OPENCODE_MARKETPLACE_AGENTS: OpenCodeAgentDefinition[] = [...]
```

### Hiring Flow

```
Tech Lead identifica gap
    ↓
DELegate command com staffing request
    ↓
HR Global recebe task de staffing
    ↓
HR Global escolhe agente do marketplace
    ↓
HIRE_AGENT command executa
    ↓
Agente adicionado ao team
    ↓
Task atribuída ao novo agente
```

## Integração com TaskBoard

### Modo Hierárquico

- Tasks são criadas no board
- Tech Lead delega para agentes
- HR Global介入 quando há gap

### Modo Direto

- Tasks podem ser criadas diretamente
- Agente recebe task sem passar por hierarquia
- Board atualiza status em tempo real

## Configurações de Autonomia

### Por Projeto

```typescript
interface AutonomyPolicy {
  allowDirectToExecutors: boolean    // default: true
  requireStaffingApproval: boolean    // default: false
  maxConcurrentTasksPerAgent: number  // default: 3
  autoEscalateOnBlock: boolean       // default: true
}
```

### Por Agente

```typescript
interface Agent {
  // ...
  autonomyLevel: "full" | "semi" | "restricted"
  maxTaskComplexity: "low" | "medium" | "high"
}
```

## Casos de Uso

### Caso 1: "Frontend Dev, cria o botão de login"

1. Sistema detecta menção a "Frontend Dev"
2. `resolveTeamAgent()` encontra o agente
3. `inferTaskScope()` retorna "frontend"
4. `canExecutorHandleScope("frontend-developer", "frontend")` retorna `true`
5. **Modo Direto** ativado
6. Agente executa diretamente

### Caso 2: "Preciso de ajuda para estruturar esse projeto"

1. `isLeadershipRequest()` retorna `true`
2. **Modo Hierárquico** ativado
3. Tech Lead avalia necessidade
4. Tech Lead pode delegar ou escalar para CEO

### Caso 3: "QA precisa testar o fluxo de checkout"

1. Sistema detecta menção a "QA"
2. Resolve QA Tester no team
3. Task scope inferido como "qa"
4. **Modo Direto** ativado se QA capable
5. QA Tester executa ou escalona para HR

## Arquitetura de Arquivos

```
apps/desktop/src/main/services/
├── entry-point-router.ts     # Roteamento de dois modos
├── agent-capability.ts       # Sistema de capabilities e scopes
├── agent-catalog.ts          # Catálogo de agentes e marketplace
├── ceo-output-parser.ts      # Parser de comandos CEO
├── ceo-command-executor.ts   # Executor de comandos hierárquicos
└── pipeline-executor.ts      # Executor de tasks

apps/desktop/src/renderer/src/
├── features/chat/hooks/
│   └── useOpencodeTranscriptBridge.ts  # Bridge de transcrição
└── components/ide/
    └── TeamsSidebar.tsx      # Sidebar de times e agentes
```

## Estados do Agente

```typescript
type AgentStatus =
  | "idle"        // Livre, esperando tarefa
  | "running"     // Executando tarefa
  | "waiting"     // Aguardando input ou dependência
  | "blocked"     // Bloqueado por algo
  | "done"        // Tarefa concluída
  | "error"       // Erro na execução
```

## Logging de Decisões

Todas as decisões de roteamento devem ser logadas:

```typescript
interface RoutingLog {
  timestamp: string
  userInput: string
  flow: "hierarchical" | "direct"
  targetAgent: string | null
  reason: string
  canExecuteDirectly: boolean
}
```

## Backward Compatibility

- Sistemas existentes continuam funcionando
- Novas features de dual-mode são opt-in via AutonomyPolicy
- Padrão é `allowDirectToExecutors: true`

## Decisões Fixas

1. Modo Hierárquico é usado quando usuário explicitamente menciona liderança
2. Modo Direto é usado quando tarefa está no scope do agente
3. HR Global só entra quando há gap real de capacidade
4. Agentes podem executar diretamente sem passar por hierarquia se capazes
5. Escalonamento é automático baseado em scope e capacidade
6. TaskBoard reflete o estado real de todas as operações