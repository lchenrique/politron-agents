# SPEC-V2-01 - Dual Provider Architecture

## Objetivo

Separar a arquitetura de agentes do Politron em dois grupos com responsabilidades diferentes:

1. Agentes internos: raciocínio, coordenação, staffing e operações de negócio.
2. Agentes executores: execução técnica com acesso a código, git, terminal e filesystem.

A experiência do usuário continua a mesma. A mudança é interna: cada agente passa a ser roteado para o provider correto.

## Princípio central

- Agentes internos usam MiniMax direto, com tools internas do Politron.
- Agentes executores usam OpenCode SDK, com tools completas de execução.
- O schema de eventos deve continuar uniforme para a UI.
- A diferença entre `agentId` e `role` precisa ser explícita:
  - `agentId` canônico do CEO Global: `ceo-global`
  - `role` do CEO Global: `global-ceo`

## Provider layer

### Roteamento

```ts
interface AgentProvider {
  type: "internal" | "executor"
  sendMessage(input: SendMessageInput): Promise<void>
  subscribe(handler: (chunk: StreamChunk) => void): () => void
  getStatus(): ProviderStatus
  getAvailableTools(agentId?: string, context?: AgentContext): Tool[]
}
```

```ts
function getProviderForAgent(agent: Agent): AgentProvider {
  if (isInternalAgent(agent)) {
    return miniMaxDirectProvider
  }

  return openCodeSdkProvider
}

function isInternalAgent(agent: Agent): boolean {
  return ["ceo", "hr-global", "tech-lead"].includes(agent.catalogSlug)
}
```

### Agentes internos

- `ceo-global`
- `hr-global`
- `tech-lead`

### Agentes executores

- Todos os agentes de catálogo orientados a execução técnica.
- Exemplos: frontend, backend, QA, design, devops e agentes especializados do marketplace.

## Contrato formal

```ts
type AgentType = "internal" | "executor"

interface AgentConfig {
  id: string
  name: string
  type: AgentType
  llm: LLMConfig
  tools: Tool[]
  capabilities: AgentCapabilities
}

interface LLMConfig {
  provider: "minimax" | "opencode"
  model: string
  modelSelectable: boolean
  temperature?: number
  maxTokens?: number
}

interface AgentCapabilities {
  canEditCode: boolean
  canUseFilesystem: boolean
  canUseGit: boolean
  canCreateTasks: boolean
  canManageTeam: boolean
  canDelegate: boolean
  canHire: boolean
}
```

## Matriz de agentes internos

### CEO Global

- `agentId`: `ceo-global`
- `role`: `global-ceo`
- `catalogSlug`: `ceo`
- Provider: MiniMax Direct
- Capacidades:
  - `canCreateTasks = true`
  - `canManageTeam = true`
  - `canDelegate = true`
  - `canHire = false`
- Tools permitidas no runtime:
  - `team_list`
  - `team_get`
  - `team_resolve`
  - `tasks_list`
  - `delegate_to_agent`
  - `staffing_request`

### RH Global

- `agentId`: `hr-global`
- `role`: `global-agent`
- `catalogSlug`: `hr-global`
- Provider: MiniMax Direct
- Capacidades:
  - `canCreateTasks = false`
  - `canManageTeam = true`
  - `canDelegate = false`
  - `canHire = true`
- Tools permitidas no runtime:
  - `team_list`
  - `team_get`
  - `team_resolve`
  - `list_catalog`
  - `hire_from_catalog`

### Tech Lead

- `agentId`: `tech-lead`
- `role`: `tech-lead`
- `catalogSlug`: `tech-lead`
- Provider: MiniMax Direct
- Capacidades:
  - `canCreateTasks = true`
  - `canManageTeam = false`
  - `canDelegate = true`
  - `canHire = false`
- Tools permitidas no runtime:
  - `team_list`
  - `team_get`
  - `team_resolve`
  - `tasks_list`
  - `tasks_ensure`
  - `delegate_to_agent`
  - `staffing_request`
  - `session_get_active`

