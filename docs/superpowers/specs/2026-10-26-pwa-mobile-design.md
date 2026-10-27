# Design: PWA mobile para trabalhar com o host

Data: 26/10/2026  
Status: direção A e preservação visual aprovadas. Em 26/10/2026, o usuário também aprovou imagens de até 20 MB por arquivo, fila de mensagens, os ajustes do Chief/painel e uma prova de compartilhamento de aba única no Brave. Esta especificação foi atualizada e aguarda revisão final antes dos planos de implementação; a integração do Brave permanece condicionada à prova de compatibilidade e escopo.

## Objetivo

Transformar a PWA em um cliente remoto realmente utilizável no celular para retomar conversas, alternar entre sessões, consultar agentes e pedir trabalho ao host por texto, imagem ou ditado. Mensagens durante uma execução podem aguardar em fila ou, quando suportado, ser enviadas imediatamente. Um pedido deve iniciar o agente no host e permitir acompanhar atividade, aprovações, resultado ou falha; não basta apenas exibir o histórico. A PWA continua limitada pelas capacidades que o host autorizou; não substitui o Electron.

O instalador Electron é independente: pode ser instalado e usado no Desktop enquanto a evolução da PWA continua.

## Decisões aprovadas

- **Direção A — Chat em primeiro plano.** Depois do pareamento, abrir a conversa usada mais recentemente. A navegação inferior oferece Chat, Sessões, Agentes e Host. Se não existir conversa recente, oferecer escolher uma sessão existente, começar uma sessão livre ou abrir um agente.
- **Grupos existentes.** A primeira versão pode abrir e conversar em grupos já existentes; criar/editar grupos não entra no escopo.
- **Ditado revisável.** A fala é transcrita pelo host e inserida como rascunho editável. Nada é enviado automaticamente; o usuário revisa e toca Enviar.
- **Sem áudio bruto.** Não enviar a gravação como anexo/áudio ao agente.
- **Sem painel de terminal na PWA.** O cliente móvel não ganha controle direto de PTY/comandos nem execução local. Enviar uma solicitação pode iniciar trabalho do agente no host, sujeito às permissões e aprovações já existentes; isso não concede capacidade nova ao dispositivo.
- **Identidade visual do Electron preservada.** A composição se adapta ao celular, mas o produto deve continuar parecendo o mesmo Electron.

## Vocabulário do produto

Seguir `ESTRATEGIA_UX_WORKSPACES.md`:

- **Workspace / projeto:** contexto de pasta e equipe padrão; pode agregar várias sessões.
- **Sessão:** conversa independente dentro de um workspace ou do workspace Livre.
- **Agente / Poli:** perfil reutilizável que pode participar de conversas em diferentes workspaces.

A UI pode exibir “grupos” para facilitar o entendimento do usuário, mas não deve criar uma entidade nova sobreposta a workspace, equipe e sessão. Uma sessão de grupo é uma conversa existente com participantes múltiplos.

## Experiência mobile

### Chat

- O chat ocupa a tela inteira; não manter a sidebar desktop comprimida.
- Cabeçalho compacto identifica conversa, workspace e participantes, com estado de atividade discreto.
- A conexão do host permanece visível e acessível, sem competir com o título da conversa.
- Enviar um pedido encaminha a mensagem para execução do agente no host. A PWA mostra “aceito/iniciando”, estado de execução e o resultado que chega ao histórico; as atualizações usam as respostas/polling atuais, sem prometer streaming de tokens.
- Aprovações e perguntas emitidas pelo agente aparecem no contexto da sessão. Ações de aprovar/recusar ou responder só ficam disponíveis quando o dispositivo possui o grant correspondente do host.
- Histórico rola independentemente do compositor. Blocos extensos de código/tabela não podem alargar a tela.
- Compositor fixo acima da área segura do aparelho, com texto, microfone, cancelar/limpar e enviar conforme os controles já suportados.
- Rascunhos sobrevivem à troca de abas e à reabertura da conversa, sem serem enviados por essa troca.
- Uma mensagem de texto ou imagem pode ser composta durante uma execução ativa. O envio padrão adiciona à fila FIFO daquela conversa, com estado visível e ação para remover enquanto ainda não começou.
- Quando o runtime atual suporta `steer`, oferecer também “Enviar agora” para a mensagem selecionada na fila. Sem suporte, não simular envio imediato; manter a opção indisponível com explicação.
- Anexar uma ou mais imagens nos formatos raster aceitos pelo runtime, com limite de 20 MB por arquivo. O host valida tipo real e tamanho; a PWA mostra prévia/nome e mantém o rascunho se upload ou dispatch falhar.
- Imagens ficam em armazenamento temporário do host associadas à mensagem/execução, não como caminhos locais expostos ao dispositivo. A UI habilita anexo somente para runtimes cuja capacidade de imagem foi confirmada.

