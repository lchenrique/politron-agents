# Plano de correção da estabilidade de agentes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução recomendada: sequencial, com revisão por entrega; tarefas compartilham contratos de sessão, persistência e delegação. Subagentes só devem ser usados se o usuário escolher esse método. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 15 achados da auditoria, preservando dados, aprovações e continuidade entre usuário, Chief e especialistas.

**Architecture:** Preservar Electron, IPC, SQLite e runtimes existentes. Aplicar ao Politron os contratos de retomada/reconstrução do OpenMausBot e de janela/ancoragem do Paseo. Sessões, mensagens, delegações e evidências terão vínculos explícitos; recuperação de estado não repetirá operações ambíguas.

**Tech Stack:** Electron, React 18, TypeScript, `node:sqlite`, Vitest, Playwright e adaptadores Codex/Claude/Pi/OpenCode/Antigravity já presentes no desktop.

**Spec:** [Auditoria de estabilidade de agentes — 15 achados](../../auditorias/2026-10-20-estabilidade-agentes.md).

**Estado:** planejamento concluído; todas as tarefas de implementação abaixo estão pendentes. As correções anteriores de modal/composer existem no checkout e devem ser preservadas. Este documento não autoriza anunciar correções como concluídas nem publicar um instalador sem evidência.

## Global Constraints

- Trabalhar em `apps/desktop`; preservar a stack, IPC tipado, temas e funcionalidades existentes.
- Preservar o banco lateral `politron-v9.sqlite`; nunca usar uma base pessoal como fixture.
- Cada agente mantém sessão por conversa e contexto; não compartilhar histórico ou evidência fora do escopo autorizado.
- Aprovação explícita do Chief para criação/delegação continua obrigatória. Permissões do destinatário continuam próprias; recuperação não amplia acesso.
- Não reenviar comandos após timeout/desconexão quando não for possível afirmar que a ação não ocorreu.
- Contexto reconstruído: até **24.000 bytes UTF-8** e **40 mensagens**, com checkpoint quando disponível. Não duplicar todo o histórico em cada turno nativo.
- Histórico no renderer: manter o limite atual de **600 mensagens**, paginação e agrupamento do streaming. Não voltar a carregar toda a conversa em memória.
- Preservar alterações staged, unstaged e untracked. Não usar reset, stash, limpeza recursiva ou checkout sobre arquivos alterados.
- Antes de executar: `bright-memory ensure`; ao concluir cada entrega relevante: `bright-memory save`. Documentação registra contratos, não substitui memória da CLI.
- Antes de migrar dados: backup consistente do SQLite; migrações transacionais e reexecutáveis com teste de banco antigo.
- Conferir a licença e manter avisos de trechos efetivamente reutilizados de Paseo/OpenMausBot.
- Usar acentuação correta em português em textos, commits e documentação.

## Review Focus

1. Aprovação pendente que atravessa reinício, reparo de mensagem ou exclusão: nunca executar uma decisão antiga sem waiter ativo — tarefas 1, 3 e 16.
2. Mensagem externa que chega durante a abertura do turno ou enquanto o usuário lê páginas antigas: não marcar contexto não entregue como visto nem trocar a leitura de lugar — tarefas 6, 11 e 12.
3. Erro de retomada depois do primeiro token ou chamada de ferramenta: não repetir o turno automaticamente — tarefas 4 e 6.
4. Duas propostas para o mesmo arquivo e edição externa durante aprovação: serializar escritores do app e preservar conflitos observados — tarefa 3.
5. Complemento de delegação após mudança de equipe, pasta, destinatário ou aposentadoria temporária: recuperar evidência autorizada, sem reativar permissões implicitamente — tarefas 8 e 10.

## Ordem e cobertura

| Fase | Tarefas | Achados | Entrega |
|---|---|---|---|
| 1. Dados e bloqueios | 1–4 | 15, 1, 2, 10, 6 | Aprovar trabalho delegado, preservar alterações e encerrar execuções quebradas. |
| 2. Sessões | 5–7 | 4, 3, 5, 11 | Retomada real, contexto externo e contratos de ferramenta atualizados. |
| 3. Colaboração | 8–10 | 8, 13 | Equipe elegível, evidência persistida e complementos na mesma tarefa. |
| 4. Histórico | 11–12 | 7, 14 | Recuperar mensagens após queda e manter a posição de leitura. |
| 5. Recursos | 13–14 | 9, 12 | Cancelar voz e descartar navegadores sem recursos órfãos. |
| 6. Aceite | 15–16 | Todos | Regressões duráveis, execução real, UI e critérios de publicação. |

A sequência é deliberada: a validação de colaboração precisa primeiro de aprovações visíveis; a continuação de tarefas precisa de sessões confiáveis e evidência persistida. Voz e descarte de navegador podem ser revisados separadamente, preservando a ordem de integração.

