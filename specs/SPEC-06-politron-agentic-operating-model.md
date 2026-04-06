# SPEC-06 - Politron Agentic Operating Model

## Objetivo

Transformar o Politron em uma camada de orquestração acima do OpenCode, operando como uma empresa virtual:

- um CEO global coordena a operação
- cada projeto possui um Tech Lead como líder local
- times podem ser expandidos dinamicamente com novos agentes
- o usuário continua podendo conversar com qualquer agente individualmente
- o sistema expõe o trabalho agentic em tempo real, sem esconder delegações, sessões ou mudanças de estado

O objetivo desta spec é priorizar o caminho mais simples para chegar em um sistema funcional e estável, sem tentar resolver tudo de uma vez.

## Princípio central

O Politron não deve ser apenas uma interface para falar com agentes.

O Politron deve ser:

- uma camada organizacional
- uma camada de observabilidade
- uma camada de governança
- uma camada de experiência de operação

O OpenCode continua sendo o motor principal de sessões, mensagens e modelos.
O Politron passa a ser o sistema operacional da empresa virtual.

## Papel do OpenCode

## O que o OpenCode deve continuar fazendo

- criação e manutenção de sessões
- envio de mensagens e streaming
- listagem de modelos disponíveis
- resolução de agentes que existirem no catálogo do SDK
- execução de prompts com contexto de diretório

## O que o Politron deve assumir

- identidade organizacional dos agentes
- persistência local de times, projetos e papéis
- resolução de prompts locais em `.opencode/agents`
- política de autonomia
- contratação e composição de time
- visibilidade do trabalho em andamento
- UX de sessões por agente e por projeto

## Regra de arquitetura

Sempre que houver conflito de responsabilidade:

- OpenCode cuida da conversa e da sessão
- Politron cuida da empresa, da operação e da interface

## Estado atual do projeto

O projeto já possui uma base boa para esta evolução:

- integração principal com `@opencode-ai/sdk`
- `OpenCodeSdkService` no main process
- `sessionStore` para sessões por agente
- `teamStore` para times e agentes
- `pipelineExecutor` para tarefas e dependências
- CEO global já modelado
- Tech Lead por time já modelado
- contratação de agentes já iniciada no backend
- `systemPromptPath` propagado entre renderer, preload e main
- seleção de modelo já iniciada no `PromptInput`

## Principais lacunas atuais

- sessões por agente e por projeto ainda não estão consistentes
- contexto de sessão ainda mistura identidade do agente, diretório e conversa ativa
- a UX de configuração do OpenCode ainda é muito limitada
- a visão operacional ainda é fraca para acompanhar trabalho simultâneo
- o pipeline ainda não existe como experiência real no frontend
- hoje o frontend é centrado em conversa, sidebar de projetos, mercado de agentes e sessões ainda incompletas
- contratação ainda não está modelada como fluxo organizacional formal
- RH ainda não existe como papel do sistema
- seleção de modelo por agente ainda não está consolidada ponta a ponta

## Meta do v1

Entregar o simples funcional:

- CEO global estável
- projeto com Tech Lead estável
- sessões corretas por agente e por contexto
- prompts locais funcionando de forma previsível
- configuração do OpenCode exposta na interface
- visão básica de agentes ativos, ociosos e executando
- base mínima de tarefas para coordenação operacional
- base preparada para RH e contratação dinâmica

Itens como seleção avançada de modelo por agente, políticas finas de autonomia e escritório virtual mais rico devem vir depois.

## Modelo alvo

## Entidades principais

```ts
interface Organization {
  id: string
  name: string
  globalCeoAgentId: string
  policies: OrganizationPolicy
  projects: Project[]
}

interface Project {
  id: string
  name: string
  rootPath: string
  status: "active" | "paused" | "archived"
  autonomyPolicy: AutonomyPolicy
  teams: Team[]
}

interface Team {
  id: string
  projectId: string
  name: string
  kind: "delivery" | "platform" | "design" | "qa" | "ops"
  techLeadAgentId: string
  agents: Agent[]
  pipeline: PipelineState
}

interface Agent {
  id: string
  name: string
  role: "global-ceo" | "hr" | "tech-lead" | "specialist"
  catalogSlug?: string
  systemPromptPath?: string
  llmModel?: {
    modelID: string
    providerID: string
  }
  status: AgentStatus
  activity?: AgentActivity
}

interface AgentActivity {
  kind: "idle" | "chatting" | "planning" | "executing" | "delegating" | "waiting" | "blocked"
  title: string
  taskId?: string
  projectId?: string
  teamId?: string
  updatedAt: string
}

interface StaffingRequest {
  id: string
  projectId: string
  teamId?: string
  requestedByAgentId: string
  targetRole: string
  reason: string
  status: "open" | "evaluating" | "approved" | "rejected" | "fulfilled"
}
```

