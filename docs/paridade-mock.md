# Paridade com o mock de referência

Fonte: `design-systems/boobot-mock/boobot_agent_workspace_desktop.html` (270 KB, React UMD + Tailwind CDN,
renderiza com zero erro de console em Chromium headless na viewport 1440×900).

Este documento existe porque a primeira varredura por `grep` produziu **falsos negativos**: "barra de revisão",
"arrastar aba" e "Preview Web" foram dados como ausentes por causa de strings de busca erradas. Antes de criar
qualquer peça, conferir o componente de verdade.

## Como verificar

- O mock roda em qualquer navegador: `node .tmp-esbuild/render-mock.cjs` gera as capturas dos cinco modos da rail.
- **As galerias de desenvolvimento não representam o shell real.** `SidebarGallery` tem dados e arranjo próprios, e
  `DshGallery` usa os tokens `--dsw-*` em vez dos do `carbon.css`. Comparação de layout tem de ser feita no shell.
- Medir sempre: `getComputedStyle` para tokens e `getBoundingClientRect` para dimensões, em vez de julgar por captura.

## Estado verificado

| Peça do mock | Onde está no app | Estado |
|---|---|---|
| Cartão de decisão com opções | `features/chat/DecisionGateCard.tsx` | criado agora, com teste |
| Barra `N arquivos modificados · Revisar · ×` | `features/diff/CompletedFileReview.tsx` | já existia, confere |
| Arrastar aba entre painéis | `features/panels/DockWorkspace.tsx` (`application/x-politron-tab`) | já existia |
| Botão `Config ⌘,` no top bar | `shell/top-bar.tsx` | criado agora |
| Pill de status do projeto | `shell/top-bar.tsx` via `StatusPill` | existia o primitivo, faltava renderizar |
| Atalho `Ctrl ,` para Configurações | `features/app/AppShell.tsx` | já existia |
| Filtro do sidebar | `shell/workspace-sidebar.tsx` | já existia |
| Menção de Boo no composer | `features/composer/MentionSuggestions.tsx` | já existia |
| Pílula `● @Boo ⌄` do composer | `features/composer/AgentChip.tsx` | criada, com teste no `Composer.test.tsx` |
| Menu do `+` (`Anexar arquivos` · `Modo planejamento`) | `features/composer/AttachMenu.tsx` | criado agora, com teste |
| Rótulo do modelo resolvido (herança mostra o modelo do Boo) | `features/composer/Composer.tsx` + `features/app/AppShell.tsx` (`agentModelLabel`) | criado agora, com teste |
| Seletor de modelo | `features/composer/ModelSelector.tsx`, `ComposerModelSlot.tsx` | já existia |
| Campo `Mensagem para <Boo>` | `features/composer/Composer.tsx` | já existia |
| Aba `Preview Web` | `shell/top-bar.tsx` → `onOpenTool('web')` | já existia |

## Pendências que ainda exigem verificação no shell real

Não tratar como ausente nem como pronto antes de olhar:

- **Sidebar**: o mock mostra rótulo de papel por Boo (`Líder`, `Decisão`, `QA`, `Code Review`) e conversas
  agrupadas por workspace com contagem e tempo relativo. O app tem `AGENTES · ARRASTE`, `PRECISA DE VOCÊ` e
  `WORKSPACES`; falta confirmar se o rótulo de papel e o agrupamento batem.
- **Acabamento das abas**: o próprio commit `8db8022` registra como parcial.

O composer foi fechado nesta rodada — ver a seção "Composer fechado" abaixo.

## Verificação no shell real (2026-11-10)

Subir o app pelo perfil E2E e ler o DOM do top bar e do sidebar por CDP — `node .tmp-esbuild/verificar-shell.cjs`.
Texto observado no app de verdade:

```
TOP BAR:  Boobot / Conversas livres local · Local Daemon Ativo · Buscar ou comando... Ctrl K · Config Ctrl , · Layout & Painéis
SIDEBAR:  WORKSPACE · Boo · AGENTES · ARRASTE · Gerenciar · Assistente · Líder · Chief · Líder ·
          WORKSPACES · Nenhuma pasta encontrada. · Local Daemon Ativo · 0 worktrees
```

Confirma no app real: o botão `Config Ctrl ,`, o pill de status (`Local Daemon Ativo`, que troca para
`Chief aguardando sua decisão (N)` quando há gate), o cabeçalho `WORKSPACE`, a seção `AGENTES · ARRASTE` com
`Gerenciar`, o rótulo de papel (`Líder`) e a árvore `WORKSPACES` com o rodapé de worktrees.

Os rótulos de papel saem de `shortRoleOf` (`appearance.ts`): `Líder` para o Chief, senão a descrição/alias do
agente truncada em 14 caracteres. `STATE_STATUS.waiting = 'Decisão'`, que é o texto âmbar da linha quando o Boo
espera resposta. O filtro do sidebar existe com o placeholder do mock.

## Limites conhecidos, fora do escopo desta rodada

- **Acabamento das abas**: o commit `8db8022` registra como parcial, sem especificar o que falta. Não foi
  tratado aqui e não deve ser dado como pronto.
- A comparação visual pixel a pixel do cartão de decisão no modo claro não foi feita; a do modo Carbon foi.

## Composer fechado (2026-11-10)

As duas últimas pendências do composer com o mock:

1. **Menu do `+`** (`features/composer/AttachMenu.tsx`). A prancheta saiu da linha do campo: o modo planejamento
   divide o `+` com "Anexar arquivos", com o título do mock (`Anexar arquivo, comando ou permissão`). O estado
   continua visível no próprio `+` (`data-plan-mode` destacado) e na marca do item do menu. O slot novo
   `attachTrigger` do `PromptInput` entrega o seletor nativo de arquivos ao menu — arrastar e colar anexos
   continuam no componente.
2. **Rótulo do modelo** (`Composer` + `AppShell`). A herança passou a exibir o modelo real do Boo
   (`agentModelLabel` resolve `runtime:model` no nome do catálogo; sem catálogo, mostra o id do Boo; com alvo
   escolhido na pílula, usa o modelo desse Boo). O envio continua sendo a sentinela `Usar o modelo do agente`:
   herança não é reescrita por um id concreto.

Leitura no shell real (Electron compilado, perfil descartável, CDP em `127.0.0.1:9333`, janela 1200×800):

```
linha:          + 28×28 @x402 · campo @x555 · modelo @x941 (86×28) · mic @x1032 · enviar @x1068
                (centros numa faixa de 8px — mesma linha do mock)
cartão:         708px de largura
modelo:         gpt-6-luna (perfil sem catálogo de CLIs: id cru do Boo, não o rótulo de herança)
menu do "+":    165×76 em y660, acima do cartão (topo do "+" em y740)
itens:          Anexar arquivos, Modo planejamento
```

Sem erro de console ou de renderer nessa leitura. Os testes de `features/composer` e `features/chat` cobrem o
menu (itens, seletor nativo, planejamento marcado/desmarcado) e o rótulo (herança e troca de alvo).

Nota: `scripts/verify-redesign-web.cjs` foi atualizado para o novo composer (nome do `+`, menu e modelo escrito),
mas não foi reexecutado nesta rodada.

## Cores de referência do mock (Carbon)

`--bg-app` #090909 · `--bg-card` #1c1c1c · `--bg-hover` #222222 · `--accent-primary` #10b981 ·
`--accent-soft` rgba(16,185,129,0.12) · `--warning` #f59e0b. O mock usa `#161616` no cartão e `#121212`
nas opções; os tokens do `carbon.css` preservam a mesma relação de contraste.