## Preparação comum

- [x] Ler `AGENT.md`, a especificação ligada acima e os callers dos arquivos de cada tarefa; conferir o estado atual do Git.
- [x] Preservar as alterações existentes de modal, composer, replay e provedores. Se houver checkout isolado, preparar nele uma base revisada que inclua as mudanças necessárias; partir de HEAD limpo sozinho não reproduz este estado.
- [x] Registrar baseline antes da primeira alteração. Histórico observado: typecheck/build passaram; suíte teve 368 passes, 5 falhas e 18 skips. Não tratar esse histórico como medição nova.
- [x] Em cada tarefa: escrever regressão que falhe pelo defeito, executar, corrigir o menor trecho responsável e executar a regressão novamente. Novos testes devem verificar o comportamento observável.
- [ ] Revisar o diff de cada entrega e fazer commits pequenos quando a execução/commit estiver autorizada; não incluir alterações anteriores alheias à tarefa. Publicação e instalador são etapas posteriores.

Os caminhos das tarefas a seguir são relativos a `apps/desktop`, salvo indicação contrária. Os comandos de testes devem ser executados nessa pasta.

## Fase 1 — Dados e bloqueios

### Tarefa 1: Vincular respostas delegadas aos runs e recuperar dados antigos

**Achado:** 15. **Dependências:** nenhuma.

**Arquivos:** modificar `src/main/v9/{workspace.ts,store.ts}`; testar `src/renderer/src/test/v9-delegation.test.ts`, `src/main/v9/schema-migration.test.ts` e novo `src/renderer/src/features/app/delegation-evidence.test.tsx`.

**Interfaces:** `WorkspaceStore.repairDelegatedMessageLinks(): number`, reparo idempotente de JSON existente; contratos `Message`, `Run` e `Delegation` permanecem compatíveis.

- [x] Escrever teste em que uma delegação pede escrita e o usuário consegue abrir a conversa privada, ver o cartão e decidir pela interface. Conferir também o diff do mesmo run.
- [x] Acrescentar fixture antiga com `resultMessage.runId === null`; após reparar, exigir `message.runId === delegation.childRunId`, mesma conversa e mesmo destinatário. Exigir zero alterações na segunda execução do reparo e preservação de mensagens sem associação comprovada.
- [x] Executar os testes e confirmar a falha antes da correção: `npx vitest run src/renderer/src/test/v9-delegation.test.ts src/main/v9/schema-migration.test.ts src/renderer/src/features/app/delegation-evidence.test.tsx`.
- [x] Definir `resultMessage.runId = child.id` na transação de criação. Reparar registros antigos somente quando `delegation.resultMessageId`, `run.messageId`, destinatário e conversa concordarem. Fazer backup consistente antes de reparar pela primeira vez uma base que precise de alteração; não criar runs ou aprovações novos.
- [x] Executar novamente; comprovar que reiniciar interrompe aprovações sem execução ativa e que o reparo não as reapresenta como executáveis. Revisar o diff e registrar a entrega.

### Tarefa 2: Atualizar somente o estado de Git do workspace

**Achado:** 1. **Dependências:** nenhuma.

**Arquivos:** modificar `src/main/v9/{workspace.ts,store.ts}`; testar `src/main/v9/git-status-polling.test.ts`.

**Interface:** `WorkspaceStore.updateWorkspaceGitStatus(id: string, info: { branch: string | null; changes: number }): Workspace | undefined`; retornar `undefined` se o registro foi excluído ou arquivado durante a leitura.

- [x] Escrever regressão com uma barreira no `inspect`: iniciar polling, editar instruções/permissões, liberar o Git e exigir que a edição permaneça.
- [x] Cobrir arquivamento e exclusão durante o `inspect`; não ressuscitar registro nem desfazer arquivamento.
- [x] Executar `npx vitest run src/main/v9/git-status-polling.test.ts` e confirmar as falhas pertinentes.
- [x] Reler o workspace depois do await e persistir apenas `branch`/`changes` sobre a versão atual, pelo método acima. Não gravar o objeto capturado antes do Git.
- [x] Reexecutar, revisar o diff e registrar a entrega. Aceite: somente os dois campos de Git mudam.

### Tarefa 3: Proteger escrita aprovada e comparar o arquivo completo

**Achados:** 2 e 10. **Dependências:** nenhuma.

**Arquivos:** criar `src/main/v9/guarded-write.ts` e seu teste; modificar `src/main/v9/{workspace.ts,project-files.ts}`; ampliar `src/main/v9/project-files.test.ts`.

**Interfaces novas, internas:**

