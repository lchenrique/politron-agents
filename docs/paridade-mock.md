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

## Composer medido contra o mock (2026-11-11)

O composer foi reaberto porque a leitura de 10/11 fechou só o menu do `+` e o rótulo do modelo. Desta vez a
comparação foi feita medindo os dois lados com `getComputedStyle`/`getBoundingClientRect`:

- mock em Chromium headless, viewport 1440×900 (`file://` no HTML de referência);
- app compilado (`out/`) via Playwright/Electron, perfil descartável, mesmo viewport.

Scripts de apoio: `scripts/verify-fluxos-electron.cjs` (fluxos) e a sonda de medição usada nesta rodada
(Chromium + Electron, compara campo por campo). Evidências em `%TEMP%/boobot-composer-4/` (`mock-pill.png`,
`app-pill.png`, `mock.json`, `app.json`).

### O que estava diferente e foi alinhado

| Peça | Mock | App (antes) | Agora |
|---|---|---|---|
| Pílula, padding | `py-1.5 px-2.5` = 6 / 10 px | 6 / 6 px | 6 / 10 px |
| Pílula, respiro externo | `pt-1 pb-3` = 4 / 12 px | 8 / 20 px | 4 / 12 px |
| Coluna | 740 px de conteúdo + 16 px laterais | 740 px totais (conteúdo 708) | 772 px totais (conteúdo 740) |
| Pílula, fundo/borda | `#1A1A1A` / `#2A2A2A`, foco `#3E3E3E` | `--bg-elevated` `#171717` / `#282828` | tokens `--composer-*` com os valores do mock |
| Campo de texto | 24 → 68 px (3 linhas), peso 400, raio 0 | 36 → 336 px, peso 450, raio 12 | 24 → 68 px, peso 400, raio 0 |
| Gap da linha | 8 px | 4 px | 8 px |
| `+` | ícone lucide `plus` 16 px em 28×28 | caractere `＋` 13 px | ícone 16 px |
| Chip do Boo | `#222222`, borda `#303030`, texto `#E5E5E5` | `--bg-hover`, `--border-default`, `--text-primary` | tokens `--composer-chip-*` |
| Modelo | 11 px, cor `#8E8E96`, `0 8px`, gap 4 | 11 px, `--text-muted`, `0 6px`, gap 6 | igual ao mock |
| Microfone | 28×28, ícone 14 px, `#71717A` | 32×32, ícone 16 px, `#A1A1AA` | igual ao mock |
| Enviar | 28×28, ícone 14 px, traço 2.5, `#F3F3F3` com `#090909` | 28×28, ícone 16 px | igual ao mock |

Com texto digitado, o botão de enviar mede `background rgb(243,243,243)`, `color rgb(9,9,9)`, 28×28 — os
mesmos valores do mock.

### Ruído que não é diferença

- **Bordas de 0,8 px no app contra 1 px no mock.** A janela roda com `devicePixelRatio` 1.25, então 1 px de
  CSS vira 1 px de dispositivo e o Chromium reporta 0,8 px. A regra CSS é 1 px nos dois.
- **`borderRadius` 999 px contra 9999 px.** Os dois são pílula; o valor computado é recortado pela altura.
- **Largura do chip e rótulo do modelo.** Dependem do nome do Boo e do modelo escolhidos, não do estilo.
- **`fontSize`/`fontWeight` dos botões só com ícone.** Não há texto; o mock não define nada ali.

### O que continua estrutural

No mock a pílula é a própria linha (`flex` com `gap-2`); no app ela é uma coluna com a linha dentro, porque
anexos viram uma faixa acima do campo. No estado padrão a linha visível tem os mesmos 8 px e a mesma altura
de 42 px, mas o `gap` da coluna (4 px) é outra medida e aparece no diff automático.

## Composer em duas linhas (2026-11-11, a pedido)

A pedido do usuário o composer deixou de seguir a pílula de uma linha do mock e passou a usar o
arranjo do campo de mensagem do DSH como referência, **mantendo os tokens do tema Carbon**:

- linha 1: campo de texto ocupando a largura toda (34 px de base, cresce até 132 px);
- linha 2: à esquerda `+` (menu de anexar/planejamento), pílula `● @Boo ⌄` e o chip de autonomia
  `⛨ Perguntar ⌄`; à direita modelo, microfone e enviar.

