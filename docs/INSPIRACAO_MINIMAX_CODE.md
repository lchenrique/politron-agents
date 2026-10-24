# Inspiração: organização e desempenho do MiniMax Code

Atualizado em 24/10/2026. Documento de referência e plano. Nada aqui está implementado além do que está explicitamente marcado como feito.

## Objetivo

Entender como o MiniMax Code organiza o sidebar e como ele mantém a lista de projetos leve, para levar essas decisões ao Politron sem copiar componentes, marca ou layout.

## Como a evidência foi obtida

O CLI do MiniMax Code é open source MIT (`github.com/MiniMax-AI/minimax-code`). O aplicativo desktop **não** é open source, então o código do app foi analisado como artefato fechado.

Duas fontes foram usadas:

1. **REA (Reverse Engineer Anything)**, repositório `morluto/rea`, executado contra `resources/app.asar` do app instalado. A análise estática foi descartada por custo: são 29.102 arquivos e o REA processa cerca de um arquivo por segundo. O REA continua sendo a ferramenta indicada para perguntas pontuais sobre um alvo específico.
2. **Leitura direta do `app.asar`**. O pacote empacotado inclui o código TypeScript original do runtime interno `@mavis/local-runtime-v2`, incluindo o módulo `projects/sidebar` e o schema do banco. Essa foi a fonte mais rica de evidência.

Caminho do artefato analisado: `C:\Users\lchen\AppData\Local\Programs\MiniMax Code\resources\app.asar`.

## Organização do sidebar no MiniMax Code

O sidebar do app desktop é composto por:

- Um **rail estreito fixo** no topo esquerdo, com o logotipo, o botão de recolher o painel e o buscador.
- Uma coluna de navegação com as entradas de topo (`New task`, `Site`, `Remote`) e o seletor `Local` / `Cloud`.
- Uma lista de projetos com seções nomeadas.

As seções reconhecidas nas chaves de internacionalização do bundle do renderer:

| Chave | Rótulo | Papel |
| --- | --- | --- |
| `section_starred` | Starred | favoritos |
| `section_main_agent` | Recents | recentes |
| `section_agents_team` | Agent Team | equipe de agentes |
| `section_mavis_agent` / `section_projects` | Projects | projetos |
| `section_archived` | Archived | arquivados |
| `section_schedules` | Scheduled | agendados |
| `section_today`, `section_yesterday`, `section_previous_7_days`, `section_older` | por data | agrupamento temporal dos recentes |
| `section_remote_sessions` | Remote sessions | sessões de host remoto |
| `section_panels` | Panels | painéis |

A lista de projetos é **plana**. A ordenação é `pinned DESC, order_index ASC, latest_activity_at_ms DESC, project_id ASC`. Cada projeto abre e revela suas sessões. Existem dois modos de visualização do histórico (`view_mode_recents` = "By task", `view_mode_projects` = "By project") e um conjunto de filtros que inclui `filter_group_by` ("Grouping"), status, agentes e atividade recente. Sessões sem projeto caem no agrupamento sintético `ungrouped_project` ("No project selected").

Ações de projeto disponíveis: fixar, renomear, arquivar as sessões do projeto, remover, mostrar no gerenciador de arquivos, mover para outro projeto, criar projeto local ou SSH.

## Desempenho: a decisão que faz a lista parecer leve

O módulo `projects/sidebar` do runtime descreve em `README.md` a topologia de consulta, que é o ponto central desta análise.

A listagem de projetos é fixada em **três leituras com suporte em SQL**:

1. **Página do catálogo de projetos.** Paginação por *keyset* no índice de projetos, com a contagem de sessões raiz relacionada calculada na mesma consulta, resolvendo existência e `sessionCount` filtrado de uma vez.
2. **Prévias de cada projeto.** O top-K de sessões raiz por projeto é calculado em SQL com `row_number() OVER (PARTITION BY project_id ...)`. O Node apenas hidrata pelo ranking devolvido e não executa ordenação nem filtro de negócio.
3. **Lote de filhos.** Uma única leitura traz os filhos de todas as prévias da página. Os filhos não recebem o predicado de agente do pai.

