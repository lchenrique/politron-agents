# @boobot/board (piloto)

> **Desativado em 03/11/2026.** O quadro de tarefas nativo do Agent Team do DSH (`team_task_*`, com dono por agente) cobre o mesmo papel, e o cadastro de Boos mudou para `plugins/boobot-boos`. Este plugin fica no repositório como referência; para reativar: `plugin_manager set_bundle @boobot/board enabled=true`.

Board do Boobot como plugin do DeepSeek Harness: equipes, cartões e tools para o agente.

| Arquivo | Papel |
|---|---|
| `store.js` | Regras puras (equipes, cartões, transições). Testado com `node --test store.test.js`. |
| `index.js` | Host: tools `board_*`, persistência em JSON e comando `/board`. |
| `client.js` | Web UI: painel "Board" na sidebar (colunas e cartões, tokens `--dsw-alias-*`). |

## Instalar

No DSH, peça ao agente: "instale o bundle em `<caminho absoluto>\plugins\boobot-board`" (usa `plugin_manager install_bundle`).
Não escreva `package.json`/`cordis.patch.yml` do perfil à mão.

Config opcional na linha do patch: `file` (caminho do JSON; padrão `$DSH_PROFILE_DIR/boobot-board.json`) e `agents` (ids dos Boos).

## Estado do piloto

Verificado: lógica pura (5 testes), sintaxe dos três módulos, JSON do manifesto e dos locales.
**Não verificado** (precisa do DSH rodando): carga do bundle, tools no agente, painel na sidebar.

## A confirmar com `cordis_inspect_query` antes de instalar

1. `ctx.commands.register` existe no contexto do plugin e o Client o executa por `ctx.remote.commands.execute('/board')` (sem sessão aberta?). Se não, trocar `load()` em `client.js` por outro ponto de entrada Client-callable.
2. Registro do painel confirmado no painel "Painel": `sidebar.panellist` (`id`, `order`, `label`) e slot `main` por `key`.
3. Lista de Boos: hoje vem de `config.agents`; ler do serviço `agentPresets`.
4. Aprovação do usuário nas tools que criam (`board_team_create`, `board_task_create`): usar `tools/pre-execute` retornando `ask`. Ainda não implementado.
5. Trocar o JSON por `ctx.storageDomain` (`defineDomain`) se o pacote de storage estiver montado no perfil.
