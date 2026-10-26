# Links internos, navegador da plataforma e terminal dos agentes

Data: 26/10/2026. Estado: aprovado pelo usuário e implementado; validações e limites registrados em PRODUCT.md.

## 1. Resultado desejado

No Boobot Desktop, clicar normalmente em um link de arquivo da resposta deve abrir o arquivo na aba do editor do projeto atual. Clicar normalmente em uma URL HTTP/HTTPS deve abrir a página dentro de um navegador próprio da plataforma. Ctrl+clique (e Cmd+clique no macOS) em URL deve abrir no navegador padrão do sistema.

Quando agentes executarem comandos, a execução e a saída devem aparecer no painel Terminal interno. Comandos de curta duração devolvem resultado/evidência ao agente; processos longos, como um servidor de desenvolvimento, permanecem ativos e podem ser observados e encerrados dentro da aplicação. Isso vale para workspaces locais e remotos: a execução ocorre no host do workspace e a saída/estado atravessa a conexão existente. Nenhuma dessas ações abre terminal externo por padrão. Um terminal externo é uma ação separada, somente por solicitação explícita do usuário e sob o fluxo de autorização existente; não abrir uma janela externa no host remoto.

O agente deve citar arquivos com links Markdown relativos ao workspace, por exemplo `[src/arquivo.ts](src/arquivo.ts)`. O produto não tenta adivinhar automaticamente que texto ou código solto representa um caminho.

## 2. Diagnóstico do checkout

Levantamento estático em `D:\projetos pessoais\politron`, sem editar código nesta etapa:

- `MessageMarkdown` usa ReactMarkdown/GFM e atualmente define `target="_blank"` em âncoras. Isso faz o clique comum seguir o tratamento de nova janela do Electron em vez de usar o editor ou um navegador integrado.
- O dock já possui abas de arquivo identificadas por workspace e caminho; `FilePreview` é o componente existente para abrir conteúdo do projeto.
- `BrowserPanel` apresenta sessões do browser de automação dos agentes, ligadas ao serviço de browser do runtime. Não há browser geral da plataforma nem `webview`/`BrowserView`/`WebContentsView` no renderer atual. Reutilizar essa sessão misturaria navegação humana ao estado isolado do agente.
- A ferramenta atual `workspace_run_command` executa PowerShell em processo oculto e captura saída. Ela não abre uma janela de terminal visível. O terminal xterm/node-pty da interface é outro mecanismo e hoje mantém uma sessão interativa global; o agente não usa essa sessão. O terminal manual recusa hosts remotos, enquanto o protocolo de eventos `v9:event` já atravessa a conexão de host; a nova sessão PTY do agente deve executar no host certo e renderizar seus eventos na aplicação conectada.
- O projeto já tem a rotina Windows `npm run dist:win`, que compila e empacota um instalador NSIS x64 em `apps/desktop/dist`; o nome de artefato é `Boobot-Setup-${version}-${arch}.exe`.
- O working tree já contém diversas alterações anteriores. O usuário autorizou explicitamente que todas sejam revisadas, incluídas em um commit e enviadas a `origin/master` junto desta entrega.

## 3. Abordagens consideradas

1. Reutilizar o BrowserPanel e o terminal global existentes. Menor mudança, porém mistura browser do usuário com sessão do agente e mistura entrada do agente com terminal manual/conversas concorrentes.
2. Criar browser geral e sessões PTY gerenciadas por conversa, ambos visíveis no dock e isolados dos recursos já existentes. Exige mudanças de UI, main process e IPC, mas preserva as fronteiras de sessão e cumpre o comportamento solicitado. **Escolhida.**
3. Manter execução oculta e apenas copiar logs para a UI, e abrir URLs em iframe. Menos infraestrutura, mas não oferece terminal interativo real, ciclo de vida confiável para servidores nem navegação web consistente (sites podem bloquear iframe).

Para o browser, usar `WebContentsView` controlado pelo processo principal, não o BrowserPanel do agente nem conteúdo arbitrário com Node/preload. Referência: https://www.electronjs.org/docs/latest/api/web-contents-view.