### Sessões

- Lista pesquisável de sessões existentes, agrupadas por workspace e com sessões recentes/ativas identificáveis.
- Distinguir sessão direta de sessão com vários participantes usando dados reais do host.
- Abrir o workspace mostra seu contexto; não cria sessão implicitamente.
- Ação explícita “Nova sessão” continua disponível para sessão livre. Não oferecer criação de grupo nesta etapa.

### Agentes

- Catálogo pesquisável de agentes reais, com identidade visual/avatar já existente e estado somente quando fornecido pelo host.
- Tocar em um agente abre sua conversa direta existente ou inicia uma conversa direta explicitamente.
- Não abrir edição de perfil como efeito colateral de tocar no agente.

### Host

- Mostrar pareamento, conexão, reconexão e grants reais do dispositivo, distinguindo chat, aprovações e acesso a arquivos quando presentes.
- Explicar que permissões são controladas pelo host; não apresentar controles que ampliem ou finjam autorização. Grants de aprovação e arquivos permanecem separados do grant de chat.
- Em caso de desconexão, oferecer reconexão clara e preservar o rascunho atual.

### Voz

1. O usuário toca no microfone e concede permissão do navegador, se necessário.
2. A PWA grava a fala no dispositivo apenas para o fluxo de transcrição existente.
3. O áudio é encaminhado ao host para transcrição, sem criar uma mensagem de áudio para o agente.
4. A transcrição aparece no compositor como rascunho normal, editável e cancelável.
5. Somente o toque explícito em Enviar encaminha a mensagem à conversa.

A permissão de microfone pode depender de contexto seguro HTTPS/localhost. Se ela for negada ou a transcrição falhar, mostrar erro e manter o caminho de digitação manual; nunca enviar texto parcial silenciosamente.

## Identidade visual

“Manter o mesmo design do Electron” significa reutilizar os tokens, componentes e identidades do renderer, não criar um tema mobile paralelo:

- Preservar suporte aos **14 temas** e o comportamento atual de seleção de tema do renderer; usar os tokens atuais de `index.css` para claro/escuro, sem inventar sincronização entre dispositivos nem criar uma paleta móvel paralela.
- Reutilizar `--chrome`, `--background`, `--foreground`, `--primary`, estados semânticos, bordas, raios, sombras e tipografia Inter já definidos.
- Preservar identidade SVG e avatares dos agentes Poli/Pits, estados e convenções dos componentes existentes.
- Não introduzir uma paleta roxa/dark-only, fonte, avatar ou estilo de botão independente. O roxo/íris do mockup é apenas aproximação estrutural; os componentes reais usam os tokens do tema ativo.
- Manter espaçamento, contraste, foco, hierarquia, comportamento de movimento reduzido e componentes de chat do Electron.
- Alterar somente a composição necessária para mobile: barra inferior, superfícies em tela cheia e áreas de toque maiores. Em larguras desktop, a experiência Electron permanece inalterada.

## Arquitetura e fluxo remoto

