# Produto alvo da V9

<!-- impeccable:product-schema 1 -->

Este documento registra os requisitos confirmados pelo usuário em 16/10/2026. Descreve o produto a construir; não certifica funcionalidades implementadas. O nome comercial permanece aberto. V9 é o nome desta evolução, sem decisão sobre a versão dos pacotes.

## Platform

web

Interface React em aplicativo desktop Electron, inicialmente para Windows. A classificação acima descreve a tecnologia da interface; a entrega é um aplicativo desktop.

## Users

O usuário principal é o próprio criador do projeto, que precisa trabalhar diariamente com agentes de IA em demandas reais, especialmente desenvolvimento de software e atividades no navegador.

## Product Purpose

Oferecer uma experiência de conversas familiar a quem usa ChatGPT Desktop e Codex Desktop, acrescentando agentes personalizados e grupos em que esses agentes trabalham e colaboram de verdade. Um grupo pode representar o time de um projeto e ter uma pasta de trabalho associada.

Correção de direção confirmada pelo usuário em 16/10/2026: o funcionamento do OpenMausBot é a referência principal, incluindo conversar diretamente com um bot ao selecioná-lo. O usuário também quer conversar dentro de um projeto sem cadastrar bot ou criar grupo, organizar várias conversas no projeto, usar uma equipe com um ou mais bots e ver diffs das alterações de arquivo no chat. A estratégia vigente que combina esses fluxos está em [ESTRATEGIA_POLITRON.md](<D:/projetos pessoais/politron/ESTRATEGIA_POLITRON.md>); a proposta original que a originou segue arquivada em [docs/arquivo/ESTRATEGIA_CHAT_V9.md](<D:/projetos pessoais/politron/docs/arquivo/ESTRATEGIA_CHAT_V9.md>).

## Positioning

O usuário começa uma conversa com o Assistente padrão ou escolhe um bot. Projetos organizam contexto e várias conversas, podendo ter uma equipe de bots. Cada conversa identifica quem responde. O usuário acompanha colaboração, resultados e trechos de arquivos alterados na mesma interface.

## Operating Context

- Base escolhida: aplicativo existente em `D:\projetos pessoais\politron\apps\desktop`.
- Reaproveitar o design atual, seus temas e os fluxos úteis da base.
- Um agente pode participar de vários grupos; a identidade é reutilizável e o histórico de trabalho é contextual.
- Conversas individuais e grupos devem funcionar com execução real, resultados progressivos e histórico recuperável.
- Cada grupo pode receber uma pasta escolhida pelo usuário. Agentes trabalhando naquele grupo usam essa pasta como contexto de execução.
- O motor inicial definido na conversa é Codex. A arquitetura admite outros motores por adaptadores; a base atual já contém integrações OpenCode e MiniMax.

## Capabilities and Constraints

### Agentes

- Cadastro e edição de nome, descrição, instruções, motor/modelo, avatar e permissões.
- Usar um único termo na interface. Adotar provisoriamente “agente”; o nome final pode mudar sem alterar o domínio.
- Todos os agentes devem oferecer a opção de habilitar Computer Use. O acesso efetivo depende das permissões e das capacidades verificadas do adaptador.
- O agente personalizado executa no motor escolhido; não exigir uma segunda IA intermediária para cada agente.

### Conversa direta como fluxo principal

- Conversar com o Assistente padrão, inclusive dentro de um projeto, sem cadastrar bot nem criar grupo.
- Clicar no bot abre sua conversa principal ou a conversa selecionada anteriormente; não abre a edição do cadastro.
- Iniciar uma nova conversa com aquele bot deve ser uma ação imediata, sem formulário obrigatório de nome, participantes ou pasta.
- Manter múltiplas conversas por bot e tornar seus históricos acessíveis na navegação.
- Abrir perfil, instruções, modelo e recursos do bot por ações próprias, preservando a conversa como tela principal.
- Grupos são uma opção explícita. Pastas, terminal e Computer Use aparecem conforme a necessidade do trabalho.
- Conversas diretas servem também para perguntas, ideias e análise; o usuário não precisa formular uma tarefa de desenvolvimento para começar.

### Projetos e alterações visíveis

