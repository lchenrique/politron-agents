# PWA Host Client Implementation Plan

> **For agentic workers:** Implementar fase por fase e validar cada tarefa antes de avançar. O protocolo do host e as permissões são contratos compartilhados; mudanças devem manter compatibilidade com clientes Boobot desktop existentes.

**Goal:** Criar um PWA instalável para celular que conecte com segurança a um host Politron/Boobot e permita acompanhar conversas e interagir com agentes.

**Architecture:** O PWA será um app web independente em `apps/pwa`, conectado diretamente ao serviço de host existente por WebSocket seguro. A criptografia de aplicação e o fluxo de pareamento serão compartilhados com o host desktop; uma credencial individual por dispositivo e uma lista explícita de capacidades limitarão cada cliente. A primeira versão não terá backend central, relay próprio, terminal nem ações de edição de arquivos.

**Tech Stack:** React, TypeScript, Vite, Web App Manifest, service worker, WebSocket do navegador e `@getpaseo/relay/e2ee` após confirmar compatibilidade no navegador.

**Spec:** [`PRODUCT.md`](../../../PRODUCT.md), [`ESTRATEGIA_POLITRON.md`](../../../ESTRATEGIA_POLITRON.md) e [`docs/architecture.md`](../../architecture.md). Este documento define a proposta específica do PWA; os itens em “Decisões de produto” devem ser confirmados antes da implementação correspondente.

## Global Constraints

- Manter a execução dos agentes e os dados no host desktop; o PWA é um cliente remoto.
- Não adicionar cloud ou relay próprio na primeira versão.
- Preservar clientes desktop existentes e a compatibilidade do protocolo atual.
- Toda operação remota deve passar por autorização explícita e lista de métodos permitidos; nunca expor IPC arbitrário.
- O PWA só conecta a endpoints `wss://` em produção e só é servido em contexto HTTPS.
- A primeira versão oferece conversa, acompanhamento, interrupção e aprovações; não oferece terminal, Computer Use, edição de agentes ou escrita de arquivos.
- Não guardar tokens em URL após pareamento, logs, analytics ou cache do service worker.

## Decisões de produto

- **Rede:** o usuário acessa o host por rede local ou VPN privada. O encaminhamento TLS será fornecido por proxy/VPN sob controle do usuário; o app não abre portas públicas nem cria relay.
- **Escopo móvel inicial:** listar agentes, projetos e conversas; abrir histórico paginado; enviar mensagem; acompanhar eventos; interromper execução; revisar diffs e aprovar/rejeitar solicitações já apresentadas pelo host.
- **Pareamento:** cada navegador/dispositivo recebe credencial própria, aprovada pelo usuário no desktop, com capacidade limitada e revogação individual.
- **Armazenamento web:** a credencial persistente fica em IndexedDB, é removida no logout/revogação e não é incluída no cache offline. Aplicar CSP estrita e não carregar scripts de terceiros.
- **Offline:** cachear somente o shell estático. Sem conexão, mostrar estado desconectado e não enfileirar mensagens para envio posterior.

## Review Focus

- Origem desconhecida tentando abrir WebSocket: rejeitar antes da sessão autenticada; cobrir com teste de allowlist de Origin.
- Link de pareamento copiado, expirado ou reutilizado: impedir novo pareamento e não expor o segredo em histórico, URL persistida ou log.
- Credencial de um dispositivo revogada: desconectar aquele dispositivo e rejeitar reconexões sem invalidar os demais.
- Host cai durante o envio: mostrar que o resultado é incerto e não reenviar automaticamente uma mensagem que possa duplicar uma execução.
- PWA abre offline ou sem suporte a instalação: permitir leitura apenas do shell, informar o estado e não sugerir que comandos foram enviados.

---

## Mapa de arquivos previsto

