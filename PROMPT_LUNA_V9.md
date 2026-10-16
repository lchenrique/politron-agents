# Execução da V9 do Politron

Trabalhe na base `D:\projetos pessoais\politron`, aplicativo `apps\desktop`. Implemente a evolução definida em [PRODUCT.md](<D:/projetos pessoais/politron/PRODUCT.md>) e [PLANO_V9.md](<D:/projetos pessoais/politron/PLANO_V9.md>). Leia os dois integralmente antes de alterar código.

## Estado atual

A implementação já começou. Antes de mexer no código, confira o diff e leia a seção “Progresso da implementação” do plano. Não recrie a base V9 nem substitua os arquivos novos sem uma razão comprovada. Preserve tanto o código V9 que já está no working tree quanto as alterações staged preexistentes.

Já existe uma primeira fatia integrada: nova tela Electron na rota principal; armazenamento lateral `politron-v9.sqlite`; cadastro de agentes e conversas; Codex app-server com resposta real e streaming; grupos sem menção enviam para todos; pergunta/delegação entre agentes; campo Kokonut; visualização Playwright com navegador isolado, cursor rotulado e controle humano; terminal contextual à pasta do grupo. Build Electron Vite e verificação TypeScript focada nos módulos V9 passaram. Provas reais pontuais estão registradas em `PRODUCT.md` e `PLANO_V9.md`.

Isto ainda não é a primeira versão utilizável concluída. Continue pelas lacunas documentadas: reinício e persistência; menções; leitura e gravação reais e limites de caminho; cancelamento e retomada; recusa/ciclo/falhas de delegação; autorização e desligamento do navegador; validação visual dos temas; baseline e desempenho; empacotamento Windows. Programas nativos do Windows são a etapa posterior.

## Objetivo

Entregar uma ferramenta pessoal de trabalho em desktop, com experiência familiar de conversas, agentes personalizados, grupos livres associados a pastas e colaboração real entre agentes. O primeiro motor do novo fluxo é Codex. Computer Use começa com navegador e cursor próprio; programas do Windows vêm na etapa seguinte, escolha expressa do usuário.

O usuário aprovou a base Politron e quer preservar seu design. Não usar OpenDots como base desta execução. O nome comercial e o termo definitivo para os agentes continuam abertos; usar “agente” provisoriamente.

## Condições obrigatórias

1. Execute `bright-memory ensure` na raiz antes do trabalho e `bright-memory save` ao concluir uma entrega significativa. Se a CLI falhar, informe uma vez e continue. Não editar sua configuração manualmente.
2. Inspecione status e diff inicial. Existem alterações staged anteriores: preserve-as e não as reverta, limpe, retire do stage ou inclua em commit automaticamente. Trabalhe sobre o estado existente sem confundir autoria.
3. Esta solicitação direta do usuário substitui as regras antigas de CEO/tech lead obrigatórios. Leia o AGENT.md e reconcilie a documentação legada na etapa 0; preserve orientações técnicas válidas. Não carregar a hierarquia antiga para o novo fluxo.
4. Preserve a identidade visual, os 14 temas existentes, fontes por tema, acabamento, painéis, terminal e controles de janela. ChatGPT/Codex são referência de interação; o usuário não pediu para substituir o visual atual.
5. Faça mudanças incrementais. Não reescrever a aplicação, migrar stack, trocar roteador ou trocar todo o estado global como pré-requisito.
6. Use UTF-8 e português com acentuação correta. Preserve licenças e avisos de componentes reaproveitados.

## Comportamento obrigatório

- Criar/editar agentes: nome, instruções, motor/modelo, avatar e permissões.
- Um agente pode participar de vários grupos, com sessões separadas por conversa e pasta.
- Criar grupos, escolher participantes e associar pasta por seletor nativo.
- Mensagem humana sem menções executa todos os agentes ativos do grupo. Com menções executa apenas os mencionados. Menção inválida não vira broadcast.
- Uma resposta comum de agente não dispara todos os outros. Colaboração acontece por ferramentas explícitas de pergunta/delegação, com execução do destinatário e retorno ao solicitante.
- O usuário vê origem, destinatário, estado e resultado das delegações. Sem hierarquia obrigatória.
- Histórico, grupos, membros, instruções, pasta e configurações sobrevivem ao reinício. Recuperar execução interrompida sem repetir efeitos automaticamente.
- Serializar escrita por pasta canônica na primeira entrega; considerar que grupos diferentes podem apontar para a mesma pasta.
- Todos os agentes oferecem Computer Use. A permissão deve ser aplicada no serviço e no runtime; não basta esconder a interface.
- Navegador: ações reais, visualização atualizada e cursor identificado, sem mover o ponteiro do Windows. Oferecer parar, assumir e devolver controle.
- Avatares estáticos e upload entram de forma simples. Expressões animadas e geração de imagens por IA são secundárias.

