# Referência de UI: DeepSeek Harness (DSH), chat e sidebar

Data: 28/10/2026. Fonte: clone somente leitura em `D:\projetos pessoais\dsh-ref` (licença MIT). Nenhum script do repositório foi executado; tudo abaixo vem da leitura dos arquivos.

Objetivo: dar a quem implementa no Boobot os valores exatos de layout, tokens, tipografia e comportamento do chat e do sidebar do DSH. A marca "DeepSeek Harness", a baleia, o wordmark e a fonte Montserrat de marca **não** devem ser copiados; onde o DSH usa a marca, o Boobot usa a própria.

Todos os caminhos citados são relativos a `D:\projetos pessoais\dsh-ref\packages\client\` salvo indicação contrária.

Capturas oficiais copiadas para `dsh-ref-shots/` (só existem estas no repositório; nenhuma mostra uma conversa com resposta, ferramentas ou subagentes):

| Arquivo | O que mostra |
|---|---|
| `onboarding-welcome.webp` / `-dark.webp` | Janela macOS: sidebar (botão New Session, workspace com sessões e tempos `1min`, `9min`, `1h`, `4d`), estado vazio "hero" com o composer central e a linha de workspace |
| `onboarding-recharge.webp` / `-dark.webp` | Variante do onboarding (conta) |
| `providers-models-page.png`, `providers-custom-form.png` | Modal de Configurações (lista lateral de seções, cartões, botões Cancel/Apply) |

---

## 1. Aparência global

Fontes: `ui-theme/src/styles/design-platform.css`, `base.css`, `gradient-shadow-text.css`, `focus.css`, `corner-shape.css`, `scrollbar.css`, `ui-theme/src/theme-settings.ts`, `ui-theme/src/boot-theme.ts`.

### 1.1 Tema claro/escuro

- Preferência: `'system' | 'light' | 'dark'`, padrão `system`. O escuro é ligado pelo atributo `body[data-ds-dark-theme]` (não por classe). O script de boot pinta `body` antes do React: claro `#fff`, escuro `#151517`, e define `color-scheme`.
- Todos os tokens vivem em `body` (não em `:root`), porque o tema troca no `body`. Componentes só consomem aliases `--dsw-alias-*` / `--dsw-specific-*`.

### 1.2 Paleta base (estática, igual nos dois temas)

Neutros azulados (os mais usados):

| Token `--dsw-static-neutral-bluish-*` | Valor |
|---|---|
| 00 | rgb(255,255,255) |
| 50 | rgb(249,250,251) |
| 60 | rgb(245,246,247) (no escuro redefinido para 249,250,251) |
| 75 | rgb(241,243,245) |
| 100 | rgb(235,238,242) |
| 150 | rgb(233,236,242) |
| 200 | rgb(225,229,238) |
| 300 | rgb(207,211,214) |
| 400 | rgb(173,178,184) |
| 500 | rgb(151,157,166) |
| 600 | rgb(129,133,140) |
| 700 | rgb(97,102,107) |
| 750 | rgb(67,69,74) |
| 800 | rgb(53,54,56) |
| 850 | rgb(44,44,46) |
| 875 | rgb(35,35,36) |
| 900 | rgb(27,27,28) |
| 950 | rgb(21,21,23) |
| 1000 | rgb(15,17,21) |

Acentos: azul de marca `deepseek-500` rgb(65,118,230), `deepseek-400` rgb(122,170,255), `deepseek-50` rgb(237,243,254), `deepseek-100` rgb(228,237,253), `deepseek-200` rgb(211,226,255), `deepseek-800` rgb(52,65,91). Estados: verde 500 rgb(34,197,94), âmbar 500 rgb(245,158,11), âmbar 600 rgb(221,134,41), vermelho 600 rgb(236,19,19), vermelho 400 rgb(242,90,90), violeta 600 rgb(124,58,237).

### 1.3 Aliases semânticos (claro → escuro)

| Alias | Claro | Escuro |
|---|---|---|
| `--dsw-alias-bg-base` (fundo do chat) | bluish-00 `#fff` | bluish-950 `#151517` |
| `--dsw-specific-sidebar-fill` | bluish-50 rgb(249,250,251) | bluish-900 rgb(27,27,28) |
| `--dsw-alias-bg-layer-1/2/3` | branco | 875 / 850 / 800 |
| `--dsw-specific-input-major` (composer, cartões) | branco | bluish-850 |
| `--dsw-specific-bubble` (balão do usuário) | deepseek-50 rgb(237,243,254) | bluish-850 rgb(44,44,46) |
| `--dsw-alias-label-primary` | bluish-1000 rgb(15,17,21) | bluish-50 |
| `--dsw-alias-label-secondary` | bluish-700 rgb(97,102,107) | bluish-300 |
| `--dsw-alias-label-tertiary` | bluish-600 rgb(129,133,140) | bluish-400 |
| `--dsw-alias-label-caption` | bluish-400 rgb(173,178,184) | bluish-600 |
| `--dsw-alias-label-dimmed` | bluish-200 | bluish-750 |
| `--dsw-alias-link` | deepseek-500 | deepseek-400 |
| `--dsw-alias-state-business-primary` (azul de seleção, caret, foco) | deepseek-500 | deepseek-400 |
| `--dsw-alias-state-business-tertiary` | deepseek-100 | deepseek-800 |
| `--dsw-alias-button-info-fill` (botão enviar) | deepseek-500 | deepseek-400 |
| `--dsw-alias-button-info-hover` | deepseek-400 | deepseek-500 |
| `--dsw-alias-button-primary-fill` (botão primário) | bluish-1000 (quase preto) | bluish-50 (quase branco) |
| `--dsw-alias-button-elevated-fill` | branco | bluish-750 |
| `--dsw-alias-button-floating-fill` / `-hover` | branco / bluish-75 | bluish-850 / bluish-800 |
| `--dsw-alias-interactive-bg-hover` | rgba(38,49,72,0.06) | rgba(255,255,255,0.08) |
| `--dsw-alias-interactive-bg-active` | rgba(38,49,72,0.10) | rgba(255,255,255,0.14) |
| `--dsw-alias-interactive-bg-hover-solid` | bluish-75 | bluish-800 |
| `--dsw-alias-interactive-bg-hover-danger` | rgba(236,19,19,0.05) | rgba(242,90,90,0.15) |
| `--dsw-alias-border-l1` | rgba(0,0,0,0.04) | rgba(255,255,255,0.06) |
| `--dsw-alias-border-l2` | rgba(0,0,0,0.10) | rgba(255,255,255,0.12) |
| `--dsw-alias-border-l3` | rgba(0,0,0,0.12) | rgba(255,255,255,0.16) |
| `--dsw-alias-border-l4` | rgba(0,0,0,0.16) | rgba(255,255,255,0.20) |
| `--dsw-alias-markdown-code-block` | bluish-50 | bluish-900 |
| `--dsw-alias-markdown-code-block-banner` | bluish-50 | bluish-850 |
| `--dsw-alias-markdown-inline-code` | neutral-50 rgb(250,250,250) | neutral-800 rgb(41,41,41) |
| `--dsw-alias-markdown-tag` (aba ativa do painel direito) | bluish-75 | bluish-850 |
| `--dsw-alias-state-success-primary` | green-500 | green-500 |
| `--dsw-alias-state-warn-primary` / `-tertiary` | amber-500 / amber-100 | amber-500 / amber-900 |
| `--dsw-alias-state-error-primary` | red-600 | red-400 |
| `--dsw-alias-state-idle-primary` | neutral-300 | neutral-600 |
| `--dsw-alias-label-deep-diving` (status "rodando") | mix(deepseek-500 70%, blue-950) | mix(deepseek-450 55%, bluish-400) |
| `--dsw-alias-tooltip-bg` | bluish-850 | bluish-750 |
| `--dsw-alias-toast-bg` | bluish-800 | bluish-750 |
| `--dsw-specific-menu` (superfície de menu translúcida) | rgba(248,249,250,0.58) | rgba(67,69,74,0.45) |
| `--dsw-specific-selector` (botão + do composer) | bluish-60 | bluish-800 |

Observação de marca: o "primário" do DSH é tinta neutra (preto/branco). O azul só aparece em link, foco, caret, aba selecionada e no botão enviar.

### 1.4 Elevação e sombras

Fonte: `gradient-shadow-text.css`. Sombras são um contorno de 0,5 px dentro do `box-shadow` mais halos muito fracos; no escuro o contorno faz a separação.

