# Chat de agentes com Pasta UI e Kokonut UI

Data: 21/10/2026. Estado: proposta de produto e contratos, ainda não implementada integralmente.

## 1. Resultado desejado

O Politron deve permitir conversar com agentes personalizados, orientar uma tarefa em andamento, acompanhar o trabalho de cada agente, aprovar decisões e inspecionar o resultado com evidências. Uma conversa simples continua simples; uma tarefa complexa ganha plano, ferramentas, arquivos, fontes e delegações no mesmo fluxo.

A Pasta UI passa a fornecer os componentes efetivos da conversa, execução e resultados. A Kokonut UI complementa funções nas quais oferece uma solução mais adequada ao produto. Cada função tem uma implementação principal; ambas compartilham os temas e a identidade do Politron.

Os 15 componentes citados pelo usuário são entregas obrigatórias: `prompt-input`, `code-block`, `file-diff`, `tool-approval`, `tool-group`, `agent-activity`, `reasoning-text`, `thinking-shimmer`, `background-inbox`, `plan-approval-card`, `inline-citation`, `file-tree`, `research-report`, `link-preview` e `commit`. Copiar os arquivos para o projeto não satisfaz esse requisito: cada um precisa de um ponto de entrada visível, dados reais, ações conectadas e evidência de funcionamento.

## 2. Diagnóstico do checkout

Levantamento estático feito em `D:\projetos pessoais\politron`, preservando o checkout com alterações anteriores. Não houve nova execução funcional nesta etapa de planejamento.

| Área | Estado observado | Consequência |
|---|---|---|
| Registros | `components.json` registra `@pastaui` e `@kokonutui`; o catálogo público Pasta contém 54 componentes | Instalação já existe, integração precisa ser concluída |
| Uso efetivo | Features importam quatro componentes Pasta: PromptInput, MessageBubble, ThinkingShimmer e ApprovalCard | O restante do chat ainda não foi convertido |
| Composer | PromptInput usa `showModelPicker={false}` e recebe seletores antigos; não recebe participantes | Modelos continuam com UI antiga; `@` não abre sugestões |
| Código | MessageItem importa `components/ui/code-block` | O CodeBlock Pasta instalado não aparece nas respostas |
| Diff | MessageList e PolitronToolApproval usam DiffCard; DiffViewer usa `@pierre/diffs/react` | O FileDiff Pasta não aparece; o mesmo arquivo pode aparecer na aprovação e novamente no resultado |
| Contagem de diff | DiffCard estima adições pela diferença no total de linhas | Substituições com o mesmo número de linhas não são representadas corretamente no resumo |
| Aprovação recente | ApprovalCard não renderiza `children`, embora PolitronToolApproval envie prévia, instruções e avisos como filhos | A integração pode ocultar informação necessária à decisão; corrigir primeiro |
| Estados de aprovação | PolitronToolApproval converte interrupted para denied no badge do ApprovalCard; a apresentação não recebe disabled | Estado visual incorreto e controles sem feedback adequado enquanto a decisão é enviada |
| Execução | MessageList associa aprovações e arquivos ao run e os coloca depois da mensagem; RunProgress resume o estado | Falta uma apresentação cronológica de trabalho e resultado |
| Dados existentes | Message, Run, Approval, FileChange, CommandEvidence e Delegation existem; schema atual é 9 | Há base útil para substituir os componentes visuais |
| Exposição de dados | Snapshot não expõe delegações nem evidência de comandos; WorkspaceEvent não tem eventos estruturados de ferramentas, fontes ou artefatos | Vários componentes precisam de contratos e APIs novos |
| Arquivos | ProjectExplorer tem leitura por pasta e FilePreview/Monaco têm contratos próprios | Substituir a árvore visual, conservar autorização, leitura e editor |
| Kokonut | Há ai-prompt, ai-tool-approval, ai-loading, ai-text-loading e action-search-bar locais; a sidebar usa action-search-bar | Reaproveitar o que serve; evitar manter dois composers e dois fluxos de aprovação |
| Runtime | Codex encaminha eventos nativos; Claude converte texto, ferramenta e término; não há contrato uniforme para atividades ricas | Normalizar cada runtime sem inventar capacidades |