O documento impõe que o plano de consulta atinja `idx_local_runtime_projects_list_v1`, `idx_local_runtime_sessions_project_root_recency_v4` ou a variante de agente, e **não** pode produzir `USE TEMP B-TREE`.

### O banco mantém os contadores

A tabela `local_runtime_projects` guarda `latest_activity_at_ms` e `session_count` como colunas materializadas. Quatro triggers (`PROJECT_V5_TRIGGERS`) mantêm esses valores em sincronia quando uma sessão é inserida, reatribuída, atualizada ou removida. A consequência prática é que a leitura da lista **nunca agrega sessões**: não existe `COUNT` em tempo de consulta sobre a tabela de sessões para montar a sidebar.

### Índices

```sql
index('idx_local_runtime_projects_list_v1').on(
  table.hidden,
  desc(table.pinned),
  asc(table.orderIndex),
  desc(table.latestActivityAtMs),
  asc(table.projectId),
)
```

O índice reproduz exatamente o `ORDER BY` do catálogo, por isso a ordenação sai do índice e não de um sort temporário. A paginação é por cursor com a cadeia de desempate completa (projeto fixado, índice de ordem, atividade, id), sem `OFFSET`.

### Confirmação por análise de evidência

A ordem foi confirmada de forma independente pelo REA, em sessão própria, com evidência citável `ev_159c5d0e85deef004d0a5b11c18ddcf796f56abfe6f4976c00927abd2ba95894`:

| Fato | Arquivo e linhas dentro do app.asar |
| --- | --- |
| `desc(p.pinned)`, `asc(p.orderIndex)`, `desc(projectActivityExpression)`, `asc(p.projectId)` | `…/local-runtime-v2/src/service/session-system/projects/sidebar/query.ts` L99-102 |
| Mesma tupla em SQL cru com `tupleAfter` para paginação keyset | `sidebar/query.ts` L86-91 |
| Catálogo (`listPage`) repete os mesmos quatro critérios | `…/projects/repo/drizzle.ts` L143-146 |
| `DEFAULT_PROJECT_ORDER_INDEX` materializa a mesma tupla como índice SQLite, exportado na linha 4 e usado em `repo/drizzle.ts` L178 | `…/local-runtime-v2/src/infra/db/schema/projects.ts` L4 e L37-42 |
| `projectActivityExpression` resolve para `projects.latestActivityAtMs` e `sessions.updated_at_ms` | `…/projects/repo/activity.ts` L8-13 |
| Variante de recentes: `desc(recentAtMs), asc(projectId)` | `…/projects/repo/drizzle.ts` L169 |

### Identidade

O projeto padrão é uma linha real com `project_kind = 'default'` e `workspace_dir = NULL`, exposto com a chave `default`, sem usar string vazia como sentinela. Check constraints garantem a coerência entre `project_kind` e `workspace_dir`. Caminhos de worktree são normalizados para o repositório pai, com reconhecimento explícito dos marcadores `.worktrees` e `.worktree`, sem confundir diretórios de dados de ferramentas como `.codex/worktrees`.

## O que o MiniMax Code não tem

Não existe no domínio `projects` qualquer entidade de pasta, grupo ou categoria de projeto. `project_kind` aceita somente `'default'` e `'workspace'`, com CHECK no banco. Agrupamento de projetos para o usuário é feito por fixação, ordem manual, modo de visualização e filtro, e não por pastas nomeadas.

Isso significa que a ideia de agrupar projetos em pastas como "Projetos Pessoais" e "Projetos da Empresa" **vai além do MiniMax Code**. Ela é uma evolução própria do Politron, e o modelo do MiniMax Code serve de referência para a parte que ele resolve bem: lista plana, ordenada, paginada e sem agregação em tempo de leitura.

## Proposta para o Politron

### Frente 1. Navegação em rail fixo mais painel recolhível

