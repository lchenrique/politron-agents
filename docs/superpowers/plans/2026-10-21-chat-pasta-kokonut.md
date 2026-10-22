# Plano de implementação: chat de agentes com Pasta UI e Kokonut UI

> **Para execução por agentes:** usar `superpowers:executing-plans` para implementar tarefa por tarefa. Este documento não autoriza iniciar subagentes automaticamente. Os passos usam caixas de seleção para registrar execução e evidência.

**Objetivo:** transformar o chat do Politron em uma interface completa de trabalho com agentes personalizados, usando efetivamente os componentes instalados da Pasta UI e complementos selecionados da Kokonut UI, com planos, ferramentas, diffs, fontes e delegações reais.

**Arquitetura:** manter Electron, IPC, HostRpc e SQLite como autoridade. Adicionar eventos de execução e artefatos persistidos, com consultas paginadas; adaptar os componentes instalados a esses contratos. A lista virtual atual continua responsável por histórico, navegação e âncora de leitura.

**Stack:** React 19 já presente no checkout, TypeScript, Tailwind 4, shadcn, Base UI/Radix conforme cada primitiva, Motion, Electron 40 e SQLite.

**Especificação:** [Decisões de produto, contratos e matriz dos 54 componentes](../specs/2026-10-21-chat-pasta-kokonut-design.md).

## Restrições globais

- Trabalhar em `apps/desktop`; os caminhos de código abaixo são relativos a esse diretório.
- Convenção para os caminhos abreviados das tarefas: `components/` e `features/` ficam em `src/renderer/src/`; nomes de serviços como `store.ts`, `workspace.ts` e adaptadores de runtime ficam em `src/main/v9/`. Caminhos começando por `src/` já estão completos a partir de `apps/desktop`. Documentos em `docs/` ficam na raiz do repositório.
- Preservar as alterações preexistentes, dados, 14 temas/fontes, identidade dos agentes, sessões, permissões, paginação, busca e painel de trabalho.
- Usar os componentes de registro reais em produção. Instalação, import sem render e exemplo estático não representam entrega.
- Adaptar o código instalado à aplicação; não colocar componentes antigos inteiros dentro de um cartão novo e chamar isso de substituição.
- Cada função tem um componente principal. PromptInput e ToolApproval serão Pasta; modelo/esforço será Kokonut; o cálculo de diff será independente da apresentação.
- Não aceitar dados de demonstração, modelos inventados, fontes inventadas, progresso estimado como fato, permissões só visuais ou execução por contagem regressiva.
- Cada nova API percorre shared → preload → IPC → serviço → persistência e entra na allowlist explícita do host remoto quando aplicável.
- Raciocínio significa resumo público disponibilizado pelo runtime. Não prometer acesso a raciocínio privado.
- Não alterar configuração pessoal do Codex/MCP nem comprar/ativar componentes Pro para executar este plano. Os registros do projeto já estão configurados.
- Esta rodada entrega planejamento. Implementação, commits das entregas e publicação serão registrados como ações posteriores; não misturar arquivos anteriores em commits novos.

## O que será substituído e o que será criado

| Frente | Substituição | Funcionalidade nova |
|---|---|---|
| Escrita | Composer antigo/seletor de modelo antigo → PromptInput Pasta + AI Model Selector Kokonut | `@` com participantes, anexos controlados e fila explícita |
| Resposta | CodeBlock antigo/Trace genérico → CodeBlock, MessageBubble, AgentActivity e ToolGroup Pasta | Linha do tempo de ferramentas e resumos públicos em streaming |
| Aprovação | Cartão genérico adaptado → ToolApproval Pasta para ferramentas | Estado completo, escopo, output após autorização e plano versionado |
| Arquivos | DiffCard/DiffViewer e árvore manual → FileDiff, Commit e FileTree Pasta | Fonte única para proposta/alteração aplicada; resumo Git estruturado |
| Coordenação | Mensagens activity textuais → TaskCard e BackgroundInbox Pasta | Inbox persistida e painel AI Agent Lanes Kokonut com delegações reais |
| Conteúdo rico | Markdown sem contrato de fontes → blocos de artefatos Pasta | Relatório, citações, referências, resultados de busca e prévias |
| Operação | Estados dispersos → ConnectionState e painel de runs | Telemetria, feedback, fila, revisões e extensões de memória/agendamento |

## Mapa de arquivos e responsabilidades

