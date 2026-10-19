# Plano de evolução do chat, colaboração em grupos e contexto

Data: 17/10/2026. Estado: implementação parcial nas quatro fases; medições, QA de runtime e critérios ainda listados como pendentes não foram comprovados.

Este plano adapta quatro ideias avaliadas no DeepSeek-Bot à arquitetura atual do Politron. Complementa `ESTRATEGIA_POLITRON.md` e aproveita Electron, React, IPC tipado, SQLite e os adaptadores Codex/Claude existentes.

## Ordem de execução

| Fase | Entrega | Resultado para o usuário | Dependência |
| --- | --- | --- | --- |
| 1 | Desempenho e históricos longos | Ler, rolar e receber mensagens sem carregar o histórico inteiro na tela | Medir a versão atual |
| 2 | Delegação assíncrona | Continuar a conversa enquanto um agente executa o pedido delegado | Identificação e estados duráveis dos pedidos existentes |
| 3 | Rodadas de colaboração em grupo | Agentes chamados participam em ordem, com contexto compartilhado e limites claros | Entrega assíncrona e correlação da fase 2 |
| 4 | Busca e checkpoints de contexto | Recuperar mensagens antigas e continuar trabalhos extensos com contexto controlado | Paginação da fase 1 e eventos/correlações das fases 2 e 3 |

Os quatro itens da análise anterior aparecem nesta ordem: desempenho de históricos, delegação assíncrona, rodadas em grupo e checkpoints. A busca FTS5 fica na fase 4 como suporte à recuperação do histórico que sair do contexto ativo. Cada fase deve produzir uma entrega utilizável antes da seguinte.

## Regras de produto que orientam o plano

- Sem menção, o padrão do grupo continua sendo um único respondente: líder escolhido pelo usuário ou agente selecionado pelo modo automático.
- O provedor do decisor automático é somente OpenRouter. A chave vem antes da descoberta dos modelos de decisão; TypeSafe/Jev pode aparecer como modelo do catálogo.
- Menções explícitas do usuário selecionam os participantes destinados àquela mensagem. O envio a todos continua sendo uma escolha explícita.
- Rodadas colaborativas dependem de uma ação ou configuração explícita. Uma resposta comum de agente não inicia uma rodada por conter nomes ou menções no texto.
- Cada agente mantém sessão própria por conversa e contexto. Participar de um grupo não compartilha seu histórico privado.
- O usuário pode escolher um coordenador por grupo. Chief permanece uma capacidade administrativa opcional.
- A identificação visível das mensagens mantém apenas `@alias`, com cor e negrito, conforme o ajuste solicitado.
- Preservar os temas, aprovações, diffs, permissões, workspaces e trabalho local existente.

As decisões desta conversa, em 17/10/2026, atualizam a regra antiga de broadcast automático ainda presente em trechos de `AGENT.md`, `PRODUCT.md` e `ESTRATEGIA_POLITRON.md`. A preparação da implementação deve reconciliar esses trechos com as regras acima.

## Ponto de partida verificado no código

| Área | O que já existe | Lacuna considerada neste plano |
| --- | --- | --- |
| Histórico | `store.ts` recupera as últimas 500 mensagens; o snapshot geral não carrega mensagens | Paginação para acessar mensagens anteriores e limitar o volume carregado |
| Renderização | `MessageList.tsx` indexa alterações/aprovações e memoriza linhas estáveis | A lista ainda percorre e monta todas as mensagens carregadas |
| Roteamento | Líder, modo automático, broadcast explícito e menções | Orquestração opcional de uma sequência de participações |
| Sessões | O vínculo do runtime inclui conversa, agente, workspace, modelo e revisões de contexto/ferramentas | Preservar esse isolamento nos novos fluxos |
| Delegação | `ask_agent`, conversa de destino, deduplicação, resultado, cancelamento e estado persistido | A chamada aguarda o pedido delegado terminar |
| Persistência | SQLite com mensagens, execuções, sessões e delegações | Índice de busca textual e registros próprios de rodada/checkpoint |
| Contexto | Continuidade delegada aos runtimes Codex e Claude | Verificar capacidades de cada adaptador antes de acrescentar compactação no aplicativo |

