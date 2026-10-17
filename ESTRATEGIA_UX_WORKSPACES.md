# Politron — estratégia de experiência: Workspaces, Sessões e Polis

Atualizado em 16/10/2026. Revisão de produto e implementação incremental, baseada no feedback de uso real.

## Princípio central

**Um lugar para trabalhar, uma equipe reutilizável, vários históricos independentes.**

- **Workspace = contexto e equipe/grupo.** Pode ter pasta de projeto, worktree ou ser livre. Define instruções, equipe padrão, permissões futuras e agrega sessões.
- **Sessão = uma conversa independente dentro do workspace.** Pode ser com Assistente, um Poli ou vários Polis simultaneamente; não aparece fora de um workspace.
- **Poli/Pits = agente reutilizável.** Tem aparência editável, especialidade, runtime, modelo, instruções e permissões. Participa de vários workspaces sem duplicar o perfil.
- **Chief = Poli coordenador, papel ainda a implementar.** Propõe e organiza agentes, tarefas e sessões, condicionado a autorizações explícitas, sem privilégios irrestritos.
- **Worktree = estratégia de isolamento de arquivos**, não uma nova camada de navegação obrigatória. Pode aparecer aninhado ao workspace original.

Evitar criar quatro entidades sobrepostas chamadas "projeto", "grupo", "workspace" e "chat". Um workspace com equipe padrão já é o grupo.

## Estrutura de navegação pretendida

```text
Politron
[+] Nova sessão livre

WORKSPACES                 [+]
⌄ Livre
   · Ideias
   · Conversa com Pits
⌄ Politron [equipe: 3]     [+] [...]
   · Planejamento
   · Implementação
   · Revisão de código
   ⌄ worktree: auth
      · Login
⌄ Molda [equipe: 2]        [+] [...]
   · Ajustar estúdio

AGENTES                    [+]
   [Poli] Pits — Desenvolvimento
   [Poli] Lyra — Design
   [Poli] Vera — QA
   [Poli] Chief — Coordenação (futuro)
```

O clique no **nome da pasta/workspace abre a visão geral**, com a equipe, o diretório e todas as sessões; **não cria histórico novo**. Só o [+] ou "Nova sessão" cria. Clicar no Poli na lista abre sua conversa livre existente ou cria uma, enquanto clicar nele dentro do workspace abre a conversa vinculada àquele projeto.

Cada item persistente precisa oferecer editar, excluir (com confirmação e proteção de arquivos) e, se tiver filhos, expandir/recolher. Sessões são linhas compactas e não devem ser repetidas sob cada avatar de agente.

## Padrões visuais

1. Chat vazio: Pits ilustrado, não o glifo/logotipo institucional. Mostrar equipe relevante abaixo apenas se houver participantes, sem desviar foco do composer.
2. Cabeçalho de conversa: avatares pequenos (42px) e descrição sucinta do workspace; chat vazio: avatares de participantes médios (56px), Pits de destaque maior.
3. Sidebar: hierarquia por indentação e cor, sessão em uma linha, avatar maior no catálogo de agentes, indicadores de execução/atenção discretos e menus acessíveis.
4. Workspace overview: equipe clicável, sessões existentes, estado vazio com ação "Criar primeira sessão", editar equipe/contexto e diretório.
5. Manter a identidade Poli Studio já definida. Inspiração de referência é sobre comportamento, não copiar componentes, marca, arte ou layouts.

## Referências de produto (conceitos, não cópia)

- **Paseo**: workspaces persistem mesmo sem sessão; sessões são abas dentro de um contexto de pasta; worktrees para isolamento. https://github.com/getpaseo/paseo/blob/main/public-docs/workspaces.md
- **OpenMausBot**: agentes aparecem como contatos reutilizáveis, com perfis próprios e conversas diretas. https://github.com/bcharleson/openmausbot
- **Chief / coordenação**: tratar como padrão de delegação, papéis, habilidades e revisão humana, não como autorização indiscriminada. https://github.com/thaitype/chief

## Auditoria de cobertura (16/10/2026)

### Implementado neste ciclo

- [x] Estado vazio usa Pits ilustrado em vez do logo; cabeçalho menor, participantes do vazio maiores.
- [x] Clique no workspace mostra overview e não cria sessão.
- [x] Novo workspace não cria sessão automaticamente.
- [x] Sessões ficam em uma linha menor e aninhadas em workspaces.
- [x] Sidebar separa workspaces de biblioteca de Polis, com recolhimento independente.
- [x] Contatos de agentes mostram rosto, especialidade e estado; não repetem todas as sessões sob os contatos.
- [x] Novas conversas livres reutilizam workspace "Livre".
- [x] Sessões legadas de workspace anônimo são mostradas dentro de "Livre" sem alterar o diretório original.
- [x] O workspace define equipe padrão; cada sessão pode usar um agente ou vários; conversa individual no contexto do workspace disponível na overview.
- [x] Exclusão de sessão, workspace e agente já conta com confirmação; worktrees têm fluxo de arquivamento.
- [x] Testes unitários sobre navegação sem criação implícita e persistência de sessões livres.
- [x] Busca local na barra lateral por workspace, sessão e agente, preservando o caminho da sessão na árvore.
- [x] Favoritos fixados para workspaces, sessões e agentes, com acesso rápido no topo da navegação.
- [x] Recolhimento de workspaces e seções persiste entre reinícios nesta instalação.
- [x] Chief é um papel explícito e único; pode propor agentes, mudanças na equipe, sessões e delegações. Cada ação aguarda aprovação explícita e fica registrada no histórico de aprovações.
- [x] Permissões persistidas por workspace controlam as propostas do Chief e podem bloquear escrita ou uso do navegador, sem conceder capacidades que o agente não tenha.
- [x] Painel lateral combina navegador, diff do workspace e terminal; conversa continua no painel principal.

