# Politron — Layout de abas e painéis (17/10/2026)

## Implementado
- `features/panels/DockWorkspace.tsx` substitui o painel direito fixo e envolve chat/visão de workspace. Cada área (principal e auxiliar) possui suas próprias abas e menu `+`.
- Abas: Chat, Arquivos, Terminal, Navegador do agente, Mascote e Alterações vs HEAD. Abrir um arquivo na árvore cria uma aba própria de largura total na área principal; é possível fechar e mover abas entre as áreas.
- Arrastar abas usando drag-and-drop HTML5; alternativa acessível no menu `…` de cada área. Painel auxiliar pode ser posicionado à esquerda, direita, acima ou abaixo e redimensionado pelo divisor (também por teclado).
- Layout e abas persistidos em `localStorage` na chave `politron.dock.layout.v1` (atualmente layout **global**, ainda não específico de workspace).
- `TitleBar` tem menu `Abrir painéis e abas` para escolher abrir ferramentas no painel auxiliar ou na área principal. `ChatHeader` oferece acesso direto a Arquivos, Navegador e Mascote.
- `features/panels/ProjectExplorer.tsx` usa árvore real via IPC; `FilePreview.tsx` abre arquivos em abas sem limite artificial de largura, **somente leitura**, tamanho máximo de 1 MB.
- `main/v9/project-files.ts`: restrição à pasta real do workspace, verificação de traversal e symlinks para fora; não lista pastas pesadas como node_modules/.git; não renderiza binários.
- Terminal: `vibe:terminal:create` reanexa o PTY existente ao mover a aba dentro do mesmo workspace; `vibe:terminal:close` encerra a sessão quando a aba Terminal é fechada. Browser: fechar a aba oculta a visualização, **não encerra o navegador nem a execução do agente**.
- Mascote: painel com seletor de agente e PoliAvatar grande, inclusive suporte a fotos personalizadas.

## Testes / QA
- `src/main/v9/project-files.test.ts` cobre listagem, leitura, traversal, binário e limite de tamanho.
- `DockWorkspace.test.tsx` cobre abertura de ferramentas, abrir arquivo por árvore, mover chat por ações/drag, fechar e recuperar layout.
- TypeScript, lint dos arquivos da mudança e build de produção passaram; snapshot visual do Electron reiniciado confirma a barra de abas ativa.
- A suíte completa existente tem dois testes de Chief ainda atrelados ao comportamento anterior de esconder ferramentas sem permissão. Outra sessão está alterando o comportamento do Chief para expor as ferramentas e negar na execução com instruções; isso é trabalho separado deste layout e não foi desfeito aqui.

## Próximos passos
1. Evoluir de apenas dois grupos para divisões aninhadas múltiplas (layout realmente livre com várias colunas/linhas).
2. Tornar visualizador um editor com destaque de sintaxe e salvamento protegido (confirmações, concorrência e diff).
3. Salvar layout por workspace/projeto e preservar/restaurar buffer do terminal ao mover.
4. Adicionar fechar navegador/sessão por API explícita e segura, sem afetar a execução indevidamente.
5. Testar interativamente todas as operações visuais no Electron, incluindo telas menores e DPI de 125%.

## 17/10/2026 — Docking aninhado, segunda fase

### Implementação
- `features/panels/dock-layout.ts`: modelo de árvore recursiva `DockNode` (`group` e `split`). Cada grupo possui abas independentes; cada divisão registra eixo e percentual de dimensão. Até 8 grupos simultâneos.
- `features/panels/DockWorkspace.tsx`: UI recursiva com separadores redimensionáveis por mouse e teclado (setas), menus para dividir um painel existente em qualquer direção, criar grupo vazio, mover aba para grupo existente e arrastar uma aba para uma região ou borda para criar divisão.
- **Preset no menu superior:** `Abrir painéis e abas → Layout de programação (4 painéis)`: chat à esquerda, editor ao centro, arquivos à direita, terminal abaixo. As abas que já existiam são preservadas no centro (inclusive arquivos e outros widgets).
- Clique em um arquivo da árvore → nova aba na região dedicada ao editor, sem apertar o chat.
- Persistência migrou automaticamente de `politron.dock.layout.v1` para `politron.dock.layout.v2`, preservando sessões e abas do layout anterior. Recuperação de layout corrompido usa fallback seguro.
- O Composer preserva texto digitado ainda não enviado em `sessionStorage` por conversa e mantém anexos em memória durante movimentações; não publica mensagens ao rearranjar as abas.
- Botões de layout no menu de cada grupo, e ação `Restaurar layout inicial`. Fechar aba Terminal é a única ação visual que encerra o PTY; mover não o encerra.
- Não há gravação de arquivo pela prévia; nenhuma alteração foi feita em arquivos do projeto explorado.

### Validação
- Testes de layout recursivo: divisões em quatro painéis, DnD, migração de estado antigo, restauração, sem duplicação, redimensionamento e preset.
- Suíte completa: **108 testes aprovados, 2 pulados, 22 arquivos**. O teste antigo do Chief foi atualizado para validar a autorização na execução: ferramentas visíveis no prompt não significam autorização de ação; o backend continua bloqueando propostas sem permissão.
- TypeScript, lint dos arquivos tocados, `git diff --check` e build de produção.

### Restrições atuais
- Até 8 regiões independentes; múltiplos monitores/janelas flutuantes não implementados.
- Prévia de arquivo continua somente leitura, até 1 MB, sem editor de texto persistente.
- Layout salvo globalmente no dispositivo, não por workspace; caberá refinar numa próxima fase.
- Recursos visuais de preview e browser ainda necessitam validação interativa completa em Electron com DPI diferentes.
