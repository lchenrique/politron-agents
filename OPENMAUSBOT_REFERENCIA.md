# Referência de colaboração: OpenMausBot

Data da análise: 16/10/2026  
Repositório de referência: <https://github.com/milind-soni/OpenMausBot>

Este documento registra o padrão de trabalho que o usuário destacou para orientar a próxima sessão do Politron V9. É uma análise de produto e fluxo; não propõe adotar OpenMausBot como base, copiar seu código ou substituir o desenho visual do Politron.

Em 16/10/2026, o usuário corrigiu o alcance desta referência: o OpenMausBot orienta também a experiência principal de conversa direta e colaboração. Ele gosta de como o aplicativo trabalha e quer acrescentar conversa em projeto sem cadastrar bot/grupo, várias conversas por projeto, equipe opcional com um ou mais bots e diffs de edições no chat. Inspeção do aplicativo instalado confirmou o fluxo de selecionar um bot e abrir imediatamente sua conversa, com perfil separado, modelo próprio e novas conversas/históricos por bot. O Politron atual ainda abre a edição ao clicar no agente e prioriza criar grupos; essa prioridade precisa ser corrigida conforme `PRODUCT.md`, `PLANO_V9.md` e a proposta em `ESTRATEGIA_CHAT_V9.md`.

## O que vale trazer como referência

O OpenMausBot apresenta cada agente como um contato com identidade, instruções e conversa própria. Canais/grupos mantêm um transcript compartilhado, membros e contexto de trabalho. A comunicação entre agentes é explícita e mediada pelo servidor: um agente pede ou delega uma tarefa para outro agente, o trabalho aparece no contexto do destinatário e o resultado retorna ao solicitante. Isso permite acompanhar o que foi pedido e por quem, sem depender de uma conversa automática sem fim. O repositório também expõe operações para enviar trabalho a um agente ou canal e esperar a conversa terminar ou pedir ajuda.

O projeto tem ainda um modo opcional de decisão automática que tenta escolher um agente para responder a mensagens sem menção. Essa é uma capacidade separada, configurável e apoiada por um modelo decisor. **Não adotar esse roteamento no Politron V9 agora**: a regra atual do produto é clara e já implementada, com mensagem sem menção enviada a todos os participantes do grupo e mensagem mencionada enviada apenas aos agentes citados.

Uma discussão pública do OpenMausBot sobre comunicação entre pares descreve recibos por destinatário e entrega em fila como áreas importantes de robustez. A issue é uma discussão de design, portanto não deve ser apresentada como funcionalidade já concluída no projeto de referência.

O usuário também destacou a promoção a **Chief**. Na instalação local inspecionada em 16/10/2026, `server/chief-of-staff.js` e `drivers/agents-proxy.js` confirmam ferramentas para criar bots, configurar perfis/modelos, criar e administrar salas e coordenar trabalho. Os contratos delimitam equipes autorizadas e nível de acesso; abaixo de Full Access, determinadas configurações passam por revisão. `post_to_room` publica em uma sala acessível sem iniciar turnos; `coordinate_bots` é a operação de delegação. Para o Politron, o requisito é permitir ao usuário conceder a um bot administração da plataforma e atuação em grupos a partir do privado. A estratégia mantém Chief opcional, autoria, escopo concedido, serviços compartilhados com a UI e vínculos duráveis entre origem e destino. Essas capacidades da referência foram verificadas no código instalado, sem criar bots, mudar modelos ou enviar mensagens no aplicativo do usuário.

## Aplicação ao Politron V9

Preservar o modelo atual do Politron: agente reutilizável, conversa individual ou grupo livre, pasta por grupo quando definida, motor Codex inicial e interface/temas já existentes. A comunicação entre agentes deve funcionar assim:

1. Um agente pode consultar participantes alcançáveis e fazer uma pergunta ou delegar uma tarefa concreta a outro agente, inclusive quando o destinatário não está no mesmo grupo, respeitando o escopo permitido pelo produto.
2. Cada pedido gera uma execução identificável ligada à execução de origem, ao agente solicitante, ao destinatário e às conversas envolvidas. A interface mostra destinatário, resumo do pedido, estado, resultado e erros de entrega. O usuário consegue distinguir uma tarefa aceita de uma tarefa apenas tentada.
3. O agente destinatário trabalha sob as próprias instruções, motor, sessão e permissões. O serviço entrega somente o pedido e o contexto estritamente necessário; não copia automaticamente o transcript completo, credenciais, aprovações ou permissões da conversa de origem.
4. O pedido e a conclusão precisam ser encontráveis no histórico de origem e no contexto de trabalho do destinatário, com vínculo entre ambos. Decidir na implementação, após inspecionar o armazenamento atual, como representar isso sem misturar o histórico pessoal do agente com tarefas de grupo.
5. A conclusão retorna ao solicitante e fica visível como atividade relacionada no grupo de origem quando o pedido veio de um grupo. A resposta do colega não deve fazer broadcast nem iniciar outra rodada automaticamente.
6. Deduplique pedidos e resultados. Sobreviva a uma troca de conversa e a reinício do aplicativo. Se houver falha ou resultado indeterminado, mostre o estado real e não repita silenciosamente uma ação que possa ter sido executada.
7. Um agente ocupado recebe a tarefa em fila ou por um handoff definido pelo runtime; não interrompa outro trabalho sem política explícita. Cancelar uma delegação deve atingir somente aquela cadeia. Limite ciclos, profundidade, fan-out e duração.
8. Na primeira entrega, comunicação entre agentes significa pergunta ou delegação com retorno rastreável, não chat livre concorrente entre agentes nem coordenação infinita.

## Estado já existente no Politron

A implementação V9 em `apps/desktop/src/main/v9` já possui uma ferramenta `ask_agent` para delegação entre participantes do mesmo grupo. A execução aparece como atividade no transcript do grupo, e a cadeia registra relação pai/filho. O smoke test real descrito no estado do projeto confirmou um agente coordenando outro e recebendo uma resposta visível.

Em 16/10/2026, a ferramenta passou a aceitar qualquer outro agente cadastrado. O serviço cria uma conversa de tarefa privada para o destinatário, com suas instruções e permissões atuais, contexto mínimo e pasta privada; não copia transcript, sessão ou pasta da origem. O pedido tem status durável, resultado/erro, vínculo entre conversas e execuções, deduplicação por chamada, cancelamento individual e propagação de cancelamento dos pais. Seis testes com runtime simulado cobrem sucesso, falha, cancelamento, persistência, repetição e ciclos, e o build Electron passou. Um teste de integração com Codex real confirmou a delegação de um agente de grupo a outro agente, o retorno esperado e os registros correlacionados nas duas conversas. A etapa ainda não está certificada completamente: falha/cancelamento reais e recuperação real após reinício precisam de provas adicionais.

O caminho de sucesso entre conversas já tem prova com Codex real. Ainda falta exercitar falha/cancelamento com runtime real, retomada após reinício sem duplicar escrita e comportamento quando o destinatário está ocupado. O trabalho deve continuar estendendo a delegação existente, não criar uma segunda implementação paralela.

Consultar `PLANO_V9.md` e `PRODUCT.md` para o escopo geral, os critérios de aceite e o estado dos testes. As notas de smoke test são evidência de um cenário específico, não certificação de persistência, recuperação após reinício, autorização em conversas entre grupos ou concorrência com destinatário ocupado.

## Referências primárias consultadas

- README: <https://github.com/milind-soni/OpenMausBot>
- Coordenação local por MCP: <https://github.com/milind-soni/OpenMausBot/blob/main/docs/mcp-server.md>
- Decisão automática de respondente em canais: <https://github.com/milind-soni/OpenMausBot/blob/main/docs/decision-model.md>
- Contrato dos agentes e integração de ferramentas: <https://github.com/milind-soni/OpenMausBot/blob/main/server/contracts.ts>
- Discussão sobre recibos e comunicação entre pares: <https://github.com/milind-soni/OpenMausBot/issues/1803>

As páginas upstream podem mudar; ao continuar a implementação, conferir novamente os contratos e a revisão atual. Preservar os avisos e a licença dos componentes já presentes no Politron.

## Instrução para a próxima sessão

Abra `D:\projetos pessoais\politron` como workspace e comece executando `bright-memory ensure`. Leia `AGENT.md`, `PRODUCT.md`, `PLANO_V9.md` e este documento. Inspecione o estado atual do Git e preserve as alterações staged preexistentes. Depois estenda e teste `ask_agent` para colaboração entre conversas, mantendo o comportamento atual de grupos, o runtime Codex, as pastas e permissões de cada agente, persistência e autoria. Não altere design ou temas fora do necessário para mostrar o estado e os vínculos da delegação. Não declare a colaboração concluída até provar um caso real de agente em grupo delegando para agente de outra conversa, recebendo o retorno atribuído corretamente e validando duplicação, cancelamento, falha e retomada.
