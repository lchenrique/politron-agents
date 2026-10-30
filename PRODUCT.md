# Produto alvo da V9

30/10/2026, Boo ao vivo e editor simplificado: a aba Mascote do dock agora acompanha a mesma conversa por runs e mensagens de ferramenta, mostra a atividade e permite abrir seu arquivo, enviar texto ao agente escolhido e usar os controles de áudio existentes. Cabeçalho/aba e flutuante recebem presença por agente e conversa; trabalho genérico usa processamento, digitação exige edição em execução e aprovação/falha/interrupção não viram sucesso. A chamada local separa preparação de voz e início real do player. Estudo do Coucou em `docs/superpowers/specs/2026-10-30-boo-atividade-coucou.md`, sem código ou assets incorporados. Boo Studio foi refeito com React Color inline para a cor do corpo, prévia, expressões de teste, animações e cinco detalhes opcionais (Brotinho, Estrelinha, Coroa de rei, Auréola e Gorro de Natal); acessórios antigos não são renderizados, mas seus dados permanecem compatíveis. Formatos, controles de proporções, rosado e cores por peça saíram do editor. Após feedback, Pensando/edição usam sorriso sereno sem sobrancelha inclinada; o olhar de pensamento tem movimento próprio e respeita movimento reduzido. Layout usa consultas de contêiner e detalhes com miniatura acima do rótulo; navegador verificou 280–840 px sem transbordamento, modal real com 565 px internos, HEX atualizando o corpo e Enter sem enviar o formulário. 158 testes em 21 arquivos, typecheck e build Electron/preload/renderer/PWA aprovados; lint direcionado sem erros e três avisos de Fast Refresh. Evidências em `docs/superpowers/specs/boo-ref/boo-studio-agent-modal.png`, `boo-studio-browser-check.json`, `boo-thinking-calm.png` e `boo-work-panel-desktop.png` e `boo-studio-crown-halo.png`. Persistência validada em banco temporário; não houve inferência, ligação real ou novo instalador. Reinício concluído após o usuário confirmar que salvou a edição: `npm run dev` gerou a PWA, recompilou main e preload, abriu o Electron e exibiu novamente a Central do Atlas. A porta `http://localhost:5173` está ativa, o perfil `%APPDATA%\politron-desktop` foi preservado e o bundle carregado contém os IDs `boo-sprout`, `boo-star`, `boo-king-crown`, `boo-halo` e `boo-noel`.

30/10/2026, Boo fiel à arte aprovada: o SVG usa curvas extraídas diretamente de `docs/superpowers/specs/boo-ref/boo-pup-ghost-concept.png`, com quatro poses de referência (repouso, foco, feliz e sono). Silhueta, ondinhas, olhos, recortes do brilho, boca, sobrancelha e mãos foram vetorizados na mesma escala, sem incorporar o PNG ao componente. A pose feliz mantém sorriso fechado e mãos laterais; foco e sono seguem a referência sem mãos ou símbolos extras. Os demais estados foram alinhados às novas posições do rosto. A deformação suave continua restrita à metade inferior; cores e acessórios manuais permanecem disponíveis. Pipeline reproduzível em `design-systems/boo-reference/trace_reference.py`, captura do componente real em `capture.cjs` e comparação em `compare.py`. Evidência em `design-systems/boo-reference/comparison/side-by-side.png`: sobreposição da silhueta entre 99,61% e 99,70% nas quatro poses, medida em repouso a 200 px; a textura e a iluminação residual do PNG não são reproduzidas. Navegador sem erros de JavaScript, interpolação do caminho confirmada e animação desativada com movimento reduzido. Seis arquivos/43 testes e typecheck aprovados; lint direcionado sem erros e dois avisos existentes de Fast Refresh. Prévia vetorial animada atualizada em `docs/superpowers/specs/boo-ref/boo-liquid-preview.svg`. O estudo de fumaça segue separado em `docs/superpowers/specs/boo-ref/experiments/`; sem efeito volumétrico integrado, novo instalador ou inferência real.

