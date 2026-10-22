# Conectar dois Boobots pelo Tailscale

## Configuração

Os dois PCs precisam estar conectados ao mesmo tailnet, com permissão de acesso entre eles. O PC que executa os agentes deve permanecer ligado, com o Boobot aberto e o host habilitado. O Tailscale precisa continuar ativo nos dois PCs.

É possível manter o listener do Boobot em loopback e usar o encaminhamento TCP privado do Tailscale Serve. Não é necessário instalar um relay Boobot no Coolify, abrir porta no roteador ou habilitar Funnel.

No host Windows, confira primeiro os serviços existentes para preservar encaminhamentos de outros aplicativos:

```powershell
tailscale status
tailscale serve status --json
tailscale serve --bg --tcp=6778 tcp://127.0.0.1:6778
```

No painel de conexões do Boobot host:

- Permitir conexão a este computador: ativado.
- Listener local: `127.0.0.1`, porta `6778`; com Serve, não é necessário habilitar a opção de listener em toda a rede.
- Endereço acessível pelo outro computador: `ws://IP-TAILSCALE-DO-HOST:6778/boobot`.
- Salvar antes de copiar novo pareamento.

No outro PC, copie o novo link ou use o pareamento anterior ainda válido com esse endereço no campo **Endereço alternativo**. O endereço deve ser o IP do host que executa os agentes. Não usar `127.0.0.1`, o IP do escritório ou um IP residencial da LAN que não tenha rota pela VPN.

O endereço usa `ws://` dentro da VPN. O Tailscale protege o transporte, e o Boobot mantém o canal criptografado e a autenticação por pareamento existentes. Não publicar esse endpoint na internet. O link contém uma credencial de controle do host; não registrar ou compartilhar em canais públicos.

Para remover somente esse encaminhamento, preservando os demais serviços do Tailscale:

```powershell
tailscale serve --tcp=6778 off
```

## Verificação

No PC cliente, a conferência de porta pode ser feita com:

```powershell
Test-NetConnection IP-TAILSCALE-DO-HOST -Port 6778
```

Porta acessível não comprova autenticação ou operação do Boobot. O aceite é conectar pelo Boobot, visualizar projetos do host e consultar dados remotos. Se a porta responder mas o pareamento falhar, conferir o link e a revogação; se a porta não responder, conferir Tailscale, políticas de acesso, Serve e o listener do host.

## Evidência local de 20/10/2026

O usuário confirmou `DESKTOP-TJNL4ON` como casa e `Usabit-NBK-006` como escritório. Tailscale estava ativo nos dois. O ping de casa para o escritório respondeu pelo DERP de São Paulo; isso demonstra alcance entre dispositivos, não uma conexão UDP direta.

Em casa, habilitado somente o encaminhamento TCP privado `6778` para `127.0.0.1:6778`. O host Boobot manteve seu listener em loopback e seu pareamento passou a anunciar `ws://100.117.39.59:6778/boobot`. Identidade e token existentes foram preservados; nenhuma credencial foi impressa ou persistida em evidência.

A verificação iniciada no próprio PC de casa, através do endereço Tailscale, autenticou o `HostClient` real, recebeu `v9:snapshot` com sete projetos e recusou uma credencial inválida. O script temporário está em `%TEMP%/boobot-tailscale-check-AgYPnc/verify.cjs`; ele compila o cliente do código existente e usa a credencial apenas em memória, preservando o clipboard anterior. Não modificou projetos ou conversas.

**Confirmado pelo usuário:** o Boobot do notebook do escritório conectou com o pareamento e o endereço alternativo corrigido e mostrou os projetos de casa. Isso valida conexão, autenticação e consulta remota entre os dois ambientes; não comprova execução de agentes, edição ou voz remota. Não houve implementação ou publicação do relay próprio, mudança de firewall, instalação adicional ou necessidade de novo instalador.

Referências: [conectar dispositivos](https://tailscale.com/docs/how-to/connect-to-devices) e [encaminhamento TCP com Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).
