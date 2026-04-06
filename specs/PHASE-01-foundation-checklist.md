# PHASE-01 - Foundation Checklist

## Objetivo

Executar a Fase 1 do Politron Agentic com foco no simples funcional.

Esta fase não tenta entregar escritório virtual, RH ou pipeline completo.
Ela existe para estabilizar a fundação:

- OpenCode
- sessões
- contexto por agente
- contexto por projeto
- prompts locais
- Tech Lead por projeto
- UX mínima confiável de conversa e sessão

## Resultado esperado da fase

Ao final desta fase, o sistema deve permitir:

- conversar com o CEO global sem reutilizar sessão errada
- conversar com agentes de projeto sem vazar contexto entre projetos
- abrir um projeto e ter um Tech Lead funcional como líder padrão
- manter sessão correta por agente e por contexto
- resolver prompts locais em `.opencode/agents` de forma previsível
- preparar o terreno para tarefas, observabilidade e RH

## Regra de escopo

Não entrar agora em:

- pipeline visual completo
- escritório virtual avançado
- RH funcional
- contratação automatizada madura
- UX refinada de modelos no prompt

## Diagnóstico atual

Hoje os pontos mais frágeis da fundação são:

1. sessão ativa da UI e sessão real do agente ainda se confundem
2. troca entre CEO, projeto e agente ainda pode causar contexto errado
3. `session.prompt`, `agent.send` e `ceo.send` ainda seguem caminhos diferentes demais
4. `workspaceDirectory`, `agentSlug`, `systemPromptPath` e `systemPrompt` ainda não formam um contrato único e explícito
5. a UI de sessões existe, mas ainda não representa o comportamento desejado por agente e por projeto

## Arquivos principais desta fase

### Main

- `apps/desktop/src/main/services/opencode-sdk.ts`
- `apps/desktop/src/main/services/session-store.ts`
- `apps/desktop/src/main/ipc/handlers.ts`

### Renderer

- `apps/desktop/src/renderer/src/features/chat/hooks/useOpencodeTranscriptBridge.ts`
- `apps/desktop/src/renderer/src/features/chat/components/shell/SessionSidebar.tsx`
- `apps/desktop/src/renderer/src/features/chat/components/shell/SessionModal.tsx`
- `apps/desktop/src/renderer/src/hooks/useWorkspace.tsx`
- `apps/desktop/src/renderer/src/features/chat/components/input/PromptInput.tsx`

### Contratos

- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/src/vite-env.d.ts`
- `apps/desktop/src/renderer/src/types/workspace.ts`

## Contrato-alvo da fundação

Cada interação precisa ser resolvida por esta sequência:

1. qual agente está ativo
2. qual projeto ou contexto está ativo
3. qual sessão pertence a esse agente nesse contexto
4. qual prompt deve ser usado
5. qual diretório de trabalho deve ser usado
6. qual modelo deve ser usado

Se qualquer uma dessas respostas estiver implícita ou ambígua, a fase ainda não terminou.

## Checklist técnico da Fase 1

## Bloco A - Consolidar contrato de sessão

- [ ] revisar `ManagedSession` e torná-lo o contrato único da sessão local
- [ ] documentar explicitamente os campos mínimos:
  - `agentId`
  - `teamId`
  - `role`
  - `workspaceDirectory`
  - `agentSlug`
  - `systemPrompt`
  - `systemPromptPath`
  - `status`
  - `session.id`
- [ ] impedir que campos críticos sejam inferidos de forma diferente em cada fluxo
- [ ] garantir que `sessionStore` seja a fonte local da verdade para o vínculo entre agente e sessão

## Bloco B - Unificar resolução de contexto

- [ ] centralizar a lógica de resolução de prompt em `OpenCodeSdkService`
- [ ] garantir prioridade:
  - `systemPrompt` explícito
  - `systemPromptPath` local
  - agente do catálogo OpenCode
- [ ] garantir que diretório de trabalho não defina identidade do agente
- [ ] impedir fallback silencioso para combinações inválidas de contexto

## Bloco C - Corrigir ciclo de vida de sessão por agente e por projeto

- [ ] revisar quando uma sessão deve ser reutilizada
- [ ] revisar quando uma sessão deve ser descartada
- [ ] impedir reuso de sessão entre contextos incompatíveis
- [ ] garantir limpeza segura quando o usuário troca:
  - CEO -> projeto
  - projeto A -> projeto B
  - agente 1 -> agente 2
- [ ] garantir que o histórico carregado sempre corresponda à sessão ativa certa

## Bloco D - Simplificar os caminhos de envio

- [ ] revisar a divergência entre:
  - `window.vibeAPI.session.prompt`
  - `window.vibeAPI.agent.send`
  - `window.vibeAPI.ceo.send`
- [ ] definir qual é o caminho principal desejado no app
- [ ] reduzir branches especiais no renderer sempre que possível
- [ ] manter a regra:
  - renderer escolhe contexto
  - main resolve sessão e prompt
  - OpenCode executa

## Bloco E - Ajustar a UX de sessões

- [ ] definir o que a sessão representa no produto
- [ ] separar claramente:
  - conversa do agente
  - sessão OpenCode
  - contexto do projeto
- [ ] corrigir o comportamento de `SessionSidebar`
- [ ] corrigir o comportamento de `SessionModal`
- [ ] garantir que o usuário consiga entender em qual conversa está
- [ ] remover comportamentos que pareçam aleatórios ou implícitos

## Bloco F - Garantir fundação organizacional mínima

- [ ] confirmar que todo projeto nasce com Tech Lead
- [ ] confirmar que o CEO global é único e estável
- [ ] garantir que a seleção de agente ativo no workspace reflita a estrutura real do projeto
- [ ] alinhar `useWorkspace` com o backend como fonte de verdade

## Bloco G - Preparar interface de configuração do OpenCode

- [ ] mapear quais configurações do OpenCode já existem no backend
- [ ] mapear quais estão implícitas e precisam virar estado explícito
- [ ] definir estrutura da futura tela de configurações
- [ ] deixar pronto o contrato para:
  - modelos disponíveis
  - defaults
  - paths de prompt
  - status da integração

## Primeiro ciclo real de implementação

Este é o recorte recomendado para começar agora.

## Ciclo 1 - Sessão, contexto e prompt corretos

### Objetivo

Parar de misturar conversa, agente e projeto.

### Escopo

- `opencode-sdk.ts`
- `session-store.ts`
- `handlers.ts`
- `useOpencodeTranscriptBridge.ts`
- `SessionSidebar.tsx`
- `SessionModal.tsx`

### Entregas do ciclo

- [ ] definir regra explícita de chave de contexto da sessão
- [ ] garantir que cada agente converse sempre na sessão certa
- [ ] garantir que trocar contexto limpe a sessão errada
- [ ] unificar resolução de `agentSlug`, `systemPrompt` e `systemPromptPath`
- [ ] garantir que CEO e agentes de projeto usem a mesma lógica-base
- [ ] corrigir listagem e seleção de sessões na UI para o contexto atual

### Fora do escopo do ciclo

- tela de tarefas
- RH
- contratação formal
- seleção refinada de modelo
- configurações completas

### Critério de pronto do ciclo

- CEO responde em sequência sem erro de sessão ou agente
- agente de projeto responde em sequência sem reaproveitar sessão errada
- trocar entre contextos não vaza histórico
- a UI de sessão passa a refletir o contexto real atual

## Segundo ciclo sugerido

## Ciclo 2 - Observabilidade mínima

### Objetivo

Mostrar o básico do trabalho dos agentes.

### Escopo

- status no sidebar
- atividade atual
- vínculo com tarefa futura
- base de detalhe do agente

## Terceiro ciclo sugerido

## Ciclo 3 - Tarefas simples

### Objetivo

Criar a primeira camada concreta de coordenação do projeto.

### Escopo

- tela de tarefas
- Tech Lead cria tarefas
- agente recebe ou pega tarefa
- status de tarefa simples

## Ordem recomendada de execução

1. Ciclo 1 - sessão, contexto e prompt corretos
2. Ciclo 2 - observabilidade mínima
3. Ciclo 3 - tarefas simples
4. configurações OpenCode e Politron
5. RH e staffing formal

## Critério de encerramento da Fase 1

Esta fase só pode ser considerada concluída quando:

- o núcleo de conversa estiver estável
- o contexto por agente e projeto estiver previsível
- o OpenCode estiver operando de forma clara dentro do Politron
- a UX principal deixar de parecer frágil ou implícita

Sem isso, qualquer camada superior vai nascer em cima de uma base instável.
