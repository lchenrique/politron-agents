# Auditoria de estabilidade de agentes — 20/10/2026

Este documento registra os problemas que fundamentam o [plano de correção](../superpowers/plans/2026-10-20-correcao-estabilidade-agentes.md). É uma especificação de defeitos e resultados esperados; não registra as correções como implementadas.

## Escopo e evidência

Foram inspecionados os fluxos de execução, sessões, filas, delegação, aprovação, arquivos, persistência, histórico, host, navegador e voz do desktop. A auditoria inicial foi ampliada com reproduções controladas, Codex real e interface Electron em perfis descartáveis.

Há **15 achados**, dos quais 13 foram reproduzidos em testes controlados, execução real ou interface. Os itens 11 e 12 foram identificados pelo rastreamento do código e ainda precisam de regressões que comprovem os defeitos antes das correções.

| ID | Prioridade | Defeito e reprodução | Resultado exigido |
|---|---|---|---|
| 1 | P1 | `scanWorkspaceStatuses` grava o workspace capturado antes de aguardar o Git; uma edição de instruções/permissões feita nesse intervalo é desfeita. | Atualizar somente branch e contagem de alterações, preservando o registro mais recente. |
| 2 | P1 | `workspace_write` lê o arquivo, aguarda aprovação e sobrescreve uma edição humana feita durante a espera. | Revalidar a versão aprovada e recusar conflito, sem sobrescrever a edição observada. |
| 3 | P1 | Sessão nativa já iniciada do Chief recebe apenas “encaminha”, sem o diagnóstico que outro agente publicou desde sua última participação. | Entregar contexto externo ainda não recebido, mantendo o pedido atual explícito. |
| 4 | P1 | OpenCode/Antigravity aceitam o binding salvo após reiniciar, mas reconstroem uma sessão com histórico vazio em memória. | Distinguir retomada real de sessão vazia e aplicar replay somente quando necessário. |
| 5 | P1 | Depois de a sessão externa desaparecer, os próximos envios reutilizam indefinidamente o mesmo binding inválido. | Recuperar uma vez quando a inexistência é inequívoca e nenhum turno foi executado; não repetir ações em erro ambíguo. |
| 6 | P1 | Stream Claude com `init` seguido de EOF, sem `result`, termina sem evento terminal e mantém o serviço esperando. | Emitir falha terminal uma única vez e liberar consultas, esperas e vaga da fila. |
| 7 | P1 | Ao reconectar, o snapshot atualiza o nome da conversa, mas uma mensagem produzida durante a queda continua ausente no cliente. | Reconciliar o histórico, sem reenviar comandos e sem perder a posição de leitura. |
| 8 | P2 | `group_members` lista um especialista ao Chief, mas `ask_agent` rejeita esse especialista por estar fora da equipe autorizada. | Informar elegibilidade e motivo com o mesmo critério usado ao delegar. |
| 9 | P2 | `stop()` durante a abertura da voz retorna com `session` vazia; a conexão pendente termina e abre uma sessão depois. | Cancelar a geração pendente e fechar sua eventual sessão tardia. |
| 10 | P2 | Arquivo com 200.004 bytes recebe como proposta seu prefixo de 200.000 bytes; a ferramenta responde “Sem alterações” e conserva o sufixo. | Comparar o arquivo inteiro; limitar somente a prévia. |
| 11 | P2 | O fingerprint de ferramentas considera só nomes; mudar schema/descrição reaproveita thread Codex com definições antigas. | Invalidar a sessão quando o contrato efetivo de ferramentas mudar. |
| 12 | P2 | Excluir conversa/agente/workspace não descarta seus contextos Playwright nem aberturas pendentes. | Descartar somente os recursos pertencentes ao item excluído, sem ressuscitá-los. |
| 13 | P1 | No Codex real, pedir um complemento ao implementador abriu outra conversa; ele não encontrou stdout/código de saída que havia obtido antes. | Continuar a delegação identificada e disponibilizar evidência persistida autorizada. |
| 14 | P1 | Crescimento de mensagem acima da área visível faz a leitura saltar para o fim; mensagem de referência sai da janela virtual. | Uma única autoridade de ancoragem, com estabilidade após medições e resize. |
| 15 | P1 | `delegate` cria resposta do especialista com `runId: null`; a UI filtra aprovações/diffs por `message.runId`, deixando a aprovação pendente sem cartão. | Associar a mensagem ao run filho e reparar vínculos antigos comprovadamente recuperáveis. |

