# Detecção de provedores do Politron

> **Atualização de 11/11/2026:** o motor **Antigravity (`agy`)** foi removido do produto — runtime, detecção, catálogo, geração de imagens e seletor. Onde este documento descreve o detetor ou a raiz do seletor em tempo presente, valem **Codex, Claude, OpenCode e Pi**. O restante é registro datado das investigações.

## Gratuitos nativos OpenCode: validação em 20/10/2026

O catálogo nativo `opencode/*` oferece gratuitos pelo Zen/Console; Go é uma assinatura separada. Não é necessário iniciar 9router. A recusa observada antes foi reproduzida com nossa política que removia ferramentas nativas do catálogo, inclusive em Big Pickle. A CLI padrão respondeu normalmente. A política do processo filho agora exige aprovação (`ask`) para ferramentas nativas, e `opencode run` sem `--auto` recusa essas solicitações. Nenhuma configuração global ou credencial foi alterada. O modelo auxiliar também fica fixado no modelo escolhido.

O protocolo textual explicita que ferramentas do Boobot são RPCs executadas pela aplicação, distintas do catálogo nativo. Inferência real com `opencode/big-pickle`: `group_members` → `propose_boos` → uma aprovação → Boo permanente `Íris QA` persistido → resposta final confirmada. Teste aprovado em 169,72 s em perfil temporário, sem escrita/computador habilitados no Boo. Log: `%TEMP%/boobot-free-real4.log`. Isso certifica esse fluxo nesse modelo; não todos os gratuitos ou melhoria de latência. A recusa anterior de `beam-free` não demonstra ausência de modelos gratuitos disponíveis.

