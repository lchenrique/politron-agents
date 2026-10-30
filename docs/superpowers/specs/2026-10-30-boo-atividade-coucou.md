# Boo ao vivo: atividade real e estudo do Coucou

Data: 30/10/2026. Referência consultada: `Louis-CFM/coucou`, branch `main`, por leitura do código público. O Coucou não foi executado neste computador.

## Direção escolhida

O usuário escolheu um painel ao lado do chat, ligado à mesma conversa. O Boo mantém a arte vetorial aprovada. A primeira integração evolui a aba **Mascote** do dock existente, sem criar outra sessão de agente, motor de inferência ou banco.

## O que produz o dinamismo no Coucou

| Mecanismo observado | Evidência no repositório | Aplicação no Politron |
| --- | --- | --- |
| Eventos da sessão atualizam um estado por agente e acrescentam passos | [hooks.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/island/hooks.ts#L339), [state.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/core/state.ts#L341) | Derivar a presença do run e da chamada de ferramenta atuais, por agente e conversa |
| Etapas compactas acompanham o trabalho e abrem alterações | [ticker.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/views/ticker.ts), [diff.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/views/diff.ts) | Reutilizar ToolCallTree e o editor existente para a prévia e a ação de abrir arquivo |
| Aprovações abrem uma superfície prioritária, vinculada à sessão | [hooks.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/island/hooks.ts#L491) | Interromper o gesto de edição e mostrar que o agente aguarda aprovação; responder pelo fluxo já existente do chat |
| Interrupção, falha e conclusão seguem caminhos distintos | [hooks.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/island/hooks.ts#L419) | Não celebrar falha ou interrupção nem continuar digitando após o turno acabar |
| A superfície abre/fecha independentemente do estado do personagem | [fsm.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/island/fsm.ts) | Manter dock/layout separados da atividade do Boo; expansão automática é uma evolução possível |
| O renderer interpreta estados sem comandar o agente | [engine.ts](https://github.com/Louis-CFM/coucou/blob/main/windows/src/mochi/engine.ts#L94), [BotCanvasView.swift](https://github.com/Louis-CFM/coucou/blob/main/NotchBuddy/Sources/App/BotCanvasView.swift) | Preservar SVG/CSS e alimentar suas expressões pelos eventos da execução |

A faixa do topo do Coucou é uma superfície de acompanhamento que se expande para cartões e ações. A parte aproveitável é a organização entre estado, personagem e evidência do trabalho. Não é necessário reproduzir o personagem, os acessórios ou a apresentação de notch.

O código do Coucou é apresentado como MIT, enquanto personagem, animações como personagem, marca e demais assets têm termos próprios em [LICENSE-ASSETS.md](https://github.com/Louis-CFM/coucou/blob/main/LICENSE-ASSETS.md). Esta integração não incorpora código, desenhos, sons ou animações do Mochi; aplica os padrões de interação ao Boo original e aos componentes do Politron.

## Problemas encontrados e correções

1. `working` virava `coding` sem evidência de edição. Agora trabalho genérico usa a expressão de processamento; digitar exige atividade de edição em execução.
2. O cabeçalho e a aba do chat não recebiam a presença individual. Agora recebem o estado derivado de cada participante na conversa selecionada.
3. O gesto podia depender de hover mesmo durante uma edição. O trabalho observado anima o avatar com tamanho adequado; os avatares pequenos configurados como estáticos continuam sem observador ou laço.
4. A chamada de voz exibia o avatar ocioso e não distinguia síntese de reprodução. Agora há preparação separada e a boca só muda após o callback de início do player; pausar ignora início tardio. Respostas de outro agente são ignoradas.
5. O flutuante selecionava um run do agente sem filtrar a conversa. Agora usa o mesmo seletor, carrega o histórico recente e recebe as atualizações das mensagens de atividade.

O contrato real do backend exige cuidado: a mensagem de atividade pode ter `status: completed` enquanto sua chamada contém `tool.status: running`. O seletor prioriza `tool.status`, respeita `finishedAt` e exige um run ativo compatível. Há regressão para esse formato, sem depender de texto inventado pela apresentação.

## Primeira integração do painel

`BooWorkPanel.tsx` substitui a vista anterior do mascote em `DockWorkspace.tsx` e recebe runs e mensagens já carregados pela conversa. Oferece:

- Boo com atividade atual e descrição proveniente do registro de ferramenta;
- prévia da ferramenta por ToolCallTree, com estados de execução, resultado e erro;
- abertura do arquivo no editor existente quando há caminho e leitura permitida;
- campo de texto enviado explicitamente ao agente selecionado na mesma conversa;
- retorno ao chat e controles de áudio existentes;
- envio indisponível quando o shell não concede a ação.

Não há código decorativo sendo digitado como se fosse trabalho real. A prévia depende do que o motor publicou; leituras ainda sem resultado não mostram conteúdo inventado. Nenhuma nova leitura automática de arquivos foi introduzida pelo painel.

## Complexidade e evoluções

A primeira camada cabe na stack atual: React, dock, SVG e eventos de IPC. Não demanda Tauri, PixiJS, WebGL ou novo serviço externo. Uma experiência mais cenográfica pode acrescentar transições originais entre arquivo, terminal e página, sempre apoiadas nas mesmas evidências.

Evoluções ainda não implementadas: destaque automático do diff específico, abrir editor/navegador automaticamente com preferência do usuário, conclusão com gesto breve por evento e cartão de aprovação dentro do painel. Aprovação e interrupção do trabalho continuam disponíveis no chat existente. Leitura, busca e terminal ainda compartilham a expressão de processamento; o texto e a prévia distinguem a atividade real.

## Verificação e limites

A galeria de desenvolvimento `/boo-work-gallery` demonstra o componente com eventos explicitamente simulados. Ela não executa motor, grava arquivo nem inicia áudio. Evidências em `boo-ref/boo-work-panel-desktop.png`, `boo-work-panel-narrow.png` e `boo-work-browser-check.json`.

O navegador verificou seis transições de estado, ausência de erros de JavaScript, largura de 420 px sem transbordamento horizontal e movimento reduzido. A validação de uma tarefa com inferência e de uma ligação com microfone/alto-falante reais não foi realizada nesta rodada. Nenhuma credencial ou serviço externo foi configurado e nenhum instalador foi gerado.


Validação final desta evolução: 158 testes em 21 arquivos, typecheck e build Electron/preload/renderer/PWA aprovados. O rosto de processamento foi suavizado após feedback do usuário, mantendo o sorriso original e um olhar atento sem a sobrancelha de foco anterior. O editor de aparência usa React Color, cinco detalhes opcionais (Brotinho, Estrelinha, Coroa de rei, Auréola e Gorro de Natal) e consultas de contêiner, testado entre 280 e 840 px. Reinício concluído após o usuário confirmar que salvou a edição: `npm run dev` gerou a PWA, recompilou main e preload, abriu o Electron e exibiu novamente a Central do Atlas. A porta `http://localhost:5173` está ativa, o perfil `%APPDATA%\politron-desktop` foi preservado e o bundle carregado contém os IDs `boo-sprout`, `boo-star`, `boo-king-crown`, `boo-halo` e `boo-noel`. O novo painel de opções foi capturado em `docs/superpowers/specs/boo-ref/boo-studio-crown-halo.png`.
