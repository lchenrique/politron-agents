# DSH fase 5: cabeçalho, estado vazio e agentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Cada item usa checkbox para acompanhar o progresso.

**Goal:** Fechar a adaptação do cabeçalho e do estado vazio do chat e acrescentar uma visão opcional dos agentes durante delegações.

**Architecture:** Ajustar a superfície de chat existente aos valores DSH, mantendo os Boos como identidade visual. Adicionar uma aba de agentes no dock que deriva as delegações e seus estados dos dados já presentes no snapshot; ela complementa a transcrição e não substitui conversas individuais, em grupo ou o composer.

**Tech Stack:** React 19, TypeScript, CSS Modules, Electron, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-dsh-ui-referencia.md`, seções 2.2–2.4, 4.18, 6 e checklist 47, 54, 62 e 64.

## Global Constraints

- A conversa direta, conversas em grupo, envio, menções, fila, steering e composer mantêm seus comportamentos e controles atuais.
- Não criar missão, cartão ou tarefa de board a partir de mensagens comuns; a aba de agentes é uma visualização complementar de delegações existentes.
- Usar avatar e nome do Boo conforme a seção 6; não remover identidade dos participantes nem importar marca/logotipo do DSH.
- Aba do painel direito tem 28 px de altura e largura entre 80 px e 170 px; sua transição usa 300 ms e respeita `prefers-reduced-motion`.
- Estado vazio usa título central 26/32, linha de workspace e composer existente; sem sugestões de prompt.
- Não adicionar chamadas IPC nem dependências se os dados de mensagens, conversas e runs do snapshot forem suficientes.

## Review Focus

- Sem workspace ou conversa: estado vazio continua oferecendo os caminhos existentes para escolher workspace/criar conversa.
- Conversa em grupo ou Boo arquivado: o cabeçalho identifica corretamente participantes e ações permitidas.
- Delegações paralelas, encadeadas e falhas: cada Boo e status aparecem ligados à conversa certa, sem duplicar registros.
- Sem delegação ativa ou com dados antigos sem metadados estruturados: painel vazio ou resumo legado não quebra o chat.
- Alternar para PWA/móvel e redimensionar o dock: abas e ações continuam alcançáveis e não expõem recursos desktop.

## Arquivos

- Cabeçalho e estado vazio: `apps/desktop/src/renderer/src/components/ide/TitleBar.tsx`, `apps/desktop/src/renderer/src/features/chat/ChatHeader.tsx`, `apps/desktop/src/renderer/src/features/chat/MessageList.tsx`, `apps/desktop/src/renderer/src/features/app/AppShell.tsx`; criar `apps/desktop/src/renderer/src/features/chat/EmptyHero.tsx` se isso permitir preservar a responsabilidade de cada componente.
- Visão de delegação: `apps/desktop/src/renderer/src/features/panels/dock-layout.ts`, `apps/desktop/src/renderer/src/features/panels/DockWorkspace.tsx`, `apps/desktop/src/renderer/src/features/app/AppShell.tsx`; criar `apps/desktop/src/renderer/src/features/panels/DelegationOverview.tsx` com testes próprios.
- Reutilizar `apps/desktop/src/renderer/src/features/chat/DelegationCard.tsx`, `apps/desktop/src/shared/v9.ts` (`Message`, `Conversation`, `Run`) e o snapshot existente; só ampliar tipos se os testes revelarem que os dados não distinguem corretamente a árvore.
- Atualizar `apps/desktop/src/renderer/src/components/ide/TitleBar.test.tsx`, `apps/desktop/src/renderer/src/features/chat/ChatHeader.test.tsx`, `apps/desktop/src/renderer/src/features/chat/MessageList.test.tsx`, `apps/desktop/src/renderer/src/features/panels/dock-layout.test.ts` e `apps/desktop/src/renderer/src/features/panels/DockWorkspace.test.tsx`; criar `apps/desktop/src/renderer/src/features/panels/DelegationOverview.test.tsx`.

### Task 1: Cabeçalho e estado vazio

- [x] Adicionar testes para a barra de título Windows, títulos individuais/grupo, avatar do Boo, conversa vazia, workspace ausente e composer preservado.
- [x] Rodar os testes focados antes da implementação e confirmar as falhas esperadas; depois, os testes passaram.
- [x] Ajustar cabeçalho e hero às seções DSH, mantendo os callbacks e o layout de chat existentes.
- [x] Rodar os testes focados e verificar claro/escuro, janela reduzida a 900×700, foco de teclado e suporte a movimento reduzido nas regras CSS/MotionConfig; a preferência do sistema não foi forçada.
- [x] Commit: `feat: finish DSH chat header and empty state` (`98085f2`).

### Task 2: Visão opcional dos agentes delegados

- [x] Adicionar testes para nenhuma delegação, várias em paralelo, árvore encadeada, sucesso, espera, falha e abrir conversa relacionada.
- [x] Rodar os testes focados antes da implementação e confirmar as falhas esperadas; depois, os testes passaram.
- [x] Implementar `DelegationOverview` com uma aba `agentes` no dock, derivando status de mensagens e runs do snapshot e preservando navegação para cada conversa.
- [x] Rodar testes do layout, do painel e do `DelegationCard`; confirmar persistência/migração do layout e ausência de alterações no composer.
- [x] Commit: `feat: add delegated agents dock view` (`df0a3ca`).

### Task 3: Verificação transversal

- [x] Rodar `npm run typecheck` e testes focados dos fluxos alterados.
- [x] Conferir visualmente título, estado vazio e delegações em perfil isolado, temas claro/escuro e janela reduzida a 900×700. O PWA compilou, e seus controles são cobertos em modo browser; a visualização pareada do painel não foi feita porque requer gerar e usar um código temporário de acesso.
- [x] Atualizar `ESTRATEGIA_POLITRON.md` com evidência, resultados e limites observados.
- [x] Registrar lint dos arquivos alterados: 0 erros e 4 avisos.
- [x] Commit: `docs: record DSH phase five evidence`.