```ts
type FileVersion = { exists: boolean; sha256: string | null }
declare function captureFileVersion(root: string, relativePath: string): Promise<FileVersion>
declare function commitFileWrite(input: {
  root: string; relativePath: string; content: Buffer
  expectedVersion: FileVersion; signal?: AbortSignal
}): Promise<{ sha256: string; changed: boolean }>
```

- [x] Escrever testes para edição humana durante aprovação, arquivo criado/removido nesse intervalo, duas propostas do app com a mesma versão e cancelamento antes de escrever. Exigir conflito sem sobrescrita quando a versão divergir.
- [x] Reproduzir o arquivo de 200.004 bytes e a proposta de 200.000 bytes iguais ao prefixo; exigir alteração real e remoção do sufixo. Cobrir UTF-8, binário e arquivo inexistente.
- [x] Executar `npx vitest run src/main/v9/guarded-write.test.ts src/main/v9/project-files.test.ts` e confirmar os defeitos.
- [x] Compartilhar validação de caminho, hash completo, serialização por arquivo dentro do app, escrita temporária na mesma pasta e substituição atômica. Revalidar após a aprovação e antes da substituição; preservar modo do arquivo e limpar somente temporários próprios. Truncar apenas a prévia, nunca a comparação.
- [x] Manter `writeProjectText` e IPC compatíveis, adaptando `expectedHash` para `FileVersion`. Respeitar limites existentes de cada caller: editor até 1 MiB e conteúdo da ferramenta até 1.000.000 caracteres. Não criar diretórios nem escrever após sinal cancelado. Não prometer compare-and-swap universal contra escritores externos: o mutex cobre o app, e hashes detectam conflitos observados nas revalidações.
- [ ] Reexecutar os testes e o cenário de aprovação na UI; exigir que conflito peça recarregar/revisar a proposta. Revisar o diff e registrar a entrega.

### Tarefa 4: Garantir término único do turno Claude

**Achado:** 6. **Dependências:** nenhuma.

**Arquivos:** modificar `src/main/v9/claude.ts`; criar `src/main/v9/claude-lifecycle.test.ts`; ampliar `src/main/v9/audit-reliability.test.ts`.

**Contrato:** cada turno iniciado emite exatamente um `turn/completed`, com estado terminal; EOF sem `result` após `init` é falha, não sucesso nem espera infinita.

- [x] Testar `init → EOF`, `init → result → EOF`, erro antes de `init`, erro depois de texto e interrupção durante chamada de ferramenta. Contar um único evento terminal por turno.
- [x] Executar `npx vitest run src/main/v9/claude-lifecycle.test.ts src/main/v9/audit-reliability.test.ts` e confirmar a regressão específica.
- [x] Centralizar a finalização idempotente do adaptador, fechar a query, limpar o timer de inicialização e resolver/recusar esperas de ferramenta pertencentes ao turno encerrado. Não encerrar consultas de outros turnos.
- [x] Exigir que `AppService.send` termine, o run falhe e a próxima tarefa da mesma pasta execute. Não reenviar o turno que já produziu texto/ferramenta. Reexecutar, revisar e registrar a entrega.

## Fase 2 — Sessões confiáveis

### Tarefa 5: Distinguir retomada real de sessão vazia

**Achado:** 4. **Dependências:** tarefa 4 para o ciclo Claude.

**Arquivos:** modificar `src/main/v9/{agent-runtime.ts,codex.ts,claude.ts,pi.ts,headless-cli.ts,workspace.ts,store.ts}` e mocks/callers de `thread`; criar `src/main/v9/session-continuity.test.ts`; ampliar `schema-migration.test.ts` e `headless-cli.test.ts`.

**Contrato interno novo:**

```ts
type RuntimeThread = {
  id: string
  history: 'retained' | 'empty' | 'resume-pending'
}
// AgentRuntime.thread mantém os argumentos atuais e retorna Promise<RuntimeThread>.
// A confirmação de send pode resolver resume-pending; não é prova por ID salvo.
```

**Persistência:** evolução planejada do schema 7 para 8. Acrescentar metadata à tabela de sessões, mantendo `key` e `thread_id`; usar colunas explícitas nos inserts. Metadata terá runtime, versão do contrato de contexto e mapa limitado de digests das mensagens efetivamente entregues.

```ts
type SessionBinding = {
  key: string; threadId: string; runtime: Agent['runtime']
  contextVersion: number; deliveredDigests: Record<string, string>
}
// Métodos de WorkspaceStore:
// sessionBinding(key: string): SessionBinding | undefined
// putSessionBinding(value: SessionBinding): void
// deleteSessionBinding(key: string): void
```