Medições de desempenho em runtime e revisão visual continuam pendentes. Os resultados anteriores de testes e build não demonstram ganho de desempenho nem validam as funcionalidades futuras deste documento.

## Preparação comum

- [ ] Executar `bright-memory ensure`, ler `AGENT.md` e conferir o diff do workspace antes de editar.
- [x] Reconciliar `AGENT.md`, `PRODUCT.md` e `ESTRATEGIA_POLITRON.md` sobre líder, modo automático, rodadas opt-in e broadcast explícito.
- [ ] Registrar a versão e o diff usados como base das medições; o checkout atual possui alterações locais.
- [ ] Mapear os eventos de streaming, histórico, aprovação, delegação e atualização de snapshot que chegam ao renderer.
- [ ] Definir as migrações aditivas necessárias, com backup antes da mudança de esquema.
- [ ] Entregar cada fase em alterações revisáveis, com evidências próprias e um caminho para desabilitar o recurso novo.

## Fase 1 — Desempenho e históricos longos

### Comportamento esperado

O chat carrega uma página recente, busca páginas anteriores quando necessário e mantém montadas apenas as mensagens próximas da área visível. Streaming, diffs e aprovações continuam funcionando. Ler mensagens antigas não faz a tela saltar para o fim.

### Trabalho

- [ ] Medir abertura de conversa, troca de conversa, rolagem, recebimento de deltas e consumo de memória no Electron.
- [ ] Usar cenários reproduzíveis de 100, 500, 2.000 e 10.000 mensagens persistidas, incluindo Markdown, blocos de código, diffs, aprovações e delegações.
- [ ] Registrar tempo até a primeira página visível, latência de atualização em p50/p95, tarefas longas da thread principal, quantidade de linhas montadas e memória do renderer.
- [ ] Usar trace do Electron/Chromium e React Profiler conforme disponibilidade. Medir a interface real; registrar explicitamente qualquer cenário que não puder ser executado.
- [x] Acrescentar uma API de histórico paginado, com cursor estável baseado no `rowid` do SQLite e identificação de que existem mensagens anteriores. Evitar paginação por offset ou apenas por horário.
- [ ] Conferir se a ordenação existente atende a um cursor durável; acrescentar uma sequência persistida se necessário, preservando a ordem dos registros antigos.
- [ ] Manter uma leitura limitada de contexto recente para o backend, independente da paginação visual. Revisar todos os usos atuais de `history` antes de mudar seu contrato.
- [x] Integrar virtualização de alturas variáveis à lista existente, usando IDs estáveis, `ResizeObserver` e margem de renderização fora da tela.
- [ ] Preservar a âncora visual ao acrescentar mensagens no início, expandir um diff ou alterar a altura de uma resposta em streaming. A âncora para carregar páginas anteriores está implementada; os outros cenários ainda precisam de validação.
- [ ] Manter rolagem automática apenas quando o usuário estiver próximo do fim e oferecer acesso às mensagens novas durante a leitura do histórico. O auto-scroll existente foi preservado; o indicador de novas mensagens ainda falta.
- [ ] Revisar eventos que invalidam a lista inteira a cada delta e reduzir atualizações desnecessárias onde o perfil mostrar custo.
- [ ] Preservar seleção/cópia, leitura por teclado, links e ações de aprovações/diffs. Planejar busca no histórico completo pela fase 4, pois a busca nativa da página alcança apenas o conteúdo montado.

### Critérios de aceite

- Uma conversa com 10.000 mensagens persistidas abre por páginas, sem transferir ou montar o histórico inteiro.
- O número de mensagens montadas depende da janela visível e da margem de renderização, em vez do total do histórico.
- Buscar páginas anteriores e atualizar uma resposta em streaming preserva a posição de leitura.
- Trocar de conversa durante carregamento/streaming não mistura mensagens nem rolagem entre conversas.
- Aprovações, diffs, navegação para delegações e reprodução de áudio continuam acessíveis nas mensagens virtualizadas.
- O relatório compara a mesma base, máquina e cenário antes/depois. Metas de latência e memória são definidas após a medição inicial, antes de concluir a otimização.
- Regressões de abertura, rolagem ou memória observadas na comparação são corrigidas ou ficam explicitamente documentadas antes de liberar a fase.

