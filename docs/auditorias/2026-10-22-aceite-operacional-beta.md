# Boobot — aceite operacional da beta (22/10/2026)

## Escopo e ponto de recuperação
- Repositório: `D:\projetos pessoais\politron`, branch `fix/agent-stability-2026-10-21`.
- Checkpoint local: commit `b1a4b98`, tag `beta-preflight-2026-10-22`.
- Consolidados 188 arquivos no checkpoint; não houve push.
- Artefato `apps/desktop/dist-release-44282a0/` e `teste.md` foram excluídos intencionalmente do commit e permaneceram no disco.
- Perfis de teste ficam em diretórios temporários separados do perfil real. Nenhuma credencial do usuário foi copiada para os relatórios.

## Aceites executados

| Caso | Resultado | Evidência |
|---|---|---|
| TypeScript | PASSOU | `npm run typecheck`, 22/10 |
| Build Electron | PASSOU | `npm run build`, 22/10 |
| Testes de permissões, delegações, editor | 33 PASSARAM | `approval-policy.test.ts`, `queue-delegation.test.ts`, `guarded-write.test.ts`, `DockWorkspace.test.tsx`, `SettingsPage.test.tsx` |
| História, estado e mensagens no Electron real | PASSOU | `npm run test:agent-stability:electron`; 80 mensagens, âncora estável, exclusão de workspace, composer editável |
| Sessão, escrita guardada, filas | 21 PASSARAM | `session-continuity.test.ts`, `queue-delegation.test.ts`, `guarded-write.test.ts` |
| Codex real (API + broker + escrita + teste) | PASSOU | modelo `gpt-6-astra`, aprovou `workspace_write` e `workspace_run_command`, alterou somente `counter.js`, executou `node test.cjs`, resultado `TESTE-RUNTIME-OK` |
| OpenCode (CLI real + provedor local controlado) | 2 PASSARAM | transporte `group_members` + `propose_boos`; rejeição de shell nativo |
| Pi com MiniMax M2.7 | BLOQUEADO | resposta do provedor `402 insufficient_balance_error` |
| Claude CLI | BLOQUEADO | `OAuth session expired and could not be refreshed` |
| OpenCode gratuito com inferência real | BLOQUEADO | modelo `opencode/beam-free`; upstream responde `Invalid value for 'tools': maximum number of items is 128` mesmo após desabilitar ferramentas nativas no agente seguro |

## O que ficou comprovado
1. Uma tarefa real de código **passou de ponta a ponta** via Boobot com Codex: leitura → escrita aprovada → comando aprovado → execução do teste → evidência de arquivo modificado → resposta.
2. O transporte e a política de aprovação do OpenCode funcionaram com modelo local controlado; isso não prova capacidade de inferência com o serviço externo.
3. O Electron persiste histórico e suporta reinício da UI; os testes unitários cobrem continuidade de sessões, mas **não** certificam recuperação de uma tarefa real interrompida por desligamento do computador.
4. O Bypass de terminal continua **sem sandbox de sistema operacional**. Não é seguro configurá-lo como padrão em projetos sensíveis.

## Uso recomendado desta beta
- Iniciar: `cd "D:\projetos pessoais\politron\apps\desktop"` e `npm run dev`.
- No seletor Codex, usar modelo **GPT-6 Astra** (identificador do runtime `gpt-6-astra`) para os primeiros testes; o catálogo marcou `gpt-6.1-sol` como padrão, mas essa opção foi recusada pela conta ChatGPT no aceite.
- Usar pasta Git de teste e aprovação de escrita/terminal. Começar com tarefas pequenas; revisar diffs e executar testes locais.
- Para voltar ao checkpoint de código, consultar `git show beta-preflight-2026-10-22`. Não fazer reset destrutivo sobre trabalhos novos.
- Renovar login do Claude no próprio CLI e configurar um modelo com saldo para o Pi antes de voltar a testá-los.
- OpenCode grátis: investigar redução da lista de ferramentas efetivamente enviada ao provedor e medir novamente. Ajuste local `tools: {'*': false}` no agente seguro foi verificado por testes unitários, mas **não resolveu** o limite upstream.

## Pendências objetivas para uso sem supervisão
1. Ambiente isolado para execução de shell + Bypass, com sonda que de fato consiga executar internamente e bloqueie escrita externa.
2. E2E real de cancelamento/retomada e de recuperação após crash.
3. Segundo motor com inferência externa aprovado em tarefa de código (Pi, Claude ou OpenCode).
4. Revisão de lint, credenciais e release antes de disponibilizar a terceiros.

Arquivos de evidência temporária desta sessão:
- Electron: `C:\Users\lchen\AppData\Local\Temp\boobot-agent-stability-qCfupu`
- Codex aprovado: `C:\Users\lchen\AppData\Local\Temp\boobot-tools-codex-w08395`
- Pi bloqueado: `C:\Users\lchen\AppData\Local\Temp\boobot-tools-pi-KFWoLe`
- Claude bloqueado: `C:\Users\lchen\AppData\Local\Temp\boobot-tools-claude-zA8c0q`
- OpenCode externo bloqueado: `C:\Users\lchen\AppData\Local\Temp\boobot-tools-opencode-r9Cr7v`

**Decisão:** beta supervisionada com Codex aprovada. Execução autônoma sem supervisão e segundo motor não certificados.
