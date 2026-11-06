# Reorganização de UX do Boobot (proposta)

Data: 06/11/2026. Origem: pedido do Carlos, com liberdade total de layout. Visão: o Boobot é a extensão digital do usuário. Um líder (o Chief) recebe pedidos pelo computador ou pelo Telegram, monta equipes, delega, cria e apaga projetos e agentes e executa no computador como se fosse o usuário.

## Princípios

1. Uma pessoa deve saber, em qualquer tela, onde está, o que está acontecendo e o que precisa dela.
2. Menos camadas: navegação global à esquerda, contexto no centro, detalhes à direita só quando pedidos.
3. Chat denso e legível, mais próximo do OpenBot: menos espaço entre turnos, texto maior onde importa, controles discretos.
4. Tudo que pode ser removido pode ser removido em lote.
5. O Telegram mostra o mesmo estado que o desktop (aprovações, andamento, parada).

## Estrutura da janela

```
┌───────────────────────────────────────────────────────────────────────┐
│ [host ▾]  [← →]   título do contexto              [modelo ▾] [busca]   │  barra superior
├──┬─────────────┬──────────────────────────────────────┬───────────────┤
│  │ Projetos|Boos│                                      │ painel lateral│
│í │ sessões       │            chat / central            │ (navegador,   │
│c │ canais        │                                      │ arquivos,     │
│o │               │ ┌──────────────────────────────────┐ │ terminal...)  │
│n │               │ │ composer                         │ │               │
│e │               │ └──────────────────────────────────┘ │               │
│s │ rodapé: conta │                                      │               │
└──┴─────────────┴──────────────────────────────────────┴───────────────┘
```

- **Barra superior:** o host (computador local ou remoto) e o seletor de modelo/esforço sobem para o topo, como no OpenBot; o composer fica só com anexos, voz, planejamento e enviar.
- **Faixa de ícones (esquerda):** Central do Chief, Board (tarefas), Rotinas, Loja, Configurações. Feita a partir de uma lista de definições, para acrescentar itens sem JSX repetido.
- **Sidebar:** seletor **Projetos | Boos | Canais**. Projetos e Boos como já definido; Canais lista os grupos.

## Canais (substituem "equipe do projeto")

Um canal é um grupo de Boos que conversam juntos, com um **alvo de trabalho** que o usuário aponta e pode trocar (um projeto, uma pasta ou nenhum). Pontos:

- O canal tem membros (Boos), um líder (o Chief por padrão) e um alvo (`workspaceId` opcional).
- Trocar o alvo muda onde os Boos trabalham sem criar outro grupo.
- Um mesmo time pode servir a vários alvos ao longo do tempo.
- Migração: cada "equipe do projeto" existente vira um canal com o projeto como alvo; nada se perde.
- A delegação, o Board e o Telegram passam a falar em canais.

## Central do Chief

- Cabeçalho com o que precisa do usuário agora (aprovações, perguntas, bloqueios).
- "Em andamento": missões e rotinas com status, Boo responsável e ação direta (abrir, pausar, parar).
- Atalhos para o que o usuário mais pede: novo projeto, nova equipe, nova rotina.
- Tipografia e áreas de toque maiores; sem blocos vazios com texto explicativo longo.

## Chat

- Espaçamento menor entre turnos e dentro das respostas; coluna de leitura mais larga; cartões de ferramenta compactos.
- Ações da mensagem (copiar, ouvir) só ao passar o mouse, exceto na última resposta.
- Rodapé do turno em uma linha ("Concluído em 13s · 2 ferramentas").

## Seleção e remoção em lote

Sessões, delegações, Boos, rotinas, projetos, canais, memórias e esperas ganham o mesmo comportamento: modo de seleção com marcar tudo, contador, confirmação única e desfazer quando possível.

## Loja (no lugar do Marketplace)

Instalar **skills**, **plugins** e **times**, com busca, categorias, estado "instalado", atualização e remoção. Times instalados viram canais prontos. O catálogo é local e opcional; nada é instalado sem confirmação.

## Computer Use e Telegram

