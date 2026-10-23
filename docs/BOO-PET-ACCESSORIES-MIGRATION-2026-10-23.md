# Boobot — acessórios recuperados do Boo Pet

Data: 23/10/2026.

## Origem

O projeto original continua em `D:\projetos pessoais\boo-pet`, branch `master`, commit consultado `e773ddd`. A coleção aprovada de vetores fica em `src/accessories.tsx`; **não** usamos os arquivos de `acessorios-descartados` porque são descartes do processo de criação. O projeto original não foi modificado.

O desenho original foi copiado, sem rasterização, para `apps/desktop/src/renderer/src/features/app/BooPetAccessories.tsx`, com dependências locais `boo-pet-color.ts`, `boo-pet-looks.ts` e `boo-pet-geometry.ts`. Este último usa as **silhuetas atuais do Boobot** em `boo-appearance.ts`, não versões antigas do Boo Pet, e tem cache de contornos/medidas para evitar trabalho repetitivo.

## Integração

`BooAccessories.tsx` roteia itens recuperados para a coleção original, mantendo acessórios exclusivos do Boobot e os bonés de aba reta e virado para trás. `PoliAvatar.tsx` posiciona acessórios importados **fora** da escala do corpo, com cálculo específico de largura/altura/forma; os acessórios antigos permanecem em sua hierarquia de escala anterior. `RiveBooAvatar.tsx` compartilha a coleção visual durante o modo experimental Rive.

Modelos de cabeça usados da coleção: boné, gorro, cartola, chapéu de bruxa, coroa, chapéu de festa, chapéu de chef, laço, flor, auréola.

Modelos de rosto usados da coleção: óculos redondos, óculos escuros, óculos de coração, óculos de estrela, monóculo, bigode, máscara de herói.

Os dez itens que não existiam antes foram incluídos no seletor do Boo Studio, tipos compartilhados e nas validações de perfil, store e ferramentas do workspace. IDs e configurações antigas continuam aceitos. Cores padrão da coleção estão preservadas; controles individuais de cores por acessório ainda não foram portados.

## Visual e validação

A montagem visual é reproduzível com `node scripts/preview-boo-pet-accessories.cjs`, que gera `%TEMP%\boobot-imported-boo-pet-accessories.jpg` com a arte da coleção importada em silhuetas diferentes. Inclui desenho e gradientes da origem. Os testes `BooPetAccessories.test.tsx` cobrem disponibilidade, adaptação ao formato, convivência com corpo SVG e opções do Studio; `PoliAvatar.test.tsx` e `RiveBooAvatar.test.tsx` verificam compatibilidade.

A qualidade aprovada é a referência SVG. Não migrar estes acessórios para PNG, não copiar a pasta descartada e não alterar os corpos para acomodar chapéus. Uma eventual exportação Rive nativa requer rig/âncoras equivalentes.

## Pendências

Validar o uso com alguns agentes reais no Electron instalado, especialmente escalas extremas, chapéus altos em avatares pequenos e possível clipping em listas. Considerar controles de cores por parte e uma comparação visual das duas variantes exclusivas de boné antes de alterar seus desenhos.
