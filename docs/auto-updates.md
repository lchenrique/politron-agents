# Atualizações do Boobot (modelo inspirado no Paseo)

## O que existe
- Verificação automática de versões **empacotadas** após iniciar o app e a cada 30 minutos.
- Botão manual em Configurações > Atualizações; canal estável/beta persistido por usuário.
- Download em segundo plano, progresso, notas da versão, aviso quando pronto e confirmação explícita antes de reiniciar.
- Revalidação do manifesto antes de instalar: uma atualização antiga não substitui silenciosamente outra mais recente.
- No modo `npm run dev`, informa que é uma compilação de desenvolvimento e não procura/instala atualizações.
- Quando o feed ainda não foi configurado, o app não tenta acessar GitHub privado e informa a pendência.

## Por que usar feed separado
As releases do GitHub são lidas sem token, então o repositório configurado em `update-feed.json` precisa ser público (veja `docs/release.md`). Não colocar token pessoal do GitHub no instalador, renderer, repositório público ou URL de atualização.

Publicar **somente os arquivos compilados** em bucket/CDN HTTPS público, por exemplo:
- `https://SEU-DOMINIO/boobot/stable/latest.yml` e o instalador `.exe` correspondente (canal estável)
- `https://SEU-DOMINIO/boobot/beta/beta.yml` e o instalador `.exe` correspondente (beta)

O arquivo `update-feed.json` na raiz do pacote contém apenas os dois URLs HTTPS públicos (sem token):
```json
{
  "stable": "https://SEU-DOMINIO/boobot/stable",
  "beta": "https://SEU-DOMINIO/boobot/beta"
}
```
Substitua `SEU-DOMINIO` por um host real ANTES da compilação de uma release. O `electron-builder` inclui o arquivo como `resources/update-feed.json`. O app só lê esse recurso empacotado e rejeita URLs HTTP, com login, query ou fragment.

## Publicação Windows
1. Defina a versão em `package.json` (e mantenha release notes adequadas). Faça o build e teste uma instalação limpa.
2. Preencha `update-feed.json` com feeds HTTPS reais.
3. Execute `npm run dist:win` para gerar o instalador NSIS e os manifests no `dist/`. **Não publique sem inspecionar as assinaturas, a versão e os hashes.**
4. Rode `npm run stage:update -- beta` (ou `-- stable`): o script valida versão, manifesto e instalador, e coloca os arquivos em `dist/update-staging/<canal>/`. Publique no diretório público do canal o `.exe` e eventuais `.blockmap`. O manifesto `latest.yml` ou `beta.yml` deve ser o **último arquivo** publicado, após todos os binários estarem disponíveis, para não anunciar uma atualização incompleta.
5. Instale uma versão anterior em ambiente de teste e confirme: atualização disponível → download → aviso → confirmação → fechamento → nova versão.
6. Assine o instalador com certificado confiável antes da distribuição pública. Preserve o mesmo certificado/identidade entre releases.

O `electron-builder.yml` agora publica em GitHub Releases (`docs/release.md`). A aplicação continua usando só o que está em `update-feed.json`: um URL HTTPS do canal tem prioridade; sem ele, usa o bloco `github` (Releases públicas, sem token).

## Limites em relação ao Paseo
O Paseo usa rollout progressivo, controle de instalação no encerramento, validação de manifests e pipeline de publicação automatizada. A primeira versão do Boobot implementa um fluxo mais simples: não há rollout percentual, assinatura automatizada, CI de upload ou rollback. Esses itens dependem do serviço de distribuição e da política de releases.

**A interface e a infraestrutura local estão implementadas, mas atualizações reais ainda não são entregues enquanto não existir um feed HTTPS publicado.** Testes unitários não substituem o teste de dois instaladores assinados em Windows.
