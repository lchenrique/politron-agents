# Site Boobot

Landing page estática em português do Brasil, sem framework ou build. Os recursos são apresentados com ilustrações explicativas e a página não anuncia download público nem acesso aberto à beta.

## Desenvolvimento

Abra `site/index.html` no navegador ou execute `python -m http.server 4173 --directory site` a partir da raiz do repositório. Para deploy estático, configure o diretório de publicação como `site` (sem comando de build). Para GitHub Pages pode usar um workflow de publicação dessa pasta após avaliar visibilidade e licença.

O logo vetorial vive em `site/assets/boobot-logo.svg`. Atualize o texto de beta quando existir um instalador público assinado e uma página de download estável.