### Arquivos prováveis

`features/chat/MessageList.tsx`, `MessageItem.tsx`, `features/app/AppShell.tsx`, `main/v9/store.ts`, `workspace.ts`, `ipc.ts`, `preload/index.ts` e `shared/v9.ts`.

## Fase 2 — Delegação assíncrona com resultado correlacionado

### Comportamento esperado

Um agente pode iniciar um pedido e receber imediatamente seu identificador e estado. O destinatário trabalha com suas instruções, sessão, pasta e permissões. O grupo ou a conversa continua disponível; o resultado é publicado na conversa de origem ligado ao pedido correto. A continuação automática do agente solicitante ainda é uma etapa pendente.

O modo de espera atual continua útil para consultas curtas. A implementação deve oferecer semânticas explícitas de esperar pelo resultado e executar em segundo plano.

### Trabalho

- [ ] Definir o contrato de delegação assíncrona: destinatário, tarefa, contexto mínimo, origem, identificador idempotente e política de entrega do resultado.
- [x] Acrescentar uma opção explícita à ferramenta: `wait` mantém o comportamento atual; `background` devolve recibo e publica o resultado depois.
- [x] Permitir que o turno do solicitante conclua sem aguardar o destinatário. Cancelar explicitamente o turno solicitante continua cancelando o filho associado.
- [ ] Persistir origem, destino, solicitante, executor, estado, resultado/erro e vínculo com as execuções antes de iniciar trabalho.
- [ ] Reutilizar a conversa privada de execução e os controles atuais de permissão. Não copiar o histórico completo de origem para o destinatário.
- [ ] Enfileirar resultados como eventos próprios, com chave única de entrega. Uma reconexão ou notificação repetida não deve publicar o mesmo resultado duas vezes.
- [x] Oferecer `continue_on_result` para iniciar uma continuação única do solicitante depois do resultado. Ela entra na fila do workspace e usa somente a sessão do solicitante; falta validar concorrência com runtime real.
- [ ] Agregar estados úteis no cartão do pedido: na fila, trabalhando, aguardando aprovação, concluído, falhou e interrompido. Atualizações de texto devem ocorrer quando houver informação relevante.
- [ ] Distinguir parar o turno atual, cancelar um pedido específico e cancelar os pedidos relacionados àquela ação. Usar controles existentes quando expressarem essas ações com clareza.
- [ ] Preservar prevenção de ciclos, limite de profundidade e deduplicação. Definir também limite de pedidos pendentes por conversa.
- [ ] Revisar as reservas da fila de workspace para a continuação assíncrona não causar bloqueio circular nem sobrepor escritas na mesma pasta.
- [ ] Após reinício, apresentar pedidos interrompidos e resultados ainda não entregues. Retomar a entrega de um resultado persistido sem reexecutar ferramentas externas; a retomada do trabalho interrompido exige ação explícita.

### Critérios de aceite

- [x] O solicitante recebe a confirmação de agendamento sem esperar a conclusão do destinatário (implementado; falta QA de runtime).
- [ ] O usuário consegue continuar enviando mensagens enquanto acompanha o estado do pedido (fluxo assíncrono implementado; falta QA de runtime).
- Dois resultados que terminam fora de ordem chegam às suas origens corretas e aparecem uma única vez na interface.
- Falha, aprovação pendente, cancelamento e fechamento do aplicativo deixam estados recuperáveis e compreensíveis.
- [ ] A continuação opcional recebe o resultado correlacionado e executa somente o agente solicitante (implementado; falta QA de runtime e concorrência).
- Histórico privado, permissões e pasta de outro agente não vazam para a origem.
- A deduplicação cobre o agendamento e a entrega. Eventuais repetições de efeitos externos são tratadas pelo contrato da ferramenta, sem prometer execução universalmente única.

### Arquivos prováveis