| Caminho | Responsabilidade |
|---|---|
| `src/renderer/src/components/ai/*` | Código Pasta instalado, adaptado com props controladas e estados completos |
| `src/renderer/src/components/kokonutui/*` | Código Kokonut instalado, sem demos automáticos em produção |
| `src/shared/run-events.ts`, `artifacts.ts`, `plans.ts`, `work-inbox.ts`, `turn-queue.ts` | Contratos serializáveis do domínio |
| `src/main/v9/run-events.ts` | Normalização, persistência, ordem e recuperação de eventos |
| `src/main/v9/artifacts.ts`, `sources.ts`, `plans.ts`, `work-inbox.ts`, `turn-queue.ts` | Serviços de publicação, fontes, decisões, leitura e execução da fila |
| `src/main/v9/store.ts` | Migrações, consultas paginadas, transações e integridade |
| `src/main/v9/workspace.ts` | Conexão com os serviços e broker de ferramentas atual |
| `src/main/v9/ipc.ts`, `src/preload/index.ts`, `src/main/hosts/rpc.ts` | Transporte local/remoto das mesmas capacidades |
| `src/renderer/src/features/chat/run-view.ts` | Projeção pura de mensagens/eventos em blocos visuais com IDs estáveis |
| `src/renderer/src/features/chat/RunContent.tsx` | Composição dos componentes Pasta dentro de cada turno |
| `src/renderer/src/features/chat/useRunEvents.ts` | Janela paginada de eventos e reconciliação após reconexão |
| `src/renderer/src/features/artifacts/*` | Renderer por tipo de artefato, relatório e fonte |
| `src/renderer/src/features/work/*` | Inbox, detalhe do run e visão de colaboração |
| `src/renderer/src/features/composer/*` | Rascunhos, seleção, menções e envio; apresentação pelo componente escolhido |
| `src/renderer/src/features/diff/file-diff-model.ts` | Conversão antes/depois/patch em hunks e contagens corretas |
| `src/renderer/src/features/panels/ProjectExplorer.tsx` | Carregamento por pasta e composição do FileTree Pasta |

## Ordem de execução

| Entrega | Tarefas | Resultado observável |
|---|---|---|
| A. Corrigir a adaptação e estabelecer a base | 1–2 | Aprovações completas e componentes coerentes com os temas |
| B. Substituir o chat que já existe | 3–4 | Composer, menções, código e diffs realmente novos |
| C. Expor o trabalho dos agentes | 5–6 | Ferramentas, atividade e raciocínio público com histórico real |
| D. Criar planos e conteúdo rico | 7–9 | Plano executável após aprovação, relatório e fontes navegáveis |
| E. Integrar arquivos e colaboração | 10–11 | Árvore, resumo de alterações, inbox e agentes em paralelo |
| F. Completar interação e operação | 12–15 | Fila/versões, feedback, telemetria e validação ponta a ponta |
| Extensão operacional | 16–17 | Memória e agendamentos, com contratos próprios e sem dados fictícios |

As entregas A–F compõem o aceite principal. As tarefas 16–17 são evolução definida, reportada separadamente. Não afirmar que todos os 54 componentes estão em uso: a matriz da especificação registra explicitamente alternativas e reservas.

## Tarefa 1 — Corrigir os riscos da integração recente

**Arquivos:** modificar `components/ai/approval-card.tsx`, `features/chat/PolitronToolApproval.tsx` e `components/ai/prompt-input.tsx`; testes existentes `features/chat/PolitronToolApproval.test.tsx` e `features/composer/Composer.test.tsx`.

**Interface:** ApprovalCard recebe `children`, `disabled` e estado `interrupted`. A decisão permanece em `AppAPI.respondApproval(id, approved)`.

- [ ] Registrar falhas atuais em testes: corpo/aviso de terminal/diff visíveis; interrupted mostra “Interrompida”; duplo clique gera exatamente uma chamada; timeout da confirmação adicional retorna ao estado normal.
- [ ] Renderizar o corpo do ApprovalCard; propagar disabled e feedback de envio; preservar negação, falha da API e confirmação adicional. Essa correção é pré-requisito de todas as trocas de aprovação.
- [ ] Corrigir o contrato de submissão do PromptInput: um responsável por limpar/restaurar o draft, composição IME não envia, mudança controlada de texto redimensiona o campo e conversa nova não herda anexos da anterior.
- [ ] Rodar `npm test -- src/renderer/src/features/chat/PolitronToolApproval.test.tsx src/renderer/src/features/composer/Composer.test.tsx` e `npm run typecheck`.

**Aceite:** uma aprovação com proposta de escrita mostra o conteúdo antes de qualquer clique; falha de envio preserva draft/anexos; negar e interromper permanecem estados distintos.

## Tarefa 2 — Consolidar registros, estilos e compatibilidade

**Arquivos:** modificar `components.json`, `package.json`, `package-lock.json`, `src/renderer/src/index.css`, `components/ai/*`, `components/kokonutui/*` e somente primitivas comprovadamente necessárias em `components/ui/*`; criar `docs/pasta-kokonut-integration.md` na raiz do repositório.