- [x] Escrever testes de sessão nova, retomada válida e reinício do adaptador. Headless após restart deve informar `empty`, mesmo com ID salvo; uma sessão em memória com histórico conservado deve informar `retained`.
- [x] Testar migração de schema 7 e bases anteriores: backup, dados preservados, passo 7→8 executado uma vez e leitura compatível de bindings legados. Não rerodar migração de workspaces para um banco já no schema 7.
- [x] Executar `npx vitest run src/main/v9/session-continuity.test.ts src/main/v9/headless-cli.test.ts src/main/v9/schema-migration.test.ts` e confirmar as falhas.
- [x] Atualizar os cinco adaptadores e todos os callers/mocks de `thread`. Codex informa `retained` só após `thread/resume` aceito; Headless verifica seu mapa real; Pi valida a sessão persistida; Claude usa `resume-pending` enquanto o SDK não confirma a abertura. Sessão nova informa `empty`.
- [x] Implementar migrações incrementais: workspace legado somente abaixo de 7, depois passos 7→8 e futuros passos em ordem. Binding antigo sem metadata não será considerado prova de contexto entregue: renovar uma vez com replay limitado, sem apagar o transcript.
- [x] Executar os testes e `npm run typecheck`; histórico reconstruído após reinício headless e sem mistura de runtime nos testes dirigidos. Revisar e registrar a entrega.

### Tarefa 6: Entregar contexto externo e recuperar binding inexistente com segurança

**Achados:** 3 e 5. **Dependências:** tarefa 5.

**Arquivos:** criar `src/main/v9/conversation-context.ts` e seu teste; modificar `src/main/v9/{workspace.ts,store.ts,codex.ts,claude.ts}`; ampliar `session-continuity.test.ts` e `steering.test.ts`.

**Contratos:** `SessionUnavailableError` distingue retomada inexistente antes de execução de erros ambíguos. `buildTurnContext` recebe histórico ordenado, checkpoint, mensagem atual e digests entregues; retorna texto e os digests desse snapshot, limitados a 40 entradas. O digest inclui ID, autor/papel, texto e status; cursor/ID sozinho não detecta texto atualizado.

```ts
type TurnContext = { text: string; deliveredDigests: Record<string, string> }
declare function buildTurnContext(input: {
  history: Message[]; checkpoint?: ContextCheckpoint
  currentInput: string; inputMessageId?: string; responseMessageId: string
  agentId: string; session: RuntimeThread
  deliveredDigests: Record<string, string>
  delegatedRequestIds?: string[]
}): TurnContext
// SessionUnavailableError é emitido apenas pelo adaptador quando a tentativa
// de retomar foi recusada antes de qualquer execução; não por timeout genérico.
```

- [x] Reproduzir “Chief já iniciou → colega publica diagnóstico → usuário diz encaminha”; exigir que a entrada entregue ao Chief contenha o diagnóstico e o pedido atual, sem depender de outra pergunta ao usuário.
- [x] Testar turno nativo comum sem contexto externo: receber somente o pedido atual. Testar atualizações de texto em mensagem existente, steering entregue e mensagem que chega durante o await de abertura; a mensagem ainda não entregue não pode ser marcada como vista.
- [x] Testar binding inexistente antes do envio: uma abertura nova e um único turno. Testar timeout ambíguo, primeiro token já emitido e ferramenta já iniciada: nenhuma repetição automática.
- [x] Executar `npx vitest run src/main/v9/conversation-context.test.ts src/main/v9/session-continuity.test.ts src/main/v9/steering.test.ts`.
- [x] Extrair o replay atual para o módulo: sessão vazia recebe checkpoint e histórico limitado; sessão retida recebe só atualizações externas ainda não vistas, além do pedido atual. Manter UTF-8 válido, marcadores dentro do orçamento de 24.000 bytes e exclusão da mensagem atual/placeholder.
- [x] Atualizar metadata só para o snapshot entregue com confirmação, mais a resposta própria gerada; não calcular “visto” sobre mensagens externas que chegaram depois. Invalidar binding inexistente e tentar uma sessão nova uma vez, somente no erro seguro definido acima.
- [x] Reexecutar e validar duas conversas/agentes/pastas simultâneos, sem contexto cruzado. Revisar e registrar a entrega.

### Tarefa 7: Versionar o contrato completo das ferramentas

**Achado:** 11. **Dependências:** tarefas 5–6.

**Arquivos:** criar `src/main/v9/tool-contract.ts` e seu teste; modificar `workspace.ts`; ampliar `session-continuity.test.ts`.

**Interface:** `fingerprintTools(tools: DynamicTool[], brokerVersion: number): string`; serialização canônica dos nomes, descrições e schemas, independente da ordem de chaves e da lista de ferramentas.

