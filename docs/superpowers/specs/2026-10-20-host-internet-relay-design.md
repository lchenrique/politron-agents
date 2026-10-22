# Host pela internet com pareamento por link

> Atualização de decisão em 20/10/2026: após aprovar este desenho e a proposta de testes, o usuário escolheu **configurar Tailscale nos dois PCs** como caminho imediato. A implementação/publicação deste relay fica adiada. A aprovação não foi usada para criar recursos no Coolify. A configuração Tailscale será registrada separadamente; este documento preserva o desenho do relay como alternativa futura.

## Pedido e resultado esperado

O usuário instalou o Boobot no escritório, copiou o pareamento do PC de casa e recebeu `hosts:add: ECONNREFUSED 127.0.0.1:6778`. Confirmou que não usa VPN ou SSH e autorizou implementar a conexão pela internet. Deve conseguir ativar o acesso no host de casa, copiar um link e colá-lo no escritório, sem configurar VPN, encaminhamento de porta ou IP residencial.

O PC de casa precisa permanecer ligado, com Boobot aberto e internet disponível. Os agentes, arquivos, credenciais dos provedores e dados continuam no host. O escritório usa as operações remotas já disponíveis. Voz e terminal interativo mantêm os limites atuais; não são novos recursos deste trabalho.

## Causa atual e base reaproveitada

- `identity.ts` anuncia `ws://127.0.0.1:6778/boobot` por padrão; `pairingLink` inclui esse endereço e `HostManager.add` o utiliza. Em outro PC ele aponta para a máquina errada.
- O transporte atual atende rede local/VPN/SSH. `HostManager.configure` rejeita `relayUrl`; não há serviço de relay neste checkout ou no inventário consultado do Coolify.
- `HostServer.accept(Transport)` já reaproveita o protocolo criptografado sem depender de um socket local. `HostClient` concentra autenticação e RPC, mas cria WebSocket diretamente; deve separar a conexão do transporte sem duplicar autenticação.
- A aplicação já depende de `@getpaseo/relay@0.12.0` para canais criptografados. Preservar essa criptografia e a validação do token/challenge, sequência de mensagens, lista de RPCs permitidos e regras de aprovação.

## Escolha proposta

Adicionar um serviço próprio e pequeno de relay WebSocket em Node, publicado por HTTPS/WSS no Coolify existente. Ambos os PCs iniciam conexões de saída. O relay encaminha os frames criptografados entre eles e não recebe o segredo de pareamento, as chaves privadas dos hosts, prompts, arquivos ou credenciais de provedores em texto aberto.

Endereço proposto: `wss://relay-boobot.codebycarlos.dev`. A pergunta sobre usar esse Coolify/domínio foi enviada ao usuário e está pendente. O endereço pode mudar sem alterar o desenho do transporte. Não usar o relay público do Paseo, nem pressupor autorização ou disponibilidade de infraestrutura de terceiros.

Alternativas consideradas: VPN/SSH já funcionam como transportes avançados, mas exigem configuração que o usuário não fez e não entregam a experiência pedida. Cloudflare Durable Objects é suportado pelo pacote do Paseo, mas acrescentaria outra infraestrutura/conta; o Coolify existente permite um serviço isolado e pequeno. WebRTC não é necessário para este fluxo e ainda exigiria infraestrutura de descoberta e fallback.

## Experiência

No painel existente do host, oferecer acesso pela internet com estado explícito: desativado, conectando, disponível ou desconectado, e mensagem de erro útil. O endereço do relay fica em configuração avançada; usuário comum não precisa informar IP, porta ou URL. A seleção entre acesso pela internet e rede/VPN deve ser explícita, sem mudar silenciosamente hosts já configurados.

O botão de copiar pareamento para internet só fica disponível após o relay confirmar o registro do host. O link identifica a rota do relay e preserva a chave pública do canal criptografado e a credencial no fragmento do link. O fragmento e o token nunca são enviados ao relay, HTTP, logs ou telemetria. Um link antigo permanece direto; não converter silenciosamente um link com loopback em uma rota de internet que ele não contém.

Ao colar o link, o escritório reconhece o transporte e conecta automaticamente. Mostrar origem remota, estado e reconexão no seletor de hosts existente. Falhas devem distinguir host offline, relay indisponível, credencial revogada, link incompatível e endereço local usado em outro PC. Os dados do escritório não podem aparecer como se fossem dados do host.