## 3. Escolha entre bibliotecas

As escolhas abaixo são decisões de integração, não uma alegação de superioridade geral de uma biblioteca.

| Função | Escolha | Motivo e adaptação |
|---|---|---|
| Composer | Pasta PromptInput | Pedido explícito, estado controlado e composição com anexos e controles reais |
| Modelos e esforço | Kokonut AI Model Selector, instalado pelo registro | Aceita níveis de esforço específicos por modelo. Ampliar o código local para catálogo por CLI, busca, virtualização e modelos indisponíveis, preservando IDs qualificados |
| Diff inline | Pasta FileDiff | Pedido explícito; adequado para antes/depois com numeração e hunks. Usar cálculo de diff real, não diferença de quantidade de linhas |
| Aprovação de ferramenta | Pasta ToolApproval | Pedido explícito. Adaptar status, corpo, disabled e confirmação adicional ao broker atual |
| Revisão de mudanças | Pasta Commit + FileDiff | Commit é um resumo de arquivos alterados; não executa `git commit`. Kokonut AI Diff Review tem decisões de aceitar/rejeitar/desfazer que exigem outro contrato e fica fora do fluxo de alterações já aplicadas |
| Trabalho paralelo | Pasta TaskCard e AgentActivity no chat; Kokonut AI Agent Lanes no painel da execução | Os cartões mostram pedidos e resultados; o painel mostra a árvore real de delegações. Adaptar lanes para estado controlado, sem relógio de demo ou execução simulada |
| Trabalho fora da conversa atual | Pasta BackgroundInbox + BackgroundRuns | A caixa avisa sobre trabalho e resultados; o painel detalha a mesma coleção, com o mesmo estado de leitura |
| Fontes e pesquisa | Pasta InlineCitation, Citations, ResearchReport, LinkPreview e DocumentReference | Compartilham um contrato de fontes e artefatos; evitar uma segunda implementação de citações |
| Contexto e custo | Pasta ContextBreakdown e CostMeter | Entram quando há telemetria real. Kokonut AI Context Meter não adiciona outro medidor para a mesma informação |
| `@agentes` | Command/Popover existentes, integrados ao PromptInput Pasta | Kokonut AI Autocomplete oferece continuação de frases, não seleção de destinatários. As sugestões usam apenas participantes válidos e inserem o alias exato |

O link Kokonut `/docs/agents` orienta a instalação por agentes de desenvolvimento; não fornece o mecanismo de colaboração do Politron. As bibliotecas apresentam dados e ações. Sessões, delegação, permissões e persistência continuam sob responsabilidade do produto.

## 4. Experiência final

1. O usuário digita, anexa arquivos, escolhe modelo/esforço e menciona participantes pelo autocomplete. Uma conversa sem participantes usa o Assistente padrão.
2. O agente pode responder diretamente ou publicar um plano editável. O início de um plano depende de uma decisão explícita vinculada à versão aprovada.
3. A execução aparece dentro do turno: atividade atual, resumo público de raciocínio quando disponível, chamadas de ferramentas agrupadas e aprovações pendentes.
4. Cada chamada apresenta seu estado real. Aprovação concedida significa autorização; sucesso só aparece após resultado confirmado.
5. Arquivos alterados aparecem uma vez como resultado, usando Commit e FileDiff. A proposta anterior fica identificada no histórico da aprovação, recolhida após a decisão.
6. Delegações mostram destinatário, pedido, estado, conversa vinculada, cancelamento e resultado. A coordenação permite abrir o painel com agentes em paralelo.
7. Pesquisas apresentam relatório, fontes, citações e links. O usuário consegue abrir a fonte ou o arquivo que sustenta uma afirmação.
8. Ao trocar de conversa, a caixa de trabalho continua informando pendências e resultados. Reabrir ou reconectar recupera os dados sem executar a tarefa novamente.

