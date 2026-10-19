# Politron Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for coordinated execution; independent helpers follow the project delegation policy. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o design aprovado do toolkit com contexto descoberto, verificações reproduzíveis e melhorias comprovadas de modelos e performance.

**Architecture:** Preservar Electron/main, preload/IPC, renderer React e SQLite. O coordenador controla configurações, dependências, recursos e integração; auxiliares têm arquivos distintos. Uma revisão independente cobre o resultado integrado.

**Tech Stack:** Electron 40, React 18, TypeScript, npm, ESLint 9, Vitest 3, SQLite e Playwright existentes.

**Spec:** `docs/superpowers/specs/2026-10-18-toolkit-design.md`, aprovado pelo usuário em 18/10/2026.

## Escopo vigente

Em 18/10/2026, o usuário informou ter avançado o restante do setup e limitou esta continuação à detecção de modelos das CLIs instaladas e à experiência dos seletores. Referências: Paseo e Model Selector do shadcn. As tarefas gerais abaixo permanecem como plano histórico; não representam entregas pendentes autorizadas nesta continuação. O resultado desta fatia está em `docs/provider-inventory.md`.

## Global Constraints

- Preservar trabalho local, dados, contratos, temas, motores e ambos os modos de voz.
- Toolkit na revisão `de66fe371a49f5a4d3b521759e5c401f390b6424`.
- npm controla `apps/desktop/package-lock.json`; somente o coordenador altera dependências/configurações compartilhadas.
- Nenhum commit, push, produção, migração, major incompatível ou hook de Git.
- Memória persistente somente pela CLI Bright Memory. Documentos de tarefa registram estado operacional.
- Backups sem segredos em `%LOCALAPPDATA%/PolitronToolkitSetup/20261018-195727`; 217 arquivos com hashes e estado Git inicial.
- Testes/build que disputem recursos serão serializados pelo coordenador; auxiliares não iniciam verificações concorrentes.

## Review Focus

1. Um provedor ausente/falhando não deve esconder modelos de outro; testes da tarefa 2.
2. JSONC com comentários, vírgulas finais e strings contendo barras deve ser interpretado sem executar conteúdo; tarefa 2.
3. Snapshot limitado deve preservar ordem e contratos mesmo após atualizar registro antigo; tarefa 3.
4. Layout/testes devem conservar interação, foco e persistência, sem substituir comportamentos reais por mocks amplos; tarefa 4.
5. Reinício de cliente, provedor real e microfone são evidências distintas de arquivos instalados e testes locais; tarefa 5 registra limites.

## Tarefa 1: Contexto e documentação descobertos

**Arquivos:** criar `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/design.md`, `docs/onboarding.md`, `docs/quality.md`; preservar `AGENT.md` e documentos canônicos existentes. Coordenador escreve `docs/setup.md`.

**Interfaces:** comandos existentes em `apps/desktop/package.json`; mapas dos nove destinos; instruções remetem ao setup final sem inventar scripts ainda não existentes.

- [ ] Escrever documentos factuais em PT-BR, links relativos e distinção entre requisitos/implementação/evidência.
- [ ] Manter AGENTS curto com Bright Memory, contratos e mapa; CLAUDE importa AGENTS.
- [ ] Incluir revisão de segurança por URL imutável da seção Prompt 13, faixa explícita e relatório privado.
- [ ] Conferir caminhos, ausência de placeholders/segredos/cópia de caminhos pessoais e consistência com código.

## Tarefa 2: Catálogos de modelos resistentes a falhas

**Arquivos:** `src/main/v9/providers/detect.ts`, `detect.test.ts`, `src/main/v9/workspace.ts`, testes novos de modelos e, se necessário à ligação do catálogo real, `src/main/index.ts`, `src/shared/providers.ts`, `SettingsPage.tsx` e teste correspondente. Todos sob `apps/desktop`.

**Interfaces:** preservar `detectProviders(home = homedir()): Promise<ProviderInfo[]>`, `AppService.models(runtimeName?): Promise<Model[]>` e APIs existentes. Extensões de diagnóstico são aditivas. Catálogos reais usam os adaptadores existentes; ausência de credencial/capacidade aparece como indisponível, sem lista inventada.

- [ ] Reproduzir falhas JSONC e agregação quando Codex falha e Claude está disponível.
- [ ] Implementar parse JSONC validado com biblioteca existente/direta aprovada e tipos desconhecidos estreitados; evitar parser por regex.
- [ ] Consultar provedores de forma independente; falhas individuais preservam catálogos válidos e chamadas explícitas mantêm seus erros úteis.
- [ ] Integrar fonte real ao diagnóstico quando o adaptador suporta; registrar origem/ausência sem expor credenciais.
- [ ] Validar JSONC malformado/ausente, nomes, timeout, credencial ausente e agregação parcial com testes focados executados pelo coordenador.

## Tarefa 3: Snapshot com trabalho limitado e benchmark reproduzível

**Arquivos:** `apps/desktop/src/main/v9/store.ts`, teste `snapshot.test.ts` e medição `snapshot.performance.test.ts` próximos aos testes existentes. Coordenador registra scripts npm e resultados em setup.

**Interfaces:** `WorkspaceStore.snapshot(): Snapshot` retorna mesmas coleções, no máximo 100 runs e 500 fileChanges; listagens completas públicas mantêm comportamento.

