# Detecção de provedores do Politron

## Inventário persistente de CLIs (continuação)

O detector consulta Codex, Claude Code, Antigravity (agy), OpenCode e Pi. O resultado é salvo em `provider-inventory.json` dentro de `app.getPath('userData')` e utilizado pelas telas sem executar novamente comandos ao abrir as configurações. Na primeira execução sem cache ele realiza a detecção; depois, somente o botão **Atualizar detecção** dispara nova varredura. A UI recebe o novo inventário por evento IPC e a seleção do composer utiliza IDs com prefixo do provedor, evitando colisões entre nomes iguais.

Há três estados diferentes: binário localizado, comando operacional e catálogo disponível para um adaptador do Politron. Codex e Claude têm adaptadores de execução; nesta continuação, o Pi ganhou adaptador RPC próprio com isolamento de ferramentas e leitura do catálogo da CLI. Claude reutiliza o login do CLI quando não existe chave própria configurada no aplicativo. OpenCode ainda só disponibiliza catálogo para consulta, sem adaptador de execução. Antigravity consulta o catálogo real do comando agy models, mas permanece indisponível para conversas até existir transporte que respeite as permissões do Politron. Todos têm entrada própria para navegação; os modelos de provedores sem executor podem ser consultados, mas não escolhidos para responder.

Codex consulta `model/list`, percorre as páginas e preserva os níveis de esforço informados pelo servidor. Claude consulta `supportedModels()` no executável detectado, usando um fluxo de entrada sem mensagens, sem persistência de sessão, hooks ou MCPs do usuário. A consulta de um provedor tem prazo e sua falha não esconde os demais. Listar modelos não comprova uma inferência bem-sucedida nem envia um prompt de teste.

O inventário usa `catalogVersion: 4`: caches anteriores são atualizados uma vez para incorporar a nova descoberta e as capacidades dos modelos. Depois disso, a atualização continua explícita. O seletor combina `Popover` e `Command` shadcn na base Radix já adotada; o esforço mantém seu menu separado. O envio conserva IDs com prefixo e rejeita esforço incompatível com o catálogo.

Referências: [descoberta Claude no Paseo](https://github.com/getpaseo/paseo/blob/be0378ce634da5253754a20351f0b267683649c5/packages/server/src/server/agent/providers/claude/model-discovery.ts) e [Model Selector shadcn/Radix](https://ui.shadcn.com/docs/ai-elements/radix/model-selector). Usar a variante Radix preserva os componentes e os temas atuais.

Uma tentativa anterior identificou falha no executável Windows do OpenCode; a sondagem atual de --version respondeu com 1.18.35, mas execução e autenticação ainda não foram verificadas por um adaptador do Politron. A raiz do seletor mostra somente as CLIs; os modelos são renderizados ao entrar no provedor.

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