O MiniMax Code mantém um rail estreito sempre visível e recolhe apenas a coluna larga. O Politron recolhe a coluna inteira, e por isso o botão de recolher precisava ficar na TitleBar, no grupo da direita junto do seletor de tema e do mascote, posição que atrapalhava a leitura e não correspondia a nenhum padrão.

**Feito em 24/10/2026:** existe um rail fixo à esquerda com a marca do Boobot, o botão de recolher e o atalho do painel direito, sempre visíveis mesmo com a barra recolhida. O botão saiu da TitleBar e foi para o rail, e a marca deixou a TitleBar do desktop para não duplicar. O rail é exclusivo do Electron: a PWA mantém o drawer e o toggle próprios, sem mudança no mobile.

Arquivos: `apps/desktop/src/renderer/src/features/sidebar/SidebarRail.tsx` (novo), `apps/desktop/src/renderer/src/features/app/AppShell.tsx` (render do rail), `apps/desktop/src/renderer/src/components/ide/TitleBar.tsx` (retirada da marca e do toggle no desktop).

### Frente 2. Botão rápido do painel direito

O MiniMax Code abre o painel direito por um botão único no canto superior direito do cabeçalho da conversa, com a escolha do conteúdo já dentro do painel.

O Politron já tem o dock (`DockZone = 'main' | 'side'`) e o menu "Abrir painéis e abas", que abre a ferramenta escolhida na zona `side`. Falta o botão único de abertura rápida.

**Feito em 24/10/2026:** o atalho do painel direito foi para o rail, junto da marca e do toggle da barra lateral. O rail do desktop passou a ter os três controles do app empilhados, como no MiniMax Code. A TitleBar do desktop ficou sem esses botões, sobrando apenas a área de arraste da janela. O botão de recolher do sidebar saiu da TitleBar e foi para o rail (Frente 1).

Verificação: `npm run typecheck` sem erros e `TitleBar.tsx` sem erros de lint. As falhas de lint existentes no repositório estão em outros arquivos, principalmente `src/main/v9`, e são anteriores a esta alteração. A suíte `npm test` terminou com 563 testes passando, 2 falhando e 23 pulados. As duas falhas ficam em `src/main/pwa/gateway.test.ts` e vêm das mudanças não commitadas do gateway PWA (o limite de tentativas responde 429 antes do 400 de corpo grande), sem relação com o renderer.

Validação visual feita com o app de desenvolvimento em execução (`npm run dev`, renderer em `localhost:5173` e gateway em `127.0.0.1:6780`): a captura da janela do Boobot confirma o logotipo BOOBOT seguido dos dois botões à esquerda, e o clique no botão novo abre o painel direito na aba Arquivos. O aceite do usuário ainda é o passo que falta.

### Frente 3. Pastas de projetos

Objetivo: permitir criar uma pasta e agrupar projetos, por exemplo "Projetos Pessoais" e "Projetos da Empresa", dentro da aba Projetos do sidebar.

Decisão de modelo recomendada, alinhada ao que foi observado no MiniMax Code e ao `ESTRATEGIA_UX_WORKSPACES.md` deste projeto:

- **Não criar uma nova entidade de domínio** "grupo". O documento de estratégia do Politron pede para evitar entidades sobrepostas "projeto", "grupo", "workspace" e "chat".
- Persistir a associação como **rótulo de agrupamento** por workspace, com valor nulo para projetos sem pasta. É uma coluna, não uma tabela nova, e não interfere nos contratos de IPC existentes.
- Agrupar apenas na renderização do sidebar. Ordenação, favoritos, busca e demais comportamentos continuam os mesmos.
- Criação, renomeação e exclusão de pasta pela própria interface, com arrastar e soltar opcional apenas depois de garantida a integridade do histórico, como já consta nas próximas etapas do documento de estratégia.

A pasta é uma organização de navegação. Ela não muda o diretório do projeto, não cria sessão e não interfere no time padrão do workspace.

**Feito em 24/10/2026:** o agrupamento existe no sidebar da aba Projetos, sem criar entidade de domínio e sem tocar nos contratos de IPC ou no store de workspaces.

