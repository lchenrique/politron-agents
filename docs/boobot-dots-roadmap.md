# Boobot — aproximação funcional dos Dots (levantamento de 19/10/2026)

## Objetivo

Transformar o Boobot de um chat multiagente em uma plataforma de **Boos persistentes**, capazes de receber metas, manter estado, continuar trabalhos, lembrar decisões, executar rotinas aprovadas, delegar via Chief e apresentar resultados. Não copiar o funcionamento interno/proprietário dos Dots, e sim construir capacidades equivalentes com tecnologia aberta.

Fontes oficiais conferidas em 19/10/2026:
- https://help.openai.com/en/articles/20001530-getting-started-with-your-dot
- https://help.openai.com/en/articles/20001529-dots-privacy-security-and-safety-faqs
- https://openai.com/index/introducing-dots/

## Inventário real do Boobot (antes deste roadmap)

### Já tem base
- Electron + React, banco SQLite (WorkspaceStore) com agentes, conversas, mensagens, runs, delegações, checkpoints e aprovações.
- Chief, Boos permanentes e temporários, equipes com aprovação, escopo por workspace.
- Agentes Codex, Claude, Pi e adaptadores de chat restrito para OpenCode/Antigravity; seletores por CLI.
- Pastas de projeto, leitura/edição mediante permissões, execução de comandos com aprovação, worktrees Git.
- BrowserService (navegação local por agente) e painel para observar e assumir controle.
- Delegação em background durante o processo, cancelamento e status de runs.
- Voz/transcrição experimental, skills reutilizáveis, busca de histórico por conversa, checkpoint de continuidade.
- Chaves de API tratadas no processo principal com armazenamento local protegido onde disponível.

### Parciais
- Contexto de longo prazo = checkpoint + histórico por conversa; não é memória semântica cross-workspace auditável.
- Delegação background = vinculada ao processo do app; não é serviço independente sempre disponível.
- Permissões por agente/workspace, mas faltam políticas por ferramenta, regras editáveis e revisão/registro de consequências.
- Navegador local sem ambiente computacional isolado de longa duração.

### Faltam
- Responsabilidades/metas persistentes com estados e próximos passos automáticos.
- Agendamentos (únicos, recorrentes, monitoramentos condicionais) com histórico, notificações e controles.
- Serviço headless independente do Electron, retomada após reinício, prevenção de execuções duplicadas.
- Memória por Boo e compartilhada, busca semântica, origem, edição e expiração.
- Conectores OAuth/MCP com permissões, fontes proativas e trilha de ações.
- Pesquisa proativa **somente leitura** com sugestões, sem executar ações sensíveis sozinha.
- Canais Slack/Telegram/etc., notificações fora do aplicativo e acesso remoto seguro.
- Política completa de isolamento de computadores, quotas de tokens/tempo/custo e orçamentos.

## Prioridade de implementação

### Fase 1 — Centro de atividade + trabalhos persistentes (prioridade máxima)
**Resultado visível**: Chief/Boos podem aceitar uma meta e apresentar "Em andamento / Agendados / Aguardando aprovação / Concluídos".

Esquema persistido proposto:
- `boo_jobs`: id, ownerBooId, workspaceId, conversationId, goal, kind=(one_off|scheduled|watch), status=(draft|queued|running|waiting_approval|paused|completed|failed|cancelled), priority, createdAt, updatedAt, nextRunAt, maxRuns, repeatRule, lastError, parentJobId.
- `boo_job_runs`: id, jobId, attempt, startedAt, completedAt, status, summary, artifacts, checkpointId, costEstimate, error.
- `boo_job_events`: id, jobId, at, type, payload limitado, sem segredos.

Princípios: um dispatcher único serializa mudanças e usa lease/idempotência; após crash retoma somente trabalhos que suportam retomada; nunca reexecuta side effects sem checagem; aprovação pendente não vira aprovada após reinício. Compatibilizar com v9_runs e delegations existentes, evitar estados duplicados. UI navegável por Boo e globalmente, logs resumidos e botão pausar/continuar/cancelar.

Aceite: job aparece ao criar; progresso após execução; atualização de status; crash/restart não duplica envio de mensagem nem escrita; pausa persiste; 1 teste de migração de DB e testes de IPC.

