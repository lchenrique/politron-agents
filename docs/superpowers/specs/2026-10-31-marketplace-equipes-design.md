# Marketplace de equipes de Boos

Data: 31/10/2026. Branch: `feat/marketplace-equipes`.

## Por quê

Hoje, para ter uma equipe especializada, a pessoa precisa pedir ao Chief (ou montar à mão) cada Boo: nome, alma, para que serve, características. O Marketplace entrega equipes prontas. A pessoa escolhe uma equipe, decide para onde ela vai e começa a trabalhar.

## O que é

- Uma tela **Marketplace** no Boobot com um catálogo de **equipes prontas**. É **gratuito**: sem preço, sem pagamento, sem conta, sem loja online. O catálogo vem dentro do app.
- Cada equipe tem nome, descrição, área (ex.: Redes sociais) e uma lista de membros. Cada membro é um Boo completo, igual a um Boo criado hoje: nome, menção, descrição, instruções (a "alma": o que ele é, para que serve, características), cor e aparência, e as **skills** dele.
- **Contratar** cria esses Boos de verdade (agentes normais, editáveis e excluíveis depois, como qualquer outro). Na contratação a pessoa escolhe o destino:
  - **Global (livre)**: os Boos ficam disponíveis em qualquer lugar, sem projeto.
  - **Projeto**: a pessoa escolhe um projeto existente; os Boos entram na equipe padrão daquele projeto (`Workspace.defaultAgentIds`).