- [ ] Registrar proveniência/versão/licença dos componentes em uso e diffs locais necessários; conferir o upgrade React 19 e a alteração de `cn` já presentes.
- [ ] Auditar Base UI `render` versus Radix `asChild`. Instalar somente os complementos selecionados pelo registro oficial, sem `--overwrite` global de primitivas compartilhadas.
- [ ] Mapear tokens Pasta (`shadow-card`, sintaxe, superfícies e tipografia) aos tokens atuais; textos e nomes acessíveis em PT-BR; movimento respeita a preferência do sistema.
- [ ] Remover fallbacks demonstrativos dos componentes que entrarão em produção. Render sem props usa vazio/indisponível, nunca simulação.
- [ ] Registrar capturas do mesmo cenário nos 14 temas e conferir menus, diálogos e sidebar após mudanças nas primitivas; executar typecheck e build.

**Aceite:** o usuário reconhece uma interface consistente em cada tema e os menus existentes mantêm teclado/foco corretos.

## Tarefa 3 — Composer completo, modelos e menções

**Arquivos:** modificar `features/composer/Composer.tsx`, `components/ai/prompt-input.tsx`, `components/ai/attachments.tsx`, `components/ai/voice-input.tsx`, `features/composer/model-options.ts`, `features/app/AppShell.tsx`; instalar/adaptar `components/kokonutui/ai-model-selector.tsx`; criar `features/composer/MentionSuggestions.tsx` e `mentions.ts`.

**Interfaces:** `getMentionQuery(text: string, caret: number): { start: number; end: number; query: string } | null`; `Composer` recebe `mentionAgents: Agent[]`; inserir apenas `agent.alias` exato. AI Model Selector usa IDs qualificados do catálogo atual e esforços `low|medium|high|xhigh|max` conforme suporte do modelo.

- [ ] Adaptar PromptInput com refs/slots controlados para cursor, ferramentas e seleção; remover a dependência visual de ModelSelector/EffortSelector antigos depois de migrar seus callers do composer.
- [ ] Manter navegação por CLI, busca, catálogo completo virtualizado, indisponibilidade explicada e modelo herdado. Não reduzir o catálogo aos exemplos de OpenAI/Claude dos demos.
- [ ] Implementar sugestões de `@` no início e após espaço/quebra de linha, busca por nome/alias, ↑/↓, Enter/Tab, Escape, clique e seleção no meio do texto. Email não abre menu; Enter escolhendo agente não envia a mensagem.
- [ ] Mostrar somente participantes elegíveis da conversa. A edição de equipe é uma ação separada; mencionar não cadastra nem adiciona agente silenciosamente.
- [ ] Usar Attachments e VoiceInput com arquivos/gravador/transcrição reais; manter limites atuais de arquivo e informar erros por anexo. CategoryDropdown mostra apenas ferramentas/habilidades disponíveis e ações conectadas.
- [ ] Testar seleção de `@atlas` entre dois nomes semelhantes, alias inválido, digitação acentuada, draft por conversa, falha de envio, mudança de modelo, esforço não suportado, envio em execução com/sem steering e microfone indisponível.

**Aceite:** o usuário consegue digitar `@`, escolher o agente e enviar; vê o PromptInput e o seletor Kokonut usando seu catálogo real. Ditado e anexos restauram estado corretamente quando o envio falha.

### Autocomplete de @menções — requisito obrigatório

- [ ] Digitar `@` abre um menu junto ao campo com avatar, nome e `@alias` dos participantes reais; digitar `@at` filtra por nome ou alias, sem distinguir maiúsculas/minúsculas na busca.
- [ ] Selecionar por clique, Enter ou Tab substitui somente o token sob o cursor por `@alias ` e devolve o foco ao composer, preservando o texto antes e depois. ↑/↓ percorrem as opções; Escape fecha sem modificar o rascunho.
- [ ] Permitir várias menções na mesma mensagem e edição no meio do texto; a seleção de uma opção nunca envia a mensagem automaticamente. O estado de composição IME tem prioridade sobre os atalhos.
- [ ] Mostrar “Nenhum participante encontrado” quando a busca não tiver resultado; atualizar/fechar sugestões ao trocar de conversa ou alterar a equipe. Autocomplete não adiciona participantes nem modifica permissões.
- [ ] Usar semântica acessível de combobox/listbox, opção ativa anunciada e menu utilizável em tela estreita. Não depender de uma requisição de IA para sugerir os participantes.
- [ ] Criar `features/composer/mentions.test.ts` para detecção/substituição do token e `MentionSuggestions.test.tsx` para interação; ampliar Composer.test.tsx para integração. Fixar os cenários: `@at` → `@atlas `, duas menções, alias com hífen/Unicode, email sem menu, cursor no meio, zero resultados, Escape e mudança de conversa com menu aberto.

