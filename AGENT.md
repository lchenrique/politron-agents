# Instruções do Politron

## Produto

O Politron é um aplicativo desktop pessoal para trabalhar com agentes de IA em conversas individuais e grupos livres associados a uma pasta de projeto. O usuário cria os agentes e define suas instruções e permissões. Não exija CEO, tech lead, cargos ou ordem empresarial.

A experiência principal é conversar imediatamente, como no OpenMausBot e nas conversas de projeto desejadas pelo usuário. O usuário deve poder falar com o Assistente padrão, inclusive em um projeto, sem cadastrar bot ou criar grupo. Clicar em um bot abre sua conversa; editar seu perfil é uma ação separada. Projetos podem organizar várias conversas e uma equipe com um ou mais bots; com um participante, somente ele executa. Criar grupo, nomear conversa ou escolher pasta não são pré-requisitos para começar a conversar. Edições reais de arquivo devem mostrar diff no chat, com autor e estado. A estratégia proposta está em `ESTRATEGIA_CHAT_V9.md`; não trate sua implementação como concluída.

O design, os 14 temas, as fontes por tema, o acabamento e os painéis já existentes são ativos do produto. Preserve-os ao acrescentar recursos. A Kokonut UI pode substituir partes específicas do chat, integrada aos tokens e temas atuais.

O usuário também quer promover opcionalmente um bot a Chief. Essa capacidade permite administrar bots, projetos/grupos, participantes e modelos por ferramentas internas, conforme o escopo concedido pelo usuário. O Chief pode receber um pedido no privado e publicar ou delegar em grupos autorizados, com autoria e recibos ligados às conversas. Publicar aviso não inicia broadcast; delegar trabalho é uma ação distinta. Chief não é um cargo obrigatório nem uma segunda IA controlando cada bot.

## Execução

- Codex é o primeiro motor do fluxo V9. Não use uma IA intermediária para comandar cada agente.
- Mantenha a integração desacoplada para que outros motores possam ser conectados depois.
- Cada agente mantém uma sessão por conversa e contexto. Não misture eventos ou histórico entre conversas.
- Em grupos, mensagem do usuário sem menções é distribuída a todos os participantes ativos. Menções direcionam somente aos agentes citados.
- Respostas de agentes e delegações não iniciam broadcasts automaticamente.
- Agentes só recebem permissões que o usuário habilitou. A pasta escolhida define o contexto do grupo.
- Computer Use começa pelo navegador com sessão e cursor próprios. Programas nativos do Windows são etapa posterior.

## Base e implementação

- Preserve a aplicação Electron existente e trabalhe em `apps/desktop`.
- A ponte entre renderer e processo principal usa preload e IPC tipados.
- Use a stack que já existe no repositório. Não combine esta evolução com migração de React, roteador ou estado.
- Preserve OpenCode e MiniMax como fluxos legados/adaptadores quando úteis; eles não definem o produto novo.
- A V9 usa um banco lateral `politron-v9.sqlite` enquanto as entidades novas são implementadas. Não sobrescreva o estado antigo nem diga que dados foram migrados antes de provar uma migração.
- O controle de terminal e processos exige evidência de que a permissão se limita à pasta escolhida. Não anuncie isolamento que ainda não foi verificado.
- Meça desempenho antes de afirmar que o aplicativo ficou mais rápido ou mais leve.
- Preserve licenças e avisos de qualquer código reutilizado.

## Texto e arquivos

- Grave texto em UTF-8 e use acentuação correta em português.
- Nunca comece uma frase ou parágrafo com travessão.
- Não apresente funcionalidades planejadas como concluídas. Registre validações reais e limites conhecidos em `PRODUCT.md` e `PLANO_V9.md`.