Não é necessário redesenhar o seletor ou os temas. Usar componentes e tokens existentes, preservando os 14 temas.

## Transporte

Criar `apps/relay` como serviço independente, com manifesto, lockfile, entrada Node, imagem Docker e healthcheck próprios. Não executar Electron ou CLIs de modelos no relay. Usar `ws` e criptografia nativa do Node para autenticação do registro. Dependências e versões serão fixadas na implementação; preservar licenças de bibliotecas utilizadas.

O protocolo de transporte Boobot relay v1 tem três papéis: controle do host, cliente e dados do host para cada cliente. Cada cliente recebe uma conexão de dados e um canal criptografado independente. Nunca multiplexar frames de dois clientes no mesmo canal criptográfico. O protocolo é próprio do Boobot; não anunciar compatibilidade com o servidor relay do Paseo.

1. O host abre controle WSS e prova posse de sua identidade de registro do relay.
2. Após confirmação, mantém heartbeat e recebe avisos de conexão de clientes.
3. O cliente abre WSS para a rota do host com um ID aleatório de conexão.
4. O relay avisa o host, que abre um socket de dados de saída para esse cliente.
5. O relay associa os dois sockets e encaminha frames preservando tipo e conteúdo.
6. `HostServer.accept` e `HostClient` executam o handshake criptografado e a autenticação existentes sobre esse transporte. O relay não autentica nem executa RPCs do produto.

Antes de os sockets serem associados, o relay envia apenas mensagens de controle do transporte. O cliente só inicia o handshake criptografado depois de receber confirmação de associação, evitando depender de buffers ilimitados de frames iniciais. A camada de transporte remove essas mensagens antes de entregar frames ao canal criptográfico.

## Registro e limites do relay

Uma conexão de controle não pode substituir um host somente por conhecer seu UUID. Criar uma identidade Ed25519 de registro por instalação e guardar a chave privada no armazenamento seguro existente. A rota pública é o SHA-256 da chave pública Ed25519 exportada em DER. A identidade de registro é separada da identidade Curve25519 já usada na criptografia dos dados; não converter ou reutilizar chaves entre os algoritmos.

Na conexão de controle, o relay emite um nonce aleatório, descartável e com validade de dez segundos. O host assina um envelope com domínio do protocolo, rota, nonce e versão. O relay confere a assinatura, a derivação da rota e a validade antes de registrar o controle. Replays falham. Uma nova conexão autenticada da mesma instalação pode substituir a antiga. O relay não precisa de banco para reservar rotas: a rota deriva da chave e sua posse é provada em cada conexão.

O socket de dados deve provar que pertence ao controle autenticado: usar um segredo efêmero por controle entregue dentro de WSS, com HMAC do ID da conexão e nonce descartável fornecido para aquela conexão. Não incluir esse segredo em URL, log ou no link de pareamento. Descartar o segredo ao encerrar o controle. IDs de conexão precisam de entropia e validação de formato; o relay nunca aceita associação apenas por ID público.

O relay mantém apenas estado efêmero, não persiste mensagens e não fornece endpoints para executar comandos. Definir limites configuráveis com padrões conservadores: 100 hosts de controle, 16 clientes por host, 20 handshakes concorrentes por IP, 10 segundos para autenticação/associação e 30 segundos entre heartbeats. Aplicar limites de taxa a upgrades e registros por IP, com confiança em proxy configurada explicitamente para a implantação; nunca confiar arbitrariamente em `X-Forwarded-For` do cliente.

Preservar o máximo atual de payload cifrado do Boobot, com backpressure e encerramento de cliente lento. Sem fila de mensagens offline; sem buffers antes da associação. Fechamento de controle encerra dados e clientes ligados a ele. Uma reinicialização perde apenas conexões: os hosts se registram de novo e os clientes reconectam. Healthcheck e logs expõem estados/contagens sem credenciais, conteúdo ou URLs de pareamento.

## Integração e persistência no desktop

