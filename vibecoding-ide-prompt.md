# VibeIDE — Prompt de Construção

---

## PROMPT

Quero que você construa do zero um aplicativo Electron chamado **VibeIDE** — uma IDE focada em vibecoding com sistema de agentes de IA organizados em times, com pipeline de execução paralela. Não é um wrapper do VSCode. É uma aplicação desktop própria.

O produto precisa seguir estas regras de organização:

- Existe **um único CEO global** para toda a aplicação.
- O CEO **não pertence a um time específico**.
- Cada time possui um **tech lead** responsável por coordenar aquele time.
- **Não existe COO**.
- O CEO global coordena prioridades entre times e pode acionar os tech leads.
- O tech lead coordena os agentes do próprio time, a execução do pipeline local e os merges daquele time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40, electron-vite |
| Frontend | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS v4 |
| State | Jotai |
| Routing | TanStack Router |
| UI components | shadcn/ui, Base UI, cmdk |
| Code highlighting | Shiki |
| Diff rendering | @pierre/diffs |
| Virtualization | TanStack Virtual |
| AI integration | @opencode-ai/sdk |
| Monorepo | Turborepo + Bun workspaces |
| Linting | Biome |
| Packaging | electron-builder |
| Versioning | Changesets |

Importante:

- A integração com IA deve usar **`@opencode-ai/sdk`**, não `spawn` manual do CLI como caminho principal.
- Sempre usar os tipos de **`@opencode-ai/sdk/v2/client`**.
- O app deve nascer já preparado para arquitetura de monorepo.

---

## Estrutura esperada do monorepo

```txt
vibeide/
├── apps/
│   └── desktop/
│       ├── electron.vite.config.ts
│       ├── package.json
│       └── src/
│           ├── main/
│           │   ├── index.ts
│           │   ├── ipc/
│           │   ├── services/
│           │   │   ├── opencode-sdk.ts
│           │   │   ├── pipeline.ts
│           │   │   ├── git.ts
│           │   │   └── storage.ts
│           │   └── windows/
│           ├── preload/
│           │   └── index.ts
│           └── renderer/
│               ├── main.tsx
│               ├── routes/
│               ├── atoms/
│               ├── components/
│               ├── features/
│               ├── lib/
│               └── styles/
├── packages/
│   ├── ui/
│   ├── shared/
│   └── config/
├── .changeset/
├── package.json
├── turbo.json
└── bun.lock
```

---

## Modelo organizacional

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
}

interface Team {
  id: string
  name: string
  projectPath: string
  techLeadAgentId: string
  agents: Agent[]
  status: "active" | "paused"
  pipeline: PipelineState
}

interface Workspace {
  globalCeoAgentId: string
  teams: Team[]
  activeTeamId: string | null
}

interface PipelineState {
  tasks: PipelineTask[]
  status: "idle" | "running" | "paused" | "done" | "failed"
}