- Manter a PWA dentro de `apps/desktop`; reutilizar gateway, pareamento, autorização e o adaptador remoto existentes (`pwa/main.tsx`, `pwa/remote-api.ts`, `pwa/api.ts` e `main/pwa/gateway.ts`).
- Introduzir um shell/navegação mobile próprios para a PWA; reaproveitar chat, Markdown, compositor, identidade dos agentes e modelos de dados existentes. Não duplicar a aplicação inteira nem migrar framework/estado.
- Toda consulta e ação continua passando pelo gateway e pelas políticas do host. Não chamar provedores diretamente do navegador nem usar dados fictícios.
- Navegação: Host/pareamento → último chat (ou escolha inicial) → sessões/grupos existentes, catálogo de agentes e conversa direta.
- Mensagens usam a conversa selecionada; histórico, respostas e estados de execução pertencem àquela sessão, sem misturar contextos.
- O envio remoto suporta texto mais referências tipadas a anexos; o navegador não envia caminhos locais do host nem injeta base64 de imagens no corpo textual atual de `v9:send`.
- Upload de imagem usa rota binária autenticada separada, valida grant `chat`, tipo MIME real e limite de 20 MB por arquivo, e grava em área temporária do host. Nenhuma rota de upload pode contornar permissões do gateway.
- Reusar `v9_messages`, `v9_runs` e `WorkspaceQueue`: mensagens e runs aceitos ficam persistidos com status `queued`, sem criar uma segunda tabela/fila paralela. A fila de execução atual serializa pela chave do workspace; chamadas da mesma conversa mantêm a ordem de aceitação no host.
- Um identificador de requisição estável torna o envio idempotente: se a resposta HTTP se perder após a aceitação, repetir a mesma requisição devolve o estado existente, sem criar outra mensagem/run. Itens aceitos aparecem na consulta de histórico.
- Uma ação direcionada cancela somente uma mensagem/run ainda `queued`; adiciona estado `cancelled` e aborta aquele item sem afetar outros runs. Depois que começou, só as ações de execução já existentes se aplicam.
- Ao reiniciar o host, o comportamento atual permanece: runs não terminais passam a `interrupted` e não são repetidos automaticamente. A UI mostra o estado e o usuário decide se reenvia.
- A ação “Enviar agora” só despacha por `steer` em runtimes que anunciam e passam teste de suporte; caso contrário, a fila continua sendo o único caminho disponível durante execução.
- Uploads ainda não vinculados a mensagem expiram em 1 hora; anexos aceitos ficam em armazenamento temporário local por até 24 horas para prévia/reenvio, e são removidos imediatamente quando uma mensagem enfileirada é cancelada. Após expirar, o histórico mantém nome/tipo/tamanho, sem conteúdo binário.
- Erros antes da aceitação (upload/validação) preservam o rascunho; depois da aceitação, falha é mostrada no estado da mensagem com ação de reenvio explícita, sem falso sucesso.

## Segurança e limites

- O host permanece fonte de verdade para autenticação, permissões, aprovações e capacidades.
- O escopo inicial permite leitura/navegação de agentes, workspaces e conversas autorizadas, envio de mensagens, fila online, anexos de imagem em runtimes compatíveis e transcrição já suportada. Nenhuma autorização nova é presumida.
- O grant `chat` autoriza envio, upload e enfileiramento de pedidos; o grant separado `approvals` autoriza responder a aprovações/perguntas. A falta de um grant não pode ser contornada por UI, upload ou RPC.
- Validar tamanho e conteúdo do arquivo no renderer e novamente no gateway/host; não confiar no nome/extensão enviados pelo dispositivo. Limitar armazenamento temporário e limpar órfãos; nunca retornar ao cliente caminhos absolutos do host.
- Imagens só são enviadas a adaptadores com suporte validado por teste. Antigravity permanece texto-only enquanto seu adaptador não provar capacidade de imagem; nunca descartar silenciosamente um anexo.
- Operações de arquivo continuam limitadas aos grants existentes `files:read`/`files:write` e às validações canônicas da pasta de workspace. O agente pode alterar arquivos no host somente conforme suas permissões e aprovações atuais; a PWA não ganha acesso a caminhos arbitrários.
- Terminal/PTY e execução direta de comandos pelo dispositivo permanecem indisponíveis na PWA. Não expor tokens, segredos ou caminhos locais do host.
- Sem criação/edição de workspaces, equipes ou grupos, sem mensagem de voz bruta e sem fila offline que execute pedidos depois sem confirmação.
- Reconectar não duplica envios. Se o resultado do envio for incerto, mostrar estado explícito e permitir ao usuário decidir antes de repetir.

## Acessibilidade e adaptação

- Alvos de toque confortáveis, rótulos de texto nos destinos principais, foco visível e estados que não dependem apenas de cor.
- Respeitar teclado virtual, safe areas, orientação, rolagem do chat e `prefers-reduced-motion`.
- Cobrir pelo menos larguras de 320–430 CSS px e uma largura maior; o teclado aberto não pode esconder o campo de mensagem nem o controle de envio.
- Preservar desktop/tablet sem alterar a composição atual do Electron.

## Critérios de aceitação