- [x] Testar que mudar descrição/schema/versionamento do broker altera a chave; somente reordenar ferramentas/chaves não altera. Mudança de permissões efetivas ou runtime também deve separar bindings.
- [x] Executar `npx vitest run src/main/v9/tool-contract.test.ts src/main/v9/session-continuity.test.ts` e confirmar a falha do hash atual.
- [x] Substituir o hash só de nomes. Incluir no binding runtime, contexto/pasta canônica, revisões atuais e fingerprint completo. Renovação por contrato usa o replay da tarefa 6 e não altera permissões.
- [x] Reexecutar; exigir que uma thread Codex antiga não continue com o schema anterior. Revisar e registrar a entrega.

## Fase 3 — Colaboração com continuidade

### Tarefa 8: Usar a mesma regra de elegibilidade ao listar e delegar

**Achado:** 8. **Dependências:** nenhuma funcional; integrar depois da fase 2.

**Arquivos:** criar `src/main/v9/delegation-eligibility.ts`; modificar `workspace.ts`; ampliar `chief-tools.test.ts` e `src/renderer/src/test/v9-delegation.test.ts`.

**Interface interna:** `delegationEligibility(context, candidate): { canDelegate: boolean; reason?: string }`. `group_members` acrescenta `canDelegate`/`reason`, mantendo campos atuais e a disponibilidade separada.

- [x] Testar agente elegível, agente fora da equipe, temporário de outro workspace, aposentado, ocupado, self-call e ciclo. O mesmo candidato deve ter a mesma decisão na lista e em `ask_agent`.
- [x] Executar `npx vitest run src/main/v9/chief-tools.test.ts src/renderer/src/test/v9-delegation.test.ts` e confirmar a divergência atual.
- [x] Compartilhar o resolver entre listagem e execução. O Chief continua enxergando o catálogo, mas deve saber quais agentes exigem inclusão aprovada na equipe. Não autorizar o catálogo inteiro implicitamente.
- [x] Cobrir alteração da equipe enquanto a aprovação está aberta; revalidar destinatário e permissões antes de executar. Reexecutar, revisar e registrar a entrega.

### Tarefa 9: Persistir evidência dos comandos vinculada à execução

**Parte do achado:** 13. **Dependências:** tarefas 1 e 3.

**Arquivos:** criar `src/main/v9/command-evidence.ts` e seu teste; modificar `src/main/v9/{workspace.ts,store.ts}` e `src/shared/v9.ts`; ampliar `schema-migration.test.ts`.

**Contratos:** `CommandResult` separa `output`, `exitCode`, `status` e `truncated`. `CommandEvidence` associa resultado a `runId`, `toolCallId`, agente, conversa, workspace, comando, cwd e datas. Store oferece `putCommandEvidence(value)` idempotente por run/call e `commandEvidenceForRun(runId)`.

```ts
type CommandResult = {
  output: string; exitCode: number | null
  status: 'completed' | 'failed' | 'interrupted' | 'timed_out'
  truncated: boolean
}
type CommandEvidence = CommandResult & {
  id: string; runId: string; toolCallId: string; agentId: string
  conversationId: string; workspaceId: string; command: string; cwd: string
  createdAt: string; finishedAt: string
}
// putCommandEvidence(value: CommandEvidence): void
// commandEvidenceForRun(runId: string): CommandEvidence[]
```

**Persistência:** schema 8→9, tabela `v9_command_evidence` com ID, run, tool call, conversa, dados e unicidade `(run_id, tool_call_id)`. Integrar exclusão de conversa e migração direta 7→9; não colocar stdout bruto no snapshot global.

- [x] Testar saída/código 0, código não zero, timeout, cancelamento, falha ao iniciar e truncamento. Saída persistida deve estar disponível depois de reabrir o store; não duplicar ao repetir o mesmo call ID.
- [x] Executar `npx vitest run src/main/v9/command-evidence.test.ts src/main/v9/schema-migration.test.ts` e confirmar ausência da capacidade atual.
- [x] Fazer o executor retornar resultado estruturado; persistir antes de devolver ao agente. Preservar o texto de saída/código para os callers existentes, acrescentando o ID da evidência. Limitar output a 32.000 bytes UTF-8, indicar truncamento e não copiar ambiente/credenciais para evidência.
- [x] Testar limpeza por conversa e falha parcial de persistência: não afirmar que evidência foi salva se não foi. Reexecutar, revisar e registrar a entrega.

### Tarefa 10: Continuar uma delegação identificada e consultar seu resultado

**Achado:** 13. **Dependências:** tarefas 1, 6, 8 e 9.

**Arquivos:** modificar `src/main/v9/{workspace.ts,store.ts,agent-prompt.ts}`, `src/shared/v9.ts`; ampliar `src/renderer/src/test/v9-delegation.test.ts`, `queue-delegation.test.ts` e `src/main/hosts/workspace.live.test.ts`.