- Um projeto organiza contexto e várias conversas independentes; a equipe pode ter zero, um ou vários bots.
- Com um participante escolhido, somente ele responde. Com vários, os participantes ficam visíveis e a conversa admite colaboração.
- A proposta de organização usa equipe padrão do projeto e participantes por conversa, conforme `docs/arquivo/ESTRATEGIA_CHAT_V9.md` (incorporado em `ESTRATEGIA_POLITRON.md`); alterações na equipe padrão não devem mudar silenciosamente conversas em andamento.
- Cada edição real de arquivo deve apresentar um cartão de diff no chat, com caminho, autor, estado, adições/remoções e trechos alterados.
- O diff é evidência produzida pela ferramenta e persistida com a execução. Diferenciar mudança aplicada, falha e resultado indeterminado; texto do modelo não comprova escrita.
- Assistente padrão e projetos com múltiplas conversas têm uma implementação inicial no incremento isolado `v9/assistente-projetos`, com validação automatizada descrita abaixo. Isso não certifica execução com Codex real nem revisão visual da interface. Diff V9 no chat continua pendente; há componentes legados reutilizáveis para visualização.

### Grupos e colaboração

- Criar grupos livres, escolher participantes e associar uma pasta.
- Uma mensagem do usuário sem menções deve ser enviada automaticamente a todos os agentes ativos do grupo, conforme decisão já confirmada.
- Com menções, direcionar aos agentes mencionados.
- Agentes podem pedir informação e delegar trabalho a outros participantes. A troca deve produzir execução real e ser visível na conversa.
- Não exigir CEO, RH, tech lead ou hierarquia empresarial. Um coordenador opcional pode ser um agente comum escolhido pelo usuário.
- Conversas e sessões de grupos diferentes precisam permanecer separadas, mesmo quando usam o mesmo agente.

### Chief e administração por conversa

- O usuário pode promover um bot existente a Chief e conceder poderes de administração global ou em projetos/grupos escolhidos.
- Chief pode criar/configurar bots, criar/gerenciar projetos e grupos, ajustar participantes e escolher modelos reais disponíveis, usando ferramentas internas da plataforma.
- Uma conversa privada pode originar publicação ou delegação em um grupo autorizado. Registrar autoria do bot, origem, destino, pedido, estado e resultado.
- Publicar um aviso não dispara turnos dos membros. Delegar trabalho executa destinatários explícitos e retorna resultados correlacionados.
- Operações da interface e do Chief passam pelos mesmos serviços e permissões. Poderes administrativos não copiam automaticamente históricos privados nem são transferidos aos bots coordenados.
- Chief é opcional e sua promoção/revogação pertence ao usuário. Não constitui uma hierarquia obrigatória. Essa capacidade ainda precisa ser implementada na V9.

### Computer Use

- Prioridade confirmada em 16/10/2026: navegador com cursor próprio primeiro; programas do Windows na etapa seguinte.
- O navegador controlado pelo agente deve funcionar sem disputar o cursor e o teclado do usuário.
- Mostrar a navegação e identificar qual agente está atuando. Oferecer parada e intervenção humana.
- Programas nativos continuam no objetivo do produto, com uma etapa técnica específica para controle independente do desktop.
- Desligar Computer Use deve impedir novas ações efetivamente, e não somente esconder os controles.

### Interface e avatares

- Preservar o design geral atual: temas, cores, fontes por tema, acabamento, geometria, painéis e controles de janela.
- Substituir seletivamente componentes do chat por componentes da Kokonut UI, integrados aos temas existentes.
- Personalizar avatares no estilo de pequenos bots, por biblioteca, imagens ou ambos.
- Rostos animados são uma melhoria posterior. Não bloquear chat, grupos, delegação ou Computer Use por essa etapa.

## Brand Commitments

A aparência do Politron foi trabalhada pelo usuário e é um ativo a preservar. ChatGPT/Codex são referências de familiaridade da interação; não são autorização para substituir o design atual por uma cópia visual. OpenDots deixou de ser a base deste projeto.

## Evidence on Hand

