# Boobot — Rive incremental e acessórios (23/10/2026)

## Entregue
- Runtime `@rive-app/react-canvas` com WASM local para Electron (sem CDN).
- Fonte reproduzível em `apps/desktop/boo-rive/scene.rml`, gerada das 12 silhuetas existentes por `generate.cjs`.
- Artefato `apps/desktop/src/renderer/public/boo-rive.riv` e `rive*.wasm` para empacotamento.
- Máquina de estados `BooMotion` e animação de piscar no arquivo Rive.
- Model `BooColors` com gradiente, olhos, bochechas, boca sorrindo e boca falando configuráveis pelo React.
- Importação lazy, fallback SVG preservado quando carregamento falha, avatar é pequeno ou personalização ainda não tem binding equivalente.
- Acessórios de cabeça/rosto extraídos e redesenhados em `BooAccessories.tsx`, com volume, detalhes e reflexos adicionais.
- Acessórios continuam vetores SVG sobre o Rive nos retratos compatíveis, preservando personalização e proporções.

## Contrato atual do renderer

`PoliAvatar` é o ponto único de entrada. Rive é habilitado apenas em tamanho >=80, com olhos e proporções padrão e sem algumas personalizações de geometria. Personalizações não cobertas, estados expressivos (dizzy, love, boop, happy, pensamento/código/concluído) e miniaturas usam SVG. A reação no hover volta temporariamente para SVG. Isso é uma migração inicial, **não uma conversão completa da animação de todos os avatares**.

Não há comprovação de que o Rive é mais rápido: o benchmark anterior de 40 Boos era de SVG/CSS; comparar antes de habilitar Rive em listas.

O arquivo `.riv` não tem dependências de scripts assinados. A geração usou a CLI oficial Rive 1.7.0 e `--once`, que validou 12 artboards, zero warnings. Mantemos a fonte RML versionada e o arquivo binário compilado.

## Regeneração do arquivo
No Windows, com a CLI oficial Rive instalada em `%USERPROFILE%\.rive\bin\rive.exe`:

```powershell
cd 'apps/desktop'
node .\boo-rive\generate.cjs
& "$env:USERPROFILE\.rive\bin\rive.exe" boo-rive --once
Copy-Item .\boo-rive\build\boo-rive.riv .\src\renderer\public\boo-rive.riv -Force
```

O WASM é copiado da versão do pacote `@rive-app/canvas`:

```powershell
Copy-Item .\node_modules\@rive-app\canvas\rive.wasm .\src\renderer\public\rive.wasm -Force
Copy-Item .\node_modules\@rive-app\canvas\rive_fallback.wasm .\src\renderer\public\rive_fallback.wasm -Force
```

## QA e próximos passos
- Testar visualmente Rive/React em um Electron instalado, com paletas claras/escuras, acessórios e as 12 silhuetas.
- Medir 1/10/40 avatares (CPU, memória, GPU e frames) antes de ampliar ativação.
- Migrar olhos com tamanhos e distâncias personalizados, forma do corpo, carinhas de pensamento/código/concluído e reações ao carinho para state machine, mantendo qualidade visual.
- Considerar consolidar todos os acessórios como camadas no Rive somente após equivalência visual — atualmente overlays SVG são intencionais.
- Não publicar release antes da validação no Electron empacotado.

## Evidências medidas
- `rive boo-rive --once`: 12 artboards; build final 17.875 bytes, zero erros/avisos. Movimento flutuante e piscar são animações do próprio Rive.
- Smoke Electron no arquivo Rive inicial: 2 avatares, 1 Rive ativo, 1 canvas, 0 falhas HTTP/arquivo e 0 erros no renderer (perfil descartável).
- Benchmark misto de 40 agentes + 180 mensagens/36 changed, com 1 Boo grande elegível ao Rive: as amostras visíveis tiveram p95 de ~33,3 ms no primeiro ciclo e ~16,8 ms no segundo; amostras ocultas ~16,7 ms. Variação exige repetição, não comprovando ganho de FPS. Evidência: %TEMP%\boobot-perf-rive-phase1-ktlwEZ\metrics.json.
- Os arquivos atuais da CLI criados com --once não são assinados; revisar requisitos de assinatura, distribuição e licença do Rive antes de publicar um instalador.

## Compatibilidade dos testes
Em `import.meta.env.MODE === 'test'`, `PoliAvatar` utiliza somente SVG: `jsdom` não renderiza WebAssembly/Canvas do Rive e o carregamento fazia testes de voz falharem por timeout. O Rive é coberto por `node scripts/verify-rive-electron.cjs` na aplicação Electron real; os testes unitários mantêm as asserts visuais e de interação dos acessórios em SVG.