**Aceite específico:** numa conversa com Atlas e Nina, escrever `@at`, pressionar Enter e continuar escrevendo insere `@atlas ` sem enviar; após o envio explícito, o roteamento existente recebe o alias exato. Menções fora da equipe continuam sujeitas à validação do backend.

## Tarefa 4 — Código e diff Pasta em todos os pontos atuais

**Arquivos:** modificar `features/chat/MessageItem.tsx`, `MessageList.tsx`, `PolitronToolApproval.tsx`, `features/diff/DiffCard.tsx`, `DiffViewer.tsx`, `FileChangesCard.tsx`; criar `features/diff/file-diff-model.ts` e teste correspondente; usar `components/ai/code-block.tsx`, `file-diff.tsx` e `commit.tsx`.

**Interfaces:** `toFileDiff(before: string, after: string, filename: string): { hunks: DiffHunk[]; additions: number; deletions: number }` usando os tipos do FileDiff instalado. Reutilizar a biblioteca de diff atual se seu modelo puder ser convertido; não escrever um algoritmo de diff improvisado.

- [ ] Substituir os blocos fenced de Markdown pelo CodeBlock Pasta, com linguagem, arquivo quando conhecido, copiar e numeração; inline code continua inline.
- [ ] Calcular hunks/contagens reais: `a\nb\n` → `a\nc\n` tem uma adição e uma remoção, mesmo total de linhas. Cobrir criação vazia, exclusão, CRLF, Unicode e ausência de newline final.
- [ ] Trocar a apresentação DiffCard/DiffViewer pelo FileDiff Pasta no chat e nas aprovações. Manter proposta e alteração aplicada com rótulos/IDs diferentes e recolher a proposta após a decisão.
- [ ] Usar Commit como resumo de mudanças aplicadas do run; abrir FileDiff por arquivo sem repetir o mesmo bloco de resultado. Não confundir o componente com uma operação Git.
- [ ] Manter arquivos grandes/binários/truncados legíveis por resumo, com abertura de detalhe sob demanda. Não montar milhares de linhas até expandir.

**Aceite:** o cenário do print mostra o FileDiff real da Pasta, contagens corretas e um resultado canônico por alteração. O componente antigo deixa de ser o renderer desses fluxos.

## Tarefa 5 — Eventos duráveis e contrato dos runtimes

**Arquivos:** criar `src/shared/run-events.ts`, `src/main/v9/run-events.ts` e testes; modificar `store.ts`, `workspace.ts`, `agent-runtime.ts`, `codex.ts`, `claude.ts`, `pi.ts`, `headless-cli.ts`, `src/shared/v9.ts`, `src/preload/index.ts`, `src/main/v9/ipc.ts` e `src/main/hosts/rpc.ts`.

**Interfaces:** RunEvent/RunEventPage/RuntimeCapabilities da especificação; `AppAPI.runEvents(conversationId: string, afterSeq?: number, limit?: number): Promise<RunEventPage>` e `AppAPI.runDetails(runId: string): Promise<RunDetails>`; WorkspaceEvent ganha eventos de execução tipados.

- [ ] Criar migração 9→10 com backup e tabela/indexes de eventos. Antes de executar, confirmar que outra tarefa não avançou o schema; ajustar a sequência de migrações sem saltar a versão encontrada.
- [ ] Persistir antes de emitir; deduplicar por fonte/run; registrar início/fim/falha/negação/interrupção de ferramentas no broker comum, incluindo duration, exitCode e referências a FileChange/CommandEvidence.
- [ ] Normalizar resumos públicos e usage disponíveis por runtime. Para capacidades ausentes, publicar ausência de suporte; não extrair texto normal como reasoning ou fonte.
- [ ] Incluir autorização de consultas, paginação, cursores e transporte remoto; não colocar a linha do tempo inteira no Snapshot.
- [ ] Testar evento duplicado, delta atrasado depois de completed, IDs iguais em runs distintos, reconexão com lacuna, payload truncado e consulta de outro workspace negada.

**Aceite:** fechar/reabrir ou reconectar recupera ferramentas e resultados na ordem persistida sem repetir comandos.

## Tarefa 6 — Turno com atividade, ferramentas e reasoning reais

**Arquivos:** criar `features/chat/run-view.ts`, `RunContent.tsx`, `useRunEvents.ts` e testes; modificar MessageList, MessageItem, RunProgress e componentes Pasta `tool-approval`, `tool-group`, `tool-result`, `tool-error`, `tool-timeline`, `agent-activity`, `agent-status`, `reasoning-text`, `thinking-shimmer`, `message-scroller`.

