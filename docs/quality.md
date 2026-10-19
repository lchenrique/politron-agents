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

## Revisão de segurança

Para uma revisão somente de leitura, use o bloco **Prompt** da revisão imutável [13-security-review.md](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/de66fe371a49f5a4d3b521759e5c401f390b6424/docs/prompts/13-security-review.md#L204-L252). Limite a execução à faixa indicada. Salve o relatório redigido em diretório privado fora do repositório; não coloque evidências sensíveis no Git. A revisão não autoriza correções, alterações de configuração, instalações ou acesso a serviços externos.

## Escopo e dívida

A auditoria inicial de dependências registrou 12 avisos agregados (2 críticos, 2 altos, 6 moderados e 2 baixos); o alcance e as correções ainda precisavam de análise. Não use esse agregado como prova de vulnerabilidade explorável ou de risco de produção. Preserve severidades de lint e descreva dívida medida; não esconda falhas reduzindo regras.
