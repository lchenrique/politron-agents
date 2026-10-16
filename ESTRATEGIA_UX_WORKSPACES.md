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

### Próximas etapas de produto, ainda NÃO implementadas

- [ ] **Chief coordenador**: capacidade para propor criação/edição de Polis, montar equipes e delegar tarefas com aprovação e auditoria.
- [ ] **Permissões por workspace**: escopos `agent:create`, `agent:edit`, `team:assign`, `session:create`, `files:write`, `computer:use` e trilha de aprovação.
- [ ] **Tela de equipe dedicada**: presets individuais/grupo, papéis (executor, revisor, coordenador), ordenação e fluxo drag-and-drop opcional.
- [ ] **Melhor organização da lista em escala**: filtro/busca, pins, arrastar sessões, menus de contexto por clique direito, contadores por status e persistência do recolhimento entre reinícios.
- [ ] **Migração opcional de sessões legadas** para workspace compartilhado físico, com preservação de contexto e decisão informada sobre diretórios; nunca mover silenciosamente.
- [ ] **QA visual dentro do Electron** com diferentes resoluções, textos extensos e dezenas de agentes; testes de fluxo E2E com banco real, além dos testes de componentes.
- [ ] **Painéis de trabalho estilo Paseo**: sessão, diffs, terminal e navegador combináveis no mesmo workspace e layout salvo.

## Segurança e integridade

Arquivar ou excluir um workspace não deve apagar arquivos alterados sem confirmação explícita. Excluir um agente não deve eliminar o histórico escrito por ele. Criar um Poli via Chief deve ser proposta revisável antes de persistir, com modelo, custo, escopo de ferramentas e autorização apresentados ao usuário.

## Ordem sugerida

**P0**: corrigir navegação, tamanho e hierarquia, sem perder dados (este ciclo).

**P1**: testar visualmente no Electron, refinar pesquisa/listas e experiência de equipe, consolidar sessões legadas.

**P2**: implementar Chief e regras de autorização auditáveis.

**P3**: ampliar painéis, worktrees, execução paralela e UX móvel, sem perder o modelo workspace-first.
