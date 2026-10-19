# Arquitetura observada

Este documento é um mapa de navegação do código, não uma especificação de funcionalidades futuras. A estratégia vigente e os limites do produto estão em [`../ESTRATEGIA_POLITRON.md`](../ESTRATEGIA_POLITRON.md) e [`../PRODUCT.md`](../PRODUCT.md).

## Aplicação desktop

O projeto executável está em `apps/desktop`. Electron 40 cria janelas e inicializa serviços no processo principal (`src/main/index.ts`). A janela configura isolamento de contexto e desabilita integração Node no renderer. O preload (`src/preload/index.ts`) publica superfícies tipadas como `appAPI`, `realtimeAPI`, `providersAPI` e `skillsAPI`; chamadas chegam ao processo principal por canais IPC. Tipos compartilhados ficam em `src/shared`.

O renderer React está em `src/renderer/src`. A interface usa os APIs do preload para dados e ações. Serviços de domínio V9 ficam em `src/main/v9`; entre eles há workspace, persistência, runtimes, arquivos, voz, detecção de provedores e habilidades. Ao acrescentar uma ação, confira o tipo compartilhado, o preload, o handler, a autorização do chamador e os consumidores da UI.

## Persistência e integrações

`src/main/v9/store.ts` usa `DatabaseSync` de `node:sqlite` e mantém o banco lateral `politron-v9.sqlite`. O snapshot agrega entidades para a interface; o histórico de mensagens tem APIs paginadas próprias. Migrações e limites reais devem ser conferidos no código e na estratégia antes de descrever resultados.

Os adaptadores de runtime preservam integrações existentes. A detecção de CLIs procura Codex, Claude Code, Antigravity, OpenCode e Pi. A descoberta de modelos em arquivos locais está implementada para Pi e OpenCode; Codex e Claude têm escolha no editor de agente, enquanto Antigravity não possui fonte local de catálogo observada no detector. Descoberta do binário, leitura de configuração, credencial, catálogo e execução do runtime são estados diferentes.

Há duas experiências de voz em tempo real: Gemini Live e modo gratuito em cascata, que usa VAD e Piper localmente, com Whisper/Groq ou Parakeet local para transcrição. Isso não equivale à voz dos Pits, com geração local Supertonic/Kokoro e caminhos próprios. Testes com mocks, smoke tests com modelos reais e uso com microfone/provedor são evidências distintas.

## Referências de domínio

- [`../ESTRATEGIA_POLITRON.md`](../ESTRATEGIA_POLITRON.md): fonte de verdade da estratégia e do plano.
- [`../ESTRATEGIA_UX_WORKSPACES.md`](../ESTRATEGIA_UX_WORKSPACES.md): modelo de workspace, sessões e navegação.
- [`../PAINEIS_E_ABAS.md`](../PAINEIS_E_ABAS.md): contrato e limitações dos painéis.
- [`../KOKONUTUI_INTEGRACAO.md`](../KOKONUTUI_INTEGRACAO.md): limites de adaptação visual e semântica.
- `docs/arquivo/`: materiais históricos, a consultar somente como contexto.
