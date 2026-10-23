# Boobot PWA — acesso aos hosts sem instalar o cliente Electron

Data: 23/10/2026. **Plano técnico**, não funcionalidade publicada.

## Objetivo e estado de partida
A mesma identidade, conversas, projetos, modelos e aprovações do host devem funcionar em navegador, celular e PWA instalável. Não reproduzir os motores de IA, segredos, arquivos e shells no navegador: tudo executa **no host autorizado**, e a interface web apresenta os resultados. O PC host precisa estar ligado, com o serviço Boobot ativo. O cliente Electron continuará independente.

Hoje o transporte de hosts é RPC versionado por WebSocket com criptografia Paseo e pareamento, usando rede privada/VPN ou túnel SSH. Casa e escritório já conseguiram conectar pelo Tailscale para autenticação e leitura de projetos (docs/hosts-tailscale.md); não é evidência de acesso PWA, de trabalho remoto ou de terminal remoto completo.

## Arquitetura proposta

```text
Boobot Electron (PC host / agentes / SQLite / ferramentas / arquivos / credenciais)
  └── Host RPC autorizado existente (localhost:6778; nunca expor publicamente)
         ↕ adaptador/gateway autenticado de navegador, no PC host ou edge privada
      HTTPS + WSS, controles de origem, sessão e autorização por capacidade
         ↕
      React Web / PWA (celular, tablet e navegador desktop)
```

A aplicação React deve reutilizar componentes de chat, projetos, diffs, aprovações, modelos e seletor de host, movendo a dependência direta de `window.appAPI` para uma interface `BoobotClient` (Electron IPC vs. WebSocket). Nada de compartilhar `node-pty`, SQLite, Electron, sistema de arquivos ou tokens de host com o bundle web. Não reutilizar o segredo permanente de pareamento em query string, service worker ou localStorage.

Para a primeira versão usar **Tailscale + HTTPS/WSS privado**, não publicar a porta 6778 em IP público. `Tailscale Serve` HTTPS (ou gateway TLS privado equivalente) pode ser adotado após inspeção das rotas/serviços já existentes; não alterar a configuração atual por conta própria. Celulares clientes entram na tailnet. Não presumir que `ws://` ou um túnel OpenSSH funciona diretamente de uma PWA em `https://`; o navegador exige WSS para conexões seguras.

## Fases e aceite

### F0 — contrato e gateway (sem UI remota)
- Extrair interface comum dos métodos de leitura, escrita, eventos e aprovações do `AppAPI`.
- Adaptador Electron continua funcional; adaptador Web usa WebSocket autenticado e eventos de reconexão.
- Gateway autoriza explicitamente RPC permitidos, aplica limite de taxa, valida origem, sessão e CSRF em mutações HTTP; aceita sessões curtas e revogáveis, vinculadas ao usuário/dispositivo.
- Não expor terminal nativo, credenciais, arquivos arbitrários ou WebSocket sem permissão; falha de host nunca troca automaticamente para execução no computador cliente.
- Testar autenticação inválida, sessão vencida, revogação, token vazado simulado, desconexão e atualização de estado após reconexão.

### F1 — PWA somente leitura
- Nova aplicação web responsiva usando o layout Boobot: sidebar, escolha do host, lista de projetos, conversas e mensagens, estado de execução, modelos, diffs e aprovações pendentes **apenas para visualização**.
- Manifest instalável, ícones e service worker que cacheia somente assets estáticos. Nunca salvar transcrições, diffs, projetos, tokens ou arquivos no cache offline.
- Teste Chrome Android, Edge/Chrome desktop, WebKit mobile compatível: mesmo projeto/host, comportamento offline explícito, sem 500 nem conteúdo de outro host.

### F2 — interações seguras
- Permitir chat, seleção de modelos, aprovação/negação auditável e edição de arquivos restrita ao workspace com diffs e confirmação. Escopos por host, política por agente e por workspace.
- Aprovação do celular sempre inclui ID da solicitação, versão e host; rejeitar aprovação obsoleta, duplicada ou de outro host. Eventos sincronizados com Electron.
- Sem Computer Use nativo nem terminal interativo na primeira versão. Desabilitar controles não suportados e explicar por quê.
- Critério de aceite: um arquivo fixture é alterado **no PC host**, aprovado pela PWA, com diff e evidência persistida, sem criar arquivo no dispositivo cliente.

### F3 — múltiplos hosts e distribuição
- Multi-host com nomes/status distintos, indicador claro de host ativo e retenção de contextos separados, reconexão e revogação.
- Instalação por PWA com deploy privado na própria tailnet primeiro; considerar gateway autohospedado/relay posteriormente, após threat model e consentimento.
- Smoke em dois computadores reais + celular, logs estruturados sem segredos e checklist de atualização/rollback.

## Decisões explícitas
- Host executa; navegador apresenta e autoriza. **Não** executar agente no service worker.
- PWA tem cache apenas de recursos estáticos; conversas offline ficam indisponíveis, não são simuladas.
- O arquivo que pode ser editado pertence ao host e ao workspace. `canWrite=true` é o padrão para agentes novos; salvamentos anteriores `canWrite=false` permanecem respeitados; aprovação padrão continua `ask` e workspace pode negar.
- Host físico desligado impede trabalho remoto.
- A animação dos Boos na PWA pode usar SVG por padrão, sem carregar os aproximadamente 4 MB de WASM do Rive enquanto não houver paridade visual e ganho medido.

## Próximo passo implementável
Primeiro isolar `BoobotClient` e inventariar APIs transportáveis; só depois criar gateway e app PWA. Não publicar endpoint externo nem copiar os segredos atuais para código frontend.