- A aba Projetos ganha o cabeçalho **Pastas**, com botão de criar pasta, e cada pasta aparece como cabeçalho recolhível com a contagem de projetos.
- O menu do workspace ganhou **Mover para pasta**, com as pastas existentes, a opção "Sem pasta" e "Nova pasta…". Criar a pasta por esse caminho já move o projeto.
- Cada pasta tem renomear e excluir; excluir a pasta devolve os projetos para "Outros" sem apagar nada.
- Projetos sem pasta ficam em **Outros**, e quando não existe nenhuma pasta a lista aparece exatamente como antes, sem cabeçalho.
- A criação e a renomeação usam um diálogo do próprio app, não `window.prompt`.
- A associação é organização de navegação e fica em `localStorage` (`politron.sidebar.groups`, `politron.sidebar.workspace-groups`, `politron.sidebar.collapsed-groups`), no mesmo padrão já usado por favoritos e pelo colapso de workspaces.

Limite conhecido: por estar em `localStorage` do renderer, o agrupamento não é sincronizado entre máquinas nem com a PWA em outro dispositivo. Para isso, o passo seguinte é um campo opcional `groupId` no `Workspace`, persistido no store e exposto por IPC, o que exige mexer em `shared/v9.ts`, `main/v9/store.ts` e `main/v9/ipc.ts`.

Arquivos: `apps/desktop/src/renderer/src/features/sidebar/projectGroups.ts` (estado e persistência), `apps/desktop/src/renderer/src/features/sidebar/ProjectGroupSection.tsx` (cabeçalho da pasta), `apps/desktop/src/renderer/src/features/sidebar/GroupDialog.tsx` (diálogo de criação e renomeação), `apps/desktop/src/renderer/src/features/sidebar/Sidebar.tsx` (integração).

### Frente 4. Desempenho da listagem

O `AGENT.md` do projeto pede: "Meça desempenho antes de afirmar que o aplicativo ficou mais rápido ou mais leve". A medição foi feita antes de qualquer otimização, e ela mudou o desenho.

**Medição.** Um benchmark novo, `apps/desktop/src/renderer/src/features/sidebar/Sidebar.performance.test.tsx`, renderiza a barra lateral com 120 projetos e 600 sessões, 8 pastas e carga concentrada em poucos projetos, que é o pior caso real. O ambiente é jsdom, então os números absolutos exageram o custo de DOM em relação ao navegador; o que interessa é a comparação no mesmo ambiente.

| Cenário | Antes | Depois |
| --- | --- | --- |
| Montagem completa | 998 a 1115 ms | 409 a 620 ms |
| Atualização com snapshot novo | 410 a 544 ms | 161 a 361 ms |
| Varreduras da lista de sessões por render | 242 | 2 |

**O que a medição apontou.** A barra lateral filtrava a lista de sessões uma vez por projeto e, dentro desse filtro, procurava o workspace de cada sessão com busca linear. Com N projetos e C sessões isso é O(N² × C): 242 varreduras da lista inteira em 120 projetos. Além disso, a barra montava todas as sessões de todos os projetos e a busca rápida reconstruía um item por sessão a cada render, mesmo fechada.

**O que mudou.**

- `features/sidebar/sidebarIndex.ts` novo: índices em `Map` construídos numa passagem só. `conversationsOf`, `childWorkspaces` e `needsAttention` viram consulta direta, sem varrer o snapshot.
- A paleta da busca rápida é memorizada e deixa de ser reconstruída a cada render.
- A partição dos projetos por pasta é uma passagem única, em vez de um filtro por pasta.
- Cada projeto mostra as 10 sessões mais recentes, com "ver mais N sessões" sob demanda. É a mesma ideia do `sessionLimit` do MiniMax Code: o sidebar navega, não arquiva.

**Como isso fica protegido.** O teste determinístico conta quantas vezes a lista de sessões é filtrada durante o render e exige menos de seis. Com a implementação anterior ele reprova com 242. O teste de tempo ficou com orçamento largo, porque em jsdom o número varia com a carga da máquina; ele é rede de seguranca, não a garantia principal.