O chip de autonomia é novo e mostra o modo do Boo que recebe a mensagem (`ask` → "Perguntar",
`automatic` → "Automático", `bypass` → "Acesso total"). Ele grava no perfil do Boo (`saveAgent`) ou nas
preferências do Assistente (`saveAssistantPreferences`) e marca "Acesso total" em âmbar, como os
avisos de permissão do app. O botão de enviar passou a usar o acento do tema (esmeralda no Carbon,
branco no ícone), em vez do círculo claro do mock.

O que continua valendo do ajuste anterior: fundo `#1A1A1A`, borda `#2A2A2A` com foco `#3E3E3E`,
coluna de 740 px de conteúdo, `+` de 16 px, modelo de 11 px em `#8E8E96`, microfone de 28 px com
ícone de 14 px e enviar de 28 px com ícone de 14 px. A tabela acima descreve a medição contra o mock
uma linha; para a pílula original, use-a como histórico, não como contrato atual.

## Seletor de modelo do mock (2026-11-11)

O seletor grande (popover de provedores, busca e esforço) saiu do composer. No lugar entrou
`features/composer/ModelMenu.tsx`, medido contra o popover do mock:

| Peça | Mock | Agora |
|---|---|---|
| Painel | `w-48` (192 px), `#181818`, borda `#2C2C2C`, `rounded-xl`, `py-1.5` | 192 px, `--composer-menu-surface` `#181818`, borda `#2C2C2C`, raio 12 px, `py-1.5` |
| Cabeçalho | mono 10 px uppercase, `#6E6E77` | "Modelo ativo", mono 10 px, `--text-muted` |
| Item | `px-3 py-1.5`, 12 px, ativo em `#10B981` + check 12 px, hover `#242424` | igual, com tokens `--accent-primary` e `--composer-menu-hover` |
| Rodapé | divisor + engrenagem 12 px esmeralda + "Configurar Provedores..." 11 px `#A1A1AA` | "Configurar provedores..." abrindo Configurações → Provedores |

Duas diferenças conscientes: o primeiro item é `Do Boo · <modelo>` (a herança do modelo do Boo
destinatário não existe no mock e continua sendo o padrão do app), e a lista cobre os modelos de
todos os provedores habilitados, porque o Boobot escolhe o motor pelo prefixo do id. O gatilho segue
o mock: 28 px de altura, texto de 11 px em `#8E8E96`, chevron de 12 px.

O seletor deixou de ser movido para o cabeçalho do chat: como no mock, ele mora no composer.

### Ajuste posterior do seletor (2026-11-11)

Duas sobras foram removidas e duas funções entraram, mantendo o acabamento do mock:

- Saiu a linha `Do Boo · <modelo>` que repetia o mesmo modelo duas vezes na lista. Agora, ao herdar,
  o modelo do Boo recebe a marca e uma etiqueta discreta `do Boo` na própria linha.
- Saiu também a linha de dica sob o título, que aparecia cortada.
- Entraram **busca** (campo de 28 px com lupa e estado "Nenhum modelo encontrado.") e **grupos por
  provedor**, com o mesmo cabeçalho mono maiúsculo das seções do mock.
- `Voltar a herdar do Boo · <modelo>` só aparece quando há um modelo escolhido, para desfazer o override.
- O painel passou de 192 px para 240 px por causa da busca e dos grupos; fundo, borda, raio (12 px),
  itens de 12 px, check esmeralda e rodapé continuam iguais aos do mock.

## Configurações → Provedores no formato do mock (2026-11-11)

A seção foi reconstruída com os três cartões do HTML de referência:

1. **CLIs de agentes instaladas**: ícone circular de 36 px, tabela em `rounded-xl` sobre `#121212`
   com divisórias, ponto de estado, nome em 13 px semibold, versão em mono 12 px e a pílula com a
   contagem de modelos; rodapé com "Atualizar detecção" e "Última verificação". Cada linha continua
   abrindo os detalhes do diagnóstico (motivo e lista de modelos).
2. **Provedores por chave de API**: cartão com a etiqueta "Em uso", e uma linha por provedor com
   chip da inicial, nome em 13.5 px, pílula mono `API Key`, contagem de modelos e ponto de estado;
   abaixo, o campo da chave (mono, fundo do painel) com "Salvar chave" e "Remover".
3. **OpenRouter para respostas em grupo**: chave + "Buscar catálogo" e o seletor do modelo decisor.

Cartões com raio de 16 px (o `rounded-2xl` do tema sai 28 px, então o raio vai explícito) e fundo
`--panel-card-surface` (`#161616` no Carbon). Duas peças do mock ficaram de fora porque dependem de
recursos que o app não tem: o **switch por modelo** (não existe filtro persistido de modelos) e o
**"Adicionar modelo"** manual (os catálogos vêm dos runtimes e da API).