**Contratos:** acrescentar `delegation_id?: string` ao schema de `ask_agent`; sem ele, criar uma tarefa independente como hoje. Com ele, validar autorização e reutilizar a conversa privada da delegação identificada. Cada complemento terá run/delegation próprios e `previousDelegationId`, mantendo recibos antigos. Ferramenta `delegation_result({ delegation_id })` retorna resultado e evidências autorizadas. Recibos informam o ID que deve ser usado para complementos.

- [x] Testar tarefa inicial que executa comando e complemento pedindo stdout/código exatos sem reexecutar o comando. Exigir mesma conversa privada, nova execução vinculada à anterior e evidência preservada.
- [x] Testar dois pedidos independentes ao mesmo especialista: continuar separados quando não houver `delegation_id`. Negar ID de outra origem/workspace/destinatário; não elevar permissão se pasta/equipe mudou.
- [ ] Executar `npx vitest run src/renderer/src/test/v9-delegation.test.ts src/main/v9/queue-delegation.test.ts` e confirmar a falha atual de continuidade.
- [x] Reutilizar fila, leases, limite de profundidade/ciclo, idempotência por call e aprovação existente. Complemento do Chief continua exigindo aprovação. Temporário aposentado pode ter resultado consultado, mas executar novamente exige elegibilidade/proposta aprovada; não reativar implicitamente.
- [x] Ao criar run delegado/complementar, preencher também `inputMessageId` com o ID do pedido correspondente. No replay de sessão nova, incluir pedidos anteriores identificados por `Delegation.requestMessageId`, mesmo que tenham papel `activity`; passar somente esses IDs autorizados em `delegatedRequestIds`. Excluir o pedido atual para não duplicá-lo e não converter atividades genéricas em instruções. Testar reinício entre tarefa inicial e complemento, preservando objetivo e evidência.
- [x] Restringir `delegation_result` ao solicitante autorizado ou destinatário da cadeia identificada, no mesmo workspace. Atualizar instruções para pedir resultado/evidência antes de reenviar trabalho.
- [x] Testar cancelamento em wait/background, resultado após origem excluída e uma única continuação automática por resultado. Reexecutar, revisar e registrar a entrega.

## Fase 4 — Histórico e leitura

### Tarefa 11: Reconciliar mensagens depois de reconectar

**Achado:** 7. **Dependências:** tarefa 1; coordenação com tarefa 12.

**Arquivos:** modificar `src/main/hosts/manager.ts`, `src/shared/v9.ts`, `src/renderer/src/features/app/AppShell.tsx` e `features/chat/useConversationHistory.ts`; ampliar `hosts/manager.test.ts` e `useConversationHistory.test.tsx`.

**Contratos:** `WorkspaceEvent` aceita `{ type: 'changed'; reason?: 'connection-restored' }`; manter o canal e protocolo existentes. Hook oferece `reconcileAfterReconnect(): Promise<void>`, protegido por host/conversa/generation.

- [ ] Testar mensagem concluída durante queda, texto atualizado em mensagem existente, evento ao vivo durante fetch e troca de host/conversa durante reconciliação. Exigir deduplicação por ID e preservação do evento mais recente. **Parcial:** evento ao vivo, deduplicação, troca de conversa e marcador real de reconexão cobertos; troca de host e atualização concorrente no armazenamento ainda aguardam Electron.
- [x] Testar mais de 100 mensagens perdidas: buscar páginas até encontrar sobreposição ou atingir 600; não criar lacuna silenciosa entre fragmentos. Ao ultrapassar a janela, conservar os 600 mais recentes com paginação anterior disponível. Coberto com 250 e 800 mensagens offline.
- [x] Executar `npx vitest run src/main/hosts/manager.test.ts src/renderer/src/features/chat/useConversationHistory.test.tsx`; os testes focados passam. A confirmação prévia do defeito na versão original não foi coletada.
- [x] Emitir o motivo depois de autenticar/reconectar e reconciliar sem reenviar `send`. Se o usuário estiver no histórico antigo/busca, preservar essa janela e foco, atualizar IDs sobrepostos e sinalizar mensagens recentes; o retorno ao presente carrega a janela recente. Não puxar a leitura para o fim. Busca histórica e recuperação recente preservam sua janela/foco; o canal só reconcilia por leitura.
- [x] Reexecutar com dois processos Electron e a mensagem offline; exigir mensagem recuperada no modo recente e nenhuma operação repetida. `npm run test:hosts:electron` passou com dois processos Electron locais; mensagem recuperada uma vez e contagem SQL permaneceu 1. Dois PCs físicos continuam pendentes.

### Tarefa 12: Manter uma única autoridade de ancoragem

**Achado:** 14. **Dependências:** nenhuma; testar junto da tarefa 11.

**Arquivos:** modificar `src/renderer/src/features/chat/MessageList.tsx`; ampliar `MessageList.test.tsx` e `MessageList.performance.test.tsx`; criar teste Electron na tarefa 16.

