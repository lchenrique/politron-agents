# Boobot — evolução da animação Rive e preparação de PWA

Data: 23/10/2026. Este registro distingue entregas concluídas de pendências.

## Renderers e aparência

- O SVG/CSS de `PoliAvatar.tsx` e `PoliAvatar.css` continua sendo a referência aprovada e o renderer padrão.
- A preferência experimental Rive continua opt-in em Configurações → Geral. A migração não está visualmente concluída.
- O arquivo Rive compilado vem de `apps/desktop/boo-rive/generate.cjs`. Rive gerencia internamente os olhos/piscar, o gradiente do corpo e a aura pulsante.
- Agora o canvas Rive e os acessórios SVG ficam juntos em `.poli-avatar__rive-lean` dentro de `.poli-avatar__rive-float`. Uma única curva de flutuação CSS usa `--poli-speed` e `--poli-amplitude`, que já são personalizáveis por Boo. Os acessórios não têm mais animação própria dessincronizada.
- A sombra do chão fica em `.poli-avatar__rive-shadow`, irmã do grupo móvel, usando a mesma elipse e opacidade do SVG original. A sombra foi retirada do arquivo Rive, para que não flutue com o corpo.
- Nos estados `thinking`, `coding` e `done`, o corpo Rive fica montado e os mesmos detalhes de boca, símbolos e mão digitando são desenhados como overlay SVG sobre o corpo, sincronizados com ele. O sorriso Rive é oculto nesses estados.

### Limites atuais

- Estados de hover e reações físicas/carinhos ainda voltam ao SVG; isso continua intencional.
- Os acessórios ainda não são vetores importados diretamente na hierarquia do Rive; compartilham movimento CSS, mas não rigs nativos.
- A aparência do gradiente, brilho e posicionamento em todas as 12 silhuetas precisa de aprovação lado a lado com o SVG e benchmark de várias instâncias antes de tornar Rive padrão.
- O WebAssembly é local ao Electron. Não incluímos Rive automaticamente no cliente PWA.

## Hosts e PWA

- Criado contrato puro `apps/desktop/src/shared/pwa-host-policy.ts`, com capacidades `read`, `chat`, `approvals`, `files:read` e `files:write`.
- `HostRpc.dispatchFromPwa()` aplica essa política antes de encaminhar métodos; `HostRpc.dispatch()` continua para os clientes Electron existentes.
- `pwa-policy.test.ts` garante que uma sessão somente leitura não envia mensagens, aprova operações ou edita arquivos, e que operações fora do contrato continuam proibidas mesmo com todas as capacidades.
- **Ainda não existe sessão web autenticada, gateway de navegador, PWA instalável ou acesso por celular.** O servidor atual continua recusando WebSockets com Origin de navegador, como proteção. Implementar autorização de sessão temporária, TLS/WSS e UI antes de disponibilizar o acesso.
- Seguir `docs/PLANO-PWA-HOSTS-2026-10-23.md`, sem expor o listener de hosts diretamente na internet.

## Validação

- Rive CLI: 12 silhuetas compiladas sem erros ou avisos.
- TypeScript e testes focados de avatar/host passaram após as alterações.
- `scripts/verify-rive-electron.cjs` foi reforçado para exigir sombra fora do grupo móvel e transformação comum; executar após build atualizado para validar no Electron compilado.
- Não houve novo instalador ou publicação remota nesta etapa.

## Próximos critérios de aceite

Capturas SVG/Rive equivalentes por silhueta e acessório, animação suave sem deslocamento de sombra, todos os estados, benchmark 1/10/40 avatares e teste no Electron instalado. Para PWA, implementar gateway HTTPS/WSS com sessão temporária por dispositivo, seleção do host e UI de leitura antes de habilitar escrita/aprovações.