## Regra organizacional alvo

- existe um único CEO global
- cada projeto nasce com um Tech Lead
- RH é um agente global com responsabilidade de staffing
- agentes especialistas pertencem a times
- o usuário pode conversar com qualquer agente
- o usuário pode observar o trabalho de qualquer agente

## OpenCode no Politron

## Regras obrigatórias

- OpenCode continua sendo SDK-first
- prompts locais em `.opencode/agents` são prioridade sobre resolução por nome de agente
- o diretório de trabalho não define a identidade do agente
- sessão não pode ser reutilizada entre contextos incompatíveis
- o Politron deve distinguir claramente:
  - agente
  - sessão
  - projeto
  - diretório de trabalho
  - prompt
  - modelo

## Camadas de configuração que precisam existir na UI

### Configuração global do OpenCode

- endpoint do servidor, quando aplicável
- disponibilidade do SDK
- modelos listados
- política padrão de modelo
- diretório padrão de resolução
- status de integração

### Configuração global do Politron

- pasta do escritório do CEO
- pasta de prompts globais
- política global de autonomia
- preferências padrão de modelo

### Configuração por projeto

- root path do projeto
- worktree e git strategy
- política de autonomia do projeto
- times habilitados
- modelo padrão do projeto

### Configuração por agente

- prompt local
- catálogo ou alias usado
- modelo preferido
- permissões operacionais
- contexto de trabalho

## Ordem de implementação

## Fase 1 - Fundar a operação correta

Objetivo:
fazer CEO, projeto, Tech Lead, sessões e prompts funcionarem de forma previsível.

### Entregas

- consolidar o contrato de `ManagedSession`
- garantir uma sessão por agente por contexto válido
- corrigir a separação entre sessão por agente e seleção de sessão na UI
- padronizar resolução de `systemPromptPath`
- padronizar fallback entre prompt local e agente do catálogo OpenCode
- garantir que projeto sempre nasça com Tech Lead
- garantir que CEO global funcione sem acoplamento indevido a diretório fixo

### Foco técnico

- `opencode-sdk.ts`
- `session-store.ts`
- handlers de IPC de sessão
- `useOpencodeTranscriptBridge.ts`
- `SessionSidebar.tsx`
- `SessionModal.tsx`
- `useWorkspace.tsx`

### Critério de pronto

- cada agente conversa sempre na sessão correta
- trocar entre CEO, projeto e agente não mistura histórico
- prompt local e workspace são resolvidos corretamente
- o app para de depender de comportamentos implícitos do OpenCode

## Fase 2 - Tornar o trabalho observável

Objetivo:
mostrar o que os agentes estão fazendo em tempo real, com foco em visão individual primeiro.

### Entregas

- status visível por agente no sidebar
- atividade atual do agente
- vínculo entre agente e tarefa atual
- timeline básica de eventos do agente
- detalhe clicável do agente com chat, status, tarefa e contexto
- visão complementar de pipeline por projeto

### Estratégia de UX

- visão principal orientada a agentes
- visão secundária orientada a pipeline
- atualizações incrementais por evento

### Critério de pronto

- o usuário sabe quem está trabalhando
- o usuário sabe em quê cada agente está trabalhando
- o usuário consegue abrir o agente e acompanhar a conversa

## Fase 3 - Introduzir tarefas operacionais

Objetivo:
criar a primeira camada real de execução coordenada no frontend, sem depender de um pipeline abstrato invisível.

### Entregas

- tela de tarefas por projeto
- tarefas visíveis para Tech Lead e agentes
- criação manual de tarefas pelo Tech Lead
- atribuição de tarefa a agente específico
- modo simples de agentes "pegarem" tarefas disponíveis
- status mínimo de tarefa:
  - `todo`
  - `in_progress`
  - `blocked`
  - `done`
- relação entre tarefa, agente e conversa
- atualização do status do agente com base na tarefa ativa

### Regra inicial