No desktop, a conversa continua central e o painel contextual usa DockWorkspace. Em largura estreita, o conteúdo contextual abre em sheet. Não inserir um segundo scroller da conversa dentro do MessageScroller: adaptar esse componente como minimapa da lista virtual existente.

### Autocomplete de menções

O PromptInput deve sugerir participantes ao digitar `@`, com avatar, nome e alias real. A lista filtra conforme a digitação, aceita mouse/teclado, suporta múltiplas menções e substitui somente o token no cursor, mantendo o rascunho. Enter/Tab selecionam uma sugestão sem enviar a mensagem; Escape fecha. Email não dispara sugestões. A lista acompanha a conversa/equipe atual e informa quando não há correspondência. O backend continua validando os destinatários no envio. Este requisito faz parte do aceite obrigatório do núcleo e está detalhado na tarefa 3 do plano.

## 5. Contratos de domínio

### 5.1 Eventos de execução

Criar `src/shared/run-events.ts` com `RunEvent`, `RunEventPage`, `RuntimeCapabilities` e a união discriminada `RunEventPayload`.

- Todo evento contém `id`, `seq`, `workspaceId`, `conversationId`, `runId`, `agentId`, `messageId`, `occurredAt` e `schemaVersion: 1`. `toolCallId`, `parentRunId` e `sourceEventId` são opcionais conforme o tipo.
- Tipos iniciais: `tool.requested`, `tool.started`, `tool.completed`, `tool.failed`, `tool.denied`, `tool.interrupted`, `reasoning.summary.delta`, `reasoning.summary.completed`, `plan.updated`, `artifact.published`, `usage.updated` e `delegation.updated`. Requested registra o pedido; started ocorre apenas quando a execução começa, depois de qualquer aprovação exigida.
- O host resolve o escopo; ferramentas não escolhem outro workspace/conversa por payload. O renderer inclui o host selecionado em suas chaves de cache e seleção.
- `seq` é atribuído na persistência; duplicatas de `sourceEventId` no mesmo run não criam outro evento. Eventos ao vivo são aplicados por ID e sequência; lacunas são recuperadas pela API.
- `runEvents(conversationId, afterSeq?, limit?)` retorna páginas em ordem crescente, limite padrão 200 e máximo 500. `runDetails(runId)` carrega comandos, aprovações, mudanças e delegações daquele run, validando escopo.
- Coalescer deltas por stream em até 100 ms ou 8 KiB; não gerar uma escrita e um render por token. Limitar a prévia de output em evento a 64 KiB, com marca de truncamento e referência ao resultado detalhado existente.
- A persistência dos eventos é incremental. Não adicionar toda a linha do tempo ao Snapshot global nem carregá-la integralmente em toda troca de conversa.

### 5.2 Raciocínio e capacidades

ReasoningText apresenta apenas resumos públicos que o runtime fornece, com timestamps reais. Não extrair raciocínio privado, gerar texto de pensamento ou simular duração. Quando não houver resumo, ThinkingShimmer e AgentActivity mostram a atividade conhecida.

Cada adaptador informa suporte a resumos, plano, referências, usage e steering. Recurso não suportado tem estado explícito na administração e a interface da conversa usa a apresentação compatível.

### 5.3 Artefatos e fontes

Criar `src/shared/artifacts.ts` com `Artifact`, `SourceReference`, `ArtifactPage` e `PublishArtifactInput`. Tipos: `report`, `sources`, `file-reference`, `link`, `code`, `audio`, `video`, `email-draft` e `change-summary`.