**Contrato:** scroller com `overflow-anchor: none`; mensagem de referência identificada por ID e deslocamento. Reconciliar antes da pintura após medição; scroll humano tem precedência sobre âncora pendente.

- [ ] Testar crescimento acima/abaixo da referência, prepend, resize, streaming e remoção de mensagem antiga por limite de janela. Atualizar medidas pelo `ResizeObserver`, sem simular apenas offsets estáticos.
- [x] Executar `npx vitest run src/renderer/src/features/chat/MessageList.test.tsx src/renderer/src/features/chat/MessageList.performance.test.tsx`; 8 testes passam. A reprodução Electron existente ainda é necessária como oráculo adicional.
- [x] Desativar a ancoragem nativa no scroller; adaptar o contrato do Paseo ao virtualizador atual, preservando a referência durante medições e o modo seguir-final somente quando o usuário estiver no final.
- [ ] No Electron, exigir a mesma mensagem montada e deslocamento vertical de no máximo 4 px após crescimento acima e resize. O script mediu delta 0 px nos dois casos. Novas mensagens não roubarem a leitura e “ir para o fim” ainda precisam de aceite adicional.

## Fase 5 — Ciclo dos recursos

### Tarefa 13: Cancelar conexões de voz ainda em abertura

**Achado:** 9. **Dependências:** nenhuma.

**Arquivos:** modificar `src/main/v9/realtime/service.ts`; ampliar `realtime/realtime.test.ts` e `src/renderer/src/features/voice/VoiceCall.test.tsx`.

**Contrato:** geração de abertura invalidada por `stop`/nova chamada; cada abertura só publica sessão/eventos se ainda for a geração atual.

- [ ] Testar iniciar→parar→abertura resolve; A inicia→B inicia→A resolve tarde; falha tardia de A com B ativa; troca de host e desmontagem durante abertura. **Parcial:** parar, A→B tardia e desmontagem cobertos; falha tardia e troca de host ainda sem cenário de integração.
- [x] Executar `npx vitest run src/main/v9/realtime/realtime.test.ts src/renderer/src/features/voice/VoiceCall.test.tsx`: 20 testes passaram; a regressão da sessão tardia foi vista falhar antes da correção.
- [x] Invalidar a geração mesmo com `session === null`; fechar sessão atrasada e não emitir sua fala/erro para outra chamada. Limpar `starting` somente se ainda for a promessa correspondente.
- [x] Reexecutar; cancelar impede sessão tardia e A atrasada não fecha B. Revisão registrada; microfone real é aceite separado da tarefa 16.

### Tarefa 14: Descartar navegadores ao excluir seus proprietários

**Achado:** 12. **Dependências:** nenhuma.

**Arquivos:** modificar `src/main/v9/{browser.ts,workspace.ts}`; ampliar `browser-concurrency.test.ts` e `src/renderer/src/test/v9-workspaces.test.ts`.

**Interfaces:** `BrowserService.disposeConversation(id: string): Promise<void>` e `disposeAgent(id: string): Promise<void>`, ambas idempotentes. Abertura pendente cancelada não pode registrar sessão/frame depois do descarte.

- [x] Escrever regressão de exclusão com sessão aberta e com `newContext` pendente. Exigir contexto fechado e ausência de sessão/frame tardios; outro agente/conversa deve continuar utilizável.
- [ ] Executar `npx vitest run src/main/v9/browser-concurrency.test.ts src/renderer/src/test/v9-workspaces.test.ts` e confirmar a falta de descarte atual. Os novos casos e a cascata de exclusão passam isoladamente; a suíte completa ainda falha no `rmSync` do worktree no Windows (EPERM), encaminhado à tarefa 15.
- [x] Invalidar aberturas do proprietário, fechar recursos e remover frames. Chamar os métodos após interromper runs e antes de excluir registros; workspace inclui suas conversas descendentes. `close()` global continua idempotente.
- [ ] Reexecutar o conjunto completo após a correção de cleanup na tarefa 15; exigir recursos removidos sem crescimento permanente de tombstones/maps de cancelamento.

## Fase 6 — Aceite e entrega

### Tarefa 15: Tornar a cobertura confiável sem esconder falhas

**Dependências:** tarefas 1–14 para o fechamento; investigação de baseline pode começar antes.

**Arquivos:** `src/renderer/src/features/sidebar/Sidebar.test.tsx`, `src/main/v9/audit-reliability.test.ts`, `git-workspaces.test.ts`, `src/renderer/src/test/v9-workspaces.test.ts` e `docs/quality.md` na raiz do repositório.