**Interface:** `buildRunView(input: RunViewInput): RunView` é projeção pura, com IDs de bloco estáveis; os controles de aprovação delegam ao handler já protegido de PolitronToolApproval.

- [ ] Compor atividade → ferramentas/aprovações → resultados → resposta dentro do turno, usando timestamps/seq reais e identidade do agente. Preservar a ordem das mensagens existentes.
- [ ] Substituir ApprovalCard pelo ToolApproval Pasta em operações de ferramenta. Adaptar corpo, estados completos e disabled; “sempre permitir” não aparece sem contrato backend de concessão correspondente.
- [ ] Aprovação aprovada vira recibo recolhido; ToolResult mostra execução confirmada e ToolError apresenta falha. Não marcar ferramenta como concluída ao aprovar.
- [ ] Ampliar ToolGroup/AgentActivity para failed, denied, interrupted e timed_out. ReasoningText recebe conteúdo/status/timestamps controlados, removendo o scheduler demonstrativo por frases.
- [ ] Integrar MessageScroller à lista virtual atual, inclusive mensagens ainda não carregadas via janela histórica; não criar uma segunda cópia rolável do transcript.
- [ ] Testar mensagem sem run antigo, só atividade, output em streaming, falha parcial, stop durante ferramenta, falha sem texto e resize de cartões sem salto da âncora.

**Aceite:** “o que o agente está fazendo” fica claro e inspecionável; o fim do run encerra todos os indicadores associados.

## Tarefa 7 — Planos editáveis com aprovação e progresso

**Arquivos:** criar `src/shared/plans.ts`, `src/main/v9/plans.ts`, `features/plans/PlanBlock.tsx` e testes; modificar store/workspace/transporte; usar PlanApprovalCard, TodoList e JobProgress Pasta.

**Interfaces:** `propose_plan` no broker; `revisePlan(planId, expectedRevision, steps)`; `respondPlan(planId, expectedRevision, 'start' | 'cancel')`; PlanExecutionRequest único por plano/revisão.

- [ ] Migrar schema 10→11 para planos, artefatos e recibos de inbox definidos na especificação, com índices de conversa/run e revisões. As tabelas dos módulos posteriores só são ativadas pelos respectivos serviços.
- [ ] Validar objetivo, passos, destinatários e escopo. Proposta coloca um gate de execução no run; publicar plano não aprova escrita/comandos.
- [ ] Conectar editar/cancelar/iniciar a decisões persistidas e início idempotente do run de continuação. Não manter a CLI esperando a interação do usuário durante horas.
- [ ] Adaptar PlanApprovalCard para revisão/status reais; TodoList e JobProgress recebem eventos dos passos, nunca um timer que avança por conta própria.
- [ ] Testar start duplicado, edição concorrente, versão antiga aprovada, permissão revogada antes de start, restart com plano pendente e cancelamento com subtarefa ativa.

**Aceite:** o usuário edita um plano, inicia a revisão exata uma vez e acompanha passos de agentes reais.

## Tarefa 8 — Artefatos e fontes com proveniência

**Arquivos:** criar `src/shared/artifacts.ts`, `src/main/v9/artifacts.ts`, `sources.ts`, `features/artifacts/ArtifactRenderer.tsx` e testes; modificar broker/store/transporte.

**Interfaces:** `publish_artifact(input: PublishArtifactInput)`; `AppAPI.artifacts(conversationId, beforeCursor?, limit?)`; SourceReference e Artifact da especificação.

- [ ] Validar payload discriminado, versão, tamanho, revisão e idempotência; recusar referências a fontes inexistentes e escopo escolhido pelo próprio agente.
- [ ] Registrar fontes a partir de `workspace_read`, resultados estruturados e `browser_observe`, preservando caminho/URL/trecho da observação. Links fornecidos sem leitura são links, sem selo de verificação.
- [ ] Publicar artefatos ligados a mensagem/run e recuperar por página depois de reinício; o renderer escolhe o componente pelo tipo validado.
- [ ] Manter Markdown antigo e mensagens de runtimes sem artefatos funcionando. Carregar corpo pesado por demanda.
- [ ] Testar relatório com referência inexistente, mistura de agentes/conversas, update de artefato já exibido, fonte removida e conteúdo HTML/URL inválidos.

**Aceite:** uma fonte citada tem identidade recuperável; um artefato persiste e reabre sem depender de estado local do componente.

## Tarefa 9 — Pesquisa, citações, links e saídas ricas

**Arquivos:** criar `features/artifacts/ReportView.tsx`, `SourceView.tsx`, `LinkPreviewBlock.tsx`, `src/main/v9/link-metadata.ts` e testes; modificar MessageItem e ArtifactRenderer; usar InlineCitation, Citations, ResearchReport, LinkPreview, DocumentReference, RetrievalChunks, SearchResultsTabs e CodeBlock Pasta.