- Artifact tem ID, revisão, versão do payload, agente, run, mensagem, conversa, workspace, título e datas. O payload é validado por tipo.
- SourceReference tem ID estável, título, tipo web/arquivo/documento, URL ou caminho e trecho/localização opcionais. Uma citação referencia esse ID, não um índice solto que muda durante streaming.
- Publicação usa `publish_artifact(input)` no broker, com escopo inferido do run ativo e chave de idempotência. `artifacts(conversationId, beforeCursor?, limit?)` recupera os registros; `onEvent` notifica publicação/atualização.
- Relatórios guardam Markdown por seção, não ReactNode ou HTML arbitrário. O renderer converte Markdown com a mesma política das mensagens.
- Mensagens antigas continuam válidas: Markdown, código e links funcionam sem migração inventada de artefatos. URL comum não se transforma automaticamente em fonte de uma afirmação.
- LinkPreview usa metadados fornecidos pela fonte ou obtenção sob demanda pelo main. HTTP(S), timeout de 5 s, resposta até 1 MiB, até 3 redirects com validação a cada salto, bloqueio de rede local/privada/link-local e sem credenciais/cookies do usuário. URL sem metadados ainda abre com título/domínio.

### 5.4 Planos

Criar `src/shared/plans.ts`: `AgentPlan`, `PlanStep`, `PlanDecision` e `PlanExecutionRequest`. Passos têm IDs estáveis, descrição, destinatário opcional e estado.

- `propose_plan` publica título, objetivo, passos e escopo no run atual. O backend passa a impedir ferramentas mutáveis desse run após a proposta; o turno encerra a proposta sem manter uma chamada de CLI esperando indefinidamente.
- `revisePlan(planId, expectedRevision, steps)` preserva versões e rejeita edição concorrente. `respondPlan(planId, expectedRevision, 'start' | 'cancel')` valida escopo e grava a decisão.
- Start cria uma solicitação durável única por `(planId, revision)`; um consumidor cria o run de continuação com a versão aprovada. Reinício/retry não duplica a execução. Aprovação de plano não concede permissão a ferramentas.
- Edição depois de aprovado exige nova revisão e nova decisão. Cancelar solicita interrupção de execuções vinculadas, mantendo o resultado já produzido.
- Todo e progresso são derivados de eventos explícitos de passos. Não inferir conclusão porque o texto contém uma caixa marcada.

### 5.5 Inbox, fila e revisões de mensagens

- BackgroundInbox deriva de runs, delegações e solicitações de decisão. Registrar leitura/dispensa em `InboxReceipt` com item, revisão e consumidor; dispensar não cancela nem apaga resultados.
- Abrir item navega para host, workspace, conversa e turno corretos. Filtros e contadores usam a mesma consulta paginada.
- MessageQueue exige `QueuedTurn` durável com ID, conversa, texto, anexos referenciados, modelo/esforço e estado. Diferenciar enviar agora, orientar o run atual e aguardar o próximo turno; apenas runtimes com steering recebem orientação.
- EditMessage exige revisão persistida. Reexecutar uma mensagem histórica cria conversa derivada explícita, sem repetir aprovações nem efeitos anteriores. Edição de texto não reescreve evidência de um run já executado.

## 6. Catálogo Pasta UI: destino de todos os 54 componentes

**Núcleo** faz parte do aceite deste plano. **Extensão** tem dependência de produto própria e tarefa definida no plano. **Reserva** permanece disponível, com uso condicionado ao tipo de artefato ou tela indicado; não ganha um fluxo fictício só para aparecer.

