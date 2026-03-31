# SPEC-02 — Integração com OpenCode via SDK

## Princípio

O VibeIDE deve usar **`@opencode-ai/sdk` como caminho principal de integração**.

Não modelar a arquitetura principal em cima de `spawn("opencode")`.
Se existir fallback para CLI no futuro, ele deve ser secundário e fora do fluxo principal desta spec.

## Regras obrigatórias

- Usar `@opencode-ai/sdk/v2/client`
- Reaproveitar os tipos oficiais do SDK
- O serviço roda no main process
- O renderer recebe apenas eventos e respostas via IPC

## Sessões

Há três níveis de sessão:

1. **CEO global**
2. **Tech lead do time**
3. **Agentes do time**

Cada agente ativo possui sua própria sessão.
O CEO global também possui uma sessão dedicada e persistente.

## Modelo de sessão local

```ts
import type { Session } from "@opencode-ai/sdk/v2/client"

interface ManagedSession {
  agentId: string
  teamId?: string
  role: "global-ceo" | "tech-lead" | "team-agent"
  session: Session
  status: AgentStatus
  lastEventAt?: string
}
```

## Serviço de integração

```ts
interface OpenCodeSdkService {
  ensureSession(input: EnsureSessionInput): Promise<ManagedSession>
  sendMessage(input: SendAgentMessageInput): Promise<void>
  subscribeToSession(agentId: string): Promise<void>
  subscribeToGlobalEvents(): Promise<void>
  stopSession(agentId: string): Promise<void>
}
```

## Estratégia de streaming

- Eventos globais devem usar `client.global.event()`
- Cada sessão também pode ter streaming dedicado para alimentar a UI
- O main process normaliza os eventos do SDK para eventos internos da aplicação

Eventos internos sugeridos:

- `vibe:agent:chunk`
- `vibe:agent:status`
- `vibe:agent:done`
- `vibe:agent:error`
- `vibe:pipeline:update`

## Construção de contexto

### CEO global

O prompt do CEO global deve incluir:

- lista dos times disponíveis
- tech lead de cada time
- estado resumido dos pipelines
- objetivo atual do usuário

### Tech lead

O prompt do tech lead deve incluir:

- contexto do time
- agentes disponíveis no time
- instruções recebidas do CEO global
- regras de locking e branch

### Agente do time

O prompt do agente deve incluir:

- identidade do catálogo
- contexto do time
- nome do tech lead
- instruções operacionais da task

## Contratos de mensagem

### CEO global → tech lead

```txt
TEAM_TASK_START
id: {uuid}
team_id: {teamId}
description: {objetivo do time}
depends_on_teams: [{teamIds}]
TEAM_TASK_END
```

### Tech lead → agente

```txt
TASK_START
id: {uuid}
agent_id: {agentId}
description: {subtarefa}
files: [{arquivos}]
depends_on: [{taskIds}]
branch: {branch}
TASK_END
```

## Detecção de status

O status do agente deve ser derivado dos eventos do SDK, não de parsing de stdout.

Mapeamento sugerido:

- início de turno/stream → `running`
- pausa aguardando resposta humana → `waiting`
- erro do SDK/session → `error`
- conclusão explícita da task → `done`
- ocioso sem execução → `idle`

## Diff e arquivos alterados

O SDK fornece o fluxo conversacional.
A identificação de arquivos alterados e geração de diff continua responsabilidade local da aplicação:

- detectar arquivos declarados na task
- ler mudanças no worktree/branch
- gerar diff com git
- renderizar com `@pierre/diffs`

## Persistência

Persistir somente metadados locais:

- `agentId`
- `teamId`
- `role`
- `sessionId`
- `status`

Não persistir uma cópia paralela dos tipos do SDK se isso puder ser evitado.

## Heurística de input humano

Um agente entra em `waiting` quando:

- o SDK sinaliza pausa/interrupção que exige resposta
- ou a aplicação detecta pergunta explícita ao usuário sem progresso subsequente dentro do timeout configurado

## Decisões fixas

1. SDK primeiro, CLI não.
2. CEO global tem sessão própria.
3. Tech lead tem sessão própria.
4. Um agente ativo = uma sessão.
5. Eventos do SDK são a fonte primária de status.