Referências: [modelos Console](https://opencode.ai/v2/docs/console/models/), [Go](https://opencode.ai/v2/docs/console/go/) e [relato upstream da recusa com ferramentas removidas](https://github.com/anomalyco/opencode/issues/50627).

Verificação da política final: CLI real com servidor controlado passou nos dois casos, criação com aprovação (86,66 s) e tentativa deliberada de shell nativo (29,95 s). O shell foi oferecido pelo catálogo, recusado com `auto-rejecting`, sem criar o arquivo sentinela ou Boo, sem aprovação interna e com execução encerrada como falha. Log: `%TEMP%/boobot-free-security4.log`. O classificador de requisições auxiliares do teste foi corrigido: textos de ferramentas que mencionam geração de título não são pedidos reais de título. Mais 39 testes focados e `npm run typecheck` passaram.

## Ferramentas dos Boos em 20/10/2026

Foi reproduzida a causa de um Chief com Gemini apresentar planos sem criar Boos: `HeadlessCliRuntime.thread` descartava as ferramentas recebidas e o prompt limitava a execução a texto. Isso afetava Antigravity e OpenCode. Agora ambos recebem o preâmbulo compartilhado `buildAgentSystemPrompt`, as descrições e os esquemas das ferramentas oferecidas por `AppService.tools`. Codex, Claude e Pi já recebiam esse contrato.

No Antigravity, `--json-schema` produz uma resposta estruturada; o OpenCode devolve o mesmo envelope JSON dentro dos eventos de texto. O adaptador valida o envelope e o nome contra a lista de ferramentas daquela sessão e emite `item/tool/call`. Não executa texto livre como comando. A chamada passa por `AppService.callTool`, com as permissões existentes, aprovação explícita para criação e retorno real ao modelo. O Chief não recebe privilégios adicionais por escolher outro provedor. O OpenCode conserva provedores definidos em `OPENCODE_CONFIG_CONTENT`, substituindo a política de ferramentas nativas pelo bloqueio do adaptador.

Negação, cancelamento e limite de execução são preservados. Respostas tardias do broker são descartadas. Uma falha ou interrupção do motor também aborta as esperas de aprovação no serviço comum; uma proposta pendente não pode ser aprovada depois da falha para criar um Boo tardiamente. Cada turno admite até 32 chamadas estruturadas. O modelo que não seguir o protocolo recebe um erro explícito, sem considerar uma resposta livre como execução.

Evidências:

- Testes de regressão reproduziram três falhas do adaptador anterior e a aprovação que permanecia pendente após falha do motor; os respectivos casos passaram após as correções.
- Contrato de criação/aprovação e negação parametrizado para Codex, Claude, Pi, OpenCode e Antigravity. Rodada focada final: 55 testes aprovados em cinco arquivos, antes da atualização do texto do seletor.
- Inferência real `gemini-3.8-flash-high`, Chief em banco temporário: chamou `group_members` e `propose_boos`, aguardou uma aprovação, persistiu o Boo permanente `Íris QA` com escrita e computador desabilitados e concluiu confirmando o resultado. Caso aprovado em 167,76 s. Log: `%TEMP%/boobot-tools-real4.log` (o arquivo também registra o caso OpenCode remoto que falhou).
- CLI OpenCode real, servidor de modelo local controlado: três requisições de modelo transportaram consulta, proposta e resposta final; uma aprovação criou e persistiu `Íris QA`. Caso aprovado em 89,86 s. Log: `%TEMP%/boobot-tools-transport2.log`. Esse caso verifica o transporte, não a inteligência ou autenticação de um modelo remoto.
- Modelos remotos OpenCode não foram certificados: `opencode/beam-free` foi recusado pelo serviço com restrição do plano gratuito; `9router/minimax/MiniMax-M2.7` falhou por falta de conexão à API configurada em `http://127.0.0.1:20128`. Nenhuma credencial ou configuração global foi alterada para contornar essas falhas.

As durações acima incluem inicialização das CLIs e múltiplas rodadas. Não foi demonstrada melhora de latência. Estes testes não certificam todos os modelos do catálogo nem sandbox completo das ferramentas nativas do CLI. As ferramentas do Boobot continuam sendo autorizadas pelo serviço comum. Não foi gerado instalador novo.

Conferência final: 55 testes de contrato/runtime, 16 de ciclo de execução/confiabilidade e 1 do texto do seletor aprovados (72 testes locais, em oito arquivos). Tipos e build do processo principal aprovados; o build final levou 18,67 s. O renderer teve somente alteração de texto do seletor, coberta pelo teste e pelo desenvolvimento com Vite; não foi produzido um novo build completo ou instalador nesta correção. A instância normal de desenvolvimento foi reiniciada depois de conferir que não havia execuções ativas.

Para repetir as integrações opt-in, use `POLITRON_RUN_CLI_TOOL_INTEGRATION=1` com `headless-cli.integration.test.ts`; `POLITRON_OPENCODE_TEST_MODEL` precisa indicar um modelo OpenCode configurado e acessível. O transporte controlado usa `POLITRON_RUN_CLI_TRANSPORT_INTEGRATION=1` com `opencode-tools.integration.test.ts`. Todos os cadastros são feitos em diretórios temporários.

## Comparação com Paseo e portabilidade em 20/10/2026

O resolvedor passou a tentar todas as instalações retornadas pelo PATH, em vez de parar na primeira quando ela está quebrada. Nos sistemas POSIX, a enumeração usa `which -a`. O Codex recebe o caminho detectado antes de iniciar o app-server, preservando sessões que já estejam abertas e a configuração explícita `POLITRON_CODEX_BINARY`.

OpenCode agora consulta `models --pure` na CLI detectada. Isso respeita a configuração efetiva da própria CLI, inclusive `OPENCODE_CONFIG`, e não depende exclusivamente de `~/.config/opencode/opencode.json`. O catálogo retornado é a prova de disponibilidade, mesmo se `--version` falhar. A consulta tem limite de 25 segundos e o inventário aguarda até 30 segundos; abrir o seletor continua usando o cache, sem nova execução. `catalogVersion: 7` substitui uma vez o cache anterior.

Na máquina Windows, o Electron compilado em perfil isolado retornou Codex 7, Claude 11, Antigravity 6, OpenCode 1045 e Pi 565 modelos. A interface selecionou e persistiu modelos de OpenCode, Pi e Antigravity; o backend reconheceu os mesmos IDs. Rascunho preservado, zero mensagens/execuções e zero erros do renderer. Relatório/capturas: `%TEMP%/politron-model-selector-check/resume-20261020-rUqF5M/`. A janela normal foi reiniciada e seu inventário versão 7 também registrou os cinco provedores habilitados.

Uma consulta real adicional do OpenCode, em outra pasta com espaços e acentos e com `OPENCODE_CONFIG` apontando para um arquivo temporário, encontrou o modelo customizado `openai/politron-portabilidade`, com saída 0 em 11,15 segundos. Não foi enviada inferência. Isso verifica esses cenários no Windows; não certifica todos os sistemas, gerenciadores de instalação ou autenticação de cada modelo.

Rodada final: 32 testes de catálogo/runtime aprovados (4 arquivos), tipos aprovados e build do processo principal aprovado em 19,62 s. A rodada anterior passou 28 testes, incluindo criação de sessões headless sem inferência. Após o ajuste para repassar o executável detectado ao Codex, a seleção foi repetida com sucesso no Electron; relatório final em `%TEMP%/politron-model-selector-check/resume-20261020-6ubaFC/`, novamente sem mensagens, execuções ou erros do renderer. O renderer não foi alterado nesta continuação; seu build completo já havia passado na rodada anterior. Nenhum novo instalador foi gerado.

Comparação de referência: [resolução de executáveis do Paseo](https://github.com/getpaseo/paseo/blob/main/packages/server/src/executable-resolution/executable-resolution.ts), que enumera candidatos e não trata toda falha de `--version` como ausência. A análise do tamanho dos pacotes está em [Tamanho do instalador Windows](installer-size.md).

## Conferência em 20/10/2026

Foi concluída a correção do launcher Windows com `cross-spawn`, preservando os argumentos dos shims npm. Os modelos configurados agora mantêm o provedor no ID enviado ao CLI; os rótulos e erros do backend também distinguem os cinco runtimes.

A conferência inicial no Electron reproduziu o bloqueio do Pi: o RPC retornava 565 modelos, mas a falha de `--version` fazia `executable` ficar falso. A disponibilidade passou a considerar a resposta válida do runtime. `catalogVersion: 6` força uma atualização dos caches anteriores sem alterar dados de conversas.

Evidências desta rodada:

- 60 testes focados aprovados, nenhum reprovado ou ignorado; tipos aprovados.
- Build completo aprovado; após o último ajuste exclusivo do backend, tipos e build do processo principal aprovados novamente, preservando renderer/preload já compilados.
- Electron compilado em perfil isolado: Codex 7, Claude 11, Antigravity 6, OpenCode 558 e Pi 565 modelos, todos com seleção habilitada.
- Pela interface, foram escolhidos `opencode:9router/oc/deepseek-v4-flash-free`, `pi:minimax/MiniMax-M2.7` e `antigravity:gemini-3.8-flash-high`. Os três valores foram persistidos e encontrados nos catálogos do backend, com o rascunho preservado e os menus fechando ao escolher.
- Nenhuma mensagem ou execução foi criada; nenhum erro no renderer. A instância isolada foi encerrada. Não houve inferência nem comprovação de autenticação de cada modelo.

Relatório e capturas: `%TEMP%/politron-model-selector-check/resume-20261020-M2gWNr/`. OpenCode e Antigravity continuam limitados a conversa por texto; esta rodada não certifica edição de arquivos por esses CLIs.

## Inventário persistente de CLIs (continuação)

O detector consulta Codex, Claude Code, OpenCode e Pi. O resultado é salvo em `provider-inventory.json` dentro de `app.getPath('userData')` e utilizado pelas telas sem executar novamente comandos ao abrir as configurações. Na primeira execução sem cache ele realiza a detecção; depois, somente o botão **Atualizar detecção** dispara nova varredura. A UI recebe o novo inventário por evento IPC e a seleção do composer utiliza IDs com prefixo do provedor, evitando colisões entre nomes iguais.

Há três estados diferentes: binário localizado, comando operacional e catálogo disponível para um adaptador do aplicativo. Codex e Claude têm ferramentas integradas; Pi usa RPC com a ponte de ferramentas do Boobot. OpenCode e Antigravity encaminham chamadas estruturadas ao mesmo broker de ferramentas e aprovações do Boobot. Claude reutiliza o login do CLI quando não existe chave própria configurada no aplicativo. OpenCode consulta `models --pure`; Pi e Antigravity também consultam os CLIs. Catálogo disponível não comprova autenticação para cada modelo. Todos têm entrada própria para navegação; modelos ficam desabilitados se o CLI não estiver operacional.

Codex consulta `model/list`, percorre as páginas e preserva os níveis de esforço informados pelo servidor. Claude consulta `supportedModels()` no executável detectado, usando um fluxo de entrada sem mensagens, sem persistência de sessão, hooks ou MCPs do usuário. A consulta de um provedor tem prazo e sua falha não esconde os demais. Listar modelos não comprova uma inferência bem-sucedida nem envia um prompt de teste.

O inventário atual usa `catalogVersion: 7`: caches anteriores são atualizados uma vez para consultar também os modelos efetivos do OpenCode e incorporar a disponibilidade comprovada pelo runtime. Depois disso, a atualização continua explícita. Uma resposta válida do catálogo RPC/CLI mantém o provedor operacional mesmo se o comando auxiliar `--version` falhar; isso evita desabilitar o Pi quando ele já respondeu com seus modelos. No OpenCode, o ID inclui a chave do provedor configurado antes do ID do modelo, inclusive quando esse ID já contém barras; a mesma qualificação é aplicada ao catálogo local do Pi. O formato segue a [documentação oficial de modelos do OpenCode](https://opencode.ai/docs/models/). O seletor combina `Popover` e `Command` shadcn na base Radix já adotada; o esforço mantém seu menu separado. O envio conserva IDs com prefixo e rejeita esforço incompatível com o catálogo.

Referências: [descoberta Claude no Paseo](https://github.com/getpaseo/paseo/blob/be0378ce634da5253754a20351f0b267683649c5/packages/server/src/server/agent/providers/claude/model-discovery.ts) e [Model Selector shadcn/Radix](https://ui.shadcn.com/docs/ai-elements/radix/model-selector). Usar a variante Radix preserva os componentes e os temas atuais.

Uma tentativa anterior identificou falha no executável Windows do OpenCode; a instalação atual responde com a versão 1.18.35. O launcher compartilhado resolve shims npm com `cross-spawn` e executáveis nativos diretamente. Ele é utilizado na sondagem de versões, no catálogo Antigravity e na inicialização do Codex, preservando os argumentos. A raiz do seletor mostra somente as CLIs; os modelos são renderizados ao entrar no provedor.

## Navegação por CLI em 18/10/2026

A raiz apresenta **Codex, Claude, Antigravity, OpenCode e Pi**, nessa ordem, além da opção de herdar o modelo do agente. Entrar em uma CLI abre seus modelos no mesmo popup, sem modificar a seleção. O cabeçalho oferece **Voltar**; a busca filtra por nome ou ID. Escape dentro de uma CLI volta à raiz; na raiz, fecha o popup. Fechar ou trocar de conversa limpa a navegação e a busca. Somente escolher um modelo habilitado altera a seleção e fecha o popup.

Os catálogos completos de OpenCode/Pi substituem a antiga linha resumida de status. Antigravity apresenta o diagnóstico quando não há catálogo; CLI ausente também continua visível com esse estado. IDs duplicados dentro da mesma CLI são consolidados para evitar opções ambíguas: o inventário atual tem 558 registros OpenCode e 554 IDs distintos. A seleção permanece limitada aos provedores que podem responder no Politron.

Referências da composição: [Command](https://ui.shadcn.com/docs/components/radix/command), [Popover](https://ui.shadcn.com/docs/components/radix/popover) e a navegação `all`/`provider` do [Model Browser do Paseo](https://github.com/getpaseo/paseo/blob/be0378ce634da5253754a20351f0b267683649c5/packages/app/src/components/model-browser.tsx). Os componentes novos foram adaptados à base React 18 existente, sem substituir o Dialog do aplicativo.

Typecheck e build aprovados nesta rodada; as asserções existentes afetadas pela navegação foram atualizadas, sem acrescentar ou executar testes. O Electron em desenvolvimento recebeu as alterações pelo recarregamento do Vite. As capturas e os 57 testes abaixo pertencem à interface anterior, com grupos na lista única; não certificam a nova navegação.

## Verificação anterior em 18/10/2026

- Suíte focada: 57 testes aprovados, nenhum reprovado e um smoke condicional ignorado. Inclui leitura JSONC, falha independente, cache, paginação, capacidades, resolução do Claude após reinício, composer e editor.
- `npm run typecheck` e `npm run build` passaram. A revisão estática independente terminou sem achados pendentes após corrigir a seleção de shims do Claude no Windows.
- Electron compilado, em perfil temporário isolado: 7 modelos Codex e 11 Claude consultados dos runtimes; 558 OpenCode e 429 Pi lidos da configuração; Antigravity encontrado sem catálogo. Não foi enviado prompt de inferência.
- Pela interface: criada conversa direta, preenchido rascunho, selecionado Codex, conferidos os cinco esforços do catálogo, escolhido Máximo e trocado para Haiku. Os menus fecharam ao selecionar; Haiku ocultou o esforço; rascunho preservado. Mensagens e execuções permaneceram em zero; nenhum `pageerror`.
- O editor filtra os esforços pelo modelo. O envio também normaliza esforços herdados do perfil usando o inventário em cache, sem alterar o perfil salvo nem iniciar nova varredura.

Capturas e relatório dessa verificação ficam fora do repositório, em `%LOCALAPPDATA%/PolitronToolkitSetup/model-selector-qa/`. Esta evidência cobre catálogo e seleção; não certifica inferência em cada modelo, qualidade de voz ou desempenho geral.

## Continuação em 19/10/2026 — Pi e Antigravity

- O backend passou a usar PiRuntime com protocolo RPC e flags de isolamento para desabilitar ferramentas nativas, extensões, skills e arquivos de contexto do projeto.
- A única extensão carregada usa a ponte local autenticada por token; inicialização confirmada por POST /ready sem interferir no stdout RPC.
- Os catálogos de Pi e Antigravity são consultados de seus comandos no refresh do inventário. Pi habilitado somente com catálogo RPC operacional. Antigravity mostra os modelos para consulta, mas não libera execução por ainda exigir um mecanismo seguro de permissões.
- O seletor shadcn usa página inicial por CLI, busca e Voltar; editor de agentes também oferece Pi.
- Smoke real opcional POLITRON_PI_LIVE_SMOKE=1: dois testes de catálogo e sessão passaram, sem enviar prompts. Pendente teste real de resposta, interrupção, ferramentas com aprovação e autenticação individual.
- OpenCode permanece pendente de adaptador de execução seguro. Catálogo de configuração não comprova acesso aos modelos.

## Continuação: seleção OpenCode e Antigravity

Ambos têm adaptação de conversas por texto em main/v9/headless-cli.ts. O cache de provedores
é invalidado uma vez (catalogVersion 4), preservando a política de não redetectar ao abrir menus.
OpenCode inicia seu executável nativo com --pure, agente interno politron-safe e permissões
negadas globalmente e por agente por meio de OPENCODE_CONFIG_CONTENT. Antigravity inicia
headless em modo plan, com --sandbox, slash commands desativados e diretório privado;
não utiliza --dangerously-skip-permissions. Esses adaptadores enviam eventos de texto e
encerramento no formato do WorkspaceService, admitem interrupção, e mantêm um histórico
resumido por sessão em memória; não expõem ferramentas do Politron.

IMPORTANTE: a experiência atual é de conversa, não um runtime de agente completo.
O catálogo pode incluir modelos sem credenciais; o teste de geração só pode confirmar isso
ao executar uma inferência com a conta do usuário. O Antigravity continua respeitando
configurações globais do CLI, então modo plan/sandbox não representa isolamento forte
contra qualquer configuração futura que amplie permissões. A implementação ACP,
gerenciamento de aprovações por ferramenta e retomada persistente do CLI são trabalhos futuros.
Os testes locais de adaptador não enviam prompts, não usam créditos e verificam resolução
de executáveis e interpretação de eventos.
