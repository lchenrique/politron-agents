# Navegador dos agentes: interno automático e navegador real pela extensão

Data: 27/10/2026. Estado: proposta aguardando aprovação.

## Intenção

O usuário quer que o Boobot (Politron) trate navegador como o Codex: o agente usa o navegador interno do app sem cerimônia e, quando a extensão oficial do navegador está instalada e funcionando, também pode usar o navegador real do usuário (Brave/Chrome), com as sessões já logadas (ex.: Jira).

Hoje nenhum dos dois funciona assim:

- Navegador interno (`PlatformBrowser`, `apps/desktop/src/main/ipc/platform-browser.ts`): o agente só consegue usá-lo se o usuário abrir a aba Navegador, escolher o agente e clicar em "Compartilhar com agente". Teste real em 27/10: sem isso, o agente caiu para a ferramenta web e respondeu "o navegador compartilhado estava indisponível".
- Navegador real: está fail-closed de propósito (`externalBrowserCallViolation()` sempre bloqueia; `EXTERNAL_BROWSER_JS_BLOCKED` sempre entra em `problems`). Motivo registrado: a ferramenta `js` do `node_repl` oficial executa JavaScript arbitrário e CDP cru, então não existe filtro confiável.

## Decisão do usuário sobre risco

O usuário aceitou o mesmo modelo de confiança do Codex: **autorização uma vez por conversa e agente**; depois disso o agente usa o navegador real livremente até o usuário revogar. Não há aprovação por chamada nem filtro de conteúdo. Isso substitui a decisão anterior de fail-closed. A tela de autorização deve deixar claro que o agente terá acesso a sites logados, cookies e dados do navegador.

## Objetivos

1. **Interno automático.** Quando um agente com permissão de navegador (`canShareBrowser(owner)`) chama uma ferramenta `browser_*`, o app abre sozinho a aba Navegador no painel auxiliar, posiciona-a para aquela conversa e concede o compartilhamento para aquele agente sem clique do usuário. O usuário vê a página mudando. O botão "Revogar compartilhamento" continua funcionando.
2. **Navegador real quando disponível.** Se a conversa+agente tiver autorização e a sonda da ponte não encontrar problemas, a ferramenta `js` do `node_repl` oficial é exposta ao agente pelo proxy existente (`ExternalBrowserProxy`), encaminhando chamadas sem filtro e sem aprovação por chamada.
3. **Pedido de autorização pelo próprio agente.** Se o agente precisa do navegador real e não tem autorização, ele pede; aparece um cartão de aprovação na conversa ("Permitir Atlas usar seu navegador real nesta conversa?"). Aprovar grava o mesmo grant que o botão "Autorizar navegador externo" já grava (`v9_meta`, chave `external_browser:<conversa>:<agente>`).
4. **Indisponível sem drama.** Extensão ausente ou quebrada: o agente continua com o navegador interno; o painel e `external_browser_status` mostram o motivo e o que o usuário deve fazer (ex.: "reinstale o plugin Browser pelo Codex").

## Não objetivos

- Reparar a extensão/ponte oficial do Codex nesta máquina (o doc oficial proíbe reparo manual; o usuário reinstala).
- Ligar as flags `browser_use*`/`computer_use` do Codex em `codex.ts`.
- Mudar a política de aprovação das ações no navegador interno (open/click/fill continuam pedindo aprovação como hoje). Chamada minha, ver abaixo.

## Anti-objetivos

- Registrar o `node_repl` oficial direto na thread do agente: sempre passar pelo proxy, para que revogar corte o acesso na hora.
- Grant global ou persistente além de conversa+agente.
- Agente usando o navegador real escondido: o uso deve aparecer na conversa (atividade/ferramenta), e o grant ativo deve ficar visível no painel.
- Quebrar o PWA/remoto: canais novos ficam fora da PWA, como os atuais (`invokeDesktopOnly`).

## Restrições

