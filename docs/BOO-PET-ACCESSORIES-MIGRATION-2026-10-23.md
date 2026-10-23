# Boobot — migração integral da coleção de acessórios (23/10/2026)

## Origem e preservação

O projeto `D:\projetos pessoais\boo-pet` continua intacto. Os arquivos de referência aprovados estão em `src/accessories.tsx`; a pasta `acessorios-descartados` não foi usada.

A arte original está preservada como vetor em `apps/desktop/src/renderer/src/features/app/BooPetAccessories.tsx`. Os acessórios exclusivos do Boobot foram **redesenhados no mesmo padrão visual**, em `BooPetExtraArt.tsx`, com costuras, gradientes e reflexos. `BooAccessories.tsx` agora é um wrapper único e não tem mais o desenho fixo antigo.

## Cobertura integral

- **16 opções de cabeça:** antena, chifres, boné curvo original do Boo Pet, boné de aba reta, boné para trás, gorro, bucket, cartola, chapéu de bruxa, fones, coroa, chapéu de festa, chapéu de chef, laço, flor e auréola
- **8 opções de rosto:** óculos comuns, óculos redondos, escuros, de coração, de estrela, monóculo, bigode e máscara de herói
- Todos os IDs de versões anteriores continuam aceitos por perfis salvos e ferramentas do workspace; todos aparecem no Boo Studio

## Encaixe único e desempenho

`ImportedBooPetAccessory` desenha tudo em coordenadas do Boo (240×200), adaptadas ao contorno real da silhueta. `boo-pet-geometry.ts` usa `BOO_BODY_PATHS` do Boobot, consulta largura do corpo na altura de apoio, ajusta escala e altura e aplica largura, altura, espaçamento e tamanho de olhos e boca.

O cache de contornos, limites e alturas por razão/silhueta evita recalcular amostras de curvas em toda renderização. Não se pode concluir equivalência pixel a pixel apenas a partir de um teste de coordenadas válidas.

## Portabilidade para o renderer Rive

`PoliAvatar` e `RiveBooAvatar` utilizam **a mesma coleção SVG** e o mesmo cálculo de encaixe, com os mesmos parâmetros de silhueta, largura, altura, olhos e boca. Na composição Rive, os vetores ficam no grupo de movimento do personagem (junto do canvas), sem animação independente do acessório. A sombra permanece fora do grupo móvel.

O arquivo binário `boo-rive.riv` contém as 12 silhuetas e a animação/estado do corpo; os acessórios continuam **overlays vetoriais SVG sincronizados**, **não** objetos nativos importados no artboard Rive. Essa distinção é importante: todos os acessórios **funcionam visualmente** no modo Rive, mas converter cada um em objeto nativo/rig Rive ainda exigiria outra etapa de autoria RML, comparações e controle de cores. O SVG continua sendo o padrão e o Rive é opt-in em Configurações.

## QA / reprodução

- `node scripts/preview-boo-pet-accessories.cjs`: gera a prancha de revisão de **todos os 24 acessórios** em `%TEMP%\boobot-imported-boo-pet-accessories.jpg`
- `BooAccessoryMatrix.test.tsx`: posiciona todas as opções nas 12 silhuetas, incluindo proporções modificadas, sem coordenadas inválidas
- `BooPetAccessories.test.tsx`, `PoliAvatar.test.tsx` e `RiveBooAvatar.test.tsx`: comprovam geometria, apresentação, persistência da seleção e aplicação da mesma coleção em SVG/Rive
- `node boo-rive/generate.cjs`, `rive boo-rive --verify`, `rive boo-rive --once`: regeneram e validam os 12 artboards; copiar `boo-rive/build/boo-rive.riv` para `src/renderer/public/boo-rive.riv`
- `node scripts/verify-rive-electron.cjs`: smoke real Electron com perfil descartável, Rive opt-in, sombra fixa, composição única e fallback SVG

## Pendências de aceitação visual

Antes de tornar o Rive padrão, validar lado a lado cap/beanie/hat/acessórios laterais em todos os formatos e tamanhos, clipping de chapéus altos em miniaturas, estados de movimento e reação, e CPU/GPU/memória para 1, 10 e 40 Boos. Portar o vetor para dentro do arquivo `.riv` é opcional para funcionamento mas **não está concluído** caso seja requisito explícito de autoria nativa Rive. Paletas individuais por acessório ainda não são configuráveis no estúdio.
