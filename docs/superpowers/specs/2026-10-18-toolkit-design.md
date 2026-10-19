# Adoção do Vibe Coding Toolkit no Politron

Status: aprovado pelo usuário; execução autorizada. Data: 18/10/2026.

Escopo posterior do usuário: esta continuação trata somente da descoberta de modelos das CLIs e dos seletores, com referências no Paseo e no shadcn. O usuário informou já ter avançado o restante do setup. As seções gerais abaixo registram o design aprovado anteriormente.

Fonte: `soumatheusgomes/vibe-coding-toolkit`, revisão
`de66fe371a49f5a4d3b521759e5c401f390b6424`, obtida fora do projeto.
Contrato: seção Prompt de `docs/prompts/12-existing-project-setup.md` dessa revisão.

## Objetivo e prioridades

Preparar o projeto existente para desenvolvimento assistido por IA com instruções
descobertas pelos clientes, contexto confiável, ferramentas compatíveis, comandos
reproduzíveis e evidência verificável. O usuário priorizou voz, detecção dos modelos
das CLIs identificadas e, principalmente, performance.

Essas prioridades orientam os testes, a navegação do código, a observabilidade e
as melhorias limitadas desta adoção. Uma correção só será apresentada como tal
quando houver reprodução e evidência. A qualidade de voz com microfone, hardware
e serviços reais exige uma validação distinta dos testes com adaptadores simulados.

## Base observada e limites

- Raiz: Politron; aplicação em `apps/desktop`.
- Electron 40, React 18, TypeScript, Vite/electron-vite, Tailwind, Radix,
  npm e `package-lock.json`. Persistência V9 por `node:sqlite`.
- `AGENT.md`, `PRODUCT.md`, `ESTRATEGIA_POLITRON.md` e
  `ESTRATEGIA_UX_WORKSPACES.md` contêm decisões existentes. `docs/arquivo` é histórico.
- Há trabalho local em 45 arquivos rastreados e vários arquivos novos. O baseline
  considera esse checkout, sem atribuir suas mudanças a esta adoção.
- Preservar contratos IPC, identidade e permissões dos agentes, dados locais,
  temas, navegação, motores e os dois modos de voz.
- Adoção local e incremental. Mudança de arquitetura, major incompatível,
  migração de banco, produção, publicação, custos e alterações destrutivas
  dependem de decisão específica. Não há necessidade observada dessas ações.
- Backups dos arquivos de configuração e documentos alterados ficarão fora do
  repositório, sem credenciais. O lockfile será alterado apenas pelo npm e pelo
  coordenador. Não haverá commit, push nem hook de Git nesta entrega.

## Evidência inicial

Comandos executados em `apps/desktop`, antes das alterações desta adoção:

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `npm run lint` | 76 erros e 16 avisos preexistentes |
| `npm test` | 205 passaram, 12 falharam, 5 ignorados; 49 arquivos |
| `npm run build` | Passou; renderer principal 2,36 MB e Monaco 7,92 MB, sem compressão |
| `npm audit --json` | 12 avisos agregados: 2 críticos, 2 altos, 6 moderados, 2 baixos; alcance e correções ainda precisam de análise |

As verificações iniciais rodaram em concorrência. Seus tempos não constituem um
benchmark isolado. Falhas de testes: dois timeouts de operações Git/worktree,
sete casos de layout com `DOMRect is not a constructor`, dois casos de Editor
com expectativas antigas e um texto divergente de RunProgress.

Reexecução isolada, sem mudança de código: `git-workspaces.test.ts` passou em
2/2 casos; `v9-workspaces.test.ts` passou em 17/17. Os dois timeouts não se
reproduziram. Não há justificativa observada para aumentar seus limites.

Pontos encontrados na leitura que orientarão medições e correções limitadas:

- `store.ts` lê e desserializa todas as runs/fileChanges antes de limitar o
  snapshot; o retorno limitado não prova custo de leitura limitado.
- A agregação de modelos depende primeiro do Codex; sua falha impede a consulta
  ao Claude. O catálogo local OpenCode `.jsonc` passa por `JSON.parse`.
- A cascata gratuita espera a resposta textual completa antes do Piper.
  Custo do VAD síncrono no main ainda é hipótese. Alterar cancelamento da
  execução do agente ou estratégia de áudio exige um contrato específico.
- O histórico já tem paginação, limite em memória, lotes de streaming e
  virtualização. Monaco e diff já usam carregamento sob demanda.

Revisão independente do design: nenhuma pergunta importante remanescente.