interface PipelineTask {
  id: string
  teamId: string
  agentId: string
  description: string
  files: string[]
  dependsOn: string[]
  status: "pending" | "running" | "done" | "failed" | "blocked"
  branchName?: string
}
```

---

## Regras de orquestração

### CEO global

- Sempre visível na UI como aba fixa/global.
- Recebe objetivos do usuário.
- Decide qual time deve executar cada frente.
- Pode quebrar trabalho em blocos por time.
- Encaminha contexto para os tech leads.
- Consolida status final para o usuário.

### Tech lead do time

- É o gerente operacional do time.
- Recebe instruções do CEO global.
- Quebra o trabalho em subtarefas para os agentes do próprio time.
- Garante que dois agentes não editem o mesmo arquivo ao mesmo tempo.
- Aprova merge da branch do time.
- Encaminha bloqueios de volta ao CEO global quando necessário.

---

## Funcionalidades em ordem de prioridade

### 1. Shell desktop base

- Electron 40 com `electron-vite`
- Janela frameless com titlebar customizada
- Layout de 3 painéis
- App com aparência de desktop profissional

### 2. Workspace com times

- Criar time: nome + projeto
- Contratar agentes no time
- Definir o `techLead` do time
- Exibir o CEO global fixo fora do escopo do time
- Pausar/retomar time inteiro

### 3. Chat e navegação

- Routing com TanStack Router
- Uma aba global do CEO
- Abas do tech lead e dos demais agentes do time ativo
- Streaming de mensagens
- Context bar para anexar arquivo, URL e imagem

### 4. Integração com OpenCode via SDK

- Usar `@opencode-ai/sdk`
- Sessão por agente ativo
- Sessão global dedicada ao CEO
- Eventos em streaming via SDK
- Reaproveitar tipos oficiais do SDK

### 5. Pipeline

- CEO global delega para tech leads
- Tech lead delega para agentes do time
- Visualização do DAG
- Atualização em tempo real
- Dependências e bloqueios explícitos

### 6. Git worktrees

- Uma branch por task relevante
- Worktree por agente quando houver edição de arquivos
- Locks visuais por arquivo
- Merge aprovado pelo tech lead do time
- Escalada ao CEO global apenas quando necessário

### 7. Catálogo de agentes

- Browser local do catálogo
- Busca por categoria e especialidade
- Preview do prompt
- Contratação rápida para o time ativo

---

## Diretrizes de frontend

- Tailwind CSS v4 como base de styling
- shadcn/ui, Base UI e cmdk para primitives e produtividade
- Jotai para estado global e por feature
- Shiki para blocos de código e preview de snippets
- `@pierre/diffs` para renderização de diff inline
- TanStack Virtual para listas grandes: mensagens, logs, catálogo

Não usar:

- Zustand
- CSS Modules como estratégia principal
- React Router
- xterm.js como dependência obrigatória do MVP

---

## Integração de IA

- O caminho principal é o SDK, não parsing de stdout do CLI.
- O serviço de IA deve morar no main process.
- O renderer só conversa via IPC tipado.
- O SDK deve sustentar:
  - criação de sessão
  - envio de mensagens
  - assinatura de eventos
  - streaming global do CEO
  - streaming por agente/time

---

## System prompt base do CEO global

```txt
Você é o CEO global da VibeIDE.

Você coordena vários times de agentes.
Cada time possui um tech lead local.
Você não executa trabalho operacional de um time diretamente quando isso puder ser delegado.

Seu papel:

1. Entender o objetivo do usuário.
2. Decidir quais times participam.
3. Delegar objetivos claros para cada tech lead.
4. Consolidar progresso, riscos e dependências entre times.
5. Pedir input humano quando houver ambiguidade relevante.

Nunca invente um COO.
Sempre trate o tech lead como responsável local do time.
Responda sempre em português brasileiro.
```

---

## System prompt base do tech lead

```txt
Você é o tech lead do seu time.

Você recebe objetivos do CEO global e gerencia a execução local.

Seu papel:

1. Quebrar o trabalho em subtarefas.
2. Distribuir subtarefas entre os agentes do time.
3. Garantir que não haja conflito de arquivos.
4. Acompanhar branches, locks e progresso.
5. Validar o resultado do time antes de reportar ao CEO global.

Se houver bloqueio externo, dependência entre times ou decisão de produto, escale para o CEO global.
Responda sempre em português brasileiro.
```

---

## Começo recomendado

1. Scaffold do monorepo com Turborepo + Bun workspaces
2. Scaffold do app desktop com Electron 40 + electron-vite
3. Configurar React 19, Vite 6, Tailwind v4, Jotai e TanStack Router
4. Criar layout base com titlebar, sidebar, workspace e painel lateral
5. Implementar a sessão do CEO global via `@opencode-ai/sdk`
6. Implementar um time com um tech lead e um agente
7. Fazer o fluxo mínimo: usuário → CEO global → tech lead → agente → resposta

Não tente fazer tudo de uma vez. Garanta primeiro o núcleo:

- shell desktop
- sessão do CEO global
- um time funcional
- um pipeline local simples