- `packages/host-protocol/`: pacote sem dependências de Node/Electron para tipos, limites, codec JSON e constantes de protocolo compartilhados.
- `apps/desktop/src/main/hosts/server.ts`: handshake seguro, validação de Origin e sessão por cliente.
- `apps/desktop/src/main/hosts/manager.ts`: emitir/consumir pareamentos e administrar dispositivos móveis.
- `apps/desktop/src/main/hosts/identity.ts` e `secure-store.ts`: modelo validado e persistência cifrada das credenciais e escopos por dispositivo.
- `apps/desktop/src/main/hosts/rpc.ts`: capacidades móveis e autorização por método.
- `apps/desktop/src/shared/hosts.ts` e `src/preload/index.ts`: contratos tipados e configuração/revogação no desktop.
- `apps/desktop/src/renderer/src/features/hosts/HostSettingsPanel.tsx`: criar pareamento, mostrar dispositivos autorizados e revogar um dispositivo.
- `apps/pwa/`: aplicação React independente, manifest, service worker, cliente WebSocket e telas móveis.
- `docs/onboarding.md` e `docs/architecture.md`: instalação, HTTPS/WSS, acesso via VPN, permissões e limites operacionais.

## Plano de implementação

### Tarefa 1: Spike de transporte e instalação PWA

**Arquivos:** teste temporário sob `apps/pwa/` e testes de integração existentes em `apps/desktop/src/main/hosts/`.

- [ ] Criar um cliente de prova com WebSocket nativo do navegador e adaptar `@getpaseo/relay/e2ee`; confirmar handshake criptográfico sem polyfills Node.
- [ ] Rodar o PWA em HTTPS e conectar a um host `wss://` com Origin permitido em Chrome Android e Safari iOS.
- [ ] Registrar no próprio plano o método de provisionar TLS pelo proxy/VPN escolhido e os requisitos de rede.
- [ ] Definir um formato de versão/negociação compatível com os clientes desktop já existentes antes de mudar o protocolo.

**Aceite:** a prova conecta e troca uma chamada inofensiva com o host por WSS em pelo menos um navegador Android e um iPhone; Origin não permitido e `ws://` de página HTTPS falham com mensagem compreensível. Se a biblioteca criptográfica não funcionar no navegador, parar aqui e escolher uma implementação compatível antes de construir UI.

### Tarefa 2: Credenciais móveis e autorização no host

**Arquivos:** `packages/host-protocol/*`, `apps/desktop/src/main/hosts/{identity,secure-store,server,manager,rpc}.ts`, `apps/desktop/src/shared/hosts.ts`, `apps/desktop/src/renderer/src/features/hosts/HostSettingsPanel.tsx` e testes adjacentes.

- [ ] Criar pareamento temporário com expiração curta, aprovado no desktop e convertido em credencial única para aquele dispositivo.
- [ ] Persistir no `HostStore` apenas credenciais protegidas, metadados mínimos do dispositivo, escopos e último uso; validar dados na leitura.
- [ ] Adicionar allowlist de Origins HTTPS configurável e rejeitar origens desconhecidas antes da autenticação; manter testes e conexão de desktop compatíveis.
- [ ] Criar perfis móveis de capacidade para leitura de conversa/diff, envio, interrupção e resposta de aprovações. O `HostRpc` verifica escopo por chamada.
- [ ] Adicionar ao painel do host a lista de dispositivos pareados, data/último uso e revogação individual; revogar desconecta sessões ativas daquele cliente.
- [ ] Testar migração dos dados atuais, cliente desktop legado, pareamento expirado/reutilizado, Origin inválido, método fora do escopo e revogação individual.

**Interface produzida:** `MobileClientCredential { id, name, tokenHash, capabilities, createdAt, lastSeenAt }`; capacidades são uma união fechada compartilhada pelo host e PWA. Segredo de pareamento é de uso único e não é salvo como token global.

**Aceite:** cliente desktop já pareado continua conectando; dispositivo novo só conecta após aprovação; métodos fora de seu escopo são recusados no host; revogar um dispositivo não afeta os outros.

### Tarefa 3: Contrato de protocolo compartilhado

**Arquivos:** `packages/host-protocol/{package.json,src/index.ts,src/codec.ts}`, `apps/desktop/src/main/hosts/{wire,client,server}.ts` e `apps/desktop/package.json`.

- [ ] Extrair para o pacote compartilhado apenas contratos browser-safe: versão, tipos, limites de pacote e encode/decode sem `Buffer` ou `node:*`.
- [ ] Adaptar o host e cliente desktop para consumir o contrato extraído sem alterar semântica de chamadas/eventos.
- [ ] Fazer o build de produção do Electron e os testes de protocolo usarem a mesma definição de versão e mensagens.