| Componente | Destino e decisão |
|---|---|
| prompt-input | Núcleo: substituir o composer visual por completo, com API controlada |
| message-bubble | Núcleo: mensagens do usuário e superfície da resposta; preservar identidade do agente |
| message-scroller | Núcleo: minimapa ligado à lista virtual e ao histórico paginado |
| attachments | Núcleo: seleção, erro, remoção e estado de anexos reais |
| model-picker | Alternativa instalada; Kokonut AI Model Selector será o seletor principal |
| reasoning-effort | Alternativa instalada; o seletor Kokonut concentra modelo e esforço |
| voice-input | Núcleo: estado real do gravador e transcrição; sem waveform simulada |
| message-queue | Extensão: turnos duráveis aguardando envio/execução |
| edit-message | Extensão: edição e versões com conversa derivada para reexecução |
| follow-up | Núcleo: próximos passos explícitos publicados pelo agente |
| follow-up-suggestions | Núcleo: escolhas estruturadas quando o agente precisa de resposta |
| code-block | Núcleo: substituir o componente antigo em Markdown e saídas de ferramentas |
| file-diff | Núcleo: propostas, resultados e painel de mudanças |
| commit | Núcleo: resumo dos arquivos de um run/workspace, com abertura de diff |
| file-tree | Núcleo: substituir árvore do ProjectExplorer, preservando editor e lazy loading |
| tool-approval | Núcleo: gate de ferramentas, comandos e escrita; status completo |
| approval-card | Núcleo: decisões genéricas de configuração/delegação, com conteúdo acessível |
| permission-grant | Núcleo: permissões já existentes de agente/workspace com escopo visível |
| tool-group | Núcleo: chamadas consecutivas agrupadas por run, incluindo falha e interrupção |
| tool-result | Núcleo: resultado confirmado, output e código de saída |
| tool-error | Núcleo: falha com contexto; retry apenas quando for seguro e implementado |
| tool-timeline | Núcleo: inspeção detalhada no painel da execução |
| agent-activity | Núcleo: atividade cronológica real do agente |
| agent-status | Núcleo: resumo do run e tarefa atual |
| task-card | Núcleo: pedido delegado, resultado, abrir conversa e cancelamento |
| reasoning-text | Núcleo: resumos públicos fornecidos pelo runtime, em streaming real |
| thinking-shimmer | Núcleo: indicador leve de atividade atual; termina junto com o run |
| background-inbox | Núcleo: pendências/resultados de outras conversas |
| background-runs | Núcleo: detalhe da mesma inbox, sem segundo estado de notificações |
| connection-state | Núcleo: host conectado, reconectando, offline e recuperado |
| plan-approval-card | Núcleo: plano versionado com editar, cancelar e iniciar |
| todo-list | Núcleo: passos reais do plano e seus estados |
| job-progress | Núcleo: tarefas com estágios declarados; indeterminado quando não há total |
| inline-citation | Núcleo: referência ao lado do trecho que ela sustenta |
| citations | Núcleo: lista/resumo das fontes citadas |
| document-reference | Núcleo: documento/arquivo, localização e trecho |
| retrieval-chunks | Núcleo: resultados estruturados de busca/leitura com identidade da fonte |
| research-report | Núcleo: relatório com seções, fontes e sumário navegável |
| link-preview | Núcleo: prévia de URLs válidas, com fallback sem metadados |
| search-results-tabs | Núcleo: resultados reais de buscas já executadas pelo agente |
| audio-player | Núcleo: reprodução da voz gerada e artefatos de áudio reais |
| video-player | Reserva: renderizar artefato de vídeo existente; este plano não cria geração de vídeo |
| email-composer | Reserva: artefato de rascunho de e-mail, com copiar/exportar; envio exige integração e autorização próprias |
| feedback-dialog | Extensão: feedback local persistido por mensagem, sem envio externo implícito |
| cost-meter | Extensão: usage/custo informado pelo provedor, com fonte e ausência explícitas |
| context-breakdown | Extensão: contexto medido/estimado com essa distinção visível |
| quota-banner | Extensão: limite/reset quando o provedor o expõe; sem inventar crédito ou upgrade |
| memory | Extensão: interface do provedor de memória configurado; este plano não cria memória paralela em Markdown |
| schedule-card | Extensão: agendamento persistido e habilitado pelo usuário, com histórico e cancelamento |
| environment-variables | Reserva: tela de configuração que já necessite variáveis; segredos mascarados e armazenamento no main, fora de artefatos de chat |
| category-dropdown | Núcleo: ferramentas/habilidades disponíveis por categoria no composer |
| data-table | Extensão: histórico de runs filtrável no painel de trabalho |
| color-picker | Reserva: substituir seleção de cor do editor de agente, mantendo paleta e identidade atuais |
| image-generation-loader | Reserva: ativar somente quando houver job real de geração de imagem; geração de imagem não faz parte do motor de agentes atual |

