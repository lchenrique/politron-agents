# components/dsh

Componentes de interface portados do DeepSeek Harness (DSH), licença MIT (texto e copyright em [`LICENSE`](LICENSE)).

- Origem: repositório `deepseek-harness`, commit `f3803c96974ad4a94195fb97e5c637e9c2a3afe3` (`release(dsh): 0.2.2-alpha.2`).
- Pacotes: `packages/client/ui-primitives/src`, `packages/client/ui-tool/src/client/tool`, `packages/client/ui-theme/src/styles` e trechos de `packages/util/{code-language,workspace-path,file-drag}`.
- Marca do DSH não foi trazida: sem `BrandWordmark`, `FishLogo`, baleia, Montserrat nem os nomes "DeepSeek"/"Harness" na interface.

Fase 1: biblioteca isolada. Nenhuma tela do Boobot usa estes componentes ainda, exceto a galeria de desenvolvimento em `features/dev/DshGallery.tsx` (só com `import.meta.env.DEV`, rota `#/dsh-gallery`).

## O que veio

- **Primitivos** (código e CSS Modules originais): Modal, Button, Menu, MenuGroup, MenuSurface, Tooltip, HoverCard, HoverCardGroup, SegmentedControl, SegmentedTabs, Switch, Checkbox, Input, InlineEditor, Toast, TextShimmer, StateDot, Pill, Tag, DisclosureRow, FoldToggle, AnimatedRows, ShortcutKeys, PathLabel, FileTypeIcon, CodeFileIcon, LinkIcon, ReferenceIcon, UserMessageBubble, user-text, CommandText, RiskConfirmation, ImageLightbox, ImagePreview, DraggableImage, ícones (`icons/`, SVG inline do próprio DSH) e os hooks de suporte (`useModalLayer`, `useAnchoredPosition`, `useDismissOnOutsidePointer`, `focus`, `input-modality`, `keyboard-composition`…).
- **Blocos de conteúdo**: CodeBlock, CodeToolbar, DiffBlock, TerminalBlock (ANSI via `anser`), ReadBlock, SearchBlock, WebBlock, JsonBlock, JsonTree, MarkdownText e MarkdownDelegate (renderizador mdast→React próprio do DSH), QuotePreview, DetailDocument. Realce de código com o `shiki` já instalado, no mesmo esquema `css-variables` do DSH.
- **Linhas de ferramenta** (`tool/`): ToolRow, ToolDetails, ExitCodeBadge, ToolCallTree, BashRow (bash-sample), e as linhas read/read-family, search, web, file-mutation, todo, details e genérica em `tool/rows.tsx`.
- **Tema**: `theme.css` com os tokens `--dsw-*` claro/escuro.

## O que foi adaptado

- **Tema com escopo**: `body` virou `:root` e `body[data-ds-dark-theme]` virou `:root.dark` (o modo escuro do Boobot). `.dsh-light`/`.dsh-dark` forçam um modo num trecho. Só variáveis (`--dsw-*`, `--ds-*`, `--dsh-content-*`, `--shiki-*`), sem pintar nada global; ficaram de fora as regras globais de foco, scrollbar, `corner-shape` e o fundo do `body`. O sidebar continua com seus nomes curtos (`--dsh-fill` etc. em `features/sidebar/sidebar-dsh.css`), sem colisão.
- **Preflight do Tailwind**: listas do Markdown voltam a `disc`/`decimal` e os ícones de link ficam inline (comentados como "Boobot" nos `.module.css`).
- **Textos**: `strings.ts` em PT-BR substitui o `t()` do namespace `conversation`, usando as chaves do DSH como guia e corrigindo a tradução automática ("Correndo" → "Em execução", "Leia" → "Ler" etc.).
- **Linhas de ferramenta**: sem Cordis, slots, store nem `useDisclosure` externo. Recebem a forma neutra `DshToolCall` (`tool/types.ts`) já com os cartões no formato dos blocos; o disclosure é local ou controlado por `expanded`/`onToggle`. Estados neutros `preparing | running | success | error | interrupted` mapeiam para os do DSH (`ok`, `stopped`). Ficaram para a fase do chat: cartão de imagem (`read_image`), pergunta ao usuário e histórico de diff do todo.
- **React 19 / TS do Boobot**: `inert` booleano, `useRef` com valor inicial, `replaceAll` trocado por `split().join()` (lib ES2020).
- **Removidos**: KaTeX (não é dependência do app; TeX fica como texto), marcas de sites do `simple-icons` (links usam o globo genérico; ver `SiteGlyph.tsx`), formulários de configuração, ZoomControls, ConnectionIndicator, PermissionIcon, arte de plugins/guias, `mime` em `util/file-drag.ts` (só o tipo ficou).

## Dependências

Nova: `anser@2.3.5`. Passaram de transitivas a diretas, nas versões já instaladas: `shiki`/`@shikijs/langs@4.5.0`, `diff@9.0.0`, `mdast-util-from-markdown@2.1.0`, `mdast-util-gfm@3.1.0`, `micromark-*` e `@types/mdast@4.0.4` (dev).

## Testes

`dsh-primitives.test.tsx` (Modal, Menu, Tooltip, SegmentedTabs, Switch) e `dsh-blocks.test.tsx` (ToolRow, ToolCallTree, DiffBlock, TerminalBlock, MarkdownText).