Publicação em 20/10/2026: instalador reduzido de 119,86 MB enviado à [release v0.1.0-beta.1](https://github.com/lchenrique/politron-agents/releases/tag/v0.1.0-beta.1), a pedido do usuário. Tamanho e SHA-256 confirmados pela API GitHub; instalador anterior preservado. Notas distinguem o pacote do checkout local das fontes do artefato anterior. Sem commit/push ou alteração de tag. [Evidência](docs/installer-size.md).

Aceite do acesso remoto em 20/10/2026: usuário confirmou que o Boobot do escritório conectou pelo Tailscale e mostrou os projetos de casa. Conexão, autenticação e consulta entre os dois PCs comprovadas; execução de agentes e outras operações remotas não foram conferidas nesta rodada. [Evidência](docs/hosts-tailscale.md).

Configuração de acesso em 20/10/2026: usuário escolheu Tailscale para casa/escritório, adiando relay próprio. Em casa, Serve encaminha TCP privado `6778` ao listener loopback do Boobot; endereço de pareamento corrigido para o IP Tailscale do host. Cliente real iniciado em casa pelo endereço VPN autenticou, recebeu snapshot e recusou token inválido. Conexão iniciada no escritório ainda depende da conferência do usuário. Sem novo instalador ou publicação de relay. [Procedimento e evidências](docs/hosts-tailscale.md).

Empacotamento local em 20/10/2026: novo instalador `apps/desktop/dist/slim/Boobot-Setup-0.1.0-beta.1-slim-x64.exe`, 119,86 MB contra 224,28 MB, redução medida de 46,56%. Removidas cópias opcionais do Claude e Monaco completo já compilado; preservados editor, voz e terminal. CLI Claude externa necessária. Artefato anterior preservado; sem publicação ou instalação automática. [Medições](docs/installer-size.md).

Atualização de execução em 20/10/2026: o gratuito nativo `opencode/big-pickle` (Zen/Console, sem Go ou 9router) consultou participantes, propôs um Boo, aguardou uma aprovação e persistiu `Íris QA` em perfil temporário, concluindo a resposta real. Teste aprovado em 169,72 s. A recusa anterior foi isolada à política que removia ferramentas nativas do catálogo da CLI. O adaptador exige aprovação nativa, recusada pelo `run` não interativo, e executa RPCs do Boobot pelo broker comum. Não certifica todos os modelos. Evidência: [inventário de provedores](docs/provider-inventory.md).

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

### Recursos do agente: paridade com Paseo

O objetivo é oferecer ao agente do Politron as capacidades equivalentes às ferramentas que Paseo disponibiliza aos agentes: orquestração e ciclo de vida de agentes; criação, listagem e arquivamento de workspaces/worktrees; terminais e scripts/serviços supervisionados por workspace; automação de navegador; perfis, provedores e modelos; pedidos de permissão e aprovações; agendamentos e heartbeats; saída de voz. Ferramentas nativas do motor e serviços MCP/skills configurados pelo usuário também devem continuar acessíveis quando o adaptador os suportar.

O diferencial intencional do Politron é permitir vários Boos especialistas, com identidade, instruções, motor/modelo e permissões próprios, colaborando ou trabalhando em paralelo sem exigir hierarquia ou coordenador obrigatório. Nenhuma capacidade é presumida: o agente só recebe ferramentas efetivamente suportadas e autorizadas pelo usuário.

No navegador, o objetivo é que os agentes usem o Browser visível do Politron, compartilhado como no Paseo, sem navegadores Playwright individuais. O agente usa o Browser interno do Politron sem cerimônia (a aba abre e é compartilhada automaticamente). Separadamente, com a extensão oficial do provider no Brave ou Chrome funcionando, o agente pode usar o navegador real com as sessões do usuário, mediante autorização única por conversa e agente (`external_browser_request`, revogável no painel Navegador), sem aprovação por chamada; cada ação é registrada na conversa e o acesso inclui sites logados e cookies. Essa decisão do usuário de 27/10/2026 substitui o fail-closed anterior. Não criar extensão própria do Politron. Se a ponte `node_repl` do plugin oficial estiver quebrada (caso desta máquina), o agente segue só com o Browser interno e `external_browser_status` explica o motivo. Como no Paseo, o uso do Browser não bloqueia conversas ou histórico na PWA; as permissões de conversa existentes continuam valendo. A PWA mantém seus limites próprios: sem terminal/PTY remoto, fila como padrão e relay remoto binário desabilitado.

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
- O composer mantém o fluxo de mensagem atual e oferece, no mesmo seletor DSH de modelo, esforço e demais controles que o catálogo de cada modelo suportar. Os controles são passados somente ao turno enviado e não criam uma nova forma de conversar com os agentes.
- A transcrição segue o modelo de turnos do DSH: mensagem do usuário, trabalho do agente e respostas ficam agrupados; ao concluir, o trabalho recolhe em um resumo com duração e quantidade de ferramentas e pode ser expandido para ver detalhes. Respostas mostram o Boo, o raciocínio fica recolhido e a navegação lateral salta entre turnos carregados; a rolagem acompanha o fim apenas se o usuário já estiver nele. Composer com eixo e cartão no estilo DSH, fila recolhível, envio direto do turno por Ctrl/Cmd+Enter e takeover do rodapé por aprovações e perguntas pendentes. Enter/Esc decidem aprovações; operações sensíveis continuam exigindo segunda confirmação. Agora aprovações de arquivo, comando e navegador podem receber “Sempre permitir”, persistido por agente, workspace e escopo da ação, com revogação nas permissões do agente. O editor de cada agente e as configurações do Assistente oferecem modo gerenciado ou bypass do runtime: `bypassPermissions` no Claude Code e `danger-full-access`/`approvalPolicy: never` no Codex. Ferramentas nativas de edição e shell continuam desativadas; as ações passam pelo broker e preservam permissões do Politron, diffs e limites do workspace. Perguntas podem indicar uma opção recomendada sem escolher por conta do usuário. Planos no modo plano podem ser abertos por inteiro, aprovados, recusados ou devolvidos ao mesmo run com feedback; aprovar não libera alterações durante esse turno. Conversas diretas e em grupo, menções, fila e steering mantêm o fluxo existente. Validação em 29/10/2026: 914 testes passaram e 21 foram ignorados; um teste falhou apenas na remoção de pasta temporária do processo longo em Windows (`EPERM` em `audit-reliability.test.ts`), após o status do processo já ter sido interrompido. Typecheck e build Electron/preload/renderer/PWA passaram. ESLint nos arquivos tocados encontrou erros `no-explicit-any` e `require-yield` já existentes nesses módulos, além de dois avisos de tamanho. Revisão com inferência real Codex/Claude não foi realizada.

### Projetos e alterações visíveis

- Um projeto organiza contexto e várias conversas independentes; a equipe pode ter zero, um ou vários bots.
- Com um participante escolhido, somente ele responde. Com vários, os participantes ficam visíveis e a conversa admite colaboração.
- A equipe padrão do projeto é aplicada a novas conversas. Alterações pela administração do workspace preservam conversas existentes. Quando o Chief forma uma equipe por `propose_boos` ou associa membros por `propose_team`, a operação informa e inclui os membros na conversa atual, preservando o coordenador e sem disparar broadcast.
- Cada edição real de arquivo deve apresentar um cartão de diff no chat, com caminho, autor, estado, adições/remoções e trechos alterados.
- O diff é evidência produzida pela ferramenta e persistida com a execução. Diferenciar mudança aplicada, falha e resultado indeterminado; texto do modelo não comprova escrita.
- Assistente padrão e projetos com múltiplas conversas têm uma implementação inicial no incremento isolado `v9/assistente-projetos`, com validação automatizada descrita abaixo. Isso não certifica execução com Codex real nem revisão visual da interface. Diff V9 no chat continua pendente; há componentes legados reutilizáveis para visualização.

### Grupos e colaboração

- Criar grupos livres, escolher participantes e associar uma pasta.
- Uma mensagem do usuário sem menções recebe resposta única do líder configurado ou do agente selecionado pelo modo automático via OpenRouter. Menções direcionam somente aos citados; broadcast é explícito. Rodadas colaborativas são opt-in.
- Com menções, direcionar aos agentes mencionados.
- Agentes podem pedir informação e delegar trabalho a outros participantes. A troca deve produzir execução real e ser visível na conversa.
- Não exigir CEO, RH, tech lead ou hierarquia empresarial. Um coordenador opcional pode ser um agente comum escolhido pelo usuário.
- Conversas e sessões de grupos diferentes precisam permanecer separadas, mesmo quando usam o mesmo agente.

### Board da empresa

- O board é uma área opcional e separada das conversas e missões. O usuário continua falando diretamente com o Assistente, Chief ou agentes pelo fluxo atual; mensagens comuns não viram cartões.
- Equipes reúnem agentes existentes. Cada tarefa tem um responsável e um revisor distintos, mantém eventos/evidências e liga suas execuções às conversas correspondentes.
- Tarefas de código usam worktree e branch próprios. O revisor recebe acesso somente leitura pelo broker; pedidos de mudança voltam ao responsável na mesma worktree. O estado de integração exige evidência informada pelo usuário e não faz merge automático.
- O Chief pode criar tarefas pelo board sob as permissões e aprovações existentes. O board recupera tarefas atribuídas após reinício, mostra filas/impedimentos e oferece leitura na PWA; mutações ficam no desktop.
- Na primeira versão, agentes não reivindicam tarefas livres automaticamente; tarefas precisam ser criadas e atribuídas pelo usuário ou pelo Chief. O board é local à instalação e não adiciona colaboração multiusuário.

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
- O Poli Studio foi integrado ao cadastro dos agentes em 16/10/2026: SVG do Poli fornecido pelo usuário, estados disponível/pensando/programando/concluído, customização de cor, olhos, bochechas, aura, formato e movimento. Esses parâmetros são salvos no SQLite V9. A possibilidade de rosto mais elaborado com biblioteca de peças ou editor externo continua opcional; não bloquear chat, grupos, delegação ou Computer Use por essa etapa.

## Brand Commitments

A aparência do Politron foi trabalhada pelo usuário e é um ativo a preservar. ChatGPT/Codex são referências de familiaridade da interação; não são autorização para substituir o design atual por uma cópia visual. OpenDots deixou de ser a base deste projeto.

“Pits” é o nome provisório escolhido pelo usuário para o mascote, sem renomear o aplicativo Politron nesta rodada. O movimento do mascote é opcional e leve, implementado com SVG/CSS, com respeito à preferência de movimento reduzido; não deve comprometer o desempenho do chat.

## Evidence on Hand

Em 24/10/2026, `propose_boos(purpose=team)` deixou de criar agentes sem conseguir associá-los: o workspace exige `chiefManageTeam` antes de qualquer aprovação/escrita, e a equipe entra no catálogo, equipe padrão e conversa atual na mesma transação. Sem a permissão, nenhum agente é criado e a mensagem indica onde habilitá-la; reforço temporário `purpose=task` continua separado. O chat agrega os fragmentos do agente em blocos leves durante o streaming e aplica Markdown ao fim da resposta. Passaram 47 testes focados e typecheck; o build Electron/PWA passou, com avisos existentes do Vite sobre diretivas `use client`, sourcemaps e chunks grandes. O `app.js` PWA ficou em 467,83 kB gzip e Monaco em chunk lazy de 1.072,21 kB gzip. O harness isolado exibiu o texto final nos quatro fluxos sintéticos de 180 eventos, com p95 de frame em 16,8 ms e nenhum frame acima de 50 ms; isso não mede latência de modelo nem desempenho em dispositivo físico. A janela de desenvolvimento carregou o renderer em `localhost:5173`; a aceitação visual do usuário ainda está pendente.

Em 24/10/2026, o renderer PWA agora monta `AppShell` e os componentes de navegação, sessões, agentes, busca, chat e painéis usados pelo Electron após pareamento. No celular, a sidebar compartilhada funciona como gaveta; permissões do host controlam chat, aprovações e arquivos. Configurações nativas, terminal, navegador de automação e chamada em tempo real ficam fora da PWA, e recursos nativos foram movidos para chunks sob demanda. Typecheck e build passaram; o JavaScript de entrada caiu 26% (632,09 para 467,45 kB gzip), com Monaco lazy em chunk de 1.072,21 kB gzip. HTTP 200 em HTML, logo, JS, CSS e chunk do editor. ESLint dos arquivos alterados terminou com 0 erros e 29 avisos. A tela de pareamento foi vista no Edge; o shell autenticado, celular físico e métricas de CPU/memória/latência ainda não foram validados. Referências e limites em [docs/BOOBOT-PWA-REACT-HOST-CONTROL-2026-10-23.md](docs/BOOBOT-PWA-REACT-HOST-CONTROL-2026-10-23.md).

Em 23/10/2026, o chat da PWA passou a reutilizar os componentes instalados da Pasta UI e da Kokonut UI, com o mesmo `MessageMarkdown` do desktop. O plugin de tipografia já instalado foi ativado para exibir títulos, listas e tabelas; o código usa `CodeBlock` com cópia e as cores seguem o tema. A PWA omite anexos e modelos sem suporte no gateway. Passaram 37 testes focados, typecheck, lint dos arquivos alterados e build completo. O navegador verificou envio, parada, cópia real, hierarquia visual e layout mobile sem transbordamento; o Electron compilado, com banco isolado, exibiu o Markdown e validou pareamento, recusa de método proibido e revogação, sem erros no renderer. Não houve inferência, publicação ou teste em celular físico/tailnet. Evidências e limites em [docs/BOOBOT-PWA-REACT-HOST-CONTROL-2026-10-23.md](docs/BOOBOT-PWA-REACT-HOST-CONTROL-2026-10-23.md).

Em 20/10/2026, foi conferida no Electron compilado a seleção real de modelos OpenCode, Pi e Antigravity. A disponibilidade do Pi agora aceita catálogo RPC válido mesmo com falha de `--version`; IDs configurados preservam o provedor do CLI e o cache foi atualizado para a versão 6. A interface persistiu as três seleções e o backend reconheceu seus IDs, preservando rascunho, com zero mensagens/execuções e nenhum erro no renderer. Passaram 60 testes focados, typecheck e build; o backend foi recompilado após o ajuste final. Não houve inferência nesta rodada; OpenCode/Antigravity permanecem em modo conversa, sem ferramentas do Boobot. Evidências atuais em `docs/provider-inventory.md`.

Ainda em 18/10/2026, o usuário pediu que os modelos fossem navegados por CLI dentro do mesmo seletor. A raiz agora mostra Codex, Claude, Antigravity, OpenCode e Pi; cada entrada abre seus modelos com busca e Voltar no mesmo popup shadcn. OpenCode/Pi expõem seus catálogos para consulta, sem habilitar execução inexistente; Antigravity mostra seu diagnóstico quando não há catálogo. Typecheck e build passaram; o Electron em desenvolvimento recebeu o recarregamento. As asserções existentes foram ajustadas; testes e nova aceitação visual não foram executados nesta rodada. A evidência dos 57 testes e capturas a seguir pertence à versão anterior do seletor.

Em 18/10/2026, a continuação foi limitada pelo usuário à detecção de modelos e aos seletores. A descoberta usa os catálogos dos CLIs Codex/Claude e as configurações locais de OpenCode/Pi, com cache e falhas independentes. Os seletores shadcn/Radix agrupam por CLI e respeitam os esforços de cada modelo. Passaram 57 testes focados (um smoke condicional ignorado), typecheck e build. Em Electron compilado com perfil isolado, foram consultados 7 modelos Codex e 11 Claude; troca de modelo, menu de esforço, Haiku sem esforço e preservação de rascunho foram verificados sem enviar mensagem nem criar execução, sem erro no renderer. OpenCode/Pi ainda não têm adaptadores de execução; Antigravity não expõe catálogo nesta integração. Evidências e limites: [docs/provider-inventory.md](docs/provider-inventory.md).

Na inspeção do OpenMausBot instalado e aberto em 16/10/2026, selecionar Lyra na lista de bots abriu a tela de conversa direta com sua identidade, descrição, modelo e campo “Mensagem para Lyra”. O perfil abriu em painel separado. A lateral expõe novas conversas e históricos por bot, além dos grupos. O código instalado separa bot e thread e permite enviar ao thread principal do bot quando um thread específico não é informado. Na inspeção inicial, clicar no agente ainda abria o formulário de edição, e a criação de conversa começava em modo grupo. Essa divergência foi corrigida posteriormente: o clique atual abre conversa direta, e a edição do agente fica em ação separada.

Em 26/10/2026, links e terminal interno ([desenho](docs/superpowers/specs/2026-10-26-links-browser-terminal-interno-design.md)): no Desktop, links Markdown relativos abrem o arquivo no editor do dock (caminho revalidado no main; traversal, absolutos e outros protocolos são recusados); URL HTTP/HTTPS abre no novo Navegador da plataforma (`WebContentsView` sem preload/Node, sandbox, partição própria, separada do navegador Playwright dos agentes); Ctrl/Cmd+clique abre o navegador do sistema; a PWA mantém links web normais. Comandos dos agentes rodam em PTY (`node-pty`) visíveis na aba Agentes do painel Terminal, com `workspace_start_process`/`workspace_process_status`/`workspace_stop_process` para processos longos, escopo por workspace/conversa, mesmas permissões, aprovações, timeout, limite de 32 KB e evidência. Listar/parar atravessa a RPC do desktop pareado; a PWA é negada; sessões sobrevivem à desconexão do cliente e o `dispose` do `AppService` encerra os processos. Terminal externo só por botão do usuário e nunca no host remoto. PTY não é sandbox. Testes unitários e de integração (PTY real e RPC por WebSocket local) passaram; não houve validação visual manual do Navegador nem teste com um segundo computador real. Limite conhecido: menus e diálogos do React ficam por baixo da view nativa do Navegador enquanto ela está visível.

Há código de chat, sessões, temas, SQLite, terminal e integrações de agentes. A inspeção encontrou um módulo de grupos ainda desacoplado da execução e da tela principal, além de regras antigas de hierarquia. O plano de execução vigente está em [ESTRATEGIA_POLITRON.md](<D:/projetos pessoais/politron/ESTRATEGIA_POLITRON.md>); o histórico de evidências anterior está arquivado em [docs/arquivo/PLANO_V9.md](<D:/projetos pessoais/politron/docs/arquivo/PLANO_V9.md>).

Em 16/10/2026 começou a implementação da primeira fatia integrada. Em perfis temporários do Electron, foram confirmados: resposta e streaming reais do Codex; envio sem menção a todos os participantes de um grupo; delegação de um agente para outro com retorno visível; navegação e clique reais pelo Playwright em uma sessão de navegador isolada, com o agente identificado por um cursor próprio. A interface Electron abriu com a ponte IPC e o tema preservado. A regra de broadcast sem menção foi substituída em 17/10/2026: o padrão atual é resposta única pelo líder ou modo automático, com envio a todos apenas por escolha explícita.

Em 16/10/2026, `ask_agent` foi estendido para alcançar qualquer outro agente cadastrado. Cada pedido cria uma conversa privada para o destinatário, usa suas próprias instruções/modelo/permissões e uma pasta privada, e mantém mensagens relacionadas nos históricos de origem e destino. O pedido tem estado durável, resultado/erro, vínculo com execuções e chave de deduplicação; a UI oferece navegação entre conversas e cancelamento direcionado. Se o aplicativo fecha durante a execução, o pedido é marcado como interrompido e não é repetido automaticamente. Seis testes automatizados com runtime simulado passaram para retorno, deduplicação, falha, cancelamento individual, cancelamento herdado da origem, persistência após reabertura e bloqueio de ciclos. Um teste adicional passou com Codex real: agente em grupo delegou a outro agente em conversa privada, recebeu o token esperado e o pedido/resultado apareceram nos dois históricos.

No incremento isolado `v9/assistente-projetos`, a implementação acrescenta Assistente padrão sem cadastro, projetos com equipe padrão opcional, várias conversas independentes por projeto, título automático, instruções/pasta herdadas ao criar conversa e persistência no SQLite lateral. Conversas sem participantes executam como Assistente; alterações nas instruções do projeto criam uma nova sessão para aquele contexto. O snapshot migra o esquema 2 para 3 com backup e recusa esquemas futuros sem rebaixá-los. Os testes focados passaram (17 passaram, 1 integração condicionada ignorada), a build passou e o typecheck dos módulos V9 passou. O Codex real, a navegação em Electron e a revisão visual ainda não foram verificados; os diffs V9 permanecem fora desta fatia.

Em 16/10/2026, a lacuna de identidade visual foi revisitada a partir da sessão original do Claude: o código disponibilizado pelo usuário do Poli Studio não havia sido integrado; o formulário oferecia apenas cor, três formatos e envio de imagem. Foi criado um rosto SVG baseado no desenho do usuário para avatares em chat/sidebar, mais um editor com prévia e controles por agente; o banco serializa as opções sem alteração de esquema (agentes já são armazenados como JSON). Os testes focalizados de rosto, controles e recuperação SQLite passaram; a suíte de 51 testes passou com 2 integrações condicionais ignoradas, além de typecheck e build. A tentativa de QA visual em instância separada de Electron via Playwright falhou no lançamento; essa captura ainda está pendente, não foi simulada como concluída.

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

## Auditoria funcional de 19/10/2026

Correção de ferramentas em 20/10/2026: Antigravity e OpenCode deixaram de descartar as ferramentas oferecidas ao agente. Os cinco motores compartilham as regras de Chief e o broker de permissões/aprovação. Gemini real criou um Boo permanente em banco temporário após aprovação, com resultado confirmado; o transporte OpenCode também foi verificado com CLI real e servidor de modelo controlado. Falhas/interrupções invalidam aprovações pendentes. A API remota configurada do OpenCode falhou por conexão e o modelo gratuito foi recusado pelo serviço; isso não certifica todos os modelos nem melhoria de desempenho. Evidências e limites: [inventário de provedores](docs/provider-inventory.md).

Atualização conferida em 20/10/2026: descoberta de modelos OpenCode pela CLI efetiva, resolução de múltiplas instalações no PATH e inventário versão 7. O Electron isolado permitiu selecionar modelos de OpenCode, Pi e Antigravity; a janela normal registrou os cinco provedores habilitados. Consulta OpenCode em outra pasta com espaços e acentos respeitou `OPENCODE_CONFIG`. Isso comprova descoberta e seleção nesses cenários Windows, sem certificar inferência de todos os modelos ou outros sistemas. Evidências: [inventário](docs/provider-inventory.md). O tamanho do instalador existente foi medido, com explicação de Claude embutido, Monaco e comparação Hermes/Paseo em [empacotamento](docs/installer-size.md); não houve redução ou novo instalador nesta rodada.

O fluxo Chief → implementador Codex → edição real → testes → conclusão foi demonstrado em Electron com perfil e projeto descartáveis. O agente corrigiu um contador React/TypeScript; dois testes e typecheck passaram também na conferência independente. Troca aprovada para Claude, navegação Chromium isolada e negação/interrupção pela UI também foram verificadas. Foram corrigidos bugs de permissão, isolamento e falhas de runtime/turno, terminal Windows, aprovações e inicialização do navegador.

Isso não certifica operação desassistida geral: a fila ainda entra em impasse em delegação aninhada/concorrente; terminal aprovado não é sandbox; os demais motores não tiveram edição real certificada. Typecheck/build passaram, mas lint e timeouts em testes Git/workspaces permanecem pendentes. Relatório e evidências: [Auditoria funcional do Boobot](docs/AUDITORIA-FUNCIONAL-BOOBOT.md).

30/10/2026, redesign parcial e beta.4: inspirado nas três propostas de UI, mantendo cores e temas. Card "Executando tarefa" no chat (aberto enquanto há ferramenta rodando) com o Boo de perfil digitando num notebook e usando fone, em SVG nas cores do agente; geometria do notebook e do fone projetada de modelos 3D (`design-systems/boo-working/`). Boo pensando ganhou balão com três pontos e dormindo ganhou Zs. Composer em linha única com seletor de modelo compacto; sidebar com item ativo na cor primária, "Novo Boo" e rodapé em linha; navegador de turnos dentro do chat, à esquerda. Painel do Boo no layout de ligação: ondas, estado com cronômetro, alto-falante/fone, mudo real do microfone, encerrar, modo de voz e última atividade expansível. Correção do instalado que rodava sem janela: o log mostrava `database disk image is malformed` passageiro ao abrir o banco enquanto outro processo do Boobot usava o mesmo perfil; a falha não tratada deixava o processo vivo segurando a instância única. Agora a abertura repete erros transitórios, falha real mostra aviso e encerra, e abrir o app de novo mostra a janela escondida. Verificado: vitest 979 passados; `npm run test:redesign:web` passou; exe beta.4 empacotado passou `verify-packaged-smoke`, `verify-packaged-boot` (script ajustado à navegação por projeto) e uma verificação com perfil isolado: banco corrompido gerou 3 tentativas e `startup-failed`; janela escondida voltou visível na segunda abertura. Limites: ligação de voz real com microfone não foi testada; o banco pessoal estava íntegro (`integrity_check` ok) e não foi alterado; instalador sem assinatura.