- Preservar contratos Electron/IPC existentes, dados e a migração de layout `browser` → `web`.
- `PlatformBrowser.grantSharing` exige a view visível e uma URL http(s) carregada; abrir a aba automaticamente precisa respeitar isso (ex.: carregar `about:blank` não serve, `safeWebUrl` rejeita).
- Revogar (botão, apagar conversa/agente, fechar app) fecha o proxy e invalida o compartilhamento, como hoje.
- Hoje o proxy externo só é anexado a agentes de runtime `codex` (`workspace.ts`, `agent.runtime === 'codex'`).

## Escolha do navegador

O agente decide. As descrições das ferramentas orientam: navegador interno por padrão; navegador real só quando a tarefa depende de sessão/login do usuário ou de algo que só existe no navegador dele.

## Runtimes (decisão do usuário)

O navegador real vale para agentes **Codex e Claude**. Codex já recebe o proxy via `mcp_servers`; Claude (`ClaudeRuntime`, Agent SDK) precisa receber o mesmo proxy HTTP como servidor MCP. Pi, OpenCode e Antigravity ficam só com o navegador interno. Confirmar que o `node_repl` oficial lido de `~/.codex/config.toml` sobe como filho do Politron independentemente do runtime do agente (o proxy é do Politron, não do Codex).

## Grant (decisão do usuário)

Uma vez por conversa+agente, gravado como hoje em `v9_meta` e mantido entre reinícios do app enquanto a conversa existir. Apagar a conversa ou o agente, ou clicar em revogar, remove o grant.

## Chamadas minhas (não decididas pelo usuário)

- Ações no navegador interno continuam com aprovação por ação.
- **Revogar o navegador interno**: bloqueia o compartilhamento automático para aquela conversa+agente até o usuário clicar em "Compartilhar com agente" de novo. Esconder o painel ou trocar de aba continua revogando o compartilhamento do momento (como hoje), mas não bloqueia: a próxima chamada `browser_*` reabre a aba e recompartilha.
- **Disputa pelo navegador interno**: só existe uma view. Se outro agente/conversa já está com o compartilhamento e tem execução em andamento, a chamada nova falha com "navegador em uso por <agente> em <conversa>". Sem execução ativa do dono atual, o novo chamador assume (o contexto da view passa para a conversa dele e a aba indica para quem está compartilhada).
- **Navegador vazio**: sem página http(s) carregada, `browser_observe`/`click`/`fill`/`scroll` falham orientando a chamar `browser_open` primeiro. `browser_open` abre a aba, carrega a URL e então compartilha.
- **Autorização no meio da execução**: para agentes Codex/Claude, o proxy fica registrado na thread sempre que a sonda da ponte não acusa problema, mesmo sem grant; sem grant, a ferramenta `js` responde "não autorizado: peça autorização" e nada é encaminhado. O `node_repl` sobe junto com o proxy (é preciso para conhecer o esquema da ferramenta `js`); sozinho ele não acessa nenhuma aba. Assim, aprovar o cartão vale na mesma execução, sem reiniciar a thread. Revogar faz o proxy recusar as chamadas seguintes e encerra o `node_repl`.
- **Sem aprovação por chamada no navegador real**: `authorizeExternalBrowserCall` deixa de pedir aprovação; cada chamada vira registro de atividade na conversa, usando `externalBrowserApprovalPreview` como resumo legível.
- O cartão de autorização do navegador real usa o fluxo `requestApproval` existente, com `alwaysAsk` (pergunta mesmo em modo bypass).

## Deixado para quem construir

- Mecanismo exato para o main pedir ao renderer que abra a aba e aguardar a view ficar visível (evento novo + timeout).
- Nome e formato da ferramenta de pedido de autorização.
- Testes: cobrir auto-compartilhamento, grant via cartão, revogação fechando o proxy, sonda com problema caindo para o interno, e garantir que nada mudou na PWA.
- Atualizar `docs/architecture.md` e notas onde a política fail-closed está descrita.
