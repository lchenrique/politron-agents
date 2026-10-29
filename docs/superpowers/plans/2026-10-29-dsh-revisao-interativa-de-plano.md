# DSH: revisão interativa de plano Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Cada item usa checkbox para acompanhar o progresso.

**Goal:** Permitir que o usuário aprove, recuse ou peça mudanças numa proposta de plano, sem executar escrita enquanto o modo plano estiver ativo.

**Architecture:** Reutilizar o registro persistido `Approval` e a pausa do run, acrescentando uma decisão tipada específica para revisão de plano e feedback opcional. Expor essa decisão por IPC local e remoto sob a permissão existente `approvals`; no renderer, uma aprovação pendente ocupa o rodapé no lugar do composer, enquanto o cartão da transcrição mantém o resultado histórico.

**Tech Stack:** React 19, TypeScript, Electron IPC tipado, SQLite V9 existente, CSS Modules, Vitest e Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-dsh-ui-referencia.md`, seção 4.14 e checklist 20/50; `ESTRATEGIA_POLITRON.md`, pendência da fase 3 DSH.

## Global Constraints

- Conversas diretas e em grupo, composer, envio, menções, fila e steering mantêm seus contratos atuais.
- Modo plano continua sem ferramentas de escrita, terminal ou execução de mudanças; aprovar a proposta não inicia a execução.
- `respondApproval(approvalId, approved)` permanece compatível para os demais tipos de aprovação; decisões de plano usam método próprio.
- Pedido de mudanças requer comentário não vazio e deixa registro persistido na aprovação anterior.
- PWA só resolve revisão de plano quando o dispositivo possui a permissão existente `approvals`.
- Não adicionar dependências nem armazenar o plano fora do registro de aprovação já persistido.

## Review Focus

- Cancelar o run durante a revisão marca a aprovação como interrompida e não a deixa acionável.
- Aprovação inválida, duplicada, de outra aprovação ou sem run ativo retorna erro e não muda estado.
- Pedir mudanças sem comentário não encerra a espera; comentário válido volta ao mesmo agente para propor nova versão.
- Aprovar ou recusar restaura a execução e registra a decisão que a transcrição apresenta depois.
- Sem permissão PWA `approvals`, o dispositivo não recebe ações de revisão.

### Task 1: Contrato e ciclo persistido da revisão

- [x] Escrever testes de serviço para aprovação, recusa, pedido de mudanças com comentário, cancelamento e decisões inválidas/duplicadas; confirmar falhas esperadas.
- [x] Adicionar `PlanReviewDecision` e `Approval.details.planReviewDecision`/`planReviewFeedback` em `apps/desktop/src/shared/v9.ts`.
- [x] Implementar espera e resolução tipada em `apps/desktop/src/main/v9/workspace.ts`, conservando o comportamento não interativo de `propose_plan` fora do modo plano.
- [x] Expor `reviewPlan` por `apps/desktop/src/main/v9/ipc.ts`, `apps/desktop/src/main/hosts/rpc.ts`, `apps/desktop/src/main/hosts/pwa-policy.ts`, `apps/desktop/src/preload/index.ts` e `AppAPI`.
- [x] Rodar testes focados de serviço, IPC e política PWA; confirmar aprovação e limites de autorização.
- [x] Commit: `feat: add interactive plan review decisions` (`28a00e5`).

### Task 2: Painel DSH e resultado no chat

- [x] Escrever testes de renderer para as ações da revisão, feedback obrigatório, estado ocupado/erro, resumo e histórico das três decisões.
- [x] Implementar painel no rodapé que substitui o composer somente enquanto uma aprovação `plan` está pendente e o dispositivo pode aprovar.
- [x] Implementar `Ver plano completo`, `Recusar`, `Pedir mudanças` com comentário e `Aprovar`; pedidos de mudanças retornam ao mesmo run para nova proposta.
- [x] Exibir na transcrição a decisão persistida e o comentário sem duplicar controles pendentes.
- [x] Rodar testes do painel, `AgentInteractionCard`, `MessageList`, PWA e composer; verificar que aprovações comuns e o envio não mudaram.
- [x] Commit: `feat: add DSH plan review panel` (`e4d0f58`).

### Task 3: Evidência transversal

- [x] Rodar `npm run typecheck`, ESLint nos arquivos tocados e os testes focados; registrar erros/avisos reais.
- [x] Conferir visualmente o ciclo em perfil isolado, claro/escuro e viewport estreito, sem enviar mensagem de execução.
- [x] Atualizar `ESTRATEGIA_POLITRON.md`, `PRODUCT.md` e este plano com evidência e limites.
- [x] Commit: `docs: record DSH plan review evidence` (`8f0215c`).

### Evidência transversal

Vitest focado: 7 arquivos/66 testes passaram. Suíte completa: 146 arquivos/903 testes passaram e 15 arquivos/21 testes condicionais foram ignorados. `npm run typecheck`, `npm run build` (Electron, preload, renderer e PWA) e `git diff --check` passaram. Build mantém avisos conhecidos de `use client`, sourcemaps, PostCSS e chunks grandes. ESLint em todos os arquivos tocados apontou apenas `no-explicit-any` já existente em `ipc.ts`, `workspace.ts` e `preload/index.ts`, e avisos de tamanho em `workspace.ts` e `AppShell.tsx`; ESLint nos arquivos de UI/teste selecionados passou. Revisão visual em perfil temporário pela galeria DSH confirmou o painel expandido e formulário em tema claro e escuro a 560×600; nenhuma decisão ou mensagem foi enviada. Revisão independente não encontrou achados acionáveis. Inferência real não foi validada. Commits de código: `28a00e5` e `e4d0f58`.