**O que continua em aberto.** A paginação da lista de projetos por cursor, como o MiniMax Code faz no catálogo, ainda não existe aqui: a barra mostra todos os projetos. Com 120 projetos isso é aceitável e o custo medido é baixo, mas é o próximo degrau se a lista crescer muito.

### O processo principal já está no caminho certo

O repositório tinha um harness de desempenho do snapshot que nunca mais rodou: o esquema da tabela `v9_file_changes` mudou e passou a exigir `run_id`, `tool_call_id` e `workspace_id`, então o `INSERT` do harness quebrava com `NOT NULL constraint failed`. O harness foi corrigido e roda com `POLITRON_RUN_PERFORMANCE=1`.

| registros por tabela | p50 | p95 |
| --- | --- | --- |
| 100 | 0,67 ms | 2,50 ms |
| 500 | 3,46 ms | 6,78 ms |
| 2.000 | 4,04 ms | 9,77 ms |
| 10.000 | 4,58 ms | 8,21 ms |

O custo estabiliza em ~4,6 ms mesmo com 10.000 registros por tabela, porque o snapshot lê apenas os 100 runs e as 500 alterações de arquivo mais recentes. A leitura é limitada na origem, que é a mesma ideia do `sessionLimit` e do `LIMIT` do catálogo do MiniMax Code: o custo não cresce com o histórico. O gargalo estava só no renderer.

## Ordem sugerida

1. Botão rápido do painel direito e reposicionamento do toggle do sidebar. **Feito.**
2. Rail fixo à esquerda, com botão de recolher sempre alcançável. **Feito.**
3. Pastas de projetos, com rótulo persistido e agrupamento apenas visual. **Feito**, com persistência em `localStorage`; falta o campo `groupId` no `Workspace` para sincronizar entre dispositivos.
4. Desempenho da barra lateral: medição antes de otimizar, índices em `Map`, limite de sessões por projeto. **Feito.** Falta a paginação por cursor da lista de projetos e a medição do custo do snapshot no processo principal.

## Registro de evidências

Origem das conclusões, todas dentro do `app.asar` instalado:

- `node_modules/@mavis/local-runtime-v2/src/service/session-system/projects/README.md`: topologia das três leituras e exigência de plano de consulta.
- `node_modules/@mavis/local-runtime-v2/src/service/session-system/projects/contracts.ts`: contrato do sidebar, com `SidebarGroup` e `SidebarEntry`.
- `node_modules/@mavis/local-runtime-v2/src/service/session-system/projects/drizzle.ts`: repositório, paginação por cursor e expressões de atividade.
- `node_modules/@mavis/local-runtime-v2/src/infra/db/schema/projects.ts`: tabela, checks, índices e triggers de agregação.
- `out/_next/static/chunks/88822-cfac6a43ea62c780.js`: chaves de internacionalização do sidebar e do dock, no bundle do renderer.
- Evidência REA `ev_159c5d0e85deef004d0a5b11c18ddcf796f56abfe6f4976c00927abd2ba95894`, produzida pela sessão `mvs_c4a996f7634d470a9d2e6dcff090183d` com `rea-agents@6.4.0`, cobrindo a ordem da lista de projetos e a definição do índice.
- Inspeção da interface ao vivo, pelo plugin Computer Use, do botão "Filter and group" e do submenu "Grouping", que oferece apenas "By project" e "By task".

Limites desta análise:

- O renderer do MiniMax Code é um Next.js exportado estaticamente, com código minificado. A leitura do comportamento visual veio do bundle de i18n e da observação da tela, não de componentização legível.
- A análise cobriu o domínio de projetos e o dock do processo principal. Não cobre o runtime de agentes, o computer use ou a camada de nuvem.
- Nada foi medido em tempo de execução. As afirmações de desempenho aqui são sobre **forma de consulta e estrutura de índice**, não sobre tempo observado.