Inventário de lint por regra: 75 ocorrências de `no-explicit-any`, uma de
`no-require-imports`, nove avisos de `react-hooks/exhaustive-deps` e sete de
`react-refresh/only-export-components`.

Context7: login OAuth foi confirmado no preparo global. Nesta sessão e em um
novo contexto CLI somente leitura, as ferramentas MCP não foram expostas; a
consulta real não foi executada. Revalidar carregamento do servidor no cliente
antes de considerar a integração funcional, sem duplicar sua configuração.

## Entrega proposta

### 1. Instruções e documentos

Criar `AGENTS.md` curto, com comandos reais, limites e mapa para as fontes
existentes. Preservar o conteúdo útil de `AGENT.md`, que continuará como fonte
detalhada de acordos do produto. `CLAUDE.md` importará `AGENTS.md` e conterá
somente ajustes específicos necessários ao Claude.

Usar os nove destinos do manifesto sem criar fontes concorrentes:

| Destino | Tratamento |
|---|---|
| `README.md` | Entrada do projeto, execução e mapa |
| `PRODUCT.md` | Preservar requisitos; atualizar apenas evidências reais |
| `AGENTS.md` | Instruções compartilhadas, comandos e links |
| `CLAUDE.md` | Ponte oficial para instruções compartilhadas |
| `docs/architecture.md` | Mapa observado de processos, IPC, dados e adaptadores; referências à estratégia |
| `docs/design.md` | Mapa dos documentos visuais existentes e contratos de interface |
| `docs/onboarding.md` | Preparação local, variáveis sem valores, diagnóstico e recuperação |
| `docs/quality.md` | Comandos, testes, perfis de lint, dívida medida e revisão de segurança |
| `docs/setup.md` | Revisão do toolkit, matriz final, evidências, manutenção e pendências |

Bright Memory permanece como memória persistente, usando a CLI. Documentação
versionada descreve o projeto; não será criada uma segunda memória em Markdown.
Handoffs temporários ficarão nos planos com status explícito.

### 2. Cobertura completa das ferramentas

Cada linha terá fonte, escopo, versão observada, descoberta pelo cliente,
execução real ou limitação e comando de manutenção em `docs/setup.md`.

| Componente | Decisão proposta | Validação |
|---|---|---|
| Superpowers | Reusar plugin global; processo proporcional | Design, plano e revisão observados |
| Subagentes | Seleção por tarefa; arquivos e recursos independentes | Revisão somente leitura; integração pelo coordenador |
| Ponytail full | Reusar instalação global | Mudança mínima que cumpra critérios |
| Caveman | Reusar; comunicação ultra conforme pedido | Clareza e precisão; código/documentos em linguagem normal |
| RTK | Reusar hooks globais; evitar interceptores duplicados | Inventário e execução observada quando o cliente expuser |
| Context7 | Reusar servidor OAuth; nenhuma credencial no projeto | Resolver biblioteca e consultar um conceito público em contexto compatível |
| Graphify | Configurar exclusões; extração estrutural local determinística | Consultar fluxo relevante; registrar cobertura e revisão |
| ESLint/regras locais | Preservar severidades; adaptar módulos da mesma revisão | Self-check, contagem por regra e lint |
| Lint tipado | Avaliar perfil focado em promessas | Medir violações, tempo e memória antes de promover |
| Biome | Avaliar benefício adicional; evitar sobreposição e formatação ampla | Decisão explícita conforme lacuna real |
| Vercel React skills | Instalação local das instruções úteis à interface React | Fonte, licença, nome, descoberta, lockfile e portabilidade |
| find-skills | Reusar global quando descoberto; instalar local se necessário | Descoberta sem duplicação |
| next-dev-loop | Inaplicável: aplicação Electron/Vite | Confirmar ausência de Next |
| next-bundle-optimizer | Inaplicável; usar recursos do bundler existente | Medições de bundles Vite |
| PostgreSQL skill | Inaplicável: SQLite | Confirmar persistência observada |
| gh-fix-ci | Avaliar CI GitHub existente; usar somente se houver fluxo aplicável | Acesso autorizado e consulta somente leitura |
| differential-review | Avaliar instrução local para diffs sensíveis | Faixa explícita e relatório privado; rastreamento manual como alternativa |
| shadcn | Reusar skill global se adoção efetiva for confirmada | Configuração, componentes e tokens atuais; nenhuma adoção artificial |
| Sentry MCP | Inaplicável enquanto não houver serviço/projeto escolhido | Registrar condição de revisão |
| Browser/DevTools | Reusar Playwright/Electron local e capacidade existente | Fluxo local, console e erros; dados descartáveis |
| Memória em camadas | Bright Memory e mapa de fontes versionadas | Recuperação observada; fatos confrontados com checkout |
| Obsidian/MCP externo | Sem necessidade concreta observada | Registrar decisão |
| Hooks de cliente | Reusar somente integrações suportadas e necessárias | Descoberta separada de execução em nova sessão |
| Artifacts/skill creation/plugins oficiais | Reusar capacidades globais com necessidade concreta | Inventário e decisão por capacidade |
| aia-harness/extras | Avaliar sobreposição com harness existente | Adotar somente se houver lacuna verificável |