```css
--dsw-elevation-stroke: 0 0 0 0.5px var(--dsw-elevation-stroke-color); /* padrão border-l4 */
--dsw-elevation-panel:     var(--dsw-elevation-stroke), 0 3px 8px 0 rgba(0,0,0,.03), 0 0 16px 0 rgba(0,0,0,.02);
--dsw-elevation-prominent: var(--dsw-elevation-stroke), 0 3px 8px 0 rgba(0,0,0,.04), 0 0 20px 0 rgba(0,0,0,.05);
--dsw-elevation-soft:      var(--dsw-elevation-stroke), 0 4px 16px 0 rgba(0,0,0,.03), 0 0 24px 0 rgba(0,0,0,.03);
--dsw-shadow-lv2: 0 4px 12px 0 rgba(0,0,0,.02), 0 2px 8px 0 rgba(0,0,0,.04);
--dsw-menu-backdrop-filter: blur(40px) saturate(150%);
```

Cada superfície religa `--dsw-elevation-stroke-color`: menus usam `border-l1`, composer `border-l2`.

### 1.5 Raios e forma de canto

```css
--dsw-radius-xs: 4px;  --dsw-radius-sm: 8px;  --dsw-radius-md: 12px;
--dsw-radius-lg: 16px; --dsw-radius-xl: 20px; --dsw-radius-panel: 28px;
```

Onde o navegador suporta, todo canto usa `corner-shape: superellipse(1.5)` (cantos "squircle" suaves); círculos e pílulas declaram `corner-shape: round` (`corner-shape.css`). Bordas finas são sempre `0.5px`.

### 1.6 Movimento

```css
--ds-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ds-transition-duration-fast: 0.1s; --ds-transition-duration: 0.2s; --ds-transition-duration-slow: 0.3s;
```

Hovers de cor: 100 ms `ease`. Recolher/expandir colunas: 300 ms ease-in-out. Dobra de turnos no chat: fade 70 ms, atraso 50 ms, fechamento 110 ms (`ui-chat/src/client/chat/flow-motion.ts`), margens com `160ms cubic-bezier(0.4,0,0.2,1)`. Todas as animações respeitam `prefers-reduced-motion: reduce`.

### 1.7 Tipografia

Fonte: `base.css`, `gradient-shadow-text.css`, `theme-settings.ts`.

```css
--dsh-font-family-text-default: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
--dsh-font-family-code-default: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas,
  'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
```

Tamanhos configuráveis pelo usuário (variáveis no `body`):

| Papel | Variável | Padrão | Faixa |
|---|---|---|---|
| Texto do chat | `--dsh-content-font-size` | 14px | 10–22 |
| Bloco de código | `--dsh-code-font-size` | 11px | 10–16 |
| Terminal | `--dsh-terminal-font-size` | 13px | 10–20 |

Derivados: `--dsh-content-font-delta = size − 14px`; `--dsh-content-font-size-secondary = min(size−1, max(13, size−2))` (14 → 13). Quase todas as alturas de linha do chat são `calc(Npx + delta)`, de modo que tudo escala com a preferência.

Escala de markdown (tamanho/altura de linha no padrão 14px):

| Elemento | Peso | Tamanho / linha |
|---|---|---|
| h1 | 700 | 21 / 30 |
| h2 | 700 | 19 / 28 |
| h3 | 700 | 18 / 26 |
| h4 | 600 | 14 / 24 |
| corpo | 400 | 14 / 24 |
| strong | 600 | 14 / 24 |
| tabela (célula / cabeçalho) | 400 / 500 | 13 / 22 |
| small | 400 | 12 / 20 |
| código inline | 400 | 12 / 19 (e `font-size: 0.875em`) |
| bloco de código | 400 | 11 / 19 |
| bloco de código pequeno (cartões de ferramenta) | 400 | 11 / 16 |

Interface fora do chat: sidebar 14px; títulos de linha 14/20; meta 12/20; tempo relativo 10/16; itens de menu 13/20; rótulo de seção de menu 11/15 (ou 11/16 peso 500 no menu de `/`).

Densidade: alta. Linhas de processo têm 24 px, linhas de sessão 32 px, itens de menu 34 px.

### 1.8 Ícones

Fonte: `ui-primitives/src/icons/index.tsx`, `artwork.ts`, `ui-theme/src/client/icon-sprite.ts`.

- Conjunto próprio em SVG (não é Lucide/Heroicons). Um sprite oculto com `<symbol id="dsw-icon-<glifo>-<peso>">`; cada ícone é `<svg><use href="#id"/></svg>` com `currentColor`.
- Dois pesos: `Regular` (traço 1 px) e `Medium` (traço 1,3 px). Tamanho padrão 16 px (alguns 14 px).
- Glifos disponíveis: `agent-preset, alarm-clock, api, apps-add, archive(-check/-off), branch, browse, check, check-circle(-fill), checklist, chevron-down/left/right/up, chevrons-up-down, clock, close(-fill/-circle-fill), code, compact, compare-split, context-injection, copy, cordis-plugin, dark, data, database, deliver-doc, dislike(-fill), download, drag-handle, edit, ellipsis, enhance, flat-list, folder-close, folder-open, followsystem, fullscreen, gauge, globe, goal, info, inspect, light, like(-fill), link, list-pen, loading, microphone, new-chat, nowrap-fill, panel-left, paper-plane, paperclip, pause, personalization, pin(-fill), plan, play, plugin-pinwheel, plus, project-add, question, queue, refresh, right-up, search, send, settings, share, shield, skill, sliders-two, sparkle, stop-fill, think, trash, tree-corner, triangle-right-fill, unarchive, user, users, warning, warning-triangle, workspace-tree, wrap-fill, wrap-lines`.
- Para o Boobot: usar uma biblioteca de traço fino equivalente (Lucide com `strokeWidth={1}` / `1.3`) mapeando os nomes acima; o que importa é traço fino, 14–16 px, cor herdada.

### 1.9 Foco e barras de rolagem

```css
:root { --dsw-focus-ring-width: 2px; }
:focus-visible { outline-color: var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-width: 2px; }
html[data-input-modality='pointer'] body :focus-visible:not(:read-write) { outline-color: transparent; }
```

O anel de foco só aparece em navegação por teclado. Barra de rolagem: 5 px de largura (`--dsh-scrollbar-width: 5px`), polegar `neutral-200` (claro) / `neutral-700` (escuro), hover um passo acima; superfícies elevadas usam o par `l2`. No sidebar a barra fica transparente enquanto o ponteiro não está dentro (`.quietBars`).

---

## 2. Layout da janela

Fontes: `ui-layout/src/client/AppFrame.module.css`, `ui-layout/src/client/columns.ts`, `apps/desktop/src/windows-layout.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload-windows.ts`, `apps/desktop/src/preload-menu.ts`.

### 2.1 Grade de três colunas

`.frame` é um grid: `grid-template-rows: minmax(0,1fr) auto` e colunas `sidebar | centro | painel direito`, com uma linha inferior opcional.

| Constante | Valor |
|---|---|
| `SIDEBAR_DEFAULT` | 280 px |
| `SIDEBAR_MIN` / `SIDEBAR_MAX` | 264 / 420 px (arraste) |
| `SIDEBAR_COLLAPSED` | 56 px (trilho de ícones; no macOS é 0) |
| `SIDEBAR_AUTO_COLLAPSE` | viewport < 1024 px recolhe para o trilho |
| `CENTER_MIN` | 400 px |
| `RIGHTBAR_MIN` | 300 px |
| `RIGHTBAR_DEFAULT_RATIO` | 0,45 da janela na primeira abertura |
| `RIGHTBAR_MAX_RATIO` | 0,70 |

Regra de resolução: o painel direito encolhe e depois some antes de o centro ficar abaixo de 400 px; o sidebar nunca cede nessa conta.

```css
.sidebarCol { background: var(--dsw-specific-sidebar-fill); border-right: 0.5px solid var(--dsw-alias-border-l3); }
.frame[data-animating] { transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.frame[data-dragging] { transition: none; }
.handle { position: absolute; width: 8px; margin-left: -4px; cursor: col-resize; z-index: 11; }
```

Redimensionadores: faixa invisível de 8 px centrada na borda da coluna, sem pílula visível. Só o toggle recolher/expandir anima; arrastar e redimensionar a janela são instantâneos.

### 2.2 Barra de título (Windows)

- `titleBarStyle: 'hidden'` com `titleBarOverlay` de 40 px (`WINDOWS_TITLEBAR_HEIGHT = 40`); botões nativos de minimizar/maximizar/fechar à direita, cor do overlay sincronizada com `--dsw-specific-sidebar-fill` e símbolos com `--dsw-alias-label-primary`.
- `html[data-windows-titlebar]` + `--dsh-windows-titlebar-height: 40px`. A faixa superior de 40 px tem o fundo do sidebar e é `-webkit-app-region: drag`.
- O centro ganha canto superior esquerdo arredondado de 16 px sobre o fundo do sidebar:

```css
:global([data-windows-titlebar]) .frame { padding-top: var(--dsh-windows-titlebar-height); background: var(--dsw-specific-sidebar-fill); }
:global([data-windows-titlebar]) .centerCol { background: var(--dsw-alias-bg-base); border-radius: 16px 0 0 0; }
:global([data-windows-titlebar]) .sidebarCol { border-right: none; }
```

- Na faixa: toggle do sidebar fixo em `left: 12px`, 28×28, centralizado verticalmente; com o sidebar recolhido, o botão Nova sessão vai para `left: 48px`. Um menu textual (Aplicativo / Editar) começa em `left: 48px` (84 px com sidebar recolhido): botões 28 px de altura, `padding: 0 10px`, raio 6 px, 14px, cor `label-secondary`, hover `interactive-bg-hover`.
- macOS: `hiddenInset`, semáforos em (16,18), sidebar translúcido com vibrancy; não se aplica ao Boobot no Windows.

### 2.3 Coluna central

Fonte: `ui-conversation/src/client/skeleton/ConversationRoot.module.css`.

- Cabeçalho da conversa: `min-height: 76px; padding: 10px 28px 0 20px; border-bottom: 0.5px solid var(--dsw-alias-border-l3)`. Linha de título de 30 px; abaixo, abas de visão (Chat, Trajetória etc.) 13/16 peso 500, `gap: 32px`, aba ativa em azul `state-business-primary` com barra de 2 px que cobre a borda inferior.
- Breadcrumb: segmentos 14/20 `label-tertiary`, `padding: 4px 8px`, raio 12, `max-width: 220px`; separador "/" em `label-caption`; segmento atual peso 500 `label-primary`.
- Largura do conteúdo (transcrição, composer e cartões compartilham o mesmo eixo):

```css
--dsh-chat-content-width: var(--dsh-chat-user-width,
  clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px));
--dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);
--dsh-composer-side-clearance: 16px;
--dsh-composer-dock-inset: 8px;
```

Ou seja: 64% da coluna, limitado entre 680 e 920 px, centralizado. O composer é 32 px mais largo que o texto. O usuário pode arrastar a largura por alças de 10 px a 24 px de cada lado do texto; ao passar o mouse aparece um brilho vertical de 2 px que segue o ponteiro (72 px de comprimento).

- Rolagem: um único scroller (`.scrollBody`) contém a transcrição e o composer `position: sticky; bottom: 0; z-index: 7`. `scrollbar-gutter: stable`, margem direita 2 px. O composer tem máscara: degradê de `bg-base` transparente a sólido em 36 px no topo, para o texto sumir por baixo.
- Estado vazio ("hero"): o composer fica centralizado vertical e horizontalmente (`padding-bottom: 32px` para ficar um pouco acima do centro), com título acima e linha de workspace (pasta + nome + chevron) logo acima do cartão. Ao enviar a primeira mensagem, o composer passa a ancorar embaixo sem remontar. Fase `settling` deixa o composer `visibility: hidden` enquanto a sessão carrega.

### 2.4 Painel direito

Fontes: `ui-sidebar-right/src/client/shell/SidebarRight.module.css`, `ui-dockkit/src/components/dockkit.module.css`, `ui-sidebar-files`, `ui-sidebar-terminal`, `ui-sidebar-browser`, `ui-subagent/src/client/sidebar-chat`.

