# Auditoria funcional do Boobot

Data: **19/10/2026**. Projeto: `D:\projetos pessoais\politron`; aplicativo: `apps/desktop`; HEAD de referência: `9aa046e`, com alterações locais anteriores preservadas. Não houve commit ou push no projeto, alteração de dependências ou mudança no Boo Pet.

## Resultado e método

**O fluxo real Chief → implementador → edição → testes → conclusão funcionou em um projeto React/TypeScript descartável.** Houve criação e delegação aprovadas, permissões próprias, diff, testes executados pelo agente e conferência independente. A troca aprovada de Codex para Claude também funcionou, com leitura real pelo Claude.

Isso comprova o cenário assistido pequeno. **Ainda não certifica coordenação geral, operação desassistida ou confinamento de processos.** Foi reproduzido um impasse da fila em delegações aninhadas e com dois pais aguardando filhos.

O Electron foi aberto em uma segunda instância com `appData` exclusivo. Não há login do Boobot: usamos os runtimes já disponíveis na máquina, conforme esclarecimento do usuário. Não copiamos credenciais nem usamos perfis pessoais de navegador, e-mails ou formulários externos. A automação atuou somente no Electron de teste, Chromium isolado e arquivos/processos descartáveis.

### Arquitetura e testes analisados antes das correções

Renderer React → preload `window.appAPI` → IPC V9 → `AppService` → runtimes/ferramentas. `WorkspaceStore` persiste agentes, conversas, runs, aprovações, delegações, diffs, sessões e checkpoints no SQLite. Codex usa app-server; Claude usa Agent SDK; Pi possui adaptador próprio; OpenCode/Antigravity usam `HeadlessCliRuntime`.

O broker aplica aprovações antes das ferramentas. `WorkspaceQueue` serializa apenas por pasta de trabalho (cwd/worktree, caminho canônico) e por sessão do motor (conversa + agente); pastas ou worktrees diferentes rodam em paralelo, inclusive para o mesmo Boo, sem limite global por padrão. `BOOBOT_MAX_PARALLEL_RUNS` (inteiro positivo) liga um limite global opcional; o pai que só aguarda um filho de outra pasta devolve a vaga enquanto espera, e o Chief usa faixa própria que não ocupa vaga nem pasta (o texto anterior, com duas vagas globais, vale só como histórico da auditoria). `BrowserService` usa Chromium headless e contextos não persistentes separados por conversa/agente.

A suíte Vitest combina React Testing Library, runtimes simulados e SQLite/arquivos/Git reais em fixtures. Integrações externas são condicionais. Foram analisados contratos e testes de Chief, delegação, permissões, aprovação, workspaces, runtimes e navegador antes de editar.

### Evidências

