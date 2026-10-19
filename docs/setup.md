# Integração do Vibe Coding Toolkit no Politron

Estado: implementação local, sem commit nem publicação. Fonte imutável: [vibe-coding-toolkit `de66fe371a49f5a4d3b521759e5c401f390b6424`](https://github.com/soumatheusgomes/vibe-coding-toolkit/tree/de66fe371a49f5a4d3b521759e5c401f390b6424). Contrato: `docs/prompts/12-existing-project-setup.md`. Design e plano aprovados em `docs/superpowers/`.

## Resumo do estado

O ambiente global foi preparado em sessão anterior: Node 24 via fnm, npm/pnpm, RTK, Ponytail, Caveman, Superpowers, Graphify e OAuth do Context7. O Docker utilizado é o **Docker Engine no WSL Ubuntu**, não é necessário iniciar o Docker Desktop. Integridade das ferramentas globais não substitui sua descoberta e uso efetivo em sessões novas de Codex e Claude.

O checkout existente foi mantido. O backup inicial da adoção contém 217 arquivos e hashes em pasta local privada fora do repositório. Não há migração de banco, troca de arquitetura, commit, push nem implantação.

## Melhorias locais verificadas

| Área | Alteração | Evidência / limite |
|---|---|---|
| Modelos | Detector OpenCode interpreta JSONC com `jsonc-parser`, erros são diagnosticados sem executar configuração | Testes de configuração válida/inválida, paths, credenciais e provedores |
| Catálogo de CLIs | Consultas Codex/Claude isoladas; falha de um provedor não apaga resposta do outro; modelos exibem origem | `npm run test:models`; autenticação e modelos reais variam por instalação |
| Snapshot | SQL aplica `ORDER BY rowid DESC LIMIT ?` antes de `JSON.parse`; resposta conserva ordem antiga e contratos | Testes com até 725 registros e atualização de registros antigos |
| Benchmark | Fixture SQLite temporária, 30 medições, 5 aquecimentos, cenários de 100/500/2.000/10.000 registros por tabela | Para 10.000: antes p50 ~310 ms, p95 ~512 ms; depois p50 9,015 ms, p95 14,258 ms. A execução inicial não tinha isolamento completo |
| Infra de testes | `DOMRect` de jsdom, testes de layout com ponte Electron de voz simulada, foco/persistência preservados | Resizing por teclado/arrasto ainda requer navegador real com geometria observável |
| Lint | Regras locais `quality/max-lines` e `quality/no-direct-console` como aviso; `quality/no-direct-data-access` bloqueia acesso direto de UI ao SQLite | Self-check das 3 regras: passou; legado ainda gera erros de lint |
| Lint tipado | Perfil separado de `no-floating-promises` e `no-misused-promises`, inicialmente como aviso | Passa com 21 avisos; Playwright de suporte fica fora do serviço de projetos TS |

## Comandos

Executar em `apps/desktop`:

| Comando | Efeito |
|---|---|
| `npm run quality:rules` | Testa as regras copiadas da revisão fixa |
| `npm run lint` | Lint principal, com as novas regras e severidades anteriores preservadas |
| `npm run lint:typed` | Verificação adicional de promessas com type information |
| `npm run typecheck` | Dois projetos TypeScript |
| `npm run test:models` | Detector de CLIs, agregação de catálogo e configurações |
| `npm run test:voice` | Testes locais de voz/realtime que não exigem telefonema real |
| `npm run test:performance` | Benchmark opt-in; não é teste de produção |
| `npm test` | Suíte Vitest |
| `npm run build` | Build do Electron e renderer |
| `npm run verify` | Encadeia gates. Para no lint enquanto a dívida antiga persistir |

## Inventário de ferramentas

| Item do toolkit | Estado / decisão |
|---|---|
| Superpowers e planejamento | Plugin global reutilizado; design aprovado e plano local salvos |
| Subagentes / revisão independente | Revisão de design executada no contexto Codex anterior; auditoria final do diff ainda requer validação separada |
| Ponytail full | Plugin global instalado, sem cópia de projeto |
| Caveman ultra | Estilo solicitado no Codex; não altera documentação nem código |
| RTK | Configuração global Codex/Claude; confirmar hooks em nova sessão real |
| Context7 | OAuth Codex concluído; ferramentas MCP não foram expostas na sessão de checagem, consulta pública pendente |
| Graphify | CLI global disponível; exclusões locais em `.graphifyignore`; extração determinística executada: 1.876 nós e 4.540 arestas, sem LLM, em `graphify-out/` ignorado; `graphify explain WorkspaceStore` encontrou ligações com `AppService`, `store.ts` e testes |
| Regras ESLint | Cópias locais da revisão fixa em `apps/desktop/eslint-rules`; self-check em `scripts/` |
| Lint tipado | Perfil adicional operacional, sem promoção automática de avisos |
| Biome | Não adotado: duplicaria lint e formatação sem lacuna comprovada |
| Skills React / composição / escrita | Catálogo local adicional não aplicado; conferir licença e portabilidade antes de copiar |
| find-skills, shadcn | Reutilização global quando descoberta; nenhuma instalação artificial local |
| next-dev-loop e next-bundle-optimizer | Não aplicáveis: Electron + Vite, sem Next.js |
| PostgreSQL/Drizzle | Não aplicáveis: persistência por SQLite |
| gh-fix-ci, differential-review | Sem automação de revisão/CI adicionada; revisão e riscos continuam manuais |
| Sentry MCP | Não aplicável sem projeto/serviço selecionado |
| Browser/DevTools e harness | Testes DOM locais não substituem execução real no Electron; interação com microfone e serviços reais pendente |
| Memória em camadas | Bright Memory via CLI e documentação versionada; não adicionar memória concorrente em Markdown |
| Obsidian, extras e hooks locais | Sem necessidade funcional demonstrada nesta adoção |

O inventário persistente das cinco CLIs, o agrupamento do composer e os limites de execução estão documentados em [`provider-inventory.md`](provider-inventory.md). Os testes de regressão para cache, detecção e seleção de modelos passaram.

## Pendências e recuperação

1. Corrigir a dívida de lint sem desligar regras. Medição nesta integração: **72 erros, 41 avisos** no perfil geral; perfil tipado **0 erros, 21 avisos**.
2. Verificar sessões novas Codex/Claude para RTK/Context7 e instalação/desempenho de CLI real; autenticação é independente da listagem de binários e modelos.
3. Validar voz com microfone, vozes Piper instaladas, provedor real e alternância de sessão. `npm run test:voice` passou com 30 testes e 2 ignorados; testes simulados não provam latência nem qualidade acústica.
4. Validar resize dos painéis no Electron real (teclado/arrasto) e fluxo completo de navegação. O jsdom não fornece dimensões reais para os resizes. A suíte local fechou com 252 testes aprovados, 6 ignorados; o build do Electron passou, ainda com renderer principal de 2,36 MB e Monaco de 7,92 MB.
5. Conferir segurança e vulnerabilidades no escopo de execução: a auditoria inicial tinha 12 avisos agregados, sem correções forçadas.
6. Para reverter somente a adoção, consultar o backup com hashes e comparar com o diff anterior. **Não restaurar o checkout inteiro**: já havia trabalho local antes deste plano.

Fontes técnicas: `docs/architecture.md`, `docs/design.md`, `docs/quality.md` e `docs/onboarding.md`. As métricas são benchmarks locais, não SLAs nem resultados em produção.