- [x] Atualizar o teste do Sidebar para o modal: cancelar conserva, confirmar exclui, nenhum `window.confirm` e composer continua editável.
- [x] Investigar os dois timeouts Git com tempos por subprocesso/etapa e fixtures pequenas. No teste de cancelamento Windows, colocar abort/cleanup em `finally` mesmo se o marcador inicial não aparecer. Não aumentar timeout ou remover asserção como solução isolada.
- [x] Executar os arquivos afetados com um worker; testes de worktree e concorrência passaram abaixo de 30 s, incluindo recusa de remover worktree sujo e isolamento.
- [x] Executar verificações e registrar resultados em `docs/quality.md`: `quality:rules`, `lint:typed`, `typecheck`, `npm test` e `build` passaram; `lint` falhou com 168 erros/45 avisos. `verify` não foi considerado aprovado.
- [x] Atualizar `docs/quality.md` com evidência nova e limites; a suíte completa pós-ajustes passou com 433 testes, 18 ignorados e nenhuma falha.

### Tarefa 16: Promover as reproduções a aceites duráveis e validar a entrega

**Dependências:** tarefas 1–15.

**Arquivos:** criar `scripts/verify-agent-stability-electron.cjs`; modificar `scripts/verify-hosts-electron.cjs` e `src/main/hosts/workspace.live.test.ts`; atualizar `PRODUCT.md` e seção 7 de `ESTRATEGIA_POLITRON.md` somente com os resultados efetivamente obtidos.

- [ ] Converter as reproduções temporárias em fixtures duráveis: histórico/resize, recuperação após queda, exclusões/composer e aprovação/diff da tarefa delegada. Perfis em TEMP com `BOOBOT_E2E_USER_DATA_DIR`; artefatos fora do Git; fechar somente processos iniciados pelo teste.
- [x] Ajustar a integração de Codex para resultado e vínculos da cadeia: duas raízes, coordenador/implementador esperados, nenhum run órfão/ciclo, idempotência, evidências consultáveis e arquivos corretos. Limite explícito de oito filhos; teste Codex real `gpt-6-luna` passou.
- [ ] Fixar o modelo solicitado pela fixture usando `BOOBOT_LIVE_TOOL_MODEL` também no teste de host, recusando ID indisponível sem fallback silencioso. Registrar modelo real e resultado; a flag é capacidade a acrescentar nessa fixture, não comportamento já existente do teste de host.
- [ ] Após build, executar `node scripts/verify-agent-stability-electron.cjs` e `npm run test:hosts:electron`. Exigir aprovações humanas pela UI em ao menos uma delegação; autoaprovação por listener não comprova a presença do cartão.
- [x] Executar Codex real em duas pastas descartáveis com aprovação: `workspace.live.test.ts` passou com `gpt-6-luna`, duas raízes, arquivos/evidências e complemento. A aprovação observada foi pelo listener de testes; não equivale ao aceite manual do cartão na UI.
- [ ] Validar retomada de Claude e os demais provedores que forem anunciados como executáveis. Catálogo visível não é prova de execução. Registrar indisponibilidade/autenticação por motor sem inventar sucesso ou ampliar permissões.
- [ ] Quando o notebook estiver disponível, validar entre dois PCs físicos: mensagem, delegação aprovada, diff, interrupção, queda/reconexão e ausência de dados cruzados. Validar voz com microfone separadamente. A indisponibilidade atual não bloqueia as correções locais, mas mantém esses aceites pendentes.
- [ ] Gerar candidato de instalador somente após os aceites locais, sem sobrescrever diretório travado por Electron. Instalar em perfil de teste e validar migração/reinício antes de oferecer atualização. Publicar release/download somente quando solicitado; build local não equivale a instalador distribuído corrigido.
- [ ] Publicar registro de aceite com cada ID 1–15, teste que o cobre, resultado e limite pendente. Nunca marcar uma tarefa concluída apenas por typecheck, build ou alteração de prompt.

## Critério final de conclusão

- [ ] Os 15 IDs têm correção revisada e regressão que verifica o comportamento.
- [ ] Aprovações/diffs novos e recuperáveis antigos aparecem na conversa correta.
- [ ] Nenhuma regressão de sobrescrita observada durante aprovação ou polling.
- [ ] Sessão perdida, reinício e atualização externa preservam contexto sem duplicar ações.
- [ ] Chief recebe contexto suficiente, só delega no escopo autorizado e consegue pedir complemento com evidência.
- [ ] Reconexão recupera mensagens e histórico permanece estável durante leitura/resize.
- [ ] Cancelamento/exclusão encerra os recursos correspondentes.
- [ ] Resultado de todos os checks é explícito; pendências físicas/microfone/provedor/instalador permanecem identificadas até teste real.

## Revisão do plano

Cobertura conferida: todos os IDs 1–15 aparecem na matriz e em tarefas com arquivos e critérios de aceite. Os contratos entre sessão, replay, evidência e delegação foram definidos antes de suas dependências. Nenhuma implementação ou publicação faz parte da criação deste plano.