1. O Electron instalado inicia e funciona independentemente de parear ou abrir a PWA.
2. Um dispositivo móvel pareado identifica conexão e grants do host, e vê apenas workspaces/agentes/sessões autorizados pelo gateway.
3. É possível reabrir uma sessão direta ou de grupo existente, enviar um pedido e confirmar que ele inicia trabalho do agente no host; a PWA mostra aceitação, estado/atividade e resultado real do histórico.
4. HTTP 202 representa apenas pedido aceito. Falha de dispatch antes de surgir um run/histórico é apresentada na conversa, preserva o rascunho e não deixa um falso “enviado com sucesso”.
5. O catálogo de agentes permite abrir conversa direta, sem abrir edição de perfil involuntariamente.
6. Aprovações e perguntas podem ser respondidas somente com o grant `approvals`; sem ele, o gateway recusa e a PWA não oferece uma ação que pareça autorizada.
7. Ditado gera rascunho editável; enviar, cancelar e editar são ações distintas; áudio bruto nunca é enviado.
8. Trocar abas ou perder a conexão não apaga o rascunho nem cria mensagens duplicadas; estados offline, autorização, aprovação pendente e reconexão são claros.
9. Nenhuma rota/capacidade de terminal é acessível pelo cliente PWA; as políticas do gateway continuam negando métodos não autorizados.
10. O mobile usa os temas e componentes do Electron, incluindo claro/escuro e o catálogo de 14 temas, sem regressão no Desktop.
11. Fluxos principais funcionam com teclado virtual, safe areas e `prefers-reduced-motion` nos navegadores móveis suportados.
12. Durante execução ativa, envio padrão cria mensagem/run `queued` em `v9_messages`/`v9_runs` e usa a `WorkspaceQueue` existente, sem tabela paralela; a ordem aceita no host é respeitada e uma reconexão da PWA não duplica mensagens.
13. “Enviar agora” usa `steer` apenas em runtime comprovadamente compatível; sem esse suporte a UI explica que a mensagem aguardará na fila.
14. A PWA envia imagens de até 20 MB por arquivo pela rota autenticada de upload; o host valida, mantém em área temporária, remove uploads não vinculados em 1 hora, mantém anexos aceitos por até 24 horas e apaga imediatamente anexos de mensagens enfileiradas canceladas.
15. Runtimes incompatíveis não recebem nem descartam anexos silenciosamente: o envio de imagem é bloqueado com motivo legível, enquanto texto segue disponível.
16. Cancelar uma mensagem `queued` marca apenas aquele item como `cancelled` e não interrompe outros runs; item já iniciado não pode ser removido da fila retroativamente.
17. Ao reiniciar o host, runs não terminais ficam `interrupted` e não são reenviados automaticamente; o usuário decide se envia de novo.

## Plano de validação proposto

- Testes unitários do shell mobile, navegação entre abas, retomada de conversa, persistência de rascunho e estados de envio/transcrição.
- Testes do gateway/RPC com cada grant: chat, approvals, files:read/write e métodos negados, especialmente terminal/PTY e upload sem grant.
- Testes de upload: imagens raster válidas nos limites, arquivo acima de 20 MB, MIME/extensão falsificados, expiração/limpeza de temporários e cliente sem grant.
- Testar matriz real de adapters para imagem: Codex, Claude Agent SDK, OpenCode e Antigravity; compatibilidade documental não substitui teste do adapter instalado.
- Testar fila no host: FIFO por conversa, idempotência, cancelamento antes do dispatch, steer apenas quando suportado, falha preservando rascunho/anexo e reconexão sem repetição.
- Testar `v9:send` como fluxo assíncrono: aceitação, início do run, atualização por histórico, conclusão/falha e dispatch que falha antes de criar run; não tratar apenas HTTP 202 como sucesso final.
- E2E no navegador em viewport mobile: pareamento/estado do host, navegar sessões/agentes, abrir grupo, enviar pedido e acompanhar run, aprovar/recusar com grant permitido, gravar/transcrever/revisar/enviar e recuperar de desconexão.
- Typecheck, lint pertinente e build de produção Electron/PWA.
- Validação manual em aparelho real via conexão segura do host antes de declarar o uso remoto pronto. Teste de viewport emulador sozinho não comprova microfone, Tailscale ou rede real.

## Fora do escopo inicial

Notificações push, uso offline de pedidos, envio/armazenamento de áudio bruto, criação/edição de grupos, gerenciamento de grants pelo celular, interface/controle direto de terminal, automação de navegador e acesso arbitrário a arquivos do host. Trabalho de agentes no host continua sujeito às permissões existentes de workspace e aos grants do dispositivo.