## Internal tools

### Team management

- `team_list`
- `team_get`
- `team_resolve`

Observação:
- O spec original listava mais operações `team_*`, mas o runtime atual está propositalmente restrito ao conjunto necessário para coordenação.

### Task management

- `tasks_list`
- `tasks_get`
- `tasks_ensure`
- `tasks_update`
- `tasks_start`
- `tasks_complete`
- `tasks_remove`
- `tasks_dedupe`
- `tasks_ready`
- `tasks_pipeline`

Observação:
- Nem todo agente interno recebe todas as tools de task.
- A visibilidade e a escrita dependem do allowlist por role.

### Delegation

- `delegate_to_agent`

Regra:
- Delegação deve passar pelo fluxo hierárquico.
- Não existe mais “direct flow” como caminho arquitetural primário.

### Staffing

- `staffing_request`
- `list_catalog`
- `hire_from_catalog`

Regras:
- `staffing_request` encaminha para o RH Global via orquestração.
- `hire_from_catalog` só pode ser usado por CEO Global ou RH Global.
- Tech Lead não contrata diretamente.

### Session / context

- `session_get_active`
- `session_get_history`

Regra:
- O estado observável do provider interno deve refletir `sessionStore`, não apenas memória local.

## Feature flags por tipo de agente

| Feature | Executor | Internal |
|---------|:--------:|:--------:|
| Trocar modelo LLM | Sim | Não |
| Ajustar temperature | Sim | Não |
| Editar system prompt | Sim | Não |
| Usar tools internas | Limitado | Sim |
| Acessar filesystem | Sim | Não |
| Executar git | Sim | Não |
| Criar tasks | Via execução | Via tools |
| Gerenciar times | Não | Sim |

## UX

### O que não muda

- A UI de chat continua a mesma.
- O usuário não precisa escolher provider.
- Os eventos continuam chegando no mesmo formato geral para transcript, tool state e status.

### O que muda internamente

- CEO, RH e Tech Lead passam a responder pelo provider interno.
- Executores continuam no OpenCode SDK.
- O seletor de modelo e as opções avançadas ficam restritos a executores.

## Regras arquiteturais fixas

1. A separação de provider é interna e transparente para o usuário.
2. Internal tools são o caminho primário para operações de negócio.
3. `ceo-global` é o id canônico do CEO; `global-ceo` é role, não id.
4. O fluxo correto é hierárquico:
   - CEO coordena
   - Tech Lead organiza o time
   - RH resolve staffing e contratação
   - Executor implementa
5. `directFlow` não deve ser usado como atalho estrutural.
6. Qualquer compatibilidade legada com aliases deve ser tratada como adaptação, não como fonte de verdade.
7. Arquivos de prompt e specs devem permanecer em UTF-8 limpo.

## Estado esperado da implementação

- `internal-agents.ts` aplica allowlist real por role.
- `staffing-tools.ts` encaminha staffing via RH.
- `team-tools.ts` resolve time por `projectName` e `projectPath`.
- `entry-point-router.ts` e `ceo-command-executor.ts` não expõem mais `directFlow` como arquitetura.
- `opencode-sdk.ts` só coordena executores e integra handoff/eventos.
- `sessionStore` representa o estado observável dos agentes internos.

## Fases

### Fase 1

- Implementar internal tools.
- Validar o provider MiniMax para agentes internos.

### Fase 2

- Roteamento dual provider ativo.
- CEO e RH no path interno.

### Fase 3

- Tech Lead no path interno.
- Group chat e mention routing podem ser adicionados sem quebrar o modelo de provider.

### Fase 4

- Remover compatibilidades legadas que não forem mais necessárias.
- Consolidar aliases antigos.
- Atualizar documentação derivada.

## Histórico

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.1 | 11/04/2026 | Spec reescrito em UTF-8 e alinhado ao contrato real do runtime |
| 1.0 | 10/04/2026 | Versão inicial |