- [ ] Renderizar citações nos trechos declarados pelo artefato, com preview e abertura da fonte. Citação desconhecida indica ausência de fonte em vez de abrir URL inventada.
- [ ] Relatório tem seções/índice/progresso de leitura e fontes; streaming atualiza seções por ID sem recolocar o leitor no início.
- [ ] Resultados de buscas/leitura usam dados do broker e trechos reais. Nenhuma contratação de motor de busca é implícita; o fluxo inicial usa arquivos e páginas observadas pelo navegador já existente.
- [ ] Implementar metadados HTTP sob demanda com limites/regras da especificação; falha de rede mantém um link simples funcional. Abrir URL usa o caminho autorizado do main.
- [ ] FollowUp/FollowUpSuggestions usam opções publicadas pelo agente; ação envia uma mensagem real, não executa comando mutável silenciosamente.
- [ ] Testar fontes duplicadas, link que redireciona para rede privada, relatório com 30 seções, links acentuados, bloqueio de scripts/HTML e navegação por teclado.

**Aceite:** o agente publica um relatório sobre arquivos/páginas que leu; todas as citações abrem suas fontes e o relatório permanece navegável durante atualizações.

## Tarefa 10 — Árvore e revisão de alterações do workspace

**Arquivos:** modificar `features/panels/ProjectExplorer.tsx`, `DockWorkspace.tsx`, `features/diff/FileChangesCard.tsx`; criar `features/panels/file-tree-model.ts`, `src/main/v9/git-summary.ts` e testes; usar FileTree, Commit e FileDiff Pasta.

**Interfaces:** `workspaceChanges(workspaceId): Promise<WorkspaceChangeSummary>` com caminhos, estado Git, contagens e referências de diff; `file-tree-model` converte pastas carregadas para IDs/caminhos estáveis sem recursão antecipada do disco todo.

- [ ] Preservar `listProjectFiles`, leitura/escrita com hash, limites e restrições de symlink. Pastas abrem sob demanda; árvore vazia/erro/sem pasta são estados reais.
- [ ] Integrar estados Git de arquivos/pastas e contagens ao FileTree. Separar alterações de um run de mudanças atuais do workspace.
- [ ] Commit abre a revisão do conjunto e FileDiff abre arquivo específico; o histórico mostra o before/after da execução, mesmo que o disco tenha mudado depois.
- [ ] Não adicionar aceitar/rejeitar/desfazer de arquivo já aplicado sem escrita protegida e autorização; o componente Kokonut AI Diff Review fica como alternativa para um futuro fluxo de patches pendentes.
- [ ] Testar rename, arquivo excluído, binário, caminho com espaços/acentos, pasta grande, symlink externo e alteração do disco durante revisão.

**Aceite:** árvore e resumo de mudanças usam os componentes Pasta e abrem o editor/diff correto no painel atual.

## Tarefa 11 — Delegações, inbox e agentes em paralelo

**Arquivos:** criar `src/shared/work-inbox.ts`, `src/main/v9/work-inbox.ts`, `features/work/WorkInbox.tsx`, `RunDetailPanel.tsx`, `AgentLanesPanel.tsx` e testes; modificar AppShell/Sidebar/DockWorkspace/transporte; instalar `@kokonutui/ai-agent-lanes`; usar BackgroundInbox, BackgroundRuns, TaskCard, ToolTimeline e ConnectionState Pasta.

**Interfaces:** `workInbox(workspaceId?, cursor?): Promise<WorkInboxPage>`; `markWorkRead(itemId, revision)`; `dismissWorkItem(itemId, revision)`. Consultas preservam IDs de host, workspace, conversa, run e delegação.

- [ ] Expor Delegation/CommandEvidence já persistidos via consultas autorizadas; conectar TaskCard a `cancelDelegation`, resultado e conversa de destino existentes.
- [ ] Criar visão global e por workspace do trabalho ativo/aguardando/finalizado/falhou/interrompido. Dispensa muda leitura, sem apagar resultado nem cancelar o run.
- [ ] Adaptar AI Agent Lanes para estado controlado por timestamps/eventos, incluindo command, aprovação, falha e interrupção. A ordem pai/filhos vem de Run/Delegation; o nome Chief continua opcional.
- [ ] Abrir item navega ao destino correto. Exibir reconexão e recuperar lacunas sem reenviar prompts ou delegações.
- [ ] Testar duas delegações simultâneas, filho falha, pai cancelado, item de conversa excluída, resultado recebido fora da conversa ativa e dois hosts com IDs parecidos.

**Aceite:** pedir uma correção ao coordenador, acompanhar especialistas em paralelo, trocar de conversa e receber o resultado na inbox com evidências e destino corretos.

