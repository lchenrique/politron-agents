# DSH fase 4: modais e menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Cada item usa checkbox para acompanhar o progresso.

**Goal:** Aplicar os modais e menus DSH já portados às superfícies existentes do Politron sem mudar suas ações ou regras.

**Architecture:** Usar `Modal`, `Menu`, `MenuSurface` e `MenuGroup` em cada fluxo que já usa diálogos, popovers ou menus. Fazer a migração por grupos de responsabilidade e manter os componentes compartilhados de outras áreas intactos.

**Tech Stack:** React 19, TypeScript, CSS Modules, Electron, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-dsh-ui-referencia.md`, seções 1.6, 1.9, 3.3 e checklist 63–64.

## Global Constraints

- Preservar contratos Electron/IPC, fluxo de navegação, textos, permissões e resultado funcional de cada ação.
- Usar os componentes de `apps/desktop/src/renderer/src/components/dsh/`; não adicionar dependências.
- Menus DSH usam `blur(40px) saturate(150%)`, raio 16 px, itens de 34 px com texto 13/20 e raio 12 px, separadores de 0,5 px.
- Foco, teclado, leitor de tela, camadas e fechamento devem continuar acessíveis nos temas claro e escuro.
- Desligar movimento com `prefers-reduced-motion: reduce`; manter texto PT-BR com acentuação.

## Review Focus

- Abrir menu perto das bordas e em janela estreita: reposicionar sem cortar itens ou sair da janela.
- Escape, clique externo e seleção de item: fechar a camada correta e restaurar foco ao acionador.
- Diálogos empilhados e confirmação destrutiva: não deixar fechar ou confirmar a camada errada.
- Fluxos PWA e desktop: manter as restrições existentes para navegador, terminal, voz e edição.
- Tema escuro e movimento reduzido: manter contraste, foco visível e estado final sem transição.

## Arquivos

- Componentes DSH existentes a reutilizar: `apps/desktop/src/renderer/src/components/dsh/Modal.tsx`, `Menu.tsx`, `MenuSurface.tsx`, `MenuGroup.tsx` e respectivos módulos CSS.
- Migrar modais em `features/app/SettingsPage.tsx`, `features/hosts/RemoteFolderDialog.tsx`, `features/sidebar/GroupDialog.tsx`, `features/sidebar/Sidebar.tsx`, `features/voice/VoiceCall.tsx` e `features/work/mission-ui.tsx`. Preservar `AgentDetails.tsx`: ele é um painel lateral não modal (`Sheet modal={false}`).
- Migrar menus e popovers em `features/chat/ChatHeader.tsx`, `features/composer/ModelSelector.tsx`, `features/hosts/HostSelector.tsx`, `features/panels/DockWorkspace.tsx`, `features/sidebar/ProjectGroupSection.tsx` e `features/sidebar/Sidebar.tsx`.
- Atualizar ou criar testes adjacentes; já existem `features/app/SettingsPage.test.tsx`, `features/chat/ChatHeader.test.tsx`, `features/hosts/HostSelector.test.tsx`, `features/panels/DockWorkspace.test.tsx`, `features/sidebar/Sidebar.test.tsx`, `features/voice/VoiceCall.test.tsx`, `features/work/mission-ui.test.tsx` e `components/dsh/dsh-primitives.test.tsx`. Criar testes para `RemoteFolderDialog.tsx` e `GroupDialog.tsx` se ainda não existirem.

### Task 1: Cobrir e migrar modais

- [x] Adicionar testes para foco inicial/restaurado, Escape, clique externo e prevenção de fechamento em operações sensíveis.
- [x] Rodar `npx vitest run` nos testes focados abaixo; confirmar as falhas esperadas. `npm test` executa `pretest`, que reconstrói a PWA antes de cada ciclo. A suíte oficial completa fica para a verificação transversal.
- [x] Migrar os seis fluxos de modal listados acima ao `Modal` DSH, preservando os callbacks e o conteúdo atual.
- [x] Rodar os testes de modal afetados e confirmar que abertura, fechamento, validação e confirmação continuam iguais.
- [x] Commit: `feat: apply DSH modal surfaces`.

### Task 2: Cobrir e migrar menus e popovers

- [ ] Adicionar testes de teclado, seleção, posicionamento e foco aos fluxos listados.
- [ ] Rodar `npx vitest run` nos testes focados abaixo; confirmar as falhas esperadas. `npm test` executa `pretest`, que reconstrói a PWA antes de cada ciclo. A suíte oficial completa fica para a verificação transversal.
- [ ] Migrar os seis fluxos de menu/popover para `Menu`, `MenuSurface` e `MenuGroup`, mantendo comandos, atalhos e condicionais de permissão.
- [ ] Rodar os testes de menu afetados e os testes dos primitivos DSH.
- [ ] Commit: `feat: apply DSH menus across the app`.

### Task 3: Verificação transversal

- [ ] Rodar `npm run typecheck`, `npm run lint` e os testes afetados.
- [ ] Conferir visualmente claro/escuro, janela estreita, camadas e movimento reduzido em perfil de desenvolvimento isolado.
- [ ] Atualizar `ESTRATEGIA_POLITRON.md` com comandos, resultados e limitações reais.
- [ ] Commit: `docs: record DSH modal and menu evidence`.
