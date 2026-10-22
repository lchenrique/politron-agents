# Politron / Boobot — interface de chat e aprovações

## Componentes usados

- **Kokonut UI AI Model Selector** (v1.0.0, licença MIT): instalado pelo registro e adaptado ao catálogo real de CLIs do Politron. Provedores, busca virtualizada, IDs completos e esforços suportados continuam vinculados ao backend. Menu de 430 px e trilha de esforço legível.
- **Kokonut UI AI Diff Review** (v1.1.0, licença MIT): o `CompletedFileReview` adapta os hunks reais via `toFileDiff` e só mostra alterações já aplicadas. Não há ações fictícias de aceitar, rejeitar ou desfazer mudanças efetuadas.
- **Pasta UI**: `PromptInput`, `ApprovalCard`, `CodeBlock` e `FileDiff` continuam em uso. O `FileDiff` permite inspecionar previamente uma proposta de escrita; inicia recolhido.

## Fluxo de revisão

Depois de uma tarefa concluída com alterações, um resumo fixo do último run com escritas confirmadas aparece logo acima do composer. Pode ser expandido para listar o diff do Kokonut, recolhido ou dispensado. O componente não aplica novas alterações e não representa um commit Git. Aprovações concluídas permanecem no histórico, porém compactadas em linhas pequenas para não duplicar o diff. Aprovações pendentes seguem acionáveis.

## Aprovações por agente

A política está no backend em `src/main/v9/approval-policy.ts`, chamada pelo serviço em `workspace.ts` e persistida individualmente por agente:

- `ask`: exige confirmação de comandos, escritas e navegador.
- `automatic`: executa escritas e ações no navegador sem confirmação; comandos de terminal continuam pedindo.
- `bypass`: permite comandos, escritas e navegador sem confirmação para **aquele agente**. Escolha explícita no editor do Boo ou nas preferências do Assistente padrão.

**Restrições mantidas**: habilitação global do terminal, `agent.canWrite`, restrições de escrita por workspace e aprovações forçadas para alterações administrativas do Chief e delegações. O terminal não tem isolamento do sistema operacional, podendo alcançar arquivos externos à pasta do workspace; essa advertência aparece na configuração. O modo do Assistente padrão não afeta os agentes cadastrados.

## Verificação

Na pasta `apps/desktop`: `npm run typecheck`, `npm run build`, testes de `approval-policy`, `CompletedFileReview`, `Composer`, `PolitronToolApproval`, `MessageList`, `delegation-evidence`, `guarded-write`, `SettingsPage` e `Editor`.

As demais etapas do plano em `docs/superpowers/plans/2026-10-21-chat-pasta-kokonut.md` ainda não estão implementadas. Não transformar elementos decorativos em progresso ou aprovação falsa.