## 4. Experiência e roteamento de links

### 4.1 Arquivos do workspace

- Links Markdown relativos associados à conversa atual resolvem dentro do workspace dessa conversa.
- Clique normal abre a aba de arquivo já suportada pelo dock/editor, sem sair da aplicação.
- Caminhos absolutos ou relativos que escapem do workspace não são abertos como arquivos do projeto. O renderer não confia no href: o main process mantém validação de caminho e escopo do workspace.
- Se a conversa não tiver workspace ou o arquivo não puder ser resolvido, a ação falha fechada com feedback claro; não tenta abrir o destino por associação do sistema operacional.
- Âncoras de seção, referências de notas de rodapé e código não são reclassificados como arquivos.
- O prompt/orientação do agente será atualizado para formatar referências a arquivos criados, alterados ou relevantes como links Markdown relativos. Não haverá auto-linkificação de caminhos em texto simples.

### 4.2 URLs e browser da plataforma

- HTTP/HTTPS com clique normal abre em uma aba do navegador da plataforma dentro do dock.
- Ctrl+clique no Windows/Linux e Cmd+clique no macOS delega a URL HTTP/HTTPS ao navegador padrão do sistema, por caminho explícito e validado no processo principal.
- Adicionar controles de endereço, voltar, avançar e atualizar ao browser da plataforma. Navegação web iniciada nesse browser permanece na plataforma; protocolos não HTTP/HTTPS não são entregues silenciosamente ao sistema.
- O browser da plataforma e o browser automatizado dos agentes permanecem separados. A WebContentsView não recebe Node nem preload do app; apenas HTTP/HTTPS é navegável. Usará partição própria, sem cookies, armazenamento ou contexto de automação dos agentes.
- URLs de mensagens antigas continuam renderizando. A PWA permanece com sua navegação web normal; a abertura de arquivos locais e a integração com o dock são específicas do Electron Desktop.

## 5. Execução de agentes no terminal interno

- Criar um serviço PTY gerenciado pelo `AppService` do host que executa o workspace. Cada sessão é associada a `workspaceId`, `conversationId`, `runId` e agente. O terminal interativo manual do usuário continua separado.
- O host local ou remoto executa o processo no seu próprio workspace; `v9:event` transmite eventos tipados de criação, saída em chunks limitados, estado e término. `HostRpc` expõe apenas a leitura de sessões e a ação de parar, ambas com escopo validado. A PWA não recebe esses métodos, mesmo com permissões amplas.
- Comandos de curta duração executam na sessão PTY interna, mostram comando e saída no dock e devolvem ao agente saída limitada, código de saída e a evidência estruturada já suportada.
- Comandos de longa duração usam ciclo de vida explícito de processo: iniciar e devolver um identificador, consultar estado/saída e parar. O terminal mostra a saída ao vivo. A troca de conversa não transfere a sessão a outra conversa; a sessão continua listada e visível ao reconectar. Parar o processo ou encerrar o `AppService` que o iniciou limpa o processo e seus filhos. Desconectar o cliente do host remoto não mata o processo; ele continua visível e interrompível ao reconectar enquanto o host estiver ativo.
- A interface deixa claro qual conversa/workspace é dona da sessão e permite ao usuário interromper um processo. Sessões do usuário não podem ser sobrescritas por comandos do agente. O Terminal manual remoto continua indisponível; as execuções PTY do agente aparecem como sessões de saída no painel da aplicação.
- Preservar as autorizações atuais: escopo do workspace, `terminalEnabled`, capacidade de escrita, aprovações exigidas, cancelamento, limites de output e evidência do comando. Abrir terminal interno não equivale a sandbox do sistema operacional; não ampliar silenciosamente o nível de acesso.
- A abertura de terminal externo é uma ação distinta. Nunca fazer fallback automático para terminal externo. O agente só pode solicitá-la quando a mensagem do usuário pedir diretamente o terminal do sistema; as permissões/aprovações aplicáveis continuam valendo. Não abrir terminal externo no host remoto.

