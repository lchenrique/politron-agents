# Qualidade e evidências

Execute comandos a partir de `apps/desktop`, onde fica o `package.json`:

| Comando | Finalidade |
|---|---|
| `npm run lint` | ESLint em todo o desktop |
| `npm run typecheck` | TypeScript do processo principal e renderer |
| `npm test` | Suíte Vitest, sem watch |
| `npm run build` | Build Electron/Vite |
| `npm run dev` | Execução local para desenvolvimento |
| `npm run quality:rules` | Self-check das regras locais do toolkit |
| `npm run lint:typed` | Perfil adicional de promessas, com avisos tipados |
| `npm run test:models` | Detecção de provedores, catálogo e configurações |
| `npm run test:voice` | Casos locais da infraestrutura de voz/realtime |
| `npm run test:performance` | Benchmark SQLite opt-in, com fixtures descartáveis |
| `npm run test:redesign:web` | E2E no navegador das galerias de desenvolvimento: card "Executando tarefa", navegador de turnos, composer em linha, sidebar e painel de voz; salva capturas (pasta opcional como argumento). Não abre o Electron nem testa áudio real |
| `npm run verify` | Encadeia verificações; falha enquanto persistirem erros do lint legado |

`npm run test:codex` é uma integração opcional que chama o Codex real. Só a execute quando essa integração externa for intencional; resultados de mocks não substituem execução real.

## Baseline registrado em 18/10/2026

Antes das alterações desta adoção, os tipos e o build passaram. O lint reportou 76 erros e 16 avisos. A suíte reportou 205 testes aprovados, 12 falhas e 5 ignorados em 49 arquivos. Build sem compressão: renderer principal de 2,36 MB e Monaco de 7,92 MB. As verificações iniciais rodaram em concorrência, portanto seus tempos não são benchmark.

As falhas iniciais incluíram dois timeouts em operações Git/worktree, sete casos de layout por incompatibilidade `DOMRect`, duas expectativas antigas do Editor e um texto divergente em RunProgress. Em execuções isoladas, `git-workspaces.test.ts` passou 2/2 e `v9-workspaces.test.ts` passou 17/17; os timeouts não se reproduziram. Este baseline descreve o checkout no momento registrado, não o estado posterior a mudanças.

## Voz, modelos e desempenho

Prioridades de observação: voz, detecção de modelos das CLIs identificadas e desempenho. Trate separadamente:

- testes simulados, smoke tests com artefatos/modelos locais e sessão real com microfone ou provedor;
- CLI encontrada, configuração local lida, credencial disponível, modelo listado e execução concluída;
- tamanho do bundle, tempo medido, memória, limite de elementos no DOM e percepção de uso.

Não afirme melhoria sem reprodução e comparação do mesmo cenário. O snapshot agora limita a consulta SQL a 100 runs e 500 fileChanges, desserializando apenas esses registros e preservando a ordenação original. Para 10 mil registros por tabela, o benchmark local passou de aproximadamente 310 ms (p50) e 512 ms (p95) para 9,015 ms (p50) e 14,258 ms (p95). É uma melhoria do snapshot SQLite, ainda sem medição equivalente da UI Electron. Consulte `docs/setup.md` para detalhes e limites.

## Verificações posteriores à adoção

Em 18/10/2026, 252 testes passaram e 6 foram ignorados, sem falhas na suíte completa; o build e o typecheck passaram. Os testes locais de voz passaram (30 aprovados, 2 ignorados). O self-check das três regras locais passou. O lint geral registrou 72 erros e 41 avisos, sem atenuação das regras anteriores; o lint tipado passou com 21 avisos. A execução real com microfone, a inicialização isolada do Electron e o resize em navegador permanecem distintos desses resultados.

## Verificações da correção de estabilidade — 21/10/2026

No checkout `fix/agent-stability-2026-10-21`, `quality:rules` passou; `typecheck` passou; a suíte completa passou com 433 testes, 18 ignorados e nenhuma falha (89 arquivos); e `build` passou. O build avisou sobre anotações e diretivas de dependências de terceiros e a configuração ESM do PostCSS. `lint:typed` terminou sem erros e com 22 avisos. O lint geral falhou com 168 erros e 45 avisos, acima dos 76 erros e 16 avisos registrados no baseline de 18/10; os erros observados são principalmente `no-explicit-any` em código de teste e `workspace.ts`, com dívida adicional em avisos de tamanho de arquivo, promessas e hooks. As regras locais permaneceram inalteradas. O comando `verify` não pode ser considerado aprovado enquanto esse lint geral falhar.

Os testes focados de histórico, reconexão, âncora, voz, exclusão do navegador e workspaces passaram. Os testes Git/worktree no Windows levaram 15,7 s e 5,1 s no `git-workspaces.test.ts`, e 11,5 s no cenário de concorrência `v9-workspaces.test.ts`; mantêm o limite atual de 30 s. A remoção manual de fixture ganhou retries e prune do worktree, e o teste de cancelamento agora aborta em `finally`. Permanecem sem aceite Electron dois processos para reconexão/histórico, medição visual de âncora, aprovações humanas em delegação, execução real do Codex/Claude e validação em dois PCs físicos. Esses limites não são cobertos pela suíte Vitest nem pelo build.

Atualização de aceite Electron em 21/10: `npm run test:hosts:electron` passou com dois processos no mesmo computador; a mensagem produzida offline foi recuperada uma vez. `npm run test:agent-stability:electron` passou com 80 mensagens persistidas: a referência visual deslocou 0 px em crescimento e resize; modal cancelar/confirmar funcionou; composer permaneceu editável após exclusão e nenhum diálogo nativo abriu. Isso não cobre dois PCs físicos nem a matriz completa de streaming/prepend/limite/fim. A integração Codex real `workspace.live.test.ts` passou com `gpt-6-luna` em duas raízes descartáveis; sua aprovação foi pelo listener automático. A tentativa adicional de exigir clique humano no cartão de delegação pela UI não passou: a mensagem foi gravada, mas a execução não deixou aprovação visível. O aceite dessa jornada permanece aberto. Os provedores Claude/alternativos e microfone real também permanecem sem execução validada.

## Revisão de segurança

Para uma revisão somente de leitura, use o bloco **Prompt** da revisão imutável [13-security-review.md](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/prompts/13-security-review.md#L204-L252). Limite a execução à faixa indicada. Salve o relatório redigido em diretório privado fora do repositório; não coloque evidências sensíveis no Git. A revisão não autoriza correções, alterações de configuração, instalações ou acesso a serviços externos.

## Escopo e dívida

A auditoria inicial de dependências registrou 12 avisos agregados (2 críticos, 2 altos, 6 moderados e 2 baixos); o alcance e as correções ainda precisavam de análise. Não use esse agregado como prova de vulnerabilidade explorável ou de risco de produção. Preserve severidades de lint e descreva dívida medida; não esconda falhas reduzindo regras.