- o Tech Lead cria e organiza as tarefas do projeto
- agentes podem receber tarefas diretamente
- em uma versão simples, agentes também podem pegar tarefas abertas
- o pipeline avançado continua sendo evolução futura

### Justificativa

Hoje o pipeline existe mais como estrutura interna do que como feature de produto.
Antes de tentar uma orquestração complexa, o Politron precisa de uma camada concreta de trabalho visível.

### Critério de pronto

- existe uma tela funcional de tarefas
- o Tech Lead consegue criar demanda operacional real
- os agentes conseguem trabalhar a partir dessa demanda
- o usuário consegue acompanhar o andamento sem depender só do chat

## Fase 4 - Formalizar a empresa virtual

Objetivo:
introduzir papéis organizacionais explícitos e fluxo de contratação.

### Entregas

- agente global de RH
- `StaffingRequest`
- fluxo CEO -> RH -> contratação
- remanejamento de agentes entre times
- política de autonomia por projeto
- histórico de contratação e composição do time

### Regra operacional

- CEO identifica necessidade
- RH avalia staffing
- contratação pode ser automática ou não, conforme política
- usuário só entra quando um agente escalar a decisão

### Critério de pronto

- contratação deixa de ser ação ad hoc
- staffing vira parte formal do sistema

## Fase 5 - Interface de configuração do OpenCode e do Politron

Objetivo:
dar interface para tudo que hoje depende de estado implícito ou configuração interna.

### Entregas

- tela lateral de configurações
- seção OpenCode
- seção CEO global
- seção de políticas de autonomia
- seção de defaults de modelo
- seção de prompts e paths

### Itens obrigatórios da seção OpenCode

- status do SDK
- lista de modelos detectados
- modelo padrão do app
- política de fallback de modelo
- origem dos prompts
- diagnóstico de resolução de sessão e prompt

### Critério de pronto

- o usuário consegue entender e controlar como o Politron usa o OpenCode

## Fase 6 - Refinar seleção de modelo por agente

Objetivo:
fechar o fluxo do `PromptInput` até a execução real com persistência consistente.

### Entregas

- modelo preferido salvo por agente
- fallback por projeto
- fallback global
- exibição clara do modelo ativo no chat
- validação quando o modelo não existir mais
- compatibilidade com sessão já aberta

### Observação

Esta fase é importante, mas não deve bloquear a base do sistema.
O simples funcional vem antes.

## Fase 7 - Escritório virtual

Objetivo:
evoluir do sistema funcional para a experiência completa de empresa virtual.

### Entregas

- escritório do CEO
- visão organizacional multi-projeto
- quadro vivo de times e agentes
- comunicação cruzada entre projetos
- histórico organizacional
- políticas mais avançadas de autonomia e escalonamento

## Backlog explícito

Estes itens existem, mas não são prioridade do núcleo:

- visual avançado de escritório
- automações sofisticadas de RH
- políticas de custo por modelo
- heurísticas automáticas de contratação mais complexas
- otimizações finas de UX

## Prioridade real

Se for para escolher o que fazer primeiro, a ordem deve ser:

1. sessões corretas por agente e por projeto
2. prompts locais e OpenCode estáveis
3. projeto nascer com Tech Lead e operação mínima confiável
4. observabilidade básica dos agentes
5. tela de tarefas simples e funcional para Tech Lead e agentes
6. interface de configurações do OpenCode e do Politron
7. RH e contratação formal
8. seleção refinada de modelo por agente
9. escritório virtual avançado

## Riscos principais

- acoplar demais a identidade do agente ao diretório de trabalho
- misturar sessão de chat com contexto organizacional
- fazer UX muito sofisticada antes da base de sessão ficar estável
- tratar OpenCode como se ele fosse a modelagem inteira do produto
- criar automação organizacional sem rastreabilidade suficiente

## Decisões fixas desta spec

1. O Politron é a camada organizacional acima do OpenCode.
2. OpenCode continua como motor principal de sessões, streaming e modelos.
3. Prompt local em `.opencode/agents` tem prioridade.
4. Cada projeto nasce com Tech Lead.
5. RH será um agente global formal do sistema.
6. A visão principal inicial deve ser orientada a agentes.
7. A visão de pipeline deve existir como apoio.
8. Seleção refinada de modelo por agente fica depois da base funcional.
9. A interface de configurações deve cobrir explicitamente tudo que envolve OpenCode.
10. O foco inicial é simples, funcional e observável.