`main/v9/workspace.ts`, `store.ts`, `routing.ts`, `agent-runtime.ts`, `shared/v9.ts` e componentes de atividade/delegação no chat e na lateral. Extrair um serviço de delegações se isso reduzir responsabilidades do `AppService`.

## Fase 3 — Rodadas opcionais de colaboração em grupo

### Comportamento esperado

Quando o usuário inicia uma colaboração, o grupo tem uma rodada identificada. Cada participante chamado lê o contexto autorizado atualizado antes de falar. Um agente pode encerrar sua participação sem publicar uma resposta vazia ou repetitiva, ou pedir uma participação específica por ferramenta.

A seleção inicial continua respeitando líder, decisor OpenRouter, menções e broadcast explícito. A rodada controla as participações autorizadas após essa seleção.

### Trabalho

- [x] Definir ativação explícita na configuração da conversa: `Rodada em ordem`; sem essa opção, líder, auto e broadcast mantêm seus comportamentos.
- [ ] Persistir rodada, mensagem que a iniciou, participantes selecionados, ordem, estados e limite de participações.
- [ ] Modelar os estados necessários da rodada e de cada participação, incluindo trabalho em segundo plano e espera por aprovação.
- [x] Serializar uma participação por agente no modo `Rodada em ordem` e incluir as respostas anteriores da mesma rodada no próximo pedido. Delegações em `background` já podem terminar sem manter o solicitante aguardando.
- [ ] Manter cursor de contexto entregue por agente e conversa. Enviar as mensagens novas pertinentes, com ordem, autoria e um orçamento de tamanho.
- [ ] Fazer a primeira participação receber um recorte recente do grupo. Se houver lacuna ou corte, indicá-lo e permitir consultar o trecho autorizado necessário.
- [ ] Atualizar o cursor junto com a confirmação idempotente de entrega ao runtime. Falha na entrega não pode fazer o agente perder mensagens silenciosamente.
- [ ] Acrescentar uma ação estruturada para passar a vez e uma ferramenta explícita para chamar outro participante. Se `[PASS]` for aceito como compatibilidade, reconhecer apenas a resposta de controle completa.
- [ ] Usar menções textuais para identificação visual. Trechos de código, citações, links ou texto produzido pelo modelo não devem disparar agentes por acidente.
- [ ] Aplicar limites por rodada, participante, encadeamento e tempo. Começar com limites conservadores, documentados e ajustáveis no serviço; validar seu efeito nos cenários de colaboração.
- [ ] Permitir remover participantes ou parar a rodada sem redirecionar uma execução já iniciada a outro agente.
- [ ] Tratar mensagens humanas recebidas durante a rodada com ordem determinística. Correções devem chegar antes de novas participações que dependam delas.
- [ ] Correlacionar resultados tardios à rodada original. Uma continuação autorizada recebe orçamento próprio e não abre ciclos ilimitados de respostas.
- [ ] Exibir andamento e conclusão com os componentes de estado existentes, evitando repetir identificação e atividade em vários cartões.
- [ ] Após reinício, marcar participações não concluídas como interrompidas e oferecer continuação explícita, preservando o registro anterior.

### Critérios de aceite

- [ ] Sem ativação da colaboração, os modos atuais continuam selecionando os respondentes como configurados pelo usuário (implementado; falta QA de runtime).
- [ ] Um participante que fala depois de outro recebe as mensagens anteriores pertinentes à rodada (implementado como transcrição limitada a uma passagem; faltam limites/orçamento explícitos e QA).
- Passar a vez não produz uma mensagem visível vazia nem é apresentado como falha.
- Chamar um especialista cria uma participação correlacionada e limitada, sem iniciar broadcast implícito.
- Um agente ocupado ou aguardando aprovação não impede indefinidamente a progressão dos demais.
- Mudança de participantes, nova mensagem humana, resultado tardio e cancelamento têm ordem e resultado verificáveis.
- A rodada termina ao consumir seu trabalho autorizado ou alcançar um limite, com estado claro na interface.
- Conversas privadas e grupos diferentes permanecem isolados.

### Arquivos prováveis