P1 indica perda de dados, bloqueio ou quebra do fluxo principal. P2 indica falha funcional que também deve ser corrigida nesta entrega; a ordem não exclui itens do escopo.

## Locais principais

Todos os caminhos abaixo são relativos a `apps/desktop`:

- `src/main/v9/workspace.ts`: polling, envio, contexto, broker de ferramentas e delegação.
- `src/main/v9/store.ts`: SQLite, migrações, mensagens, runs, bindings e aprovações.
- `src/main/v9/agent-runtime.ts`, `codex.ts`, `claude.ts`, `pi.ts`, `headless-cli.ts`: contrato e adaptação das sessões.
- `src/renderer/src/features/app/AppShell.tsx`: seleção, eventos e associação dos cartões.
- `src/renderer/src/features/chat/{MessageList.tsx,useConversationHistory.ts}`: janela de histórico, reconciliação e scroll.
- `src/main/hosts/manager.ts`: reconexão e sinalização ao renderer.
- `src/main/v9/realtime/service.ts` e `src/main/v9/browser.ts`: ciclo dos recursos.

## Resultados observados antes da implementação

- `npm run typecheck` e `npm run build` passaram.
- Suíte completa: 368 testes passaram, 5 falharam e 18 foram ignorados. Isso não é uma suíte aprovada.
- Repetição isolada de três arquivos: 22 testes passaram; dois cenários Git/worktrees continuaram excedendo 30 segundos. Configurações passou isoladamente.
- O teste de cancelamento Windows não chegou à etapa de interrupção porque o marcador inicial não apareceu a tempo; a limpeza recebeu EPERM. Não comprova falha do cancelamento do produto.
- O teste do Sidebar ainda espera `window.confirm`, embora a implementação anterior tenha passado a usar modal React.
- Codex real `gpt-6-luna`: dois projetos, sete runs concluídos, duas escritas e dois `npm test` aprovados. Os testes independentes dos arquivos resultantes passaram, dois por projeto.
- A integração real falhou por esperar exatamente quatro runs filhos e encontrar cinco. A quinta execução foi um pedido complementar legítimo, mas revelou o defeito 13. A contagem rígida precisa ser substituída por invariantes da cadeia e do resultado.
- Electron real: exclusão/cancelamento de conversa, workspace e agente preservaram a capacidade de digitar no composer; nenhum diálogo nativo foi aberto nesses fluxos.
- Duas instâncias Electron por loopback validaram pareamento, escrita remota, bloqueio offline, reconexão e separação do estado local/remoto. O item 7 foi reproduzido nessa reconexão.
- Histórico com 350 mensagens manteve 13 elementos de mensagem montados no ponto medido. Isso não prova estabilidade de ancoragem: o item 14 foi reproduzido separadamente.
- No item 14, a leitura estava aproximadamente 1.785 px distante do fim. O defeito persistiu depois de 15 frames com scroll/altura estabilizados. Desativar `overflow-anchor` somente no DOM do teste preservou a referência em y=58,3875 no crescimento e no resize.
- No item 15, a aprovação pendente existia no backend, mas o chat não mostrava cartão. Preencher somente o `runId` na cópia de teste fez os cartões aparecerem.

Os experimentos de correção foram feitos somente em DOM e bancos descartáveis. Nenhum desses controles positivos equivale a uma correção aplicada ao produto.

## Referências de implementação

As referências foram inspecionadas nestas revisões, sem depender de mudanças posteriores na branch principal:

- Paseo `068f272a00ffef3f00ec30ec4cfa3a631be97624`: [reading-anchor.ts](https://github.com/getpaseo/paseo/blob/068f272a00ffef3f00ec30ec4cfa3a631be97624/packages/app/src/agent-stream/reading-anchor.ts), [history-window.ts](https://github.com/getpaseo/paseo/blob/068f272a00ffef3f00ec30ec4cfa3a631be97624/packages/app/src/agent-stream/history-window.ts). Referência para identidade da mensagem, medição e janela limitada.
- OpenMausBot `2bfb982f5a55ce297a6d301bc45ba0c9906a9dc6`: [turn-context.ts](https://github.com/milind-soni/OpenMausBot/blob/2bfb982f5a55ce297a6d301bc45ba0c9906a9dc6/server/turn-context.ts), [context-rebuild.ts](https://github.com/milind-soni/OpenMausBot/blob/2bfb982f5a55ce297a6d301bc45ba0c9906a9dc6/server/context-rebuild.ts). Referência para retomada nativa e reconstrução em sessão nova, perdida ou atualizada externamente.

O objetivo é aplicar esses contratos à arquitetura existente do Politron, preservando agentes personalizados, permissões, aprovação e autoria. Código efetivamente reutilizado deve manter licença e avisos aplicáveis.

## Limites de aceite

O usuário confirmou que está somente no computador de casa e não tem acesso ao notebook do escritório agora. Teste entre dois computadores físicos e microfone real permanecem pendentes. O executável publicado anteriormente não foi validado como contendo as correções locais posteriores.

Os logs e screenshots originais foram mantidos fora do repositório por serem evidência de máquina. A implementação deve converter os cenários em regressões duráveis e preservar os novos artefatos de QA sem incluir credenciais ou bases pessoais no Git.

## Aceite de correção — 21/10/2026

Este registro acompanha os 15 IDs acima; resultados parciais não significam aceite final.

| IDs | Evidência local | Estado e limite |
|---|---|---|
| 1–2, 4–10, 13, 15 | Regressões focadas; suíte completa 433 aprovada, 18 ignoradas; typecheck e build aprovados. Para 13, Codex real `gpt-6-luna` em duas raízes descartáveis passou com complemento e evidências. | Correções implementadas e verificadas pelos testes registrados. Aceite visual do conflito de escrita e cartão manual de aprovação continuam pendentes. |
| 3 | Testes de continuidade/contexto focados e suíte completa. | Implementado; retomar conversa existente com usuário ainda não foi aceite manualmente com cartão real. |
| 7 | Dois processos Electron locais: uma mensagem adicionada enquanto cliente estava desconectado reapareceu após reconexão; SQLite confirmou uma mensagem. | Passou em loopback no mesmo computador; dois PCs físicos pendentes. |
| 11 | Fingerprint de contrato e isolamento de binding de sessão cobertos em testes de sessão. | Implementado; retomada real Claude e demais provedores não foi validada. |
| 12 | BrowserService e exclusão em cascata cobertos por testes direcionados. | Implementado; cenário amplo de navegador Electron permanece parcial. |
| 14 | `test:agent-stability:electron`: mesma referência permaneceu montada; deslocamento foi 0 px depois de crescimento acima e resize. | Crescimento/resize passaram; prepend, streaming, remoção do limite, novas mensagens e “ir para o fim” não foram aceites juntos no Electron. |
| Bug de composer após exclusão | `test:agent-stability:electron`: cancelar preservou workspace; confirmar excluiu; composer aceitou texto; nenhum diálogo nativo. | Passou em Electron local. |

Comandos registrados no checkout: `quality:rules`, `lint:typed`, `typecheck`, `npm test` e `build` passaram. `lint` falhou com 168 erros e 45 avisos; portanto `npm run verify` não está aprovado. A integração live `workspace.live.test.ts` passou com modelo fixo `gpt-6-luna`; sua aprovação foi automática pelo listener da fixture. A tentativa opcional de aprovação manual via cartão da UI falhou: a mensagem do usuário foi gravada, porém nenhum cartão pendente de delegação permaneceu visível. Evidência temporária da última tentativa: `%TEMP%/boobot-agent-stability-BxWn84`; Electron local sem chamada live passou em `%TEMP%/boobot-agent-stability-T2y7BW`. A investigação do envio/aprovação real permanece aberta.

Não foi criado instalador candidato, nem publicado release. A máquina de escritório não estava disponível; teste entre PCs físicos, microfone e retomada real de Claude seguem pendentes. O build local não valida o instalador anteriormente distribuído.