- Painel ancorado à borda direita da janela; abre/fecha com `transform: translateX(width)` em 300 ms ease-in-out. Até 2 painéis divididos; pode ir para tela cheia ou flutuar.
- Faixa de abas: linha de 38 px com banda de 28 px embaixo (`padding: 10px 6px 0 10px; gap: 4px`). Aba: 28 px de altura, `padding: 0 10px`, raio 8, 13px, `min-width: 80px; max-width: 170px`, cor `label-secondary`; ativa `label-primary` com fundo `--dsw-alias-markdown-tag`. O "x" (20 px, glifo 14) aparece sobre os últimos 14 px do título só na aba ativa ou em hover, com máscara no título; a aba não muda de largura.
- Botões do cabeçalho do painel: 28×28, glifo 15 px, raio 8, `label-secondary`, hover `interactive-bg-hover`.
- O cabeçalho do chat (76 px) é alinhado com faixa de abas + cabeçalho de painel (38 + 38) para as bordas se encontrarem.
- Conteúdos: Arquivos (árvore do workspace, atalho Ctrl+P), Terminal (xterm, Ctrl+`), Navegador (webview, Ctrl+T), pré-visualização de plano/arquivo, conversa de subagente (chat embutido somente leitura). Aba inicial "Start" com atalhos para ferramentas.
- Atalho: Ctrl+Alt+B alterna o painel; Ctrl+\ divide; Ctrl+Alt+Enter tela cheia.

---

## 3. Sidebar esquerdo

Fontes: `ui-sidebar/src/client/SidebarRoot.module.css`, `ui-workspace/src/client/rows/Rows.module.css`, `rows/Rows.tsx`, `rows/WorkspaceBrowser.module.css`, `ui-workspace/src/client/locales.ts`, `ui-workspace/src/client/shortcuts.ts`, `ui-primitives/src/StateDot.*`.

### 3.1 Estrutura vertical

```
[faixa superior: toggle do sidebar]            (Windows: dentro da barra de título)
[linha da marca 60px: logo + nome]             → no Boobot: marca do Boobot
[Nova sessão: barra 38px]
[lista de painéis globais: Plugins, Tarefas… + "Mais"]
[cabeçalho de seção "Sessões" + busca + opções de visão + adicionar workspace]
[lista rolável: workspaces > sessões]          (degradê de 24px no rodapé)
[rodapé: ações extras + Configurações/conta]
```

```css
.root {
  --dsh-sidebar-inline-padding: 8px;
  --dsh-sidebar-row-padding: 12px;
  --dsh-sidebar-label-gap: 6px;
  --dsh-sidebar-paint-inset: 3px;
  padding: 6px var(--dsh-sidebar-inline-padding);
  background: var(--dsw-specific-sidebar-fill);
  font-size: 14px;
}
```

### 3.2 Botão Nova sessão

```css
.newSession {
  height: 38px; padding: 8px 12px; margin: 0 4px 10px;
  border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 12px;
  background: var(--dsw-alias-button-elevated-fill); color: var(--dsw-alias-label-primary);
  font-size: 14px; font-weight: 500; line-height: 22px;
}
.newSession:hover { background: var(--dsw-alias-button-floating-hover); }
```

Conteúdo centralizado: ícone `new-chat` + "Nova sessão", gap 6. Em hover/foco, o atalho (Ctrl+N) aparece à direita (opacidade 0 → 1) e o rótulo ganha máscara de 16 px no fim.

### 3.3 Painéis globais e botões de ícone

- Linha de painel: `min-height: 36px; padding: 7px 9px; border-radius: 12px; line-height: 22px`; hover e ativo `interactive-bg-hover`. Lista com `gap: 2px`.
- Botões de ícone do sidebar: 28×28, raio 8, cor `label-secondary`, hover `interactive-bg-hover`.
- Menu "Mais": 288 px de largura.

### 3.4 Cabeçalho da seção e busca

- Altura 36 px, rótulo "Sessões" à esquerda em `label-tertiary`, ações à direita (busca, opções de visão, adicionar workspace), gap 4.
- Clicar na lupa expande a busca no lugar: o rótulo e as ações somem (180 ms, ease-in-out; opacidade 120 ms) e o campo ocupa a linha: altura 32, borda `0.5px border-l4`, raio 12, texto 13/18, placeholder "Buscar nomes de sessão". Atalho Ctrl+K.
- Resultado de busca: linha de 48 px com título 14/20 e, abaixo, workspace (12/17 `label-tertiary`, máx. 40%) + trecho (12/17 `label-secondary`). Raio 16. Esqueleto de carregamento pulsando opacidade 1 → 0,6 em 2 s.
- Menu de opções de visão (`min-width: 200px`):
  - Agrupar por: Workspace (padrão), Árvore de workspace, Lista única.
  - Ordenar por: Manual, Última atualização.
  - Filtro: Ocultar arquivadas, Todas (mostrar arquivadas), Só arquivadas.

### 3.5 Anatomia das linhas

Linha de workspace (projeto):

```css
.projectRow { height: 34px; display: flex; align-items: center; gap: 6px;
  padding: 0 8px 0 calc(12px - 3px + var(--dsh-workspace-indent, 0px));
  border-inline: 3px solid transparent; background-clip: padding-box; border-radius: 12px; }
.projectRow:hover { background-color: var(--dsw-alias-interactive-bg-hover); }
```

- Slot inicial de 16 px: ícone de pasta (fechada/aberta, `label-tertiary`; pasta ativa em azul `state-business-primary`). Em hover a pasta vira um triângulo (`triangle-right-fill`, cor `label-caption`) que gira 90° em 150 ms quando aberto.
- Ações em hover à direita (gap 13): "…" (menu) e "Nova sessão neste workspace" (ícone `new-chat` 14). Botões 24×24 com margem −4, raio 4, `label-tertiary` → `label-primary` em hover.
- Menu do workspace: Renomear, Excluir workspace (danger).

Linha de sessão:

```css
.sessionRow { height: 32px; gap: 0; border-radius: 12px; /* mesmo padding/inset do projeto */ }
.sessionRow.selected, .sessionRow:hover { background-color: var(--dsw-alias-interactive-bg-hover); }
.title { font-size: 14px; line-height: 20px; margin: 0 6px 0 6px; flex: 1; text-overflow: ellipsis; }
.time  { font-size: 10px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
```

Ordem: `[slot 16px de status] [título] [repouso: alfinete + tempo] | [hover: ações]`.

- Slot de status (`StateDot`): vazio quando ociosa; spinner de 14 px (anel 25% + arco girando 1,5 s, cor `label-tertiary`) quando rodando ou com subagentes rodando; ponto âmbar (10 px de caixa, núcleo 6 px) quando espera aprovação, revisão de plano ou resposta; ponto verde quando concluída e ainda não vista.
- Quando há pendência, o tempo é substituído por texto compacto: "Aprovação", "Revisão do plano", "Resposta".
- Tempo relativo compacto: `agora`, `{n}min`, `{n}h`, `{n}d`, `{n}mo`, `{n}y`. Sem tempo antes do primeiro prompt.
- Fixada: ícone `pin-fill` 14 px em `label-caption`.
- Em hover: o tempo some e aparecem ações rápidas (Arquivar, Fixar) e "…". Título longo faz marquee em velocidade constante enquanto o ponteiro está na linha, com máscaras de 12 px nas bordas; volta ao início ao sair.
- Arquivada: título em `label-caption`.
- Menu da sessão: Renomear (Ctrl+Alt+G), Bifurcar sessão (Ctrl+Alt+F), Fixar/Desafixar, Arquivar (Ctrl+Shift+A), Copiar ID da sessão. Arquivar sessão em andamento pede confirmação listando turno, subagentes, jobs e lembretes que serão parados; toast com "desfazer".
- Hover card (escuro fixo nos dois temas): título 14/20 `#FFFFFF`, caminho 12/16 `#CFD3D6`, "Criada há …" 12/16, linhas de status com ponto 12/20 `#ADB2B8`.
- Lista por workspace mostra 5 sessões (`SESSION_WATERMARK_BASE = 5`) e depois "Mostrar mais {n} sessões" / "Mostrar menos". Espaço entre linhas 2 px; entre grupos 4 px.
- Reordenação por arraste: marcador de inserção azul de 2 px com pequeno chevron à esquerda, posicionado ±7 px entre linhas.
- Lista vazia: "Nenhuma sessão ainda".

### 3.6 Recolher

Recolher é deslizar + crossfade: o conteúdo some em 150 ms mantendo a largura, a coluna anima para 56 px (300 ms) e então os controles do trilho (36×36, raio 12, `gap: 12px`, cor `label-primary`) entram vindo de 49 px à direita em 150 ms. No trilho, o toggle mostra a marca e revela o ícone de painel em hover. Atalho Ctrl+B.

---

## 4. Transcrição do chat

Fontes: `ui-chat/src/client/chat/*` (ChatView, ChatFlow, ChatGroupSeat, ChatNodeSeat, AssistantMarkdown, AssistantNodeView, MessageItem, MessageIconActions, ReasoningRow, TurnProcessNodeView, TurnTailNodeView, TurnNavigator, StatsPills e respectivos `.module.css`), `ui-chat/src/client/presentation-policy.ts`, `transcript-view.ts`, `ui-chat/src/chat-settings.ts`, `ui-primitives/src/UserMessageBubble.module.css`, `ui-primitives/src/markdown/*`, `ui-primitives/src/DisclosureRow.module.css`, `ui-primitives/src/TextShimmer.module.css`, `ui-chat/src/client/locale.ts`.

### 4.1 Coluna e ritmo

```css
.scroll  { padding: 16px calc(var(--dsh-composer-side-clearance) + 16px); container-type: inline-size; }
.column  { max-width: var(--dsh-chat-content-width); width: 100%; margin: 0 auto; display: flex; flex-direction: column; }
/* espaçamento entre itens do fluxo */
margin-top: var(--dsh-chat-flow-gap, 4px);   /* linhas de processo: 4px */
.flowItem[data-chat-group-part="response"] { --dsh-chat-flow-gap: 12px; } /* resposta do assistente */
/* cabeçalho de turno (duração): 16px antes e depois */
```

Não há avatar nem nome de autor em nenhuma mensagem. A diferença entre usuário e assistente é só alinhamento e balão.

### 4.2 Mensagem do usuário

```css
.userRow   { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.userStack { align-items: flex-end; gap: 8px; max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%); }
.bubble {
  background: var(--dsw-specific-bubble); border-radius: var(--dsw-radius-xl); /* 20px */
  padding: 10px 16px; font-size: 14px; line-height: 22px;
  color: var(--dsw-alias-label-primary); white-space: pre-wrap; word-break: break-word;
}
```

- Balão à direita, azul muito claro (claro) / cinza 850 (escuro), sem borda nem sombra, texto simples (não renderiza markdown).
- Anexos acima do balão, alinhados à direita: imagens em galeria; arquivos em cartão 240×64 (`padding: 8px 12px; border: 0.5px border-l2; radius 16`), ícone 28, nome 14/22 peso 500, meta 12/15 `label-tertiary`.
- Linha de ações abaixo, à direita, 28 px: horário (13/24 `label-tertiary`, `padding-right: 12px`) + Copiar. Mensagens de usuário anteriores escondem a linha (opacidade 0, 80 ms) e mostram em hover/foco; a última fica sempre visível.
- Horário: `HH:mm` no mesmo dia, `M/D` ou `AAAA-M-D` em outros dias.
- Mensagem enviada aparece imediatamente como "eco" com o mesmo visual até o host confirmar.

### 4.3 Resposta do assistente

```css
.root { display: flex; flex-direction: column; font-size: 14px; line-height: 24px; color: var(--dsw-alias-label-primary); }
.body { display: flex; flex-direction: column; gap: 16px; }
.actions { margin-top: 16px; margin-left: -6px; }
.stopped { padding: 0 6px; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 18px; } /* etiqueta "Parado" */
```

Texto corrido em largura total, sem balão, alinhado à esquerda.

### 4.4 Markdown

Fonte: `ui-primitives/src/markdown/MarkdownText.module.css`, `CodeBlock.module.css`.

```css
.markdown h1,h2,h3 { margin: 32px 0 16px; }   .markdown h4,h5,h6 { margin: 16px 0; }
.markdown p { margin: 16px 0; }
.markdown :where(ul, ol) { margin: 16px 0; padding-left: 18px; }
.markdown li:not(:first-child) { margin-top: 6px; }
.markdown li::marker { color: var(--dsw-alias-label-secondary); }
.markdown hr { height: 0.5px; margin: 32px 0; background: var(--dsw-alias-border-l2); border: none; }
.markdown blockquote { border-left: 2px solid var(--dsw-alias-label-caption); margin: 16px 0 0; padding-left: 14px; }
.markdown a { color: var(--dsw-alias-link); font-weight: 500; text-decoration: none; }
.markdown a:hover { text-decoration: underline dotted var(--dsw-alias-link); text-underline-offset: 3px; }
.markdown :not(pre) > code { font: var(--dsw-font-markdown-code); font-size: 0.875em;
  background-color: var(--dsw-alias-markdown-inline-code); border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 8px; padding: 0 5px; }
.markdown > *:first-child { margin-top: 0 !important; }  .markdown > *:last-child { margin-bottom: 0 !important; }
```

- Links e menções de arquivo recebem um ícone de categoria de 1,1em antes do texto.
- Tabelas: sem bordas verticais nem fundo; `th`/`td` `padding: 10px 16px`, primeira coluna sem padding à esquerda; linha de cabeçalho `0.5px border-l3`, linhas `0.5px border-l2`; `min-width: 100px; max-width: min(30vw, 320px)`. Até 3 colunas a tabela ocupa 100%; com 4 ou mais colunas ela "vaza" para a largura total da transcrição e rola na horizontal (barra só aparece em hover).
- Imagens: raio 12, clicáveis (lightbox), máx. 640×360.
- Bloco de código:

```css
.block { margin: 16px 0; background: var(--dsw-alias-markdown-code-block); border-radius: 16px; }
.bannerWrap { position: sticky; top: 0; z-index: 6; }           /* cabeçalho gruda no topo ao rolar */
.banner { padding: 9px 14px; font: 11px/18px var(--dsw-font-family); display: flex; justify-content: space-between; }
.infostring { font-family: var(--ds-font-family-code); font-size: 11px; }  /* linguagem à esquerda */
.block pre { font: var(--dsw-font-markdown-code-block); padding: 16px; white-space: pre-wrap; word-break: break-all; }
```

Copiar à direita do cabeçalho, como texto (troca para "Copiado"). Realce de sintaxe com Shiki. Sem borda.

- Versão compacta (usada no corpo de "Pensar" e resumos): 13/20 `label-tertiary`, margens de 4 px, links sublinhados pontilhados na cor do texto, código sem cor de sintaxe.

### 4.5 Streaming

- Sem cursor piscante. O texto cresce no lugar.
- Parse incremental (`ui-primitives/src/markdown/incremental.ts`): blocos de topo concluídos ficam congelados; só os 2 últimos blocos são reprocessados a cada pedaço. Chave estável por offset do bloco, para o React reconciliar sem remontar.
- Enquanto o turno roda, aparece uma linha de status no fim (`.running`): ícone animado de 14 px + texto "Mergulhando fundo há {duração} ···" em `label-deep-diving` com efeito shimmer (varredura mascarada de 1,5 s, atraso 0,3 s, `steps(48)`), fonte 12/22. Uma divisória de 0,5 px aparece acima se a última linha visível é saída. No Boobot, trocar o ícone da baleia por um indicador próprio.
- Linhas de ferramenta em execução usam o mesmo shimmer no texto.

### 4.6 Rolagem automática

- Segue o fim quando o leitor está a até 24 px do fundo (`FOLLOW_THRESHOLD = 24` em `use-chat-reading.ts`); amostra de posição a cada 500 ms; posição salva e restaurada por sessão.
- Botão "Voltar ao fim": círculo de 34 px, `background: var(--dsw-alias-button-floating-fill)`, `box-shadow: var(--dsw-elevation-panel)`, `z-index: 8`, alinhado à borda direita da coluna de texto, 16 px acima do composer (`bottom: calc(var(--dsh-composer-height, 152px) + 16px)`), hover `button-floating-hover`.
- Histórico antigo: botão central "Carregar anteriores" (`padding: 4px 12px; 12px; radius 8; background: interactive-bg-hover-solid`).
- Não há virtualização com janela de linhas; a transcrição é paginada (carrega mais antigo sob demanda) e as linhas ficam no DOM. Itens ocultos usam `hidden="until-found"` para continuar pesquisáveis pelo Ctrl+F.

### 4.7 Navegador de turnos (trilho à direita)

Fonte: `TurnNavigator.module.css`. Trilho de 28 px a 12 px da borda direita, centralizado na altura útil, máx. 420 px. Cada turno é um traço horizontal de 20×2 px `border-l4` escalado 0,6; ativo escala 1 em `label-primary`; em hover mostra prévia flutuante (300 px, `padding: 10px 12px`, raio 16, `bg-layer-1`, `elevation-panel`) com o prompt (1 linha, 13 peso forte) e o início da resposta (3 linhas, 12 `label-caption`), entrada 120 ms.

### 4.8 Agrupamento do turno ("seats")

O turno é: mensagem do usuário → cabeçalho do turno (só quando fecha) → linhas de processo agrupadas → resposta → rodapé do turno.

- **Cabeçalho do turno** (`TurnProcessNodeView`): botão em largura total, 33 px, `padding-bottom: 8px`, `border-bottom: 0.5px border-l2`, 14px `label-tertiary` (hover `label-secondary`). Texto: "Concluído em 1m23s" / "Concluído" / "Parado" / "Falhou", seguido de `· N chamadas de ferramenta · N mensagens · N subagentes` e chevron 14 px. Clicar dobra ou desdobra todo o trabalho do turno.
- **Grupos de processo** (`ChatGroupSeat`): título 14/24 `label-tertiary` com ícone de atividade de 16 px que vira chevron em hover/aberto (100 ms). Texto por categoria, com versões "em andamento", "preparando" e "concluído": "Lendo arquivos / Leu arquivos", "Buscando código", "Editando arquivos", "Executando comandos", "Pesquisando na web", "Coordenando subagentes", "Atualizando o plano", "Aguardando sua ação", "Chamando ferramentas"; múltiplas categorias viram "X e Y" ou "X, etc.". Ícones: think, browse, search, edit, api (comandos), code, globe, agent-preset (subagentes), plan, question, sparkle (genérico).
- Corpo do grupo aberto: `max-height: min(400px, 50vh); overflow-y: auto;` com máscaras de 24 px no topo e no fim quando há rolagem; linhas com gap 4 px.
- **Política de detalhe** (configurável, padrão `detailed`, dobra "na conclusão", respostas dobradas "todas"):

| Modo | Dobra turno concluído | Grupos | Detalhe ao vivo no título | Prévia do raciocínio |
|---|---|---|---|---|
| compact | sim | sempre recolhidos | não | não |
| standard | sim | sempre recolhidos | sim | sim |
| detailed | sim | só histórico | sim | sim |
| verbose | não | nenhum | não | sim |

Opções extras: dobrar "na conclusão" ou "na próxima mensagem"; quando dobrado, manter "todas as respostas" ou "só a resposta final".

### 4.9 Linha de ferramenta

Fonte: `ui-tool/src/client/tool/components/ToolRow.module.css`, `ui-primitives/src/DisclosureRow.module.css`, `ExitCodeBadge.module.css`.

Anatomia (24 px, uma linha): `[ícone 16 (glifo 14)] 6 [título 13/24] 8 [ponto 2×2 label-caption] 8 [resumo 13/24, ellipsis]`.

```css
.row { height: calc(24px + delta); color: var(--dsw-alias-label-tertiary); transition: color 100ms ease; }
.row:hover { color: var(--dsw-alias-label-secondary); }
.leading { width: 16px; height: 16px; margin-right: 6px; }  /* em hover o ícone vira chevron */
.sep { width: 2px; height: 2px; border-radius: 1px; margin: 0 8px; background: var(--dsw-alias-label-caption); }
.fileLink { text-decoration: underline dotted; text-underline-offset: 3px; }   /* caminho clicável */
.errorSummary { color: var(--dsw-alias-state-error-primary); }
.stoppedSummary { color: var(--dsw-alias-state-warn-label); }
.diffStat { margin-left: 10px; font-family: var(--ds-font-family-code); font-size: 11px; } /* +12 −3, verde/vermelho em hover/aberto */
```

- Estado: rodando = shimmer no resumo; erro = resumo vermelho ou selo de código de saída com ponto vermelho de 4 px; parado = resumo âmbar. Não há ícone de check para sucesso.
- Duração não aparece por linha; aparece no cabeçalho do turno.
- Expandida: corpo com `margin: 4px 0 4px 4px`. Cartão IN/OUT: fundo `markdown-code-block`, `0.5px border-l1`, raio 16, fonte 11/16 mono, seções `padding: 12px 16px; max-height: 150px` com rótulos IN/OUT em `label-caption` fixos à esquerda; divisória 0,5 px. Terminal: saída até 224 px com banner fixo. Também há corpos próprios para diff, leitura com números de linha, busca agrupada, web (citações) e imagem.
- Botão "Inspecionar" em pílula (11/16, `0.5px border-l3`, raio 999) aparece em hover e leva ao registro na aba Trajetória.

### 4.10 Raciocínio ("Pensar")

Fonte: `ReasoningRow.module.css`, `ReasoningRow.tsx`. Mesma anatomia da linha de ferramenta: ícone `think` + "Pensar". Fechado, ocupa 24 px; se `settledReasoningPreview`, mostra `· primeira linha` em 13/20 truncada. Enquanto transmite, a prévia tem máscara de 48 px no fim. Aberto: corpo em markdown compacto com recuo de 22 px, cabeçalho fica `sticky` no topo enquanto rola.

### 4.11 Subagentes

Fontes: `ui-subagent/src/client/*`, `ui-tool/src/client/tool/toolviews/details-row.tsx`, `ui-chat` (categoria `subagents`).

- Inline: a criação/consulta de subagente é uma linha de processo com ícone `agent-preset` e título da categoria "Coordenando subagentes"; o grupo do turno conta "N subagentes".
- O subagente tem sua própria sessão. Ela abre no painel direito como aba "Chat" (conversa embutida somente leitura, mesmo componente de transcrição) via "Abrir no sidebar".
- Ao navegar para a sessão do subagente, o cabeçalho mostra a linhagem como breadcrumb (`crumbSubagent` 12/18) e um seletor (`switcherTrigger`: 28 px, 12/18, peso 500, máx. 244 px, chevron que gira 180°) com menu de 336 px listando a árvore de subagentes, cada um com spinner (rodando), modo ("one-shot" / "contínuo") e duração/tokens.
- O composer da sessão de subagente vira cartão somente leitura ("Este subagente é somente leitura por enquanto").
- No sidebar, a sessão pai mostra spinner com rótulo "{n} subagentes rodando".

### 4.12 Aprovações

Fonte: `ui-approval/src/client/ApprovalPanel.module.css`, `ApprovalCard.tsx`. O cartão **substitui o composer** no rodapé.

```css
.card { max-width: var(--dsh-chat-content-width); border: 1px solid var(--dsw-alias-state-warn-secondary);
  border-radius: 20px; background: var(--dsw-specific-input-major); box-shadow: var(--dsw-shadow-lv2); overflow: hidden; }
.strip { display: flex; gap: 8px; padding: 10px 16px; background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-primary); font-size: 13px; line-height: 18px; }  /* ponto âmbar + "Aguardando aprovação" */
.body { padding: 12px 16px 0; gap: 6px; max-height: 336px; overflow-y: auto; }
.headline { font-size: 15px; font-weight: 500; line-height: 24px; }
.command { color: var(--dsw-alias-label-tertiary); font-family: var(--ds-font-family-code); font-size: 13px; line-height: 20px; }
.actionRow { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 16px; }
```

Botões (36 px, raio 12, 14/22): "Rejeitar" (contorno; hover vermelho), "Permitir uma vez" (contorno), "Sempre permitir" (primário). Teclado: Enter permite, Esc rejeita. Depois de responder, o ponto vira spinner.

### 4.13 Perguntas ao usuário

Fonte: `ui-user-questions/src/client/QuestionComposer.module.css`. Também substitui o composer.

- Cartão: `max-height: min(60vh, 520px)`, raio 20, `input-major`, `elevation-panel`. Cabeçalho `padding: 20px 16px 0 24px` com "eyebrow" 11/16 `label-tertiary`, título 16/22 peso 500, botões de 24 px (anterior/próxima, minimizar, fechar). Pergunta mostra até 3 linhas e "Expandir".
- Opções: lista `gap: 1px; padding: 4px 12px`; cada linha 40 px mínimos, `padding: 8px 12px 8px 8px`, raio 12; selecionada com `interactive-bg-hover` e `0.5px border-l2`. Indicador 20×20 com o número (seleção única) ou checkbox (múltipla). Rótulo 14/24 peso 500, descrição até 2 linhas. Selo "Recomendado" 11/18 peso 600 azul sobre `sidebar-nav-item-active-accent`.
- Linha "Digite sua resposta" no fim. Rodapé com paginação, "Pular" e "Próxima". Contagem regressiva opcional ("Continuando em {s}s", "Tirar um tempo").
- A resposta enviada vira um registro "Perguntas e respostas" na transcrição.

### 4.14 Plano

Fontes: `ui-plan/src/client/*`, `ui-user-questions/src/client/PlanReviewPanel.module.css`.

- Modo plano: chip no composer, 28 px, `padding: 0 8px`, raio 8, 13/20 peso 500, azul sobre `state-business-tertiary`; em hover o ícone vira "x" para sair.
- Plano gerado aparece na transcrição como cartão de arquivo: 60 px de altura, `padding: 8px 10px`, raio 16, `0.5px border-l1`, fundo `neutral-50` (escuro `neutral-850`); ícone em quadro 40×40 raio 10; título 13/20 peso 500; descrição "Plano · Markdown" 10/16; botão "Abrir" (28 px, `0.5px border-l3`, raio 8, 12/18). Abre no painel direito (documento 14 px, linha 1,75, `padding: 20px 24px 40px`).
- Revisão do plano substitui o composer: faixa âmbar 12px 16px 14/20, título 15/22 peso 500, descrição 14/24 (2 linhas), rodapé com "Ver plano completo >", "Recusar", "Pedir mudanças", "Aprovar".
- Lista de tarefas (todo) fica num painel encaixado acima do composer.

### 4.15 Erros, novas tentativas e limites

Fonte: `MessageItem.module.css`.

- Nova tentativa de requisição: linha `<details>` 13/20 `label-tertiary`, "Tentando novamente a requisição ({n}/{max}) · {s}s" com seta CSS que gira; abre detalhes "Atraso" e "Motivo da falha".
- Erro de turno: grade `10px | 1fr | auto` com ponto vermelho, título "Este turno falhou" em `state-error-primary` peso 600, mensagem `label-secondary`, código em mono 11/16 `label-tertiary`.
- Limite de tokens: título âmbar "Limite de tokens de saída atingido" + dica para enviar "continue".

### 4.16 Compactação de contexto

Linha de 24 px (`compactionRow`): ícone de contexto que vira chevron em hover, "Contexto compactado" 13/24, ponto 2×2, resumo "Compactou {n} itens do histórico (~{t} tokens)" truncado. Aberto, o botão fica `sticky` com fundo sólido e o resumo aparece recuado 22 px em 13/24 `label-tertiary`. Durante: "Compactando contexto…".

### 4.17 Ações de mensagem

Fonte: `MessageIconActions.module.css`, `TurnTailNodeView.tsx`, `ui-message-feedback/*`.

```css
.actions { display: flex; align-items: center; gap: 8px; height: 28px; }
.action { width: 28px; height: 28px; padding: 6px; border-radius: 8px; color: var(--dsw-alias-label-tertiary); }
.action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.action svg { width: 15px; height: 15px; }  /* 17px no rodapé do assistente */
.timeEnd { font-size: 12px; line-height: 24px; }
```

- Rodapé do turno do assistente (à esquerda, `margin-left: -6px`): Copiar, Gostei, Não gostei (abrem diálogo de feedback), Bifurcar ("Ramificar em nova conversa"; desabilitado com opacidade 0,4 e tooltip explicando fora da última mensagem), e à direita do grupo uso de tokens (pílula com painel) + horário.
- Não há botão "regenerar"; o equivalente é bifurcar.
- Copiar troca o ícone para check ("Copiado") por um instante. Tooltips abaixo.
- Rodapé visível sempre quando o turno termina em resposta; senão só em hover.
- Ao fim do turno, o slot de rodapé também mostra cartões de entrega ("Arquivos alterados": cabeçalho 60 px com quadro 40×40, título 13/20 peso 500, "+N −M" mono 10/16; lista de caminhos 12px; "Todos os {n} arquivos").

### 4.18 Estado vazio

Fonte: `ui-conversation/src/client/skeleton/HeroShell.module.css`, `EmptyHero.tsx`. Título centralizado 26/32 peso 500 `label-primary` com a marca ao lado (gap 10) e selo mono 12/18 "Preview" (pílula azul clara). Abaixo, linha de workspace (pasta + nome + chevron, 13px) e seletor de preset de agente à direita, depois o composer com piso de 2 linhas (52 px) e placeholder "Descreva o que você quer construir, / comandos, @ arquivos ou sessões". Sem sugestões de prompt. Sem workspace, o cartão inteiro vira seletor com contorno tracejado de 1 px que fica azul em hover.

---

## 5. Composer

Fontes: `ui-conversation/src/client/skeleton/InputBar.module.css`, `InputBar.tsx`, `ui-conversation/src/client/queue/QueueDock.module.css`, `ui-conversation/src/client/input/editor/*`, `ui-conversation/src/client/apply.ts`, `ui-conversation/src/submission-settings.ts`, `ui-input-trigger/src/client/MenuView.module.css`, `ui-attachment/src/*`, `ui-model-selection/src/client/ModelSelect.module.css`, `ui-goal/src/client/GoalBar.module.css`, `ui-chat/src/client/chat/StatsPills.module.css`.

### 5.1 Cartão

```css
.root { padding: 0 16px 4px; }                       /* clearance lateral */
.card {
  display: flex; flex-direction: column; gap: 12px; padding-top: 8px;
  max-width: var(--dsh-composer-card-max-width);    /* texto + 32px */
  border: 0; --dsw-elevation-stroke-color: var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-panel);           /* 28px */
  background: var(--dsw-specific-input-major); box-shadow: var(--dsw-elevation-soft);
  font-size: 14px; line-height: 24px;
}
.scroll { max-height: 336px; overflow-y: auto; margin-right: 4px; }   /* 14 linhas de 24px */
.input  { min-height: 36px; padding: 4px 8px 0 14px; caret-color: var(--dsw-alias-state-business-primary); }
.placeholder { position: absolute; inset: 4px 8px auto 14px; color: var(--dsw-alias-label-caption); white-space: nowrap; text-overflow: ellipsis; }
```

Editor é contenteditable (Lexical), não `<textarea>`, para suportar chips de comando e referências inline.

### 5.2 Barra de controles

```css
.row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 2px 8px 6px; container-type: inline-size; }
.add { width: 28px; height: 28px; border-radius: 999px; background: var(--dsw-specific-selector); color: var(--dsw-alias-label-primary); }
.primary { width: 34px; height: 34px; border-radius: 999px; background: var(--dsw-alias-button-info-fill); color: #fff;
  transform: translateY(-2px); transition: background-color 100ms ease; }
.primary:disabled { opacity: 0.4; }
@container (max-width: 560px) { .tools, .modes, .trailing { gap: 8px; } }
```

- Esquerda: "+" (`plus` medium 14; abre menu "Adicionar arquivos ou executar comandos"), chip de permissão (ex.: "Workspace Write" com ícone de escudo), chip de Plano quando ativo.
- Direita: seletor de modelo (28 px, `padding: 0 4px 0 8px`, raio 8, 13/20 `label-secondary`, máx. 360 px; mostra "Modelo" + esforço em cinza, ex. "DeepSeek-V4-Flash High", chevron 12; em largura estreita vira só ícone `data`), depois o botão principal.
- Botão principal: seta para cima branca sobre azul; vazio = opacidade 0,4; enviando = arco girando 800 ms; rodando = quadrado arredondado 10×10 (`rx=3`) de parar. Quando há rascunho durante a execução, aparecem os dois botões: parar e enviar.
- Menu do modelo: duas colunas "Modelo" e "Esforço", busca "Buscar modelos…".
- Abaixo do cartão (`.dock`, gap 12): pílulas de estatística 12/20 `label-tertiary` ("{t} turnos {s} passos", "Cache {p}%"), medidor de contexto.

### 5.3 Fila e "steer"

- Enviar com o agente ocupado coloca na fila por padrão (`DEFAULT_BUSY_ENTER_BEHAVIOR = 'queue'`); Ctrl/Cmd+Enter faz a ação complementar ("steer": injeta no turno em andamento). Configurável.
- Fila encaixada acima do cartão, colada a ele (cantos de baixo retos): painel translúcido `--dsw-specific-menu` + blur, raio 16 em cima, contorno `0.5px border-l1` sem borda inferior; cabeçalho 36 px "{n} mensagens na fila" 13/24 peso 500 com chevron; lista até 180 px; cada item com Editar, Remover, Steer.
- Mensagens de steer aparecem na transcrição como balão de usuário pendente, logo abaixo da linha de status.
- Placeholder com fila: "Cmd/Ctrl+Enter aplica steer em todas as mensagens da fila".
- Outros encaixes acima do composer com a mesma largura: objetivo (barra de 36 px, raio 12, `elevation-panel`), lista de tarefas.

### 5.4 Comandos e menções

Fonte: `ui-input-trigger/src/client/MenuView.module.css`.

- `/` abre comandos, `@` abre referências (arquivos e sessões). O menu abre **acima** do cartão, mesma largura do cartão: `bottom: calc(100% + 4px); left: 0; right: 0; max-height: 400px; padding: 4px; box-shadow: var(--dsw-elevation-prominent)`, superfície translúcida com blur.
- Item: `min-height: 34px; padding: 6px 8px; gap: 6px; raio 12; 13/20`; ativo (teclado ou mouse, um só destaque) `interactive-bg-hover`. Colunas: ícone 14 (`menu-icon`), nome (máx. 40%), alias 12/18 `label-tertiary` (máx. 20%), descrição 12/18 alinhada à direita, dica de tecla "Tab" para entrar em subníveis.
- Títulos de seção 11/16 peso 500 `label-tertiary`.
- Comando escolhido vira chip inline; referência vira texto azul (`state-business-primary`) com marcador `@` peso 500 e ícone, `max-width: 240px`; inválida riscada em vermelho.

### 5.5 Anexos

- Imagens no composer: miniaturas 64×64, raio 20, `0.5px border-l2-darkmode-thin`, trilho horizontal sem barra (setas circulares de 24 px quando transborda), botão remover 18 px no canto que aparece em hover.
- Arquivos: cartão 240×64, raio 16, ícone de tipo 28, spinner de 20 px durante upload, borda vermelha em falha com "Tentar de novo".
- Arrastar arquivos sobre a janela mostra overlay de drop (`bg-mask-drop`).

### 5.6 Atalhos

| Ação | Tecla (Windows desktop) |
|---|---|
| Enviar | Enter |
| Nova linha | Shift+Enter |
| Ação complementar (fila ↔ steer) | Ctrl+Enter |
| Parar geração | Esc Esc |
| Comandos / menções | `/` / `@` |
| Nova sessão | Ctrl+N |
| Buscar sessões | Ctrl+K |
| Adicionar workspace | Ctrl+O |
| Renomear / bifurcar / arquivar sessão | Ctrl+Alt+G / Ctrl+Alt+F / Ctrl+Shift+A |
| Sidebar esquerdo / direito | Ctrl+B / Ctrl+Alt+B |
| Arquivos / navegador / terminal | Ctrl+P / Ctrl+T / Ctrl+` |
| Configurações / atalhos | Ctrl+, / Ctrl+/ |
| Aprovar / rejeitar | Enter / Esc |

IME: Enter de composição nunca envia (`isComposing`, `keyCode 229`, janela extra de 10 ms).

---

## 6. Identidade de agente e como encaixar os Boos

Fontes: `ui-agent-preset/src/client/AgentPresetLabel.*`, `AgentPresetSeat.*`, `ui-agent-preset/src/client/locales.ts`, `ui-subagent/src/client/SubagentHeaderLineage.*`.

O que o DSH tem:

- **Presets de agente** (Padrão, PTC, Mínimo, Criador e personalizados): escolhidos na tela de nova sessão por um chip ao lado do workspace (28 px, `padding: 0 8px`, raio 8, 13/20 peso 500, ícone `agent-preset` + nome + chevron `label-caption`, máx. 240 px; ao trocar, o nome entra letra por letra, 0,4 s cada, com ícone escalando 0,5 → 1 em 0,15 s).
- No cabeçalho da sessão, o preset é rótulo somente leitura: 22 px, 12/22 `label-tertiary`, ícone 14 com opacidade 0,7, máx. 180 px; some quando a linha do cabeçalho fica abaixo de 540 px.
- Mensagens não têm avatar nem nome; o assistente é anônimo na transcrição. Subagentes são identificados só por título de sessão, árvore e status.

Como pôr os Boos (avatar + nome) na mesma anatomia sem quebrar o visual:

1. **Rodapé do turno**: antes de Copiar, inserir avatar de 16 px (círculo, `corner-shape: round`) + nome 12/24 `label-tertiary`, na mesma linha de 28 px das ações. Mantém a resposta em largura total e sem balão.
2. **Linha de status ao vivo**: trocar o ícone animado de 14 px pelo avatar do Boo com pulso e o texto por "{Boo} trabalhando há {duração}".
3. **Delegação/subagente**: a linha de processo usa o avatar de 16 px no lugar do ícone `agent-preset`; título "Delegou para {Boo}"; resumo após o ponto 2×2. Abrir a conversa do Boo no painel direito como aba "Chat", igual ao subagente.
4. **Cabeçalho da sessão**: o rótulo do preset vira "avatar 14 px + nome do Boo principal" nas mesmas medidas (22 px, 12/22).
5. **Sidebar**: o slot de status de 16 px continua sendo do status; o avatar do Boo, se exibido, vai no hover card, não na linha, para não perder a densidade de 32 px.
6. **Seleção na nova sessão**: chip igual ao `AgentPresetSeat`, listando Boos com avatar 16 + nome + descrição curta.

---

## 7. Checklist de fidelidade

1. Fundo do chat `#fff` no claro e `#151517` no escuro; sidebar rgb(249,250,251) / rgb(27,27,28).
2. Tema escuro alternado por atributo no `body`, com preferência padrão "sistema" e fundo pintado antes do primeiro render (sem flash).
3. Fonte de interface do sistema (`Segoe UI` no Windows) e código em `'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas…`.
4. Texto do chat 14/24 por padrão, ajustável de 10 a 22 px, com todas as alturas de linha acompanhando o delta.
5. Bordas finas de 0,5 px em todo lugar (sidebar, cabeçalho, botões contorno, tabelas).
6. Escala de raios 4/8/12/16/20/28 aplicada: composer 28, balão 20, blocos de código e cartões 16, linhas do sidebar 12, botões de ícone 8.
7. Ícones de traço fino (1 px; 1,3 px no peso medium), 14–16 px, cor herdada.
8. Anel de foco azul de 2 px só com navegação por teclado; nunca ao clicar.
9. Barras de rolagem de 5 px temáticas; no sidebar, invisíveis até o ponteiro entrar, sem deslocar as linhas.
10. Barra de título Windows de 40 px na cor do sidebar, arrastável, com controles nativos à direita.
11. Coluna central com canto superior esquerdo de 16 px sobre o fundo do sidebar no Windows.
12. Sidebar abre com 280 px, arrasta entre 264 e 420 px, recolhe para trilho de 56 px e recolhe sozinho abaixo de 1024 px.
13. Recolher/expandir anima em 300 ms ease-in-out; arrastar e redimensionar a janela não animam.
14. Alças de redimensionamento invisíveis de 8 px com cursor `col-resize`.
15. Botão Nova sessão de 38 px, raio 12, contorno 0,5 px, texto 14 peso 500, atalho visível só em hover.
16. Cabeçalho "Sessões" de 36 px com busca que expande no lugar (180 ms) para um campo de 32 px.
17. Opções de visão com Agrupar (workspace/árvore/lista), Ordenar (manual/atualização) e Filtro de arquivadas.
18. Linha de workspace de 34 px com pasta que vira triângulo em hover e gira 90° ao abrir (150 ms).
19. Linha de sessão de 32 px: slot de status 16 px, título 14/20, tempo compacto 10/16 (`1min`, `9min`, `1h`, `4d`).
20. Status da sessão: spinner de 14 px rodando; ponto âmbar quando espera aprovação/pergunta/plano, com o tempo trocado por "Aprovação"/"Resposta"/"Revisão do plano".
21. Em hover da sessão o tempo some e aparecem Arquivar, Fixar e "…"; título longo faz marquee com máscara de 12 px.
22. Selecionada e hover com o mesmo fundo `rgba(38,49,72,0.06)` (claro), raio 12, recuo de pintura de 3 px.
23. 5 sessões por workspace e depois "Mostrar mais {n} sessões".
24. Arrastar sessão mostra linha azul de 2 px entre linhas, sem mudar layout.
25. Largura do texto = 64% da coluna limitada a 680–920 px, centralizada; composer 32 px mais largo no mesmo eixo.
26. Cabeçalho da conversa de 76 px com breadcrumb 14/20 e abas de visão 13/16 com barra azul de 2 px na ativa.
27. Composer fixo no rodapé do mesmo scroller, com degradê de 36 px escondendo a transcrição por baixo.
28. Sem avatar e sem nome nas mensagens; usuário à direita, assistente em largura total à esquerda.
29. Balão do usuário: fundo azul muito claro (escuro: cinza 850), raio 20, `padding: 10px 16px`, 14/22, largura máxima ~70% do texto, sem markdown.
30. Horário e Copiar abaixo do balão; balões anteriores mostram as ações só em hover.
31. Resposta do assistente sem balão, blocos com gap de 16 px.
32. h1/h2/h3 a 21/19/18 px peso 700 com margem 32/16; parágrafos com 16 px.
33. Código inline com fundo claro, contorno 0,5 px, raio 8, `padding: 0 5px`, fonte 0,875em.
34. Bloco de código raio 16, sem borda, cabeçalho de 11/18 com linguagem e Copiar, cabeçalho grudando no topo ao rolar.
35. Tabelas sem grade vertical, células `10px 16px`, primeira coluna sem recuo, tabelas largas (4+ colunas) expandindo para a largura da transcrição.
36. Links azuis peso 500 sem sublinhado; sublinhado pontilhado só em hover.
37. Streaming sem cursor, com parse incremental (blocos antigos não re-renderizam).
38. Linha de status "trabalhando há {duração} ···" em azul acinzentado com shimmer de 1,5 s enquanto o turno roda.
39. Rolagem segue o fim quando a até 24 px do fundo; senão aparece o botão circular de 34 px "Voltar ao fim" 16 px acima do composer.
40. Cabeçalho do turno concluído "Concluído em 1m23s · N chamadas de ferramenta" com borda inferior 0,5 px e chevron que dobra todo o trabalho.
41. Turno concluído dobra o processo automaticamente (modo padrão "detailed", na conclusão), mantendo as respostas visíveis.
42. Grupos de processo com título por categoria ("Lendo arquivos", "Executando comandos"…) e corpo limitado a `min(400px, 50vh)` com máscaras de 24 px.
43. Linha de ferramenta de 24 px: ícone 16 → título 13 → ponto 2×2 → resumo truncado, em cinza terciário que escurece em hover.
44. Ícone da linha vira chevron em hover; clicar expande cartão IN/OUT mono 11/16 com seções de no máximo 150 px.
45. Erro de ferramenta pinta o resumo de vermelho; interrompida pinta de âmbar; sucesso não tem ícone.
46. "Pensar" recolhido em uma linha, com prévia da primeira linha; aberto em markdown compacto 13/20 recuado 22 px.
47. Subagente/delegação aparece como linha de processo e abre a conversa no painel direito como aba "Chat".
48. Aprovação substitui o composer: contorno âmbar 1 px, faixa âmbar "Aguardando aprovação", botões Rejeitar / Permitir uma vez / Sempre permitir; Enter permite e Esc rejeita. **Concluído em 29/10/2026:** “Sempre permitir” cria uma regra persistente para agente + workspace + caminho, comando exato ou ação de navegador exata; painel do agente permite revogar. Bypass é configurável por agente e Assistente: Codex `danger-full-access`/`approvalPolicy: never`, Claude Code `bypassPermissions`; as chamadas de ferramentas continuam no broker do Politron e ferramentas nativas de shell/edição não são expostas.
49. Pergunta substitui o composer: opções numeradas de 40 px, selo "Recomendado", campo de resposta livre, até `min(60vh, 520px)`. **Concluído em 29/10/2026:** `ask_user` aceita uma recomendação opcional que deve corresponder a uma opção, e a escolha correspondente recebe o selo sem seleção automática.
50. Plano aparece como cartão de arquivo de 60 px com botão "Abrir" e abre no painel direito.
51. Erro de turno com ponto vermelho, título vermelho peso 600 e código mono; nova tentativa como `<details>` "(n/max) · s".
52. Compactação como linha de 24 px "Contexto compactado · Compactou N itens (~T tokens)", expansível.
53. Rodapé do assistente: Copiar, Gostei, Não gostei, Bifurcar, uso de tokens e horário, ícones 17 px em botões de 28 px.
54. Estado vazio com título central 26/32 peso 500, linha de workspace e composer com piso de 2 linhas.
55. Composer: raio 28, sombra `elevation-soft`, contorno via sombra (sem `border`), altura máxima de texto 336 px.
56. Botão "+" circular de 28 px à esquerda; enviar circular de 34 px azul com seta branca; parar com quadrado arredondado.
57. Seletor de modelo como chip 13/20 cinza com nome + esforço e chevron, virando só ícone quando apertado. Adaptação Politron: navegação por provedor/modelo no mesmo menu, trilha de esforço e controles que o runtime anunciar para aquele modelo; níveis de serviço do Codex, Fast Mode do Claude compatível, níveis de pensamento do Pi e variantes do OpenCode. Modelo sem capacidade não exibe controle; Antigravity continua apenas consultivo enquanto não tiver execução. Opções seguem junto com a mensagem e são validadas pelo runtime, sem alterar conversas, menções, fila ou steering.
58. Enter enfileira durante execução; Ctrl+Enter faz steer; fila encaixada acima do composer com cantos inferiores retos.
59. `/` e `@` abrem menu acima do composer na largura dele, itens de 34 px, um único destaque compartilhado por teclado e mouse.
60. Referências inline em azul com `@` peso 500; inválidas riscadas em vermelho.
61. Miniaturas de imagem 64×64 raio 20 com remover em hover; cartões de arquivo 240×64 raio 16.
62. Painel direito desliza em 300 ms; abas de 28 px (80–170 px) com "x" sobreposto só na ativa/hover; ativa com fundo `markdown-tag`.
63. Menus translúcidos com `blur(40px) saturate(150%)`, raio 16, itens 13/20 de 34 px, raio 12, separador 0,5 px.
64. Todas as animações desligadas com `prefers-reduced-motion: reduce`.

---

## O que não foi possível determinar pelo código

- Não existe captura oficial de uma conversa com resposta, ferramentas, subagentes ou aprovação; os valores da seção 4 vêm só do CSS e TSX.
- Arte exata dos glifos (os SVGs estão em `ui-primitives/src/icons/artwork.ts`, mas a equivalência visual com Lucide é estimativa).
- Proporções finais do painel direito por conteúdo (arquivos, terminal, navegador) além da casca e das abas; os corpos não foram detalhados.
- Formato exato do texto do horário (`formatMessageClock`) e da duração foi inferido das chaves de tradução (`clock.md`, `clock.ymd`, `duration.compactMinutes`).