## Caminho de execução

Siga as etapas 0 a 7 do plano para a primeira versão utilizável:

1. Preparar a base, registrar baseline e provar Codex + ferramenta local + navegador independente.
2. Implementar domínio, persistência e cadastro de agentes sem cargos obrigatórios.
3. Ligar chat individual real, streaming, interrupção, aprovações e recuperação.
4. Entregar grupos com pasta, menções, envio a todos e fila de execução.
5. Entregar colaboração real por ferramenta, com limites e retorno de resultado.
6. Integrar os componentes Kokonut selecionados ao chat, preservando temas e contratos.
7. Integrar navegador controlado a qualquer agente habilitado, com visualização e intervenção humana.
8. Consolidar recuperação, avatares estáticos, validação e distribuição Windows.

A etapa 8 do plano detalha programas nativos e expressões opcionais. Não declarar desktop completo entregue quando apenas o navegador funciona.

Cada etapa deve terminar com um fluxo verificável. Se uma entrega exigir mais de uma sessão de trabalho, registrar tarefas e evidências de implementação no plano, distinguindo feito, pendente e bloqueio. Isso é acompanhamento de execução; memórias duráveis do projeto continuam na CLI Bright Memory.

## Pontos técnicos que não podem ser ignorados

- O provider-router atual suporta OpenCode/MiniMax; Codex precisa de adaptador real. Conferir a versão local e a documentação oficial do app-server, que o CLI instalado identifica como experimental.
- O módulo de grupos existente guarda mensagens em React e ainda não é um chat coletivo operacional. Ligar grupos à persistência, runtime e tela principal.
- Reutilizar cartões úteis de Markdown, diff, arquivos, terminal e ferramentas. Integrar o campo Kokonut sem reescrever todos os blocos.
- Kokonut é interface. Conectar envio, interrupção, anexos, modelo e aprovações aos serviços; remover dados de demonstração e respeitar os tokens atuais.
- Usar o `components.json` existente. Não reinicializar shadcn, importar tema novo ou sobrescrever o CSS global para instalar um componente.
- Sessões e eventos precisam de conversa, agente, execução e grupo quando aplicável. Não depender de um agente global “atualmente ativo”.
- A pasta de trabalho não é, sozinha, um sandbox. Validar restrições também nas ferramentas diretas do runtime e nos caminhos canônicos.
- Conectar ferramentas de colaboração e navegador como ferramentas contextuais suportadas pelo Codex app-server. Demonstrar chamada pelo agente e uso do resultado; não pressupor que MCP seja obrigatório.
- Executar navegador fora do renderer privilegiado. Contextos por agente/grupo isolam sessão; não são isolamento completo do sistema operacional.
- O cursor mostrado representa ações reais. Respeitar coordenadas, escala, frames e exclusividade de controle; não simular movimento aleatório.
- Preferir carregamento sob demanda e fechar recursos ociosos. Medir antes de afirmar melhora de desempenho.

## Validação e entrega

Execute os checks apropriados às mudanças e a matriz da seção 13 do plano. Valide o aplicativo no Electron; o navegador sozinho não fornece `window.vibeAPI`.

Faça uma demonstração real com dois agentes: o usuário solicita uma alteração em um grupo com pasta, um agente delega ao outro, o resultado retorna ao solicitante e o navegador verifica a página usando seu cursor próprio. Reabra o aplicativo e confira o histórico. Teste também desativar Computer Use e impedir novas ações.

Compare o visual com a referência inicial e exercite os temas existentes. Diferencie testes com mocks de execução real de runtime/ferramentas. Não declarar sucesso com build isolado, UI demonstrativa, mensagens artificiais ou uma delegação que só cria um cartão.

Ao concluir, relate os fluxos efetivamente implementados, como foram validados, limitações restantes e a etapa seguinte. Não criar PR, commit, publicar distribuição nem enviar mensagens a outros chats sem instrução específica.