- [ ] Criar fixture SQLite temporária com muitas runs/fileChanges e medir snapshot antes de alterar consulta; guardar números fora de fonte.
- [ ] Provar limites, ordem original de inserção e atualização de registro antigo por testes.
- [ ] Mover limitação para SQL, antes de desserializar, sem migração ou mudança de ordenação.
- [ ] Repetir cenário idêntico; registrar tamanho da fixture, amostras, p50/p95, memória e limites do teste.
- [ ] Manter benchmark opt-in separado dos testes comuns; encerrar banco e remover apenas diretório temporário da própria fixture.

## Tarefa 4: Qualidade e ferramentas locais

**Arquivos do coordenador:** configs ESLint, `eslint-rules/`, `scripts/`, `package.json`, lockfile, `.gitignore`, `.graphifyignore`, `.agents/skills/`, `.claude/skills/`, `skills-lock.json`; infraestrutura de testes e casos Editor/RunProgress/DockWorkspace pertinentes.

**Interfaces:** preservar `lint`, `typecheck`, `test`, `build`; adicionar `verify`, `lint:typed`, `quality:rules`, `test:voice`, `test:models`, `test:performance` apenas depois de verificar os comandos reais.

- [ ] Estabilizar DOMRect no ambiente jsdom com suporte fiel aos cálculos usados; reparar expectativas de interface obsoletas preservando asserções de comportamento.
- [ ] Copiar `eslint-rules/{index,core-rules,utils}.cjs` e self-check da revisão do toolkit; adaptar somente gates aplicáveis.
- [ ] Medir limite 350 e perfil tipado focado em promessas; manter proteções existentes, documentar contagem e custo.
- [ ] Corrigir lint em contratos verificáveis afetados; registrar dívida que exija novo domínio, sem reduzir severidade ou ocultar falhas.
- [ ] Conferir catálogo upstream de skills React/composição/interface/escrita; instalar localmente com cópias portáveis, lockfile e licença. Reusar equivalentes globais.
- [ ] Configurar exclusões Graphify e gerar grafo de código determinístico; consultar nó real e conferir resultado no código.
- [ ] Registrar auditoria por alcance e compatibilidade; aplicar somente atualizações comprovadamente compatíveis, sem correção forçada.

## Tarefa 5: Integração, harness e entrega

**Arquivos:** `docs/setup.md`, atualizações factuais de `PRODUCT.md`/registro da estratégia quando necessárias; status neste plano. Artefatos e relatório sensível fora do repositório ou em diretórios ignorados.

- [ ] Executar self-check, lint, perfil tipado, tipos, testes focados, suíte e build; distinguir baseline e regressão.
- [ ] Iniciar Electron local com userData descartável e porta livre; verificar navegação, provedores e painel de voz sem enviar dados a provedores reais.
- [ ] Avaliar casos descartáveis de harness pertinentes; verificar instruções/skills em contexto limpo e reaplicação estática/idempotente.
- [ ] Revalidar Context7/RTK quando observáveis; registrar configuração, descoberta e execução como estados separados.
- [ ] Revisão independente do diff desta adoção comparado ao backup inicial, com callers e testes; corrigir achados relevantes e repetir checks afetados.
- [ ] Fechar matriz de todo catálogo, fontes/versões, comandos de manutenção, resultados e pendências com causa e próxima ação.
- [ ] Salvar resumo durável pela Bright Memory e entregar comandos/resultados/limitações.

## Autoavaliação e decisões de execução

Cobertura: documentos e contexto em 1; modelos em 2; leitura SQLite e medição em 3; qualidade/instalações em 4; validação, voz, auditoria, memória e matriz em 5. Interfaces de 2/3 não colidem. Configurações, lockfile e recursos pertencem ao coordenador.

Ruling: executar após a aprovação explícita do design e pedido de execução; este plano detalha entregas reversíveis já aprovadas e não introduz decisão arquitetural. Não solicitar novamente a autorização existente.

Ruling: usar o checkout atual e preservar alterações com backup, em conformidade com o Prompt 12; exigências genéricas de worktree/commit de skills não se aplicam a esta entrega.

## Estado operacional

- [x] Design aprovado; backup inicial criado.
- [x] Tarefa 1: documentos do projeto e `docs/setup.md` criados, sem substituir os documentos canônicos.
- [x] Tarefa 2: catálogos independentes, JSONC validado e testes focados passaram (36 testes incluindo snapshot/configuração).
- [x] Tarefa 3: limites SQL e teste de ordenação passaram; benchmark 10 mil registros por tabela passou de p50 ~310 ms para 9,015 ms.
- [ ] Tarefa 4: regras locais, self-check, perfil tipado, comandos, Graphify gerado; catálogo de skills, auditoria de dependências e dívida geral do lint continuam parciais. Retomada posterior: inventário persistente das 5 CLIs, atualização manual, UI do composer agrupada e bloqueio de provedores ainda sem adaptador, detalhados em `docs/provider-inventory.md`.
- [ ] Tarefa 5: suíte (252 aprovados, 6 ignorados), testes de voz e build passaram. Restam smoke Electron/voz real, Context7 no cliente, revisão final independente, auditoria de segurança e fechamento de ferramentas.

Retomada via Desktop Commander em 18/10/2026: checkout sujo foi preservado; não houve commit/push/migração. Lint geral: 72 erros e 41 avisos; perfil tipado: 0 erros e 21 avisos. Grafo Graphify: 1.876 nós e 4.540 arestas; consulta `WorkspaceStore` encontrou referências reais. Documentos de evidência e manutenção: `docs/setup.md` e `docs/quality.md`.