### Próximas etapas de produto, ainda NÃO implementadas

- [ ] **Chief coordenador**: revisar a proposta de custo/modelo antes de aprovação, ampliar a trilha de auditoria das alterações manuais e adicionar retomada segura de propostas após reinício.
- [x] **Permissões por workspace**: o Chief requer habilitação explícita para criar/editar agentes, atribuir equipes e criar sessões; arquivos e navegador podem herdar o perfil do agente ou ser bloqueados por workspace.
- [ ] **Tela de equipe dedicada**: presets individuais/grupo, papéis (executor, revisor, coordenador), ordenação e fluxo drag-and-drop opcional. A overview existente já exibe a equipe e abre sua edição visual.
- [ ] **Melhor organização da lista em escala**: arrastar sessões, menus de contexto por clique direito e contadores por status. Busca, favoritos e persistência do recolhimento foram implementados localmente.
- [ ] **Migração opcional de sessões legadas** para workspace compartilhado físico, com preservação de contexto e decisão informada sobre diretórios; nunca mover silenciosamente.
- [ ] **QA visual dentro do Electron** com diferentes resoluções, textos extensos e dezenas de agentes; testes de fluxo E2E com banco real, além dos testes de componentes.
- [ ] **Painéis de trabalho estilo Paseo**: permitir redimensionar, esconder e reorganizar sessão, diffs, terminal e navegador e salvar o layout por workspace.

## Segurança e integridade

Arquivar ou excluir um workspace não deve apagar arquivos alterados sem confirmação explícita. Excluir um agente não deve eliminar o histórico escrito por ele. Criar um Poli via Chief deve ser proposta revisável antes de persistir, com modelo, custo, escopo de ferramentas e autorização apresentados ao usuário.

## Ordem sugerida

**P0**: corrigir navegação, tamanho e hierarquia, sem perder dados (este ciclo).

**P1**: testar visualmente no Electron, refinar pesquisa/listas e experiência de equipe, consolidar sessões legadas.

**P2**: implementar Chief e regras de autorização auditáveis.

**P3**: ampliar painéis, worktrees, execução paralela e UX móvel, sem perder o modelo workspace-first.

## Revisão UX — 17/10/2026: sidebar e design system

### Fluxo implementado

- **Navegação por contexto:** alternância entre abas **Projetos** e **Agentes** com shadcn/ui Tabs; a preferência é mantida localmente. A lista de agentes passa a ter espaço de rolagem completo, em vez do bloco pequeno fixo no rodapé.
- **Chief:** cartão sempre separado e em destaque, independentemente da aba escolhida. O papel é único e pode ser alterado via menu de ações; a persistência é responsabilidade do serviço existente.
- **Projetos e sessões:** árvore com recolhimento independente, sessões compactas, favoritos, indicadores de não lidas/aprovações e menus por item. Clicar no nome do projeto continua abrindo apenas a visão geral; criar sessão exige ação explícita.
- **Catálogo de agentes:** Polis ordenados com favoritos à frente, rosto e disponibilidade visíveis, com um único menu de ações para editar, favoritar, iniciar nova conversa, promover e excluir.
- **Busca rápida de navegação:** componente **Kokonut UI Action Search Bar / Command Palette**, instalado do registro público, com pesquisa por projetos, sessões, agentes e comandos de criação. Atalho global Ctrl+K (Cmd+K no Mac, conforme o componente). O campo de filtro abaixo das abas restringe somente a lista atual.
- **Criação contextual:** menu único de criar sessão livre, projeto ou agente, mantendo o atalho direto para nova sessão.

### Componentes padronizados

- **shadcn/ui:** Button, DropdownMenu, Input, Select, Checkbox, Tabs, Slider e Textarea. Os controles de papel, modelo, runtime, permissões do Chief, equipe, configuração do Assistente e ajustes do Poli não dependem mais de select/checkbox HTML nativos.
- **Kokonut UI:** Action Search Bar original (MIT, crédito preservado no arquivo) em `components/kokonutui/`. O projeto ganha `components.json` para futuras instalações via `@kokonutui`; não substituir o SVG dos Pits por um gerador de avatares externo.
- **Identidade visual:** priorizar hierarquia, status e legibilidade; evitar efeitos excessivos em listas com muitas sessões.

### Verificações e próximos refinamentos

- Testes de componentes, tipagem TypeScript e build de produção devem continuar como gates.
- Ainda falta QA visual real no Electron para estreitamento de janela, escala do Windows e dezenas de projetos; captura de tela do desktop pode estar ocluída por outra janela e não comprova a interface.
- Melhoria futura: comando para mover uma sessão entre workspaces, agrupamento configurável de agentes por equipe e drag-and-drop somente após garantir integridade e histórico.