Todos os nomes dessa matriz são rastreáveis a uma decisão; os componentes alternativos de modelo/esforço não devem criar outro seletor ativo.

## 7. Restrições e critérios de conclusão

- Instalar pelo registro oficial e usar o código instalado nos caminhos de produção. Manter licença/proveniência, PT-BR e estilos coerentes com os 14 temas/fontes do Politron.
- Revisar as alterações React 19, Base UI, Radix, Motion, next-themes e primitivas compartilhadas já presentes. Nenhuma nova migração global de framework/roteador/estado é requisito deste plano.
- Componentes de demonstração não iniciam timers, chamadas, modelos, preços, fontes ou progresso quando faltam props. Falta de dado é um estado de produto explícito.
- Persistir antes de publicar eventos. Não tratar aprovação como sucesso nem texto do agente como evidência de arquivo alterado.
- Preservar autorização e validação no main; incluir novas APIs no shared, preload, IPC e allowlist de HostRpc. Consultas e ações remotas têm o mesmo escopo das locais.
- Preservar paginação, busca, âncora de scroll por ID, drafts, foco, cancelamento e histórico depois de excluir workspace/conversa.
- Binários, truncamento, arquivo removido e conflito de versão têm tratamento explícito. Nenhum botão de desfazer aceita um estado do disco que mudou depois da execução.
- Instalação, typecheck e build são evidências diferentes de funcionamento. Cada entrega tem teste relevante e captura no Electron usando dados reais de um workspace descartável.
- O núcleo só conclui quando os 15 componentes pedidos, menções, delegações e fontes estão funcionando. Extensões e reservas são reportadas separadamente com seu estado real.

## 8. Fontes oficiais consultadas

- [Pasta UI: catálogo e requisitos](https://pastaui.com/llms.txt) e [registro público](https://pastaui.com/r/registry.json).
- Documentação dos 15 componentes: [prompt-input](https://pastaui.com/docs/component/prompt-input), [code-block](https://pastaui.com/docs/component/code-block), [file-diff](https://pastaui.com/docs/component/file-diff), [tool-approval](https://pastaui.com/docs/component/tool-approval), [tool-group](https://pastaui.com/docs/component/tool-group), [agent-activity](https://pastaui.com/docs/component/agent-activity), [reasoning-text](https://pastaui.com/docs/component/reasoning-text), [thinking-shimmer](https://pastaui.com/docs/component/thinking-shimmer), [background-inbox](https://pastaui.com/docs/component/background-inbox), [plan-approval-card](https://pastaui.com/docs/component/plan-approval-card), [inline-citation](https://pastaui.com/docs/component/inline-citation), [file-tree](https://pastaui.com/docs/component/file-tree), [research-report](https://pastaui.com/docs/component/research-report), [link-preview](https://pastaui.com/docs/component/link-preview) e [commit](https://pastaui.com/docs/component/commit).
- [Kokonut UI para agentes](https://kokonutui.com/docs/agents), [AI Model Selector](https://kokonutui.com/docs/ai/ai-model-selector), [AI Diff Review](https://kokonutui.com/docs/ai/ai-diff-review), [AI Tool Approval](https://kokonutui.com/docs/ai/ai-tool-approval), [AI Autocomplete](https://kokonutui.com/docs/ai/ai-autocomplete) e [AI Agent Lanes](https://kokonutui.com/docs/ai/ai-agent-lanes).
- O acesso pela ferramenta web às páginas Pasta falhou nesta sessão; os documentos HTTP e o registro oficial foram lidos por PowerShell, com resposta 200. As interfaces descritas foram conferidas também no código-fonte instalado.