- A primeira equipe do catálogo é a de **Instagram / Redes sociais**, montada a partir do repositório gratuito [Ootto-AI/claude-content-skills](https://github.com/Ootto-AI/claude-content-skills) (licença MIT, 54 skills). Outras equipes (marketing, etc.) virão depois, como dados novos no catálogo, sem mudar código.

## Metas

1. Tela Marketplace acessível pela barra lateral (item "Marketplace", junto de Central, Board e Escritório).
2. Cartão de cada equipe com: nome, área, descrição, membros (Boo desenhado com cor e acessório de cada um, nome e papel em uma linha) e botão **Contratar**.
3. Detalhe da equipe: o que cada membro faz e quais skills ele tem.
4. Contratar: escolher destino (Global ou um projeto) e motor/modelo dos Boos; confirmar; Boos criados; aviso de sucesso; abre uma conversa em grupo com a equipe, liderada pelo membro líder.
5. Skills por Boo: cada membro só recebe as skills da sua função (além das skills globais que já existem hoje).
6. Equipe de Instagram completa com as 54 skills distribuídas entre os membros.
7. Skills editáveis (decidido pelo usuário): no editor de Boo, uma seção de skills mostra as skills do Marketplace que o Boo tem e permite adicionar ou remover qualquer skill do Marketplace, inclusive em Boos que não vieram de equipe. As ferramentas do Chief de criar e editar Boo (`agent_create` e afins em `chief-control.ts`/`workspace.ts`) aceitam `skillIds`. A página de skills nas Configurações lista as skills do Marketplace como origem própria, só leitura (não dá para excluir; `SkillsService.remove` continua recusando).

## Fora do escopo (não fazer agora)

- Pagamento, preço, conta, avaliação, loja online, baixar equipes da internet.
- Pessoa publicar a própria equipe no Marketplace.
- Marketplace no PWA (celular). Fica só no app desktop por enquanto.
- Publicar posts no Instagram de verdade (as skills só produzem roteiro, legenda, calendário, respostas etc.).
- Traduzir o conteúdo das skills para português.

## Antimetas (falharia mesmo funcionando)

- Contratar apagar, sobrescrever ou renomear Boos que a pessoa já tem.
- Skills de uma equipe vazarem para todos os Boos e poluírem o prompt dos outros agentes.
- Contratar a mesma equipe duas vezes quebrar por menção repetida.
- Uma equipe contratada virar algo especial que não dá para editar ou excluir como um Boo normal.

## Restrições do código atual (verificadas)

- `Agent` (`src/shared/v9.ts`) não tem campo de skills. Skills hoje são globais (`src/main/v9/skills/`: `~/.codex/skills`, `~/.claude/skills`, pastas externas e `skills-learned`). O bloco de skills entra no início de cada turno (`workspace.ts`, máx. 30 itens / 2000 caracteres); os agentes leem o conteúdo sob demanda com `list_skills`/`read_skill`.
- `read_skill` só lê `SKILL.md`. Arquivos auxiliares (`references/*.md`, scripts) não são expostos.
- `WorkspaceStore.saveAgent` exige menção única (`Essa menção já pertence a outro agente.`) e instruções não vazias (até 20000 caracteres). Só pode haver um Chief.
- Equipe padrão de projeto aceita até 10 agentes (`store.ts:481`).
- Conversa em grupo: `Conversation.kind 'group'`, 1 a 10 agentes, `responseMode` com `leaderAgentId`.
- Itens da barra lateral em `Sidebar.tsx` (bloco `nav aria-label="Trabalho"`), view no `AppShell.tsx`.

## Decisões de como fazer

1. **Catálogo dentro do app**, como arquivos versionados: `apps/desktop/resources/marketplace/teams/<id-da-equipe>/team.json` e as skills da equipe em `apps/desktop/resources/marketplace/skills/<id-da-skill>/` (pasta inteira copiada do repositório de origem, com `SKILL.md`, `references/` e scripts). O `LICENSE` original e a atribuição à Ootto ficam junto (`resources/marketplace/skills/NOTICE-ootto.md`). Empacotado no exe como recurso extra.
2. **Formato de `team.json`** (minha proposta):
   ```json
   {
     "id": "instagram",
     "name": "Equipe de Instagram",
     "area": "Redes sociais",
     "description": "…",
     "leader": "diretor",
     "members": [
       { "key": "diretor", "name": "…", "alias": "…", "description": "…", "instructions": "…",
         "color": "#…", "pitsHeadAccessory": "…", "skills": ["content-factory", "going-viral"] }
     ]
   }
   ```
3. **Skills por Boo**: novo campo opcional `Agent.skillIds?: string[]`. Skills do Marketplace são uma nova origem (`source: 'marketplace'`) que **só aparece** para Boos que as têm em `skillIds`. As skills globais continuam aparecendo para todos, como hoje. O bloco de skills do turno lista primeiro as skills do Boo.
4. **`read_skill` lê arquivos auxiliares**: aceita um caminho relativo opcional dentro da pasta da skill (ex.: `references/social.md`), bloqueando saída da pasta. Scripts (ex.: `hook-mining/mine_hooks.py`) não são executados pelo Boobot; o Boo recebe o caminho absoluto e pode rodar pelo shell que já tiver permissão.
5. **Contratar** (processo principal, uma operação):
   - cria cada membro com `saveAgent` usando os dados do `team.json` + motor/modelo escolhidos; se a menção já existir, acrescenta sufixo numérico (`roteirista-2`);
   - destino Projeto: acrescenta os novos ids em `defaultAgentIds` do projeto, respeitando o limite de 10 (se estourar, recusa com mensagem clara antes de criar qualquer Boo);
   - cria conversa em grupo com os membros, `responseMode: 'leader'`, líder = membro `leader`, no projeto escolhido (ou na área livre se Global);
   - se algo falhar no meio, remove os Boos já criados nessa contratação.
6. **Idioma**: nomes, papéis e almas dos Boos em português. Conteúdo das skills fica em inglês; as instruções de cada Boo mandam responder no idioma da pessoa.
7. **Memória (`ai-brain`)**: a skill grava notas Markdown numa pasta. Mantida; as instruções do líder apontam a pasta para `AI Brain/` dentro do projeto (ou da área livre se Global). Sem Obsidian obrigatório.
8. **Membros da equipe de Instagram (6 Boos)** e distribuição das 54 skills:
   - **Diretor de conteúdo (líder)**: content-factory, going-viral, ai-brain, content-pillar-builder, series-planner, content-calendar, best-time-scheduler, campaign-brief.
   - **Pesquisador**: agent-reach, content-research, reel-analyzer, trend-spotter, competitor-teardown, comment-mining, social-listening, hook-mining, viral-carousel.
   - **Roteirista**: virality, viral-hook-writer, ab-hook-tester, reel-scripter, reel-builder, on-screen-text-writer, b-roll-shot-list, cover-thumbnail-brief, story-sequencer, carousel-builder.
   - **Copywriter e distribuição**: caption-and-hashtags, cta-writer, hashtag-keyword-research, content-repurposer, cross-platform-reformatter, cross-platform-distribution, x-thread-strategy, linkedin-thought-leadership.
   - **Relacionamento**: comment-responder, dm-script-writer, community-engagement-plan, collab-outreach, creator-outreach, influencer-partnerships, ugc-creator-brief.
   - **Analista**: analytics-readout, social-analytics-report, content-audit, profile-conversion-audit, bio-profile-optimizer, audience-personas, positioning-audit, competitor-positioning, social-proof-mining, paid-social-brief, utm-campaign-plan, launch-retrospective.

   A skill `content-factory` (orquestradora) chama as outras em sequência; como cada skill agora pertence a um Boo, as instruções do Diretor dizem para **delegar** cada etapa ao membro dono da skill na conversa em grupo, em vez de executar tudo sozinho.

9. **Host remoto** (minha decisão): contratar segue o mesmo caminho de criar um Boo hoje. Se o app estiver conectado a outro host, a contratação acontece nesse host. `marketplaceTeams` e `hireTeam` entram na lista de métodos liberados em `src/main/hosts/rpc.ts`; o catálogo é lido do app do host, e os caminhos de skill e `AI Brain/` são os da máquina do host.

## Deixado para quem implementar

- Visual exato da tela Marketplace e do diálogo de contratação, seguindo `docs/design.md` e os componentes `dsh` existentes (Modal, Menu, Button) e o desenho de Boo existente.
- Texto final das almas (instruções) de cada Boo, a partir dos papéis do README da Ootto e das skills de cada um.
- Onde o catálogo é lido no processo principal e como chega ao renderer (IPC novo, ex.: `marketplaceTeams` e `hireTeam`).
- Testes: unitários para contratação (sufixo de menção, limite de 10, rollback), filtro de skills por Boo e `read_skill` com caminho auxiliar; e2e simples da tela.