Novo serviço de rodadas em `main/v9`, integrado a `workspace.ts`, `store.ts`, `routing.ts` e às delegações da fase 2; contratos em `shared/v9.ts`; controles em `ChatHeader.tsx`, editor de grupo e componentes de atividade.

## Fase 4 — Busca FTS5 e checkpoints de contexto

### Comportamento esperado

Usuários e agentes autorizados conseguem buscar mensagens antigas desta conversa. A busca visual abre uma janela ao redor da mensagem original; agentes podem recuperar trechos por ferramenta. Agentes também podem salvar checkpoints manuais, que entram em uma nova sessão do mesmo agente e conversa junto das três mensagens humanas mais recentes, preservadas literalmente. Gatilhos automáticos por limite de tokens e compactação nativa continuam pendentes: `AgentRuntime` não expõe atualmente um contrato comum de uso de contexto.

### Etapa 4A: busca e recuperação

- [x] Criar um índice derivado FTS5 sobre mensagens pesquisáveis, com IDs de origem e escopo por conversa. O histórico original permanece a fonte de verdade.
- [x] Indexar incrementalmente mensagens do usuário, atividades e respostas finalizadas, evitando reindexação a cada delta de streaming.
- [x] Reconstruir entradas ausentes na inicialização sem apagar conversas.
- [x] Respeitar exclusão e restringir a ferramenta ao histórico da conversa atual; chats privados de outros agentes não são consultados.
- [x] Oferecer busca por texto, recorte ao redor do resultado e abertura da mensagem pela paginação/virtualização da fase 1, inclusive quando ela estiver fora da janela renderizada.
- [ ] Preservar referências estáveis para arquivos, anexos, diffs e mensagens relacionadas.
- [ ] Validar pesquisa com acentos, português, código, termos curtos e identificadores. Escolher tokenizer e fallback a partir desses resultados.
- [x] Acrescentar ferramenta `search_history` com até oito resultados, escopo da conversa atual, autoria, data, trecho e ID da mensagem. Conteúdo recuperado é apresentado como dado.

### Etapa 4B: continuidade e checkpoints

- [x] Mapear o contrato comum atual: `AgentRuntime` não expõe uso de contexto ou compactação; a disponibilidade de retomada depende do binding de cada runtime. Não estimar a janela apenas pelo nome do modelo.
- [ ] Preferir a compactação nativa quando ela fornecer continuidade e evidência suficientes. Acionar checkpoint no aplicativo somente onde houver contrato de integração definido.
- [ ] Definir orçamento de entrada, reserva de saída e limite de intervenção com base nas capacidades reais. Um percentual como 80% é uma referência a avaliar, não uma configuração universal já aprovada.
- [x] Oferecer checkpoint manual explícito solicitado pelo agente, sem compactar a sessão atual nem repetir ações. O gatilho automático em limite seguro segue pendente até os runtimes exporem capacidades e uso confiáveis.
- [x] Persistir resumo, decisões e pendências em checkpoint ligado à conversa, agente e execução de origem. O resumo deve registrar trabalho realizado com evidências e próximos passos.
- [x] Ao iniciar sessão nova, preservar literalmente as três mensagens humanas mais recentes e incluir o checkpoint. O histórico completo segue disponível por `search_history`.
- [ ] Distinguir compactar trabalho ainda em andamento de começar uma nova parte após um ponto de parada. A troca de parte mantém a mesma conversa visível.
- [x] Vincular checkpoint ao agente, conversa e execução de origem. Checkpoints são usados apenas quando um binding de sessão compatível não existe.
- [ ] Gerar e salvar o pacote antes de trocar o vínculo de sessão. Se a geração ou validação falhar, preservar a sessão anterior e apresentar o estado recuperável.
- [ ] Se houver avaliação por modelo auxiliar, definir seu provedor, modelo, orçamento, timeout e fallback separadamente do decisor de respondentes. A chave do decisor OpenRouter não autoriza automaticamente novas funções ou chamadas.
- [ ] Registrar tokens, latência, motivo e falhas das operações auxiliares, sem registrar chaves. Comparar custo e qualidade da continuidade com a base.

### Critérios de aceite