## 6. Critérios de aceite

1. Uma URL HTTP/HTTPS clicada normalmente numa mensagem abre e renderiza dentro da aba do browser do Boobot.
2. Ctrl/Cmd+clique na URL abre o navegador padrão do sistema; clique comum não o abre.
3. A navegação do browser da plataforma não reutiliza nem altera sessões do BrowserPanel dos agentes.
4. Um link Markdown relativo a arquivo do workspace abre o arquivo dentro do dock/editor, inclusive para caminhos codificados com espaços.
5. Links fora do workspace, URLs de protocolo não permitido e links sem workspace não executam nem abrem destinos externos silenciosamente.
6. Menções a arquivo em respostas do agente usam links Markdown relativos; caminhos em code spans/blocos permanecem texto/código.
7. Comando curto aparece no terminal interno e devolve resultado/evidência correta ao agente, inclusive falha/código de saída.
8. Servidor de desenvolvimento iniciado pelo agente permanece ativo, mostra saída/status e pode ser encerrado sem matar processos de outra conversa, tanto local quanto remoto; ao reconectar ao host remoto, as sessões ativas podem ser retomadas/encerradas.
9. Permissões e aprovações atuais continuam aplicadas; nenhuma janela de terminal externo aparece sem solicitação explícita e nunca no host remoto.
10. A PWA não pode listar/controlar processos do agente pela RPC; os controles de execução manual e o terminal manual remoto indisponível não sofrem regressões.
11. Verificações focalizadas, typecheck, testes pertinentes e build são executados e reportados sem declarar aprovação de checks que falharam.
12. `npm run dist:win` gera e valida `apps/desktop/dist/Boobot-Setup-<version>-x64.exe`; o arquivo é entregue ao usuário.
13. Depois das validações, todas as alterações atuais e novas são revisadas, staged e incluídas em um commit; enviar `master` para `origin/master`. Se o instalador falhar, não fazer push.

## 7. Plano de validação

- Testes de Markdown para click normal, Ctrl/Cmd+click, arquivos relativos, fragmentos GFM e protocolos inválidos.
- Testes de resolução de arquivo para workspace correto, espaços/encoding, ausência de workspace e rejeição de traversal/escopo externo.
- Testes do ciclo de vida do browser: criação/remoção da view, navegação HTTP/HTTPS, limites de protocolo e isolamento do browser dos agentes.
- Testes de PTY: saída e código de saída em comandos curtos, sessões de conversas distintas, start/status/stop de processos longos, autorização/cancelamento e cleanup.
- Testes de host remoto: eventos PTY atravessam `v9:event`, estado pode ser consultado e o processo pode ser parado após reconexão; PWA continua sem RPC de controle de processo.
- Executar typecheck, testes focados e suíte pertinente, build do app e `npm run dist:win`. Registrar falhas existentes/intermitentes sem mascará-las.
- Antes do commit, revisar o diff completo atual (incluindo alterações anteriores, conforme autorização do usuário), executar `git diff --check` e procurar segredos/artefatos indevidos. Não limpar, resetar ou descartar alterações do usuário.
- Só fazer push depois de o instalador ter sido criado e checado; apresentar o caminho absoluto do instalador e o commit/push resultantes.

## 8. Segurança e limites

- Links nunca executam protocolos arbitrários. A navegação externa HTTP/HTTPS parte de gesto explícito Ctrl/Cmd+clique.
- O browser da plataforma tem armazenamento separado do browser dos agentes e não recebe privilégios do renderer local.
- Eventos de terminal remoto são limitados em tamanho e vinculados a sessão/workspace/conversa; RPC de listagem/parada não é autorizada para a PWA.
- Caminhos de arquivo são resolvidos sob o workspace atual e revalidados no main process.
- Nenhum segredo deve ser adicionado a logs, artefatos, prompt ou commit.
- Não alterar repositórios originais/remotos além do push solicitado deste checkout Politron; não publicar/deployar outros serviços.
