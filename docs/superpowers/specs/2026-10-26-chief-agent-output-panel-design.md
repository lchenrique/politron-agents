# Design: ajustes da Central do Chief e do painel de saídas

Data: 26/10/2026  
Status: abordagem aprovada pelo usuário; aguarda revisão final da especificação antes do plano.

## Problema

A Central do Chief usa `<select>` nativo para Projeto e Responsável, destoando dos componentes do app. A aba Terminal revela automaticamente a saída das sessões de agentes, e a aba chamada “Agentes” pode ser confundida com terminal interativo.

## Decisões aprovadas

- Substituir os dois selects nativos pelo `Select` shadcn já disponível em `@/components/ui/select`.
- Manter as opções, valores, validações e ações atuais da Central do Chief.
- Renomear a aba “Agentes” do dock para “Saídas dos agentes”.
- Não revelar o dock automaticamente quando uma PTY de agente iniciar; a aba continua disponível para abertura manual.
- Manter a aba “Terminal” como terminal interativo. A saída das PTYs continua somente leitura e separada.

## Comportamento

O seletor de Projeto continua usando os mesmos workspaces válidos e atualizando a missão conforme o valor selecionado. O seletor de Responsável mantém as mesmas opções, estados desabilitados e callbacks. A troca para o componente shadcn não altera o modelo de dados nem a semântica de submissão.

Quando uma sessão de agente inicia, o evento ainda atualiza o estado da sessão e disponibiliza a saída no painel. Ele deixa de forçar a visibilidade do dock. Se o usuário já abriu o painel manualmente, essa preferência não deve ser fechada/resetada pelo evento.

## Critérios de aceitação

1. Projeto e Responsável usam os selects shadcn existentes, com seleção e valores equivalentes ao comportamento anterior.
2. A Central do Chief mantém criação/edição de missão, seleção de responsável e validações existentes.
3. A aba exibe o rótulo “Saídas dos agentes” em vez de “Agentes”.
4. Iniciar uma PTY atualiza a sessão, mas não revela automaticamente o painel.
5. O painel pode ser aberto manualmente e continua mostrando a saída read-only; o terminal interativo permanece disponível em sua própria aba.
6. Permissões de PTY, grants, IPC e isolamento de sessões não mudam.

## Validação

- Testes de componente para selecionar Projeto/Responsável e submeter os valores corretos.
- Teste do evento de início de PTY confirmando ausência de abertura automática e preservação de abertura manual.
- Testes do TerminalPanel para rótulos e alternância entre terminal interativo e saídas de agentes.
- Typecheck, lint dos arquivos tocados e regressão dos testes do dock/layout.

## Fora do escopo

Não remover o serviço de PTY, não transformar a saída read-only em terminal interativo, não alterar permissões ou comandos, não redesenhar o dock e não introduzir tema mobile separado.