- Uma mensagem antiga é encontrada por busca e aberta no histórico original mesmo após checkpoint ou troca de parte.
- Reconstruir o índice mantém o histórico original intacto; exclusões não deixam resultados acessíveis indevidamente.
- A continuação preserva a solicitação mais recente, critérios de aceite, correções, aprovações e resultados de trabalho já realizado.
- Ferramentas, escritas e delegações concluídas não são repetidas por causa da troca de contexto.
- Falhas na criação de checkpoint não descartam a sessão anterior nem anunciam continuidade concluída.
- O comportamento é verificado separadamente em Codex e Claude. Uma capacidade não suportada fica explicitamente indisponível naquele adaptador.
- O relatório distingue consumo de contexto, custo de chamadas auxiliares e desempenho da interface; são medidas diferentes.

### Arquivos prováveis

Novo serviço de índice e migração em `main/v9/store.ts`; ferramentas de histórico em `workspace.ts`; contratos de capacidades em `agent-runtime.ts`, `codex.ts` e `claude.ts`; serviço de checkpoints e navegação de resultados no renderer.

## Validação e entrega por fase

| Fase | Verificação automatizada necessária | Verificação no aplicativo |
| --- | --- | --- |
| 1 | Paginação sem lacunas/duplicações; isolamento de carregamentos; âncora de rolagem e estados das mensagens | Benchmark antes/depois no Electron, streaming, histórico longo, temas e uso por teclado |
| 2 | Deduplicação de agendamento/entrega, resultados fora de ordem, cancelamento, reinício e continuação única | Delegar, continuar conversando, acompanhar aprovação e receber resultado com runtime real |
| 3 | Ordem das participações, cursores, passar a vez, limites, correções durante rodada e resultados tardios | Grupo com três agentes, incluindo um em trabalho demorado e outro aguardando aprovação |
| 4 | Migração/reconstrução FTS, escopos de acesso, âncoras e falhas de checkpoint | Buscar mensagens antigas e continuar tarefa extensa em cada adaptador suportado |

- Executar testes focados nas regras alteradas, typecheck e build a cada entrega. Ampliar a suíte quando os serviços compartilhados ou as migrações forem afetados.
- Verificar efeitos reais das ferramentas nos cenários de integração. Uma resposta textual do agente não comprova arquivo escrito ou tarefa executada.
- Comparar o resultado com todos os critérios de aceite da fase e registrar os casos ainda não executados.
- Manter alterações de esquema compatíveis e com backup. Desabilitar um recurso deve preservar histórico, pedidos, rodadas e evidências já persistidos.
- Atualizar o estado de implementação em `PRODUCT.md` e `ESTRATEGIA_POLITRON.md` somente com evidências correspondentes. Salvar contexto durável pela CLI Bright Memory.

## Referências de implementação

DeepSeek-Bot inspecionado no commit `e13bc3419d2695a509520d850a07e63f05c34e07`. A referência é um plugin do DeepSeek Harness; sua integração de sessões precisa ser adaptada aos motores do Politron. Código eventualmente reutilizado deve preservar licença e avisos Apache-2.0.

- [Descrição dos fluxos e limites](https://github.com/Fei2411/DeepSeek-Bot/blob/e13bc3419d2695a509520d850a07e63f05c34e07/ds-bot/README.md).
- [Rodadas, contexto por participante e trabalho em segundo plano](https://github.com/Fei2411/DeepSeek-Bot/blob/e13bc3419d2695a509520d850a07e63f05c34e07/ds-bot/src/host/groups.js).
- [Mensagens e delegação entre agentes](https://github.com/Fei2411/DeepSeek-Bot/blob/e13bc3419d2695a509520d850a07e63f05c34e07/ds-bot/src/host/tools.js).
- [Índice de chat FTS5](https://github.com/Fei2411/DeepSeek-Bot/blob/e13bc3419d2695a509520d850a07e63f05c34e07/ds-bot/src/host/chat-index.js).
- [Orçamento de contexto e formato dos checkpoints](https://github.com/Fei2411/DeepSeek-Bot/blob/e13bc3419d2695a509520d850a07e63f05c34e07/ds-bot/src/host/steward.js).
