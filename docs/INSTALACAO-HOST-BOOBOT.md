# Instalação privada do Boobot em dois computadores

Status: preparação de beta local Windows x64, não lançamento público. O nome do projeto continua `politron`; o produto instalado chama-se `Boobot`. O instalador não é assinado digitalmente, não há atualização automática e a licença de distribuição pública ainda não foi decidida.

## 1. Gerar o executável e o instalador

Na pasta `apps/desktop`:

```powershell
npm ci
npm run dist:win
```

A configuração em `electron-builder.yml` cria o instalador NSIS em `apps/desktop/dist/Boobot-Setup-0.1.0-beta.1-x64.exe`. O pacote extraído de teste fica em `dist/win-unpacked/Boobot.exe`. Não envie o repositório completo nem arquivos `.env` para o outro PC. Para repetir só o empacotamento após um build já feito, execute `npx electron-builder --win nsis --x64 --publish never`.

A versão é de teste interno. Antes de divulgação pública, validar assinatura digital, ícone definitivo, direitos das dependências e recursos incorporados, compatibilidade nativa e antivírus. O código não deve usar os dados reais durante testes automatizados: `BOOBOT_E2E_USER_DATA_DIR` seleciona somente um perfil abaixo de `%TEMP%`.

## 2. Configurar o PC host (por exemplo, PC de casa)

1. Instale e abra o Boobot. No host estão os projetos, arquivos, CLIs de IA, credenciais, modelos e ambientes de execução. Não é necessário duplicá-los no cliente.
2. Em Configurações → Conexões, habilite **Permitir conexão a este computador**. Para rede local/VPN, marque **Aceitar pela rede local ou VPN**.
3. Configure a porta (por padrão `6778`) e o endereço público **na VPN ou LAN**, por exemplo `ws://100.x.y.z:6778/boobot`. Para túnel SSH, mantenha o host escutando em `127.0.0.1`.
4. Autorize a conexão de entrada no firewall **somente na interface/rede privada ou VPN necessária**; não exponha a porta diretamente na internet pública.
5. Clique **Copiar pareamento** e transfira o link ao outro PC por um meio privado. Ele contém um segredo que concede acesso remoto. Use **Revogar conexões** se o link vazar ou perder o controle do outro PC.
6. Deixe o Boobot executando, inclusive na bandeja, e impeça que o PC entre em suspensão durante as tarefas. O host não funciona depois de sair do programa, encerrar a sessão Windows ou desligar o computador.

## 3. Conectar o segundo PC

1. Instale o mesmo instalador Boobot no PC cliente e garanta alcance TCP ao host pela LAN/VPN.
2. Abra **Selecionar host** no rodapé da barra lateral → **Adicionar host**.
3. Cole o link de pareamento, atribua um nome (opcional) e, se necessário, informe o endereço `ws://IP-DA-VPN:6778/boobot`. Para SSH, configure previamente chave e known_hosts no OpenSSH e preencha o campo do túnel.
4. Conecte. O cliente deve mostrar os projetos **do host**, não os próprios. Abra um projeto de teste e verifique leitura, edição/aprovação e execução com agent runtime configurado no host.
5. Simule uma queda de conexão e reconecte. Com host indisponível, o cliente **não deve executar comandos ou editar projetos localmente como fallback**. Verifique no estado do host se a tarefa foi concluída antes de reenviar.

## 4. Estado e limitações

- Transporte WebSocket com criptografia de canal do pacote `@getpaseo/relay` e autenticação de pareamento, revogação de token e atualização do estado após reconexão.
- Rede local/VPN e túnel SSH disponíveis; relay público ou autohospedado de encaminhamento **não implementado**. Para usar fora da mesma rede sem abrir porta pública, prefira uma VPN como Tailscale ou um túnel OpenSSH.
- Voz em tempo real e terminal interativo são locais e não têm todos os controles transportados; recursos remotos não compatíveis são bloqueados.
- A conexão criptografada não torna o terminal um sandbox; comandos aprovados no host ainda têm acesso aos recursos permitidos pelo usuário do Windows.
- A navegação por agentes com Playwright pode exigir instalação do Chromium no host. CLIs de IA, dependências de terceiros e credenciais não são fornecidos pelo instalador.
- Pacote usa temporariamente `npmRebuild: false` porque a recompilação de `node-pty` com `node-gyp` falha quando o diretório de origem contém espaços. Isso exige teste real do executável e do terminal nativo antes de distribuir.
- Não há teste entre dois PCs físicos ainda. `npm run test:hosts:electron` passou com duas instâncias isoladas. O teste adicional com `BOOBOT_TEST_PACKAGED_CLIENT=1` também passou, conectando um cliente **já empacotado** ao host Electron de desenvolvimento (pareamento, escrita remota, desconexão, reconexão e separação dos dados). O smoke da aplicação empacotada passou com perfil temporário isolado e sem erros de JavaScript.

## 5. Verificações

```powershell
npm run typecheck
npx vitest run src/main/hosts/transport.test.ts src/main/hosts/manager.test.ts src/renderer/src/features/hosts/HostSelector.test.tsx --maxWorkers=1
npm run test:hosts:electron
node scripts/verify-packaged-smoke.cjs
$env:BOOBOT_TEST_PACKAGED_CLIENT = '1'
npm run test:hosts:electron
Remove-Item Env:BOOBOT_TEST_PACKAGED_CLIENT
```

O script com `BOOBOT_TEST_PACKAGED_CLIENT` usa um cliente **empacotado** e o host Electron de desenvolvimento, com perfis descartáveis. Teste uma instalação NSIS no segundo PC apenas depois das verificações locais, com backups dos projetos e dados.