- Acrescentar identidade de registro opcional validada aos dados de hosts, gerada somente ao habilitar acesso pela internet e persistida com rollback em falha antes de abrir a conexão. Dados existentes sem identidade continuam válidos.
- `HostSettings.relayUrl` passa a selecionar o transporte internet quando configurado e o host está habilitado. Internet é opt-in; não ativar servidores já existentes por migração.
- `SavedHost` e o link v2 carregam indicação explícita do transporte relay. Links/dados v1 diretos continuam aceitos e mantêm significado. Validar URLs de produção como WSS, sem credenciais ou fragmentos; WS só para loopback de desenvolvimento explicitamente permitido. Não fazer fallback de relay para loopback.
- `HostManager` administra listener local, controle relay, conexões de dados e clientes. Exibir a prontidão real do relay separada do listener local; `running` local não significa acesso pela internet disponível.
- Atualizar snapshot e os callers tipados no preload/renderer de forma compatível. Persistência do host remoto ocorre apenas depois da autenticação real, como hoje.
- Desativar host, revogar pareamento ou fechar o app encerra controle, dados, timers e canais. Revogação troca o token do produto e encerra sessões; links antigos não autenticam novamente. Não ampliar para revogação individual de dispositivos neste incremento.
- Reconexão com backoff limitado e jitter. Retomar por snapshot e eventos, sem reenviar mensagens, comandos ou aprovações que talvez já tenham sido executados.
- Quando o usuário escolhe outro host ou remove a conexão, callbacks antigos não podem alterar o estado da nova seleção. Preservar as proteções por geração do manager.

## Entrega e implantação

Preparar e conferir tudo localmente antes da etapa de publicação: serviço, Dockerfile, configuração de proxy/WSS, alterações desktop, documentação e novo instalador Windows. Não alterar aplicativos existentes do Coolify. Criar recurso isolado para o relay somente na etapa autorizada de publicação.

Na publicação, conferir domínio/DNS, certificado válido, WebSocket através do proxy, limites de memória e reinício automático. O endpoint final entra como padrão de build configurável; não entregar um instalador que anuncie um endereço ainda inexistente como pronto. Links diretos anteriores continuam disponíveis para uso avançado.

Os dois PCs precisam atualizar para a versão com relay e gerar um novo pareamento no de casa. O instalador reduzido anterior não contém este recurso e deve ser preservado. Não há como certificar a conexão escritório-casa sem executar a versão nova nos dois ambientes; publicar ou provar loopback não satisfaz esse aceite.

## Evidência de aceite

A implementação deve demonstrar registro autorizado, rejeição de assinatura/replay/credencial inválida, isolamento de dois clientes, limites e cleanup; handshake criptografado, RPC real inofensivo, eventos e revogação através do relay; reconexão sem duplicar operações; preservação de direto/SSH; estados e mensagens da interface. Não enfraquecer autenticação para demonstrar conexão.

Verificações já autorizadas pelas instruções locais: checagem de tipos e build pertinentes, registrando resultados e limitações. A bateria nova de testes automatizados é proposta para aprovação junto deste desenho; a instrução do ambiente exige solicitação explícita antes de adicionar/rodar testes.

O aceite final é conectar do escritório ao host de casa usando somente um novo link de pareamento, consultar projetos, receber eventos e executar uma solicitação permitida no host, com o usuário confirmando os dois ambientes. Registrar resultados em `PRODUCT.md` e `ESTRATEGIA_POLITRON.md` §7 e salvar contexto durável pela CLI Bright Memory.

## Limites

Não inclui PWA/celular, login central, contas, migração de banco do produto, novos poderes de RPC, captura de programas nativos, nova infraestrutura de IA ou garantia de acesso em redes que bloqueiem WebSocket de saída. Nesse último caso, mostrar erro claro e manter a conexão direta avançada disponível. O relay pode observar IPs, horários e volume de tráfego; o conteúdo permanece criptografado. Suspensão/desligamento do host impede acesso.

## Referências verificadas

- Código local: `apps/desktop/src/main/hosts/{identity,manager,client,server,wire}.ts`.
- [Pacote do Paseo](https://github.com/getpaseo/paseo/blob/main/packages/relay/package.json), versão instalada 0.12.0.
- [Papéis e conexões independentes no transporte do Paseo](https://github.com/getpaseo/paseo/blob/main/packages/relay/src/types.ts).
- [Alternativa Cloudflare do Paseo](https://github.com/getpaseo/paseo/blob/main/packages/relay/src/cloudflare-adapter.ts).
- Inventário Coolify somente leitura em 20/10/2026: servidor disponível, sem relay Boobot. Nenhum recurso ou deploy foi criado nesta investigação.