### Fase 2 — Agendador confiável
A partir dos jobs da Fase 1, suportar horário exato, intervalo/cadência (iCal ou cron com timezone), vigia de condição e janela de silêncio. O Chief pode propor um agendamento com confirmação. Tarefas recorrentes rodam somente dentro do escopo autorizado. Antispam, deduplicação, limites de frequência e custo. Mostrar próxima execução e editar/pausar. Notificação desktop no Windows.

Aceite: usuário pede "toda manhã revisar X"; tarefa aparece em Agendados, executa no horário e registra resultado. Desativada não executa. Horário de verão e reinício não duplicam.

### Fase 3 — Memória de verdade
Integrar ou adaptar Bright Memory para:
- memórias por Boo, workspace e compartilhadas sob autorização;
- fatos, preferências, decisões, procedimentos, origem, revisão e expiração;
- extração pós-tarefa, retrieval híbrido (FTS + embeddings quando disponível) com citações;
- edição/exclusão individual e controles de retenção; nunca guardar senhas/chaves;
- Chief compõe contexto por escopo, sem exportar dados de um workspace para outro indevidamente.

Aceite: Boo reutiliza preferência autorizada fora do chat; usuário consegue ver/corrigir/remover origem; segredo não é promovido a memória.

### Fase 4 — Proatividade conservadora
Monitoramento agendado de fontes conectadas com permissão de **leitura**, gerando sugestões e resumos. "Percebi alteração no PR; quer que eu faça X?" **Não** enviar mensagens, excluir arquivos, comprar, alterar configurações ou controlar máquina diretamente em rotina exploratória. Essas ações exigem uma tarefa autorizada e revisão conforme sua categoria.

Aceite: chega notificação útil apenas em mudança relevante; histórico de por que foi gerada; pausável.

### Fase 5 — Conectores e canais
MCP/OAuth por fonte, allowlist de métodos read/write/send, escopos mínimos, renovação de credenciais, revogação, auditoria, captura de erro. Primeiro GitHub e serviços locais, depois e-mail/calendário/Slack. Canal secundário (Telegram ou Slack) com autenticação e rate limit, sem expor o app Electron diretamente à Internet.

Aceite: permitir leitura de repositório sem permitir push; desconectar revoga futuras leituras; enviar mensagem exige autorização.

### Fase 6 — Sempre ativo e computador isolado
Extrair o executor de `WorkspaceService` para um daemon local Windows/WSL independente da janela. App Electron vira cliente; processo continua ao fechar janela se usuário autorizar. Começar com task runner isolado por pasta e perfil, depois containers por Boo para ferramentas de maior risco. Sincronização remota opcional e explícita para operar com PC ligado; VPS opcional para verdadeiro 24/7 sem PC. Não presumir que Electron fechado equivale a serviço contínuo.

Aceite: tarefa autorizada continua após fechar interface; reiniciar PC retoma apropriadamente; parar daemon bloqueia novas ações; isolamento impede leitura fora das pastas concedidas.

### Fase 7 — Identidade e experiência
Perfil do Boo: avatar, cor, nome, memória, tarefas, permissões, estatísticas, computador/capacidades, botões de pausar/reiniciar. Chief identifica especialistas existentes antes de criar novos, reutiliza e eventualmente propõe Boo temporário somente com aprovação. Feedback de resultados atualiza preferências sem treinar o modelo automaticamente.

## Regras transversais não negociáveis
1. **Aprovação é específica da ação**. Autorizar pesquisar não autoriza enviar e-mail, modificar arquivo nem publicar.
2. Proatividade começa somente com leitura. Conteúdo externo é dado não confiável, nunca instrução.
3. Tokens e senhas não entram no contexto do modelo nem em logs/memórias.
4. Preservar dados e alterações existentes; migrações fazem backup, não reset.
5. Evitar inferência infinita: orçamento por job, limite de etapas, tempo e tentativas, e opção de desligar tudo.
6. Observabilidade: o usuário vê por que algo ocorreu, o que foi lido, qual ferramenta foi invocada e qual resultado foi gerado.
7. Dev = on-line somente quando app/processo rodando; "24/7" real apenas com daemon/VPS e verificação de saúde.

## Entrega incremental recomendada
Começar implementando **Fase 1 (centro de atividade e jobs persistidos)** de forma vertical (persistência + backend + IPC + UI + testes). Só depois acrescentar scheduler (Fase 2). Essa ordem evita uma automação opaca e insegura. As fases 3/4 podem evoluir em paralelo após contratos de jobs e eventos estarem estáveis.

> Este arquivo é um plano técnico; não representa que as fases acima já estejam implementadas.