- Computer Use por aprovação (a primeira ação por conversa e Boo pede confirmação), com o estado visível na barra superior quando ativo.
- Telegram: texto, áudio, aprovações, cartões, Parar e andamento. As ações sensíveis de desktop continuam exigindo o computador, a não ser que o usuário libere o contrário.

## Ordem de execução

1. Navegação (faixa de ícones, Projetos | Boos, sem Escritório e Marketplace). Em andamento.
2. Computer Use. Em andamento.
3. Barra superior (host e modelo), chat denso e Central do Chief.
4. Seleção em lote nas listas.
5. Canais (modelo de dados, migração, sidebar, Telegram).
6. Loja.

## Decisões do Carlos (06/11/2026)

- **Largura do chat ajustável pelo usuário**, como no DeepSeek Harness: o usuário aumenta e diminui a coluna de leitura (arrastando ou por um controle), a escolha fica salva e existe um valor padrão confortável. Vale para o chat e para a Central.
- **Loja com plugins externos desde a estrutura:** começamos com times e skills locais funcionando, mas o modelo de dados, as telas e o fluxo de instalação já nascem prontos para plugins externos (origem, versão, permissões pedidas, confirmação antes de instalar), mesmo que o carregamento deles ainda não esteja ativo.
- Para o time de desenvolvimento, existe agora um canal **Boobot** no OpenBot com o Atlas como líder e os três agentes do Boobot; os pedidos de trabalho vão por lá.

## Auditoria de layout (06/11/2026, capturas de todas as páginas)

Problemas medidos, em 1440x900 e tema escuro:

1. **Cada página tem sua própria coluna.** A Central começa em x=493 (coluna de ~960 px mais uma lateral), o Board em x=438 e sem limite de largura (as colunas passam da janela e o "Retrabalho" fica cortado), as Rotinas numa coluna centralizada que começa em x=659, e o chat centraliza o composer com outra largura. Não existe largura de conteúdo compartilhada.
2. **Cabeçalhos diferentes.** Central: avatar, título e descrição inline. Board: título à esquerda e ações à direita, descrição em duas linhas. Rotinas: descrição e o botão abaixo. Chat: barra com avatar, nome e ícones. Todos usam um "eyebrow" pequeno ("Central", "Trabalho da empresa", "Automação") que não ajuda.
3. **Título da janela repete o contexto** ("Central do Chief", "Livre") e não corresponde ao título da página.
4. **Configurações é um modal com outro esqueleto**: cartões pesados, descrições longas, escala tipográfica própria.
5. **Composer:** o da Central e o do chat têm formatos e larguras diferentes.
6. **Sidebar em projeto** mostra a Central ao lado, e o item selecionado ("Chief") não bate com o que está aberto.
7. **Contraste de superfícies baixo** (fundo, cartões e bordas quase da mesma luminosidade) e hierarquia tipográfica rasa.

## Sistema de layout (a aplicar em todas as páginas)

- **PageShell único**: barra de cabeçalho de 56 px com título (20 px, semibold), uma linha opcional de contexto e as ações à direita; abaixo, o conteúdo numa coluna com largura `--content-width` centralizada e padding lateral de 32 px. Páginas largas (Board) usam o mesmo cabeçalho e ocupam a largura toda, com rolagem própria sem cortar colunas.
- **Largura ajustável pelo usuário** (como no DeepSeek Harness): controle no cabeçalho (Estreita 720 / Média 880 / Larga 1080 / Total), salvo em `localStorage`, com a mesma variável para Central, Rotinas, chat e composer.
- **Sem eyebrows.** O título da janela mostra só o app; o contexto vive no cabeçalho da página.
- **Escala de espaçamento** 4/8/12/16/24/32 e escala tipográfica fixa (12/13/14/16/20); cartões com uma única receita (raio, borda, padding), com contraste de superfície visível.
- **Configurações** como página no mesmo PageShell (navegação de seções à esquerda, conteúdo na coluna), no lugar do modal.
- **Chat e Central compartilham o composer** (mesmo componente, mesma largura de coluna). Host e seletor de modelo sobem para a barra superior.
- **Estados vazios** curtos, com uma ação, sem texto longo.

