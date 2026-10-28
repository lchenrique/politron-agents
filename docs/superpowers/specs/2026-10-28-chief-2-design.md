# Chief 2.0, autoaprendizado e reordenação do sidebar

Data: 28/10/2026. Estado: proposta aguardando aprovação.

## Intenção

O Boobot é o assistente pessoal do usuário, na linha dos "Dots" do ChatGPT, do jeito dele. O Chief (hoje "Atlas"; o nome é editável) é o substituto do usuário dentro da plataforma: tudo que o usuário faz no app, o Chief também faz, inclusive quando o pedido chega pelo celular (PWA) com o usuário fora de casa. Além disso, todos os agentes devem aprender sozinhos, transformando procedimentos que deram certo em skills. E o usuário precisa organizar o sidebar do jeito dele.

## Parte 1: reordenar o sidebar (arrastar e soltar)

- Na raiz: reordenar projetos e pastas de projetos; mover um projeto para dentro ou para fora de uma pasta.
- Dentro de um projeto: reordenar sessões. As sessões aninhadas de delegação acompanham a sessão pai.
- Aba Boos (global e do projeto): reordenar Boos.
- Teclado: o mesmo reordenamento por atalho (Alt+↑/↓ no item focado), por acessibilidade.
- A ordem manual substitui a ordenação automática. Itens novos entram no topo. Favoritos continuam marcados com estrela, sem forçar posição.
- **Chamada minha:** a ordem é salva no banco (`v9_meta`), não no navegador, para valer também na PWA e sobreviver a reinstalações. Hoje grupos e favoritos ficam em `localStorage`; a ordem nova vai para o banco e os grupos migram junto.
- Biblioteca: reutilizar uma que o projeto já tenha; se não houver, usar `@dnd-kit` (padrão do ecossistema shadcn), sem animações pesadas.

## Parte 2: autoaprendizado (todos os agentes)

Diagnóstico: as ferramentas `list_skills`/`read_skill`/`save_skill` existem e o prompt manda usar, mas nenhum agente gravou skill até hoje (a pasta `skills-learned` nem existe). A decisão fica no meio do trabalho e o modelo não lembra.

- **Revisão no fim da execução:** quando uma execução teve trabalho relevante (várias chamadas de ferramenta, erro corrigido ou procedimento novo), o próprio agente faz um passo curto ao final, na mesma thread: "isso vira skill? já existe uma parecida para atualizar?", e grava ou atualiza. Execuções triviais não disparam o passo.
- **Skills visíveis no prompt:** nome e descrição das skills existentes entram no prompt de cada execução (lista curta), para o agente saber o que já existe sem precisar chamar `list_skills`.
- **Permissão:** gravar skill deixa de depender da permissão de escrever arquivos do projeto, porque a skill fica na pasta de dados do app. Continua proibido incluir segredos em skills.
- **Visibilidade:** quando um agente cria ou atualiza uma skill, aparece uma linha na conversa ("Aprendeu: <skill>"), e a skill fica em Configurações → Skills para o usuário editar ou apagar.
- Vale para todos os runtimes que já recebem as ferramentas do Boobot.

## Parte 3: Chief com controle total

Princípio: dentro do Boobot, o Chief pode tudo que o usuário pode. Fora do Boobot (navegador real, arquivos fora das pastas dos projetos, serviços externos), vale a permissão que o usuário já concede hoje.

**Ver tudo (só leitura, sem confirmação):**
- listar projetos (nome, pasta, sessões, time, missões e rotinas);
- ver o panorama de um projeto: quem está trabalhando em quê, execuções ativas, delegações e aprovações pendentes;
- ler o histórico de qualquer sessão de qualquer projeto;
- listar missões e rotinas de todos os projetos.

**Fazer (sem confirmação, só registro na conversa):**
- criar projeto (pasta existente indicada pelo usuário; senão `Documentos\Boobot\<nome>`);
- criar sessão em qualquer projeto e mandar mensagem nela;
- montar e alterar o time de qualquer projeto ou sessão;
- delegar para qualquer Boo do catálogo; o Boo entra no time daquela conversa;
- criar e editar Boos, inclusive modelo e instruções;
- editar a si mesmo (descrição, instruções, modelo);
- criar e editar rotinas e missões;
- renomear projetos e sessões, mudar a ordem e as pastas do sidebar.

**Pedem confirmação (ações que apagam ou não têm volta):**
- excluir ou arquivar projeto, sessão, Boo, rotina ou missão;
- mudanças de configuração que ampliam acesso externo (navegador real, terminal, acesso remoto).

**Chamada minha:** "fazer sem confirmação" substitui os atuais `propose_*` do Chief (proposta mais cartão) por ações diretas. Os outros Boos continuam como hoje. As confirmações usam o fluxo de aprovação existente e funcionam na PWA, exceto o que já é exclusivo do desktop.

Não objetivos: acesso a arquivos fora das pastas dos projetos sem permissão; o Chief aprovar as próprias confirmações; mudar o papel dos Boos comuns.

## Ordem de entrega

1. Reordenação do sidebar.
2. Autoaprendizado.
3. Chief 2.0.

Cada parte é testada em modo dev com perfil isolado (`BOOBOT_E2E_USER_DATA_DIR`) antes do executável.