**Aceite:** protocolo antigo e novo negociam explicitamente suas capacidades; codec compartilhado passa nos mesmos vetores de teste no Node e no navegador; o bundle do PWA não inclui módulo Electron/Node.

### Tarefa 4: Esqueleto instalável e conexão do PWA

**Arquivos:** `apps/pwa/package.json`, `vite.config.ts`, `index.html`, `public/manifest.webmanifest`, ícones, `src/main.tsx`, `src/app/*`, `src/lib/host-client.ts` e testes do pacote.

- [ ] Criar app React/TypeScript independente e definir comandos próprios de dev, build, typecheck e teste sem converter o repositório em monorepo npm.
- [ ] Criar manifest instalável, ícones e service worker com cache exclusivo do shell estático; definir CSP e política de conexão limitada aos endpoints configurados.
- [ ] Implementar cliente com pareamento, verificação da identidade do host, eventos ordenados, timeout, reconexão com backoff e limpeza segura da credencial.
- [ ] Criar telas de conectar/parear, escolher host e estados conectando, conectado, desconectado, expirado e revogado.
- [ ] Testar handshake inválido, rede interrompida, armazenamento indisponível, logout, recarga e atualização do service worker.

**Aceite:** o PWA instala nos navegadores suportados, conecta por HTTPS/WSS e não armazena respostas RPC nem histórico no cache offline.

### Tarefa 5: Conversas e interação com agentes

**Arquivos:** `apps/pwa/src/features/{home,chat,approvals}/*`, `apps/pwa/src/components/*` e testes de UI/integrados.

- [ ] Apresentar agentes, projetos e conversas usando o snapshot do host, sem misturar estado entre hosts.
- [ ] Carregar histórico com paginação e pesquisa; renderizar mensagens/eventos novos e diffs com autor/estado quando o host os fornecer.
- [ ] Enviar mensagens com estado de execução, bloquear duplo envio, permitir interromper e mostrar resultado incerto em desconexão.
- [ ] Exibir solicitações de aprovação com ação explícita de aprovar/negar e confirmação visual do resultado.
- [ ] Implementar layout mobile responsivo e acessível, com tema/identidade visual Politron; não depender de hover nem de janela Electron.
- [ ] Testar fluxo completo usuário → host → agente → evento/resposta, aprovação, interrupção, troca de host e reconexão sem duplicar mensagem.

**Aceite:** em celular, o usuário consegue selecionar uma conversa, enviar mensagem, acompanhar a resposta e interromper a execução; aprovações continuam sujeitas às permissões já concedidas no host.

### Tarefa 6: Publicação e operação

**Arquivos:** documentação de instalação e rede em `docs/onboarding.md`, mapa de componentes em `docs/architecture.md` e configuração de deploy aprovada na Tarefa 1.

- [ ] Documentar build/servidor HTTPS do PWA, proxy TLS para WSS, acesso por LAN/VPN, rotação de credenciais, backup e revogação.
- [ ] Validar pacote servido em HTTPS, manifest, instalação, atualização de service worker e uso em Android/iOS.
- [ ] Fazer revisão de segurança do protocolo e do escopo RPC; verificar que nenhum segredo ou dado de conversa aparece em logs, cache, URL ou analytics.
- [ ] Executar typecheck, testes de host e PWA, build Electron e build PWA; registrar limites de navegador/dispositivo observados.

**Aceite:** outra máquina pode seguir a documentação sem abrir uma porta pública ou instalar um backend central; falha de TLS, host offline e token revogado ficam claros na interface.

## Auto-revisão do plano

- Fluxo de autenticação e segurança cobre Origin, WSS, credenciais individuais, escopos e revogação.
- UX cobre instalação, seleção do host, histórico, envio, execução, aprovações, interrupção, desconexão e retorno à rede.
- Compatibilidade desktop é tratada antes de trocar o protocolo e testada com o cliente já existente.
- A decisão de infraestrutura HTTPS/VPN permanece gate da primeira tarefa; nenhuma fase presume relay, cloud ou porta pública.
- Limite funcional declarado: terminal, Computer Use, edição de arquivos e notificações push ficam fora da primeira entrega.
