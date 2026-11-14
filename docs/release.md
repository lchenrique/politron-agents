# Release do Boobot: GitHub Releases, atualização automática e assinatura

Este guia cobre o que está configurado no repositório e os passos manuais de uma release do Windows. Nada aqui foi executado contra o GitHub: nenhuma release, tag ou publicação foi criada.

## O que está configurado

- `apps/desktop/electron-builder.yml` tem `publish.provider: github` apontando para `lchenrique/politron-agents`, com `releaseType: draft`. Uma publicação cria um rascunho de release, que precisa ser revisado e publicado à mão.
- `npm run dist:win` continua com `--publish never`. Gerar o instalador não envia nada ao GitHub.
- `apps/desktop/update-feed.json` é o que o app instalado lê para saber onde procurar atualizações:
  ```json
  { "stable": null, "beta": null, "github": { "owner": "lchenrique", "repo": "politron-agents" } }
  ```
  Um URL HTTPS em `stable` ou `beta` tem prioridade sobre o GitHub naquele canal (feed `generic`, descrito em `docs/auto-updates.md`). Sem URL, o canal usa as Releases do GitHub. Campos como token são ignorados.
- O app empacotado verifica 15 s depois de abrir e a cada 30 minutos, baixa em segundo plano e mostra o aviso "Boobot X está pronto para instalar". A instalação só acontece quando o usuário confirma em Configurações > Atualizações. Em `npm run dev` nada é verificado.
- Canal estável usa `latest.yml` da release mais recente. Canal beta aceita pré-releases e usa `beta.yml`.

## Impacto do repositório privado

O `electron-updater` lê as releases pelo endereço público do GitHub. Com `lchenrique/politron-agents` privado, essa leitura responde 404 e o app mostra em Configurações > Atualizações: "Não foi possível ler as Releases de lchenrique/politron-agents. O repositório precisa ser público...". O aviso de atualização pronta não aparece, porque nada é baixado.

O `electron-updater` aceita repositório privado com `private: true` e um `GH_TOKEN` no ambiente do app instalado. Isso não foi configurado de propósito: o token iria dentro de cada instalação e daria leitura de todo o código do repositório a qualquer pessoa com o instalador, além de cair no limite de requisições da API. O app sempre passa `private: false`.

Para a atualização funcionar de verdade, escolha uma das opções:

1. **Repositório público só de releases (recomendado).** Crie, por exemplo, `lchenrique/boobot-releases` público e vazio. Troque `repo` em `publish` (`electron-builder.yml`) e em `github` (`update-feed.json`) para ele. O código continua privado; só instaladores e manifestos ficam públicos.
2. **Tornar `politron-agents` público.** Nenhuma mudança de configuração.
3. **Host HTTPS próprio.** Preencha `stable`/`beta` em `update-feed.json` e siga `docs/auto-updates.md` com `npm run stage:update`.

O token para **publicar** (`GH_TOKEN` com permissão de escrita em releases) fica só na máquina ou no CI que gera a release, nunca no app.

## Assinatura de código

Sem certificado o build sai sem assinatura, como hoje, e o Windows SmartScreen avisa ao instalar. O `electron-builder.yml` já declara `win.signtoolOptions` com SHA-256 e carimbo de tempo RFC 3161; a assinatura só acontece quando há certificado no ambiente.

### Certificado `.pfx` (OV ou EV exportável) com signtool

No PowerShell, antes de `npm run dist:win`:

```powershell
$env:CSC_LINK = "C:\caminho\certificado.pfx"   # ou o conteúdo em base64
$env:CSC_KEY_PASSWORD = "senha-do-pfx"
npm run dist:win
```

`WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD` também valem e têm prioridade no Windows. Não grave essas variáveis em arquivos versionados. Certificado em token USB/HSM (EV moderno) usa `win.signtoolOptions.certificateSubjectName` ou `certificateSha1` com o token conectado, no lugar de `CSC_LINK`.

### Azure Trusted Signing

1. Crie a conta de Trusted Signing e o perfil de certificado no Azure, e um app registration com o papel "Trusted Signing Certificate Profile Signer".
2. Em `electron-builder.yml`, troque `signtoolOptions` por (as duas opções não podem coexistir):
   ```yaml
   win:
     azureSignOptions:
       publisherName: "Nome exato do titular do certificado"
       endpoint: https://eus.codesigning.azure.net
       codeSigningAccountName: nome-da-conta
       certificateProfileName: nome-do-perfil
   ```
3. Exporte `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` e `AZURE_CLIENT_SECRET` e rode `npm run dist:win`. O electron-builder instala o módulo `TrustedSigning` do PowerShell se faltar.

### Verificação da assinatura nas atualizações

Quando o build é assinado, o electron-builder grava o `publisherName` no `app-update.yml` do pacote e o `electron-updater` recusa instaladores de atualização assinados por outro titular. Mantenha o mesmo titular entre releases. A verificação vale a partir da primeira versão assinada instalada: uma versão sem assinatura não tem `publisherName` e aceita a atualização para a primeira assinada normalmente.

Para conferir um instalador: `Get-AuthenticodeSignature .\dist\Boobot-Setup-<versão>-x64.exe` deve mostrar `Status: Valid`.

## Passo a passo de uma release

1. Ajuste `version` em `apps/desktop/package.json` (`0.1.0-beta.13` vai para o canal beta, `0.1.0` para o estável).
2. Configure o certificado (seção acima), se houver.
3. `npm run typecheck`, `npx vitest run` e `npm run dist:win` em `apps/desktop`.
4. Confira em `dist/`: `Boobot-Setup-<versão>-x64.exe`, `.blockmap` e `latest.yml` ou `beta.yml` com a versão e o `sha512`.
5. Publique no GitHub, com `GH_TOKEN` de escrita no ambiente:
   ```powershell
   npx electron-builder --win nsis --x64 --prepackaged dist\win-unpacked --publish always
   ```
   Isso cria um **rascunho** com o instalador, o `.blockmap` e o manifesto. Também é possível criar a release à mão e anexar esses três arquivos.
6. No GitHub, revise o rascunho, marque "pre-release" se for beta e publique. A tag é criada nesse momento.
7. Em uma máquina com a versão anterior instalada, use "Procurar atualizações" e confirme: disponível, download, aviso, confirmação, reinício e nova versão.

## Limites conhecidos

- Atualização real não foi testada: o repositório é privado e não há release publicada.
- A assinatura não foi testada, porque não há certificado.
- Não há CI de release, rollout gradual nem rollback automático.