## Tarefa 12 — Fila, edição e versões de mensagens

**Arquivos:** criar `src/shared/turn-queue.ts`, `src/main/v9/turn-queue.ts`, `features/composer/QueuedMessages.tsx` e testes; modificar store/workspace/transporte/Composer/MessageItem; usar MessageQueue e EditMessage Pasta.

**Interfaces:** `enqueueTurn(input): Promise<QueuedTurn>`; `updateQueuedTurn(id, revision, patch)`; `removeQueuedTurn(id, revision)`; `forkFromMessage(messageId, revisedText): Promise<Conversation>`. Migração 11→12 para fila/revisões e feedback da tarefa seguinte.

- [ ] Persistir fila antes de mostrar aceitação; preservar arquivos por referências duráveis com limpeza no cancelamento. “Enviar agora” só retira da fila após o backend aceitar.
- [ ] Distinguir mensagem de orientação de próximo turno; impedir envios repetidos por teclado/reconexão e retirar rascunho somente ao aceitar.
- [ ] EditMessage mantém a autoria e versão original. Reexecutar cria uma conversa derivada com histórico anterior selecionado, sem reexecutar efeitos antigos nem copiar aprovações como válidas.
- [ ] Testar restart com fila, exclusão da conversa, edição concorrente, anexo removido e cancelamento entre aceitação e início.

**Aceite:** usuário vê e gerencia o próximo pedido enquanto o agente trabalha, sem perder o texto ou executá-lo duas vezes.

## Tarefa 13 — Feedback e telemetria operacional

**Arquivos:** criar `src/shared/run-usage.ts`, `src/main/v9/run-usage.ts`, `features/work/RunMetrics.tsx` e testes; modificar adaptadores/store/transporte; usar CostMeter, ContextBreakdown, QuotaBanner, FeedbackDialog e DataTable Pasta.

- [ ] Registrar uso/custo quando o runtime informar; representar unknown separadamente de zero. Estimativa de contexto identifica método e não aparece como contagem exata.
- [ ] Nenhum cálculo de preço usa tabela fixa sem fonte/data; quota/reset exige informação do provedor. Não oferecer upgrade fictício.
- [ ] Persistir feedback local por mensagem/revisão e permitir editar/remover. Envio a terceiros permanece fora desse fluxo.
- [ ] Histórico de runs permite filtrar agente, runtime, status e período; abrir uma linha mostra a mesma execução da inbox.
- [ ] Testar runtime sem usage, moeda ausente, falha de consulta, run interrompido e feedback em versão antiga.

**Aceite:** números exibidos têm fonte e significado claros; ausência de dado não parece custo zero nem progresso concluído.

## Tarefa 14 — Mídia e conteúdo contextual do catálogo

**Arquivos:** criar `features/artifacts/MediaArtifact.tsx`, `EmailDraftArtifact.tsx`; modificar o fluxo de voz/ArtifactRenderer e testes; usar AudioPlayer, VideoPlayer e EmailComposer Pasta conforme tipo publicado.

- [ ] AudioPlayer usa a fala/arquivo real, com reprodução, progresso, cancelamento e descarte do recurso anterior ao trocar de conversa.
- [ ] VideoPlayer só recebe mídia existente e acessível pelo host; estado sem mídia não gera conteúdo. EmailComposer representa rascunho com copiar/exportar; não fornece botão de enviar sem integração autorizada.
- [ ] Aplicar TypeScript/Markdown/code aos artefatos e a mesma política de URL/arquivo. Reservas como ImageGenerationLoader só entram quando houver um job/provedor real em uma evolução específica.
- [ ] Testar arquivo ausente, formato não suportado, host offline, cancelamento de áudio e rascunho com dados inválidos.

**Aceite:** os componentes de mídia/rascunho aparecem quando o agente entrega um artefato desses tipos e suas ações têm efeito verificável.

## Tarefa 15 — Aceite integrado, temas e retirada dos caminhos antigos

**Arquivos:** adicionar teste Electron seguindo o padrão de `scripts/verify-agent-stability-electron.cjs`; atualizar testes de histórico/scroll/composer/aprovação; registrar resultados em `docs/auditorias/2026-10-21-chat-pasta-kokonut.md`, PRODUCT, ESTRATEGIA_POLITRON seção 7 e docs/design.