Na inspeção do OpenMausBot instalado e aberto em 16/10/2026, selecionar Lyra na lista de bots abriu a tela de conversa direta com sua identidade, descrição, modelo e campo “Mensagem para Lyra”. O perfil abriu em painel separado. A lateral expõe novas conversas e históricos por bot, além dos grupos. O código instalado separa bot e thread e permite enviar ao thread principal do bot quando um thread específico não é informado. No Politron atual, clicar no agente ainda abre o formulário de edição, e a criação de conversa começa em modo grupo. Essa divergência foi identificada, mas a correção da interface ainda não foi implementada.

Há código de chat, sessões, temas, SQLite, terminal e integrações de agentes. A inspeção encontrou um módulo de grupos ainda desacoplado da execução e da tela principal, além de regras antigas de hierarquia. O plano de execução vigente está em [ESTRATEGIA_POLITRON.md](<D:/projetos pessoais/politron/ESTRATEGIA_POLITRON.md>); o histórico de evidências anterior está arquivado em [docs/arquivo/PLANO_V9.md](<D:/projetos pessoais/politron/docs/arquivo/PLANO_V9.md>).

Em 16/10/2026 começou a implementação da primeira fatia integrada. Em perfis temporários do Electron, foram confirmados: resposta e streaming reais do Codex; envio sem menção a todos os participantes de um grupo; delegação de um agente para outro com retorno visível; navegação e clique reais pelo Playwright em uma sessão de navegador isolada, com o agente identificado por um cursor próprio. A interface Electron abriu com a ponte IPC e o tema preservado.

Em 16/10/2026, `ask_agent` foi estendido para alcançar qualquer outro agente cadastrado. Cada pedido cria uma conversa privada para o destinatário, usa suas próprias instruções/modelo/permissões e uma pasta privada, e mantém mensagens relacionadas nos históricos de origem e destino. O pedido tem estado durável, resultado/erro, vínculo com execuções e chave de deduplicação; a UI oferece navegação entre conversas e cancelamento direcionado. Se o aplicativo fecha durante a execução, o pedido é marcado como interrompido e não é repetido automaticamente. Seis testes automatizados com runtime simulado passaram para retorno, deduplicação, falha, cancelamento individual, cancelamento herdado da origem, persistência após reabertura e bloqueio de ciclos. Um teste adicional passou com Codex real: agente em grupo delegou a outro agente em conversa privada, recebeu o token esperado e o pedido/resultado apareceram nos dois históricos.

No incremento isolado `v9/assistente-projetos`, a implementação acrescenta Assistente padrão sem cadastro, projetos com equipe padrão opcional, várias conversas independentes por projeto, título automático, instruções/pasta herdadas ao criar conversa e persistência no SQLite lateral. Conversas sem participantes executam como Assistente; alterações nas instruções do projeto criam uma nova sessão para aquele contexto. O snapshot migra o esquema 2 para 3 com backup e recusa esquemas futuros sem rebaixá-los. Os testes focados passaram (17 passaram, 1 integração condicionada ignorada), a build passou e o typecheck dos módulos V9 passou. O Codex real, a navegação em Electron e a revisão visual ainda não foram verificados; os diffs V9 permanecem fora desta fatia.

Essas provas pontuais não certificam falha/cancelamento com Codex real, retomada de sessão após reinício, limites contra junctions ou ferramentas externas, ação humana no navegador, controle de programas do Windows, distribuição instalada ou desempenho. A primeira versão utilizável ainda não está concluída.

## Product Principles

1. Entregar trabalho real antes de acrescentar decoração ou configurações extensas.
2. Preservar a identidade visual existente ao acrescentar funcionalidades.
3. Tornar claros o agente responsável, a pasta, a tarefa e o estado da execução.
4. Manter grupos flexíveis e agentes reutilizáveis, sem cargos obrigatórios.
5. Dar ao usuário controle simples sobre execução, permissões e uso do computador.

## Decisões abertas

- Nome comercial e termo definitivo para os agentes.
- Desenho final dos rostinhos e eventual serviço de geração de imagens.
- Backend de controle de programas nativos com entrada independente da sessão de trabalho do usuário.
- Metas numéricas de desempenho, a definir após medir a base.

As decisões abertas não bloqueiam o planejamento nem a implementação das entregas de chat, grupos e navegador.
