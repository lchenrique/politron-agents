# Arquitetura observada

Este documento é um mapa de navegação do código, não uma especificação de funcionalidades futuras. A estratégia vigente e os limites do produto estão em [`../ESTRATEGIA_POLITRON.md`](../ESTRATEGIA_POLITRON.md) e [`../PRODUCT.md`](../PRODUCT.md).

## Aplicação desktop

O projeto executável está em `apps/desktop`. Electron 40 cria janelas e inicializa serviços no processo principal (`src/main/index.ts`). A janela configura isolamento de contexto e desabilita integração Node no renderer. O preload (`src/preload/index.ts`) publica superfícies tipadas como `appAPI`, `realtimeAPI`, `providersAPI` e `skillsAPI`; chamadas chegam ao processo principal por canais IPC. Tipos compartilhados ficam em `src/shared`.

O renderer React está em `src/renderer/src`. A interface usa os APIs do preload para dados e ações. Serviços de domínio V9 ficam em `src/main/v9`; entre eles há workspace, persistência, runtimes, arquivos, voz, detecção de provedores e habilidades. Ao acrescentar uma ação, confira o tipo compartilhado, o preload, o handler, a autorização do chamador e os consumidores da UI.

## Persistência e integrações

`src/main/v9/store.ts` usa `DatabaseSync` de `node:sqlite` e mantém o banco lateral `politron-v9.sqlite`. O snapshot agrega entidades para a interface; o histórico de mensagens tem APIs paginadas próprias. Migrações e limites reais devem ser conferidos no código e na estratégia antes de descrever resultados.

Os adaptadores de runtime preservam integrações existentes. A detecção de CLIs procura Codex, Claude Code e Pi; o OpenCode entra pela API do Console, com chave própria. A descoberta de modelos em arquivos locais está implementada para Pi; o OpenCode consulta o catálogo do Console pela API; Codex e Claude têm escolha no editor de agente. Descoberta do binário, leitura de configuração, credencial, catálogo e execução do runtime são estados diferentes.

Há duas experiências de voz em tempo real: Gemini Live e modo gratuito em cascata, que usa VAD e Piper localmente, com Whisper/Groq ou Parakeet local para transcrição. Isso não equivale à voz dos Pits, com geração local Supertonic/Kokoro e caminhos próprios. Testes com mocks, smoke tests com modelos reais e uso com microfone/provedor são evidências distintas.

## Navegador dos agentes

- **Interno (automático):** `PlatformBrowser.acquireForAgent` (`apps/desktop/src/main/ipc/platform-browser.ts`) emite `platformBrowser:reveal`, o renderer abre a aba Navegador e o compartilhamento com o agente é concedido sem clique. Se o usuário revogar em "Compartilhar com agente", o agente fica bloqueado até um novo compartilhamento. Em disputa, a ferramenta responde "navegador em uso por <agente> em <conversa>".
- **Real (Brave/Chrome, extensão oficial):** o antigo fail-closed foi removido por decisão do usuário em 27/10/2026. A autorização vale por conversa e agente (`v9_meta`, chave `external_browser:<conversa>:<agente>`), é pedida pela tool `external_browser_request` (cartão `alwaysAsk`, que pergunta mesmo em modo bypass) ou pelo botão do painel Navegador, e dura até o usuário revogar. Não há aprovação por chamada: cada `js` encaminhado vira atividade na conversa. O agente passa a ter acesso a sites logados, cookies e dados do navegador.
- **Proxy:** o Politron sobe o `node_repl` oficial (comando lido de `~/.codex/config.toml`, timeout de 600 s) e expõe o servidor MCP próprio `politron_external_browser`. Ele é registrado para agentes Codex e Claude quando a sonda da ponte não acusa problema; o `node_repl` oficial nunca é registrado direto. Sem grant, `js` é recusado citando `external_browser_request`; revogar no meio da execução recusa as chamadas seguintes, mas não cancela uma chamada `js` já em andamento (ela pode durar até 600 s). O cartão de `external_browser_request` só pode ser respondido na janela do desktop: host remoto e PWA recebem erro. Iniciar o `node_repl` tem prazo de 10 s; se falhar, o par conversa:agente fica sem proxy até um novo `external_browser_request`, uma nova autorização pelo painel ou reiniciar o app. Apagar conversa, agente ou workspace encerra o proxy correspondente. Com a ponte quebrada, o proxy não é registrado e `external_browser_status` explica o motivo. Pi, OpenCode e Antigravity usam só o navegador interno.
- Especificação: `docs/superpowers/specs/2026-10-27-navegador-agentes-design.md`.

## Referências de domínio

- [`../ESTRATEGIA_POLITRON.md`](../ESTRATEGIA_POLITRON.md): fonte de verdade da estratégia e do plano.
- [`../ESTRATEGIA_UX_WORKSPACES.md`](../ESTRATEGIA_UX_WORKSPACES.md): modelo de workspace, sessões e navegação.
- [`../PAINEIS_E_ABAS.md`](../PAINEIS_E_ABAS.md): contrato e limitações dos painéis.
- [`../KOKONUTUI_INTEGRACAO.md`](../KOKONUTUI_INTEGRACAO.md): limites de adaptação visual e semântica.
- `docs/arquivo/`: materiais históricos, a consultar somente como contexto.
