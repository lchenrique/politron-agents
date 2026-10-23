# TODO — UX, desempenho e respostas em grupo

Esta lista reúne os pontos pedidos para a próxima rodada do Politron. O código atual tem alterações locais em andamento; antes de implementar, revisar o diff e confirmar o que já foi concluído para evitar repetir trabalho.

## 1. Revisar o comportamento do MausBot

- [x] Ler o repositório do MausBot diretamente, com foco no roteamento de respostas em grupos e no decisor JEV/OpenRouter.
- [x] Registrar como o MausBot armazena a chave do decisor, carrega e filtra os modelos compatíveis com decisões e lida com falhas/fallback.
- [x] Comparar o fluxo do MausBot com o modelo de conversas e agentes do Politron e definir uma adaptação compatível com a arquitetura local.

Referências consultadas: [Decision model](https://github.com/milind-soni/OpenMausBot/blob/main/docs/decision-model.md), [catálogo de modelos](https://github.com/milind-soni/OpenMausBot/blob/main/server/decider/openrouter-models.ts) e [cliente OpenRouter](https://github.com/milind-soni/OpenMausBot/blob/main/server/decider/openrouter.ts). O Politron usa apenas o caminho de modelos de decisão do OpenRouter solicitado aqui: chave criptografada localmente, catálogo público filtrado por `output_modalities=decisions`, seleção com limite de confiança e fallback para líder.

## 2. Definir quem responde em uma conversa de grupo

- [x] Garantir que, por padrão, apenas um agente responda quando a mensagem não mencionar ninguém.
- [x] Permitir escolher um líder do grupo, que responde quando não houver menção explícita.
- [x] Adicionar modo automático: o JEV escolhe qual agente responde, mesmo sem menção.
- [x] Usar OpenRouter como provedor do decisor; depois de informar a chave, buscar o catálogo e exibir apenas os modelos cuja saída declara suporte a decisões. TypeSafe/Jev aparece como opção de modelo quando disponível.
- [x] Manter a possibilidade de selecionar um respondente fixo e de direcionar uma mensagem a um agente com `@menção`.
- [x] Definir e implementar fallback claro para chave inválida, erro do decisor, modelo indisponível ou resposta ambígua; evitar que vários agentes respondam por acidente.
- [x] Cobrir persistência das configurações, migração de conversas existentes e testes de menção, líder, modo automático e falhas.

## 3. Reduzir avatares desnecessários e melhorar o desempenho do chat

- [x] Mapear onde o avatar é renderizado e identificar instâncias repetidas ou decorativas que não ajudam a identificar quem fala.
- [x] No histórico do chat, remover avatares individuais das mensagens dos agentes, inclusive em conversas de grupo.
- [x] Identificar o autor no chat com `@nome` em negrito e uma cor consistente por agente; garantir contraste e distinção acessíveis.
- [x] Manter avatares apenas nos contextos em que ajudam a reconhecer ou escolher um agente, como seleção, lista de equipe ou estado vazio, após confirmar cada uso.
- [ ] Medir renderizações e memória com histórico longo. O benchmark sintético de streaming com CDP Performance está em docs/PERFORMANCE-RENDERER-2026-10-22.md.
- [x] Investigar outras fontes de lentidão no chat e corrigir as causas observadas: indexar alterações/aprovações/conversas uma vez por atualização e memorizar linhas de mensagens estáveis.

Impacto estrutural verificado no código: os filtros repetidos por mensagem, de custo O(M × (F + A + C)), viraram indexação e percurso O(M + F + A + C), onde M é o número de mensagens, F alterações de arquivo, A aprovações e C conversas. Essa é uma análise de complexidade, não uma medição de tempo real.

## 4. Melhorar a criação e edição de agentes

- [x] Revisar o fluxo atual de criar e editar um agente e listar redundâncias, campos confusos e decisões repetidas.
- [x] Simplificar o formulário, removendo prévias de avatar repetidas e mantendo a personalização visual em um único preview; configurações avançadas continuam agrupadas.
- [x] Tornar explícitos os valores herdados do agente, especialmente modelo e esforço, e o que será salvo.
- [x] Validar criação, edição e persistência do agente nos testes existentes e focados.

## 5. Verificação de conclusão

- [x] Revisar o diff existente antes de alterar arquivos e preservar trabalho não relacionado.
- [x] Comparar o resultado com cada item desta TODO; marcar como concluído apenas o que tiver evidência no código e na validação correspondente.
- [x] Executar verificações direcionadas para roteamento, persistência, renderização do chat e formulário de agentes.
- [ ] Revisão visual no aplicativo instalado e perfil de memória em conversas longas. Medições de CPU/layout antes/depois já registradas em docs/PERFORMANCE-RENDERER-2026-10-22.md.