Instalações de projeto ficam no menor escopo oficialmente suportado. Pré-requisito
global novo exige apresentar comando e efeito antes de executar. Reinício ou
intervenção externa será registrado com causa e próximo passo.

### 3. Qualidade, voz, modelos e performance

- Consolidar comandos existentes em uma verificação local que não publique,
  conecte serviços de produção ou aplique migrações.
- Corrigir falhas reproduzidas da infraestrutura de testes e expectativas que
  estejam comprovadamente obsoletas, preservando os comportamentos relevantes.
  Investigar timeouts Git isoladamente antes de alterar qualquer limite.
- Diagnosticar erros de lint existentes. Corrigir contratos verificáveis dentro
  desta adoção; documentar dívida que exija mudança de domínio separada, mantendo
  severidades. Novas regras com violações começam como avisos medidos; regras
  novas limpas podem bloquear regressões.
- Adaptar limite de 350 linhas e fronteiras reais de Electron: renderer não
  acessa diretamente banco/processo principal; dados entram por preload/IPC.
  Regras de Next, Pino ou Drizzle só se aplicam quando esses contratos existirem.
- Analisar atualizações compatíveis, changelogs, peers e engines. Auditoria não
  autoriza correções forçadas, downgrade automático ou migração de major.
- Expor cenários de voz rápida, tarefa longa, interrupção e troca de sessão nos
  comandos de diagnóstico existentes. Registrar o que depende de microfone,
  modelos baixados ou provedor real; não inferir qualidade acústica de mocks.
- Mapear como cada CLI é identificada, como obtém modelos, origem/fallback e
  limites de cache. Corrigir apenas falhas reproduzidas com contratos claros.
- Medir desempenho local com dados descartáveis e cenários repetíveis: histórico
  grande, snapshot, atualizações em streaming e descoberta de CLIs. Registrar
  memória, duração, tamanho do bundle e limites do ambiente. Priorizar trabalho
  síncrono e leituras sem limite que os dados confirmarem como gargalo.
- Usar o plano de performance existente como referência e manter a distinção
  entre limite de nós no DOM, tempo medido e experiência real do Electron.

### 4. Validação e revisão

Executar self-check das regras, lint, tipos, testes afetados, suíte existente e
build. Serializar verificações que disputem build, portas, banco e processos.
Validar UI local com dados descartáveis quando a capacidade estiver disponível;
encerrar somente recursos criados por esta adoção.

Revisar o diff desta adoção contra o estado local inicial, incluindo callers e
contratos afetados. Revisores independentes trabalham somente em leitura.
Verificar instruções, recuperação de contexto, descoberta de skill, consulta
Context7 e Graphify, RTK e reaplicação segura; observar separadamente contexto
novo de subagente e reinício real de cliente. Casos descartáveis do harness
terão pass/fail/não executado com evidência.

Documentar revisão de segurança reutilizável pela fonte versionada do prompt 13
em `docs/quality.md`; relatórios com evidência privada ficam fora do repositório.

## Critérios de conclusão e recuperação

A entrega termina com matriz completa, documentos coerentes, comandos
reproduzíveis, falhas introduzidas corrigidas e cada pendência acompanhada por
causa, evidência e próximo passo. Instalação, configuração, descoberta e execução
são estados diferentes. Uma melhoria de performance exige medição antes/depois
no mesmo cenário; voz e provedores reais têm validação própria.

Recuperação: restaurar somente os arquivos desta adoção a partir dos backups e
conferir o diff contra o baseline inicial. Nunca resetar ou sobrescrever o
trabalho local anterior. Recursos temporários pertencentes à adoção serão
inventariados e removidos pelo coordenador quando possível.

## Decisões deixadas à implementação

Escolher nomes dos scripts e divisão de arquivos conforme os padrões existentes;
selecionar as skills locais úteis após conferir upstream; definir a menor
amostra repetível para medição; promover novas regras somente com contagem
compatível. Novos requisitos de produto ou mudança arquitetural voltam para
decisão específica.