- [ ] Rodar cenário real em workspace descartável: citar arquivo → pedir plano → editar/aprovar → mencionar agente → delegar → aprovar comando/escrita → acompanhar atividade → revisar diff → ler relatório com fontes → abrir resultado na inbox.
- [ ] Cobrir negação, falha, interrupção, restart/reconexão e histórico antigo. Diferenciar cenários simulados de execuções reais de provedor nos registros.
- [ ] Validar foco/teclado/IME/reduced-motion, larguras 390/768/1440 e 14 temas. Capturar cada componente dos 15 links em sua situação de uso real, com o caminho de entrada documentado.
- [ ] Conferir 1.000 mensagens com cartões de altura variável e saída longa; preservação do item/offset de leitura após expandir, carregar histórico e receber eventos.
- [ ] Rodar typecheck, build, testes focados e verificações declaradas no package.json. Rodar a suíte completa antes do aceite; registrar falhas preexistentes em vez de chamar verify de aprovado.
- [ ] Remover imports/renderers antigos desses fluxos somente depois de conferir callers. Remover dependência apenas quando não houver uso restante. Registrar cada componente como instalado/integrado/validado/pendente.

**Aceite principal:** todos os 15 componentes obrigatórios e fluxos de menções, plano, fontes e colaboração estão acessíveis e funcionando. Demonstrações e capturas isoladas não substituem o cenário integrado.

## Tarefa 16 — Extensão: memória visível pelo provedor configurado

**Arquivos previstos:** `src/shared/agent-memory.ts`, `src/main/v9/agent-memory.ts`, `features/work/MemoryPanel.tsx`, transporte e testes; usar Memory Pasta.

- [ ] Criar um adapter `MemoryProvider` com list/remove e capacidades explícitas. Integrar Bright Memory quando configurado, sem criar armazenamento concorrente em Markdown.
- [ ] Mostrar origem, escopo, data e disponibilidade; remover somente fatos da memória que o provedor permite administrar. Não confundir checkpoint de contexto com lembrança aprovada do usuário.
- [ ] Exigir confirmação para remoção e testar indisponibilidade, escopo de outro agente e segredo acidentalmente retornado pelo provedor.

**Aceite da extensão:** o usuário consulta e administra a memória efetiva do agente, com estado de erro e ausência de integração claros.

## Tarefa 17 — Extensão: agendamentos reais e configuração contextual

**Arquivos previstos:** `src/shared/schedules.ts`, `src/main/v9/schedules.ts`, `features/work/SchedulesPanel.tsx`, store/transporte e testes; usar ScheduleCard Pasta. ColorPicker e EnvironmentVariables entram somente nas telas de edição/configuração que lhes correspondem.

- [ ] Persistir regra, timezone, próximo disparo, estado habilitado e vínculo de tarefa/workspace/agente. Criação depende de ação explícita do usuário; um cartão não agenda por renderização.
- [ ] Implementar consumidor único de jobs, idempotência por ocorrência, pausa/cancelamento e política explícita para horário perdido durante offline. Começar com “não recuperar automaticamente ocorrências perdidas”.
- [ ] Rever permissões na execução de cada job, manter gates de ferramentas e informar resultados na inbox. Instância remota executa no host dono; notebook cliente offline não duplica job.
- [ ] Testar horário de verão/timezone, restart no disparo, dois consumidores, agente excluído e permissão revogada. Configuração de segredos permanece no main, mascarada e fora do transcript.

**Aceite da extensão:** um agendamento habilitado dispara uma vez no host correto, pode ser pausado e produz recibo rastreável.

## Riscos que a revisão deve conferir

| Condição | Resultado esperado | Tarefa que cobre |
|---|---|---|
| Aprovação renderizada sem corpo/disabled | Proposta, aviso e estado são visíveis; um clique não duplica decisão | 1, 6 |
| Evento duplicado, atrasado ou recebido após reconexão | Timeline estável, sem reexecução e sem voltar completed para running | 5, 6, 11 |
| Altura muda enquanto o usuário lê histórico | Item e offset visual preservados; minimapa não mantém outro transcript | 6, 15 |
| Aprovar versão antiga de plano ou arquivo | Backend rejeita conflito; usuário vê a revisão atual | 4, 7, 10 |
| Fonte/arquivo/host não está mais disponível | Conteúdo histórico preservado; abertura informa erro sem substituir a fonte | 8–11, 14 |

## Definition of done por componente

- [ ] Código instalado identificado, importado e renderizado em um fluxo de produção.
- [ ] API e estado controlado conectados a dados reais; estado vazio/falha/interrupção representado.
- [ ] Ação visual percorre backend e produz o resultado prometido.
- [ ] Reinício, navegação e atualização não perdem o conteúdo nem executam a ação novamente.
- [ ] Teste relevante e captura no Electron registram o comportamento; revisão visual continua explicitamente pendente até ser feita.

## Estado deste documento

Planejamento concluído com inspeção estática do checkout e consulta aos registros/documentação oficiais em 21/10/2026. Nenhuma caixa acima representa trabalho concluído nesta rodada. Este plano não certifica a migração atual para React 19, a integração visual anterior nem conectividade entre dois PCs físicos.