Neste documento, **E/** abrevia:

```text
C:\Users\lchen\AppData\Local\Temp\boobot-functional-audit-20261019-c2ff153d
```

O estado inicial está em **E/git-status-inicial.txt**. Scripts, logs e screenshots ficam nessa pasta temporária; os resultados essenciais estão transcritos aqui. Os testes Git existentes criam históricos somente em repositórios descartáveis, sem modificar o histórico do Politron.

## 1. Funcionalidades verificadas e funcionando

| Funcionalidade | Teste e runtime | Resultado / evidência | Limite ou correção |
| --- | --- | --- | --- |
| Electron sem login e envio pelo composer | Interface real | Perfil vazio abriu; pedidos enviados pelo composer. **E/electron-initial.png**, **verified-electron-final.png** | Não é teste do instalador; dados pessoais preservados. |
| Chief encontra agentes, propõe criação e equipe | Electron + Codex `gpt-6-luna`, esforço baixo | `group_members`, `propose_agent`, `propose_team`, criação/equipe aprovadas. **E/real-flow.jsonl**, **runtime-tool-calls.jsonl** | Cenário dirigido; não avalia qualidade geral de planejamento. |
| Permissões próprias do implementador | Electron + Codex real | AuditWorker nasceu sem escrita; o operador da fixture concedeu `canWrite` explicitamente. Chief continuou sem escrita. **E/real-flow.jsonl** | Aprovar criação não concede privilégios. |
| Delegar, editar e retornar conclusão | Dois agentes Codex reais | Implementador corrigiu `src/counter.ts`; Chief recebeu o resultado. Ambos concluíram no workspace correto. **E/verified-final-snapshot.json**, **real-verified.jsonl** | Caso pai/filho; não certifica delegação aninhada. |
| Executar testes e TypeScript | PowerShell/npm reais acionados pelo Codex | 2 testes aprovados, saída 0; typecheck com saída 0. Repetição independente confirmou. **E/real-verified.jsonl** | Terminal exige escrita habilitada e aprovação de cada comando. |
| Trocar runtime/modelo com aprovação | Chief Codex → Claude → Codex | `propose_agent_model`; permissões preservadas. Claude leu o arquivo e identificou o defeito antes da correção. **E/real-continuation.jsonl** | Troca verificada entre tarefas, não durante uma edição. |
| Abrir, navegar, ler, preencher e clicar | Chromium real, sem LLM | Formulário local, botão, link e retorno por URL funcionaram. Página pública `https://example.com/` carregou. **E/browser-real-final.json** | Nenhum formulário externo enviado. |
| Agente usa as ferramentas de navegador pelo runtime | Electron + Codex real, Chromium real | Agente com navegador habilitado e escrita desabilitada abriu a página local, preencheu `#name`, clicou `#save`/`#next`, leu os resultados e abriu `https://example.com/`. Cada ação sensível foi aprovada pelo IPC. **E/real-browser-agent.jsonl**, **agent-browser-final.png** | Fluxo completo real; decisões positivas automatizadas pela fixture. |
| Isolar sessões do navegador | Chromium real | Contextos e localStorage separados por agente. Texto/dados de um não apareceram no outro. | Não utiliza perfil do navegador principal; não é uma VM. |
| Controle humano e erros do navegador | Chromium real | Agente bloqueado após tomada de controle; devolução funcionou. `file:` recusado; URL local indisponível gerou erro de rede. **E/browser-real-final.json** | Controle da página, não do Windows. |
| Negar escrita pela interface | Electron + Codex real | Clique em **Negar** persistiu `denied`; arquivo permaneceu igual. **E/real-controls.jsonl** | Sem contornar a recusa. |
| Parar tarefa e voltar a conversar | Electron + Codex real | Clique em **Parar geração** interrompeu aprovação/run; arquivo intacto. Novo pedido respondeu `RECUPERADO`; zero runs ativos. **E/real-controls.jsonl**, **real-interrupted-ui.png** | Comprovado durante aprovação; não cobre toda operação externa. |
| Permissão negada e ferramenta indisponível | Runtime simulado; broker/SQLite reais | Sem escrita não há arquivo/skill/terminal; workspace pode negar comandos; navegador sem permissão é bloqueado antes de abrir. Terminal global desabilitado gera erro claro. `audit-reliability.test.ts` | B01 corrigido no catálogo e no broker. |
| Falha e separação entre runtimes | Codex/Claude simulados | Desconexão Codex preserva Claude e libera a espera. Thread diferente com mesmo turno não é encerrada; falha antecipada permanece falha. | Falhas injetadas sem derrubar runtimes pessoais. |
| Encerrar processo filho | PowerShell/Node reais; aprovação simulada | Cancelamento encerrou a árvore atual no Windows antes da escrita do filho. **E/cancel-diagnostics.jsonl** e regressão no broker | Melhor esforço com `taskkill /T /F`; não é sandbox. |
| Erro/cancelamento de delegação e ciclos | Runtime simulado; persistência real | Casos existentes de destinatário falho, origem cancelada, cancelamento individual, idempotência e ciclos. `v9-delegation.test.ts` | Não equivale a falhas reais de todos os provedores. |
| Checkpoints e reinício | Runtime simulado; SQLite real | Checkpoint reaparece na thread nova com decisões, pendências e pedido literal. Banco reaberto interrompe runs/aprovações antigas sem repetir escrita. | Recuperação de contexto; não retoma comandos automaticamente. |

### Prova da edição real

Fixture: **E/react-typescript-project**, com componente React `src/Counter.tsx`, função TypeScript, testes Node e `tsconfig.json`. Reutilizou compilador/tipos instalados, sem instalar dependências.

```diff
-export function increment(value: number): number { return value - 1 }
+export function increment(value: number): number { return value + 1 }
```

Antes: dois testes falhando. Depois, pelo agente e pela conferência independente:

```text
npm test             → 2 aprovados, 0 falhas, saída 0
npm run typecheck    → saída 0
```

Chief: run `88ce24a1-0728-445b-b122-d99ef2921d7a`, sem escrita. Implementador: `9755d825-aada-4c18-987d-99cbfacaa609`, com escrita. Ambos concluídos na mesma pasta; diff aplicado identifica autor e arquivo.

As aprovações positivas do cenário foram decisões automatizadas pelo operador da fixture através do IPC real, limitadas à criação/equipe, destinatário, arquivo e dois comandos exatos. Não são descritas como cliques humanos. Negação e interrupção foram verificadas separadamente com cliques na interface.

Tentativas anteriores foram preservadas: o agente inicialmente aguardou confirmação textual da escrita e não editou. Depois, o driver negou uma gravação por comparar barras diferentes no caminho Windows; era erro da fixture, e o aplicativo respeitou a negação. O driver foi corrigido sem alterar a proteção. Nessa tentativa apareceu o bug real do terminal B05. Somente a repetição com arquivo alterado e testes independentes aprovados foi considerada sucesso.

## 2. Funcionalidades parcialmente funcionando

| Área | Evidência / runtime | Limite e correção necessária |
| --- | --- | --- |
| Autonomia da equipe | Chief e implementador reais | Criação, concessão de escrita e ações sensíveis dependem do operador. A passagem “criado → autorizado → pronto” precisa comunicar a permissão atual com clareza. |
| Delegação com três níveis ou dois pais | Classe de fila real, sem LLM; **E/queue-repro.jsonl** | Impasse reproduzido. Falta concessão herdada/suspensa para filhos, mantendo limites e serialização por pasta. |
| Terminal limitado ao workspace | Processo real; **E/terminal-boundaries.jsonl** | `cwd` não confina comandos: um comando aprovado leu um arquivo sintético irmão. Necessita sandbox de SO para prometer confinamento. |
| Revogação durante execução | Inspeção do broker/contextos | Run usa snapshot do agente; revogação durante uma chamada em andamento não foi certificada. Definir cancelamento imediato e política de revogação. |
| Motores adicionais | Código/testes existentes inspecionados | Pi/OpenCode/Antigravity não fizeram edição real aqui. `HeadlessCliRuntime.thread` ignora workspace/ferramentas recebidos e usa execução restrita; catálogo/chat não provam capacidade de codar nesse caminho. |
| Escopo de delegação | Broker e testes do Chief | Chief é limitado à equipe/workspace. Agentes comuns podem localizar outros cadastrados; não há uma política geral de delegação origem/destino certificada. |
| Retomada de trabalho real | SQLite/checkpoints com runtime simulado | Contexto é recuperado; não foi demonstrada continuação integral de uma tarefa real após matar o aplicativo. |
| Concorrência em worktrees | Runtimes simulados, Git/arquivos reais | Testes verificam arquivos e autores separados, mas apareceram timeouts nas repetições. Não certifica escrita concorrente na mesma pasta. |

## 3. Bugs encontrados e reproduzidos

| ID | Reprodução / impacto | Estado |
| --- | --- | --- |
| B01 | Agente permanente `canWrite=false` gravava por `workspace_write`. Terminal e skills também ignoravam restrições em certos caminhos. | **Corrigido:** catálogo e broker respeitam agente/workspace. |
| B02 | Desconectar Codex falhava o run de Claude e podia deixar a espera original ocupando a fila. | **Corrigido:** filtra runtime e aborta somente suas esperas, preservando estado de falha. |
| B03 | Mesmo id de turno em duas threads encerrava ambas pelo evento de uma só. | **Corrigido:** verifica também `threadId`. |
| B04 | Solicitações concorrentes lançavam mais de um Chromium. | **Corrigido:** promessa compartilhada de lançamento e criação por sessão; limpeza se inicialização falhar. Reprodução com mock; navegação concorrente real também executada. |
| B05 | Ambiente reduzido sem `PATHEXT`/`COMSPEC` quebrava `npm`; erro de `$LASTEXITCODE` com saída 0 enganosa. | **Corrigido:** essas variáveis de sistema entraram na lista permitida. Processo real antes/depois e regressão pelo broker. |
| B06 | Falha em `turn/completed`, recebida antes do retorno de `send`, era convertida em sucesso pelo cache. | **Corrigido:** cache por runtime preserva estado/erro, limitado a 1.000 resultados. |
| B07 | Resolver aprovação acumulava listeners de abort no run. | **Corrigido:** listener removido ao resolver; teste verifica remoção. |
| B08 | Parar PowerShell deixava Node filho gravar após a interrupção. | **Corrigido para a árvore atual no Windows:** `taskkill /T /F` no cancelamento e timeout. Não contém processos deliberadamente destacados. |
| B09 | Dois pais esperando filhos: `active=2`, `pending=2`. Pai/filho/neto: `active=2`, `pending=1`; neto nunca inicia. | **Aberto, estrutural.** Reprodução na fila de produção em **E/queue-repro.jsonl**. Problema documentado antes de propor mudança; fila não foi reescrita. |

Os quatro erros iniciais eram expectativas desatualizadas: nome Politron/Boobot, pasta de delegação, campos adicionais do catálogo Claude e texto “respondendo/trabalhando”. Foram alinhadas aos contratos observados. A fixture de skills que grava agora concede escrita explicitamente. Nenhuma verificação de segurança foi desativada.

## 4. Bugs corrigidos e arquivos modificados

Intervenções desta auditoria:

- `apps/desktop/src/main/v9/workspace.ts`: B01–B03 e B05–B08. Aprovação obrigatória por comando e timeout de 120 segundos preservados.
- `apps/desktop/src/main/v9/browser.ts`: B04 e limpeza/fechamento das inicializações.
- Novos testes no mesmo diretório: `audit-reliability.test.ts`, `browser-concurrency.test.ts`, `browser.live.test.ts`.
- Expectativas/fixtures: `skills.tools.test.ts`, `skills/skills.test.ts`, `src/renderer/src/test/v9-delegation.test.ts`, `v9-multi-runtime.test.ts`, `src/renderer/src/features/chat/RunProgress.test.tsx`.
- Este relatório, `PRODUCT.md` e seção 7 de `ESTRATEGIA_POLITRON.md`.

As demais alterações já presentes no Git não são atribuídas à auditoria. Não reconstruímos navegador, Computer Use ou UI, nem alteramos dependências ou regras de lint.

## 5. Testes executados e resultados

Comandos em `apps/desktop`: `npm test` com um/dois workers e relatório JSON; `npm run typecheck`; `npm run build`; `npm run lint`; `npm run quality:rules`. Chromium real foi habilitado somente no processo do teste com `POLITRON_RUN_BROWSER_INTEGRATION=1`, executando `browser.live.test.ts` e `browser-concurrency.test.ts`.

| Verificação | Resultado | Evidência em E/ |
| --- | --- | --- |
| Suíte inicial | 304 aprovados, 4 falhos, 9 condicionais ignorados | `tests-baseline.json` |
| Regressões antes de corrigir | Falhas comprovadas para B01–B08 | `audit-red-final.json`, `browser-red.json`, `terminal-red.json`, `race-red.json`, `cancel-red.json` |
| Suíte após correções, antes dos dois últimos casos adicionados | 319 aprovados, 0 falhas, 11 condicionais ignorados | `tests-certified.json` |
| Rodada com todos os casos e dois workers | 319 aprovados, 2 timeouts, 11 condicionais ignorados | `tests-complete.json` |
| Repetição dos testes Git/workspaces com um worker | 17 aprovados, 2 timeouts, em casos parcialmente diferentes | `worktrees-recheck.json` |
| Rodada final com um worker | **321 aprovados, 0 falhas, 11 condicionais ignorados** (332 casos) | `tests-final-serial.json` |
| Chromium real + teste de inicialização | 3 aprovados, 0 falhas | `browser-real-final.json` |
| TypeScript final | Aprovado, saída 0 | `typecheck-complete.log` |
| Build final | Aprovado, saída 0 | `build-certified.log` |
| Regras locais de qualidade | Aprovadas | `quality-rules.log` |
| ESLint geral | **Falhou:** 96 erros, 41 avisos na execução registrada | `lint.log` |
| Lint focado | Arquivos novos/navegador sem apontamentos; broker mantém 9 `any` anteriores e aviso de tamanho | `lint-audit-files.log` |
| Projeto descartável, agente e conferência independente | Dois testes e typecheck aprovados | `real-verified.jsonl` |
| Negação, interrupção e recuperação pela UI | Aprovações `denied`/`interrupted`, arquivo intacto, resposta `RECUPERADO`, zero runs ativos | `real-controls.jsonl` |

Os timeouts Git/workspaces não foram escondidos nem ampliados. A primeira rodada de 332 casos teve dois testes de 30 segundos excedidos. A repetição focada voltou a apresentar timeout, inclusive em outro caso de workspace; a causa não foi isolada. Portanto, não classificamos a suíte geral como estável apenas por uma rodada verde anterior.

A rodada completa final com um worker passou sem falhas. Isso comprova a execução final e preserva a evidência de instabilidade das rodadas anteriores; não certifica estabilidade sob carga ou paralelismo maior.

Os 11 condicionais ignorados da chamada padrão não são recursos aprovados; dois são os testes novos de navegador, executados separadamente com Chromium real. Integrações de voz, desempenho e demais runtimes não foram habilitadas indiscriminadamente.

O teste de cancelamento usa filho que escreveria após sete segundos, dando margem ao início do `taskkill` nesta máquina. Exige término antes da escrita, sem alterar o timeout de produção. O diagnóstico real encerrou a árvore e registrou `marker: false`.

### Distinção entre mocks, modelo e interface

- `real-flow.cjs`, `real-continuation.cjs`, `real-verified.cjs` e `real-controls.cjs`, em E/, usam Electron/runtimes reais. Aprovações positivas automatizadas e cliques de negação/parada são identificados separadamente.
- `real-browser-agent.cjs` executou uma navegação completa pelo agente Codex autorizado, sem escrita, com Chromium real. O formulário só alterou o DOM local; a página pública foi apenas lida. O run terminou `completed`, com frame final de `https://example.com/`.
- `runtime-tool-calls.jsonl` contém referências encontradas somente nos rollouts dos threads da fixture. Ocorrências de nomes não são contagem exata de chamadas. Não contém credenciais/conversas pessoais.
- Uma abertura durante o build falhou porque `out/renderer` estava sendo recriado. Repetição após o build abriu normalmente: erro da ordem do harness, não tratado como falha de instalação do produto.
- O primeiro teste adicional de negação pediu um arquivo fora das instruções restritas do implementador; ele recusou antes de chamar a ferramenta. O teste foi ajustado para propor um comentário no arquivo permitido e negar a aprovação real. Não ampliamos sua permissão para fazer o teste passar.

### Esperas e estado “trabalhando”

Não foi encontrada espera deliberada de segundos antes de mostrar texto. O primeiro delta é enviado imediatamente; os demais são agrupados por 16 ms. A varredura de status a cada cinco segundos não segura a resposta. Limites de inicialização, modelos e comandos foram mantidos.

As regressões de falha exigem estado final correto e liberação da espera. O teste real de parada terminou sem runs ativos e aceitou nova mensagem. **B09 ainda pode deixar tarefas em “trabalhando” indefinidamente**, mesmo com runtime saudável.

## 6. Testes não executados e motivos

- Controle de desktop/janelas Windows: não existe backend certificado e não foram autorizadas ações sobre outros aplicativos. Somente a interface Electron de teste foi automatizada.
- Confinamento forte de comandos: inexiste sandbox de SO. A reprodução usou exclusivamente arquivo sintético irmão da fixture.
- Fluxo real de dois Chiefs presos ou três níveis: impasse já reproduzido na fila sem LLM; mais chamadas reais não resolveriam admissão e consumiriam recursos.
- Edição real por Pi/OpenCode/Antigravity, voz e distribuição instalada: fora do cenário real certificado. CLI/catálogo não provam execução de ferramentas.
- Retomada integral após matar o aplicativo, revogação durante ação e falhas reais de rede de cada provedor: sem certificação real; SQLite e injeção de falhas cobrem somente partes.
- Seis agentes, uso prolongado, custo e benchmark de desempenho: não medidos. Não há promessa de latência ou estabilidade prolongada baseada no smoke.

## 7. Funcionalidades ainda inexistentes

### Computer Use nativo: proposta mínima, não implementada

O navegador já oferece screenshot, DOM, entrada na página, frames, cursor e controle humano. Broker, aprovações e recibos podem ser reaproveitados. `screen` no main posiciona o mascote; não foi encontrado backend de captura/entrada nativa ou automação de janelas do Windows.

Implementação mínima segura proposta:

1. Capacidade separada de navegador, por agente/workspace, consentimento explícito por sessão e janela alvo.
2. Broker no main para capturar somente a janela autorizada e verificar sua identidade antes de cada ação; fila sequencial de ações curtas, sem fallback silencioso para terminal.
3. Botão/atalho de parada independente do LLM; revogação bloqueia novas ações e encerra a sessão.
4. Prévia de ações sensíveis e recibos auditáveis sem persistir credenciais/imagens pessoais desnecessárias; validar primeiro em janela descartável.
5. Definir convivência e isolamento antes de usar aplicativos reais: contexto Chromium não isola mouse/teclado do Windows.

Também não existem garantias de sandbox do terminal limitado à pasta, retomada transacional automática de comandos interrompidos ou concessão herdada da fila para filhos.

## 8. Próximas melhorias, por impacto e esforço

| Ordem | Melhoria | Impacto / esforço | Critério de aceitação |
| --- | --- | --- | --- |
| 1 | Resolver B09 com concessão herdada/suspensa e serialização por pasta | Alto / médio a alto | Dois pais e três níveis terminam sem impasse; irmãos e cancelamentos respeitam os limites. Não apenas aumentar slots. |
| 2 | Confinamento de comandos e política de revogação | Alto / alto | Não acessar fixture irmã, bloquear ações após revogação e comunicar limites. Até lá, comandos confiáveis explicitamente aprovados. |
| 3 | Comunicar “criado → autorizado → pronto” | Alto / baixo a médio | Chief e implementador reconhecem a permissão concedida sem repetir verbalmente; sem promoção automática de privilégio. |
| 4 | Isolar causa dos timeouts Git e eliminar dívida de lint | Médio / médio | Repetições estáveis e lint aprovado, sem suprimir regras ou aumentar limites para esconder falhas. |
| 5 | Certificar ferramentas dos demais motores | Médio / médio a alto | Cada runtime edita fixture, pede aprovação, respeita negação e preserva pasta. |
| 6 | Reinício real e revogação em tarefas longas | Médio / médio | Sem tarefa presa, replay de comando ou cruzamento de workspace. |
| 7 | Computer Use mínimo descrito acima | Futuro / alto | Somente janela descartável, com consentimento e parada independente. |

**Impedimentos atuais ao uso diário confiável:** impasse de coordenação aninhada/concorrente, ausência de confinamento do terminal, motores adicionais sem certificação de código e instabilidade da suíte Git/workspaces. O fluxo simples com Chief e implementador já realiza trabalho verificável. A ausência de Computer Use nativo é uma lacuna de produto, não uma falha do navegador existente.
