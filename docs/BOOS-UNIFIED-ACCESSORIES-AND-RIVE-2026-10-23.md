# Boobot — substituição integral dos acessórios e atualização do Rive

## Origem e escopo

O código de acessórios de `D:\projetos pessoais\boo-pet\src\accessories.tsx` é a referência visual aprovada. O projeto Boo Pet original permanece intacto. Antes desta etapa o Boobot ainda renderizava parte da coleção local antiga (`BooCaps.tsx`, formas fixas de antenas, chifres, headphones, bucket e óculos). A implementação atual usa **somente o sistema de arte vetorial e âncoras do Boo Pet** para os itens ativos.

São **16 opções de cabeça** e **8 de rosto**, sem contar `none`. A coleção preservada do Boo Pet continua em `BooPetAccessories.tsx`; os desenhos complementares, agora com o mesmo padrão visual (gradientes, costuras, contornos, volume e detalhes), estão em `BooPetExtraArt.tsx`. `BooAccessories.tsx` é só a ponte de seleção e passa forma, proporção e características do rosto ao sistema único. Não há mais seleção entre componentes de arte antigos.

## Encaixe na cabeça e rosto

- `boo-pet-geometry.ts` lê as **12 silhuetas oficiais do Boobot**, amostra suas curvas e determina largura/altura do contorno com cache de medidas.
- Chapéus utilizam âncora específica por peça e proporção relativa ao corpo; não são simplesmente ampliados com a escala do corpo.
- Itens de rosto utilizam posição real dos olhos, espaçamento, tamanho dos olhos, posição da boca e proporções do Boo.
- O mesmo componente renderiza os acessórios no SVG padrão e como overlay sincronizado com o personagem no Rive experimental; gradientes têm IDs exclusivos por instância.

## Integração Rive

O arquivo `boo-rive.riv` mantém as 12 formas originais e os componentes nativos de corpo, gradiente, olhos, piscada, aura e boca. Foram adicionados bindings `eyeOpacity` e `auraVisibility` no ViewModel para respeitar olhos personalizados e a opção de aura. O componente `RiveBooAvatar.tsx` aceita também proporções do corpo, tamanho/espaçamento dos olhos, tamanho da boca, blush, aura e estado atual. `RiveBooEffects.tsx` reproduz expressões de trabalho, pensamento, conclusão, humor e reações como SVG vetorial sobre o mesmo canvas Rive, enquanto os acessórios usam a coleção compartilhada.

**Limitação explícita:** embora os acessórios e reações estejam disponíveis **no renderer Rive**, suas formas continuam como SVG sobreposto e não como formas nativas dentro do binário `.riv`. Isso preserva integralmente a arte e o posicionamento, mas não configura uma migração nativa completa de rigs para o editor Rive. Não ativar Rive como padrão antes de comparar qualidade, movimento e consumo de GPU com o SVG. O SVG continua padrão.

## Verificações

- `BooAccessoryMatrix.test.tsx` testa presença de todos os itens, os encaixes das 12 silhuetas, proporções e identificadores únicos dos gradientes.
- `RiveBooAvatar.test.tsx`, `BooPetAccessories.test.tsx` e `PoliAvatar.test.tsx` verificam a integração e os estados.
- O painel visual com os 24 acessórios pode ser regenerado com `node apps/desktop/scripts/preview-boo-pet-accessories.cjs`; saída em `%TEMP%\boobot-imported-boo-pet-accessories.jpg`.
- O Rive pode ser recompilado pelo fluxo `node boo-rive/generate.cjs` → `rive boo-rive --verify` → `rive boo-rive --once` → cópia de `boo-rive.riv` à pasta public.

## Pendências de aceitação visual e performance

Aprovar com capturas/vídeos lado a lado as 12 silhuetas com acessórios altos e largos, minitamanhos, olhos customizados, expressões, a iluminação, sombra e movimento; executar benchmark com 1/10/40 Boos Rive reais. Para um port **100% nativo** ao arquivo Rive, converter os SVGs em objetos/artboards de Rive e adicionar rigs/âncoras, preservando uma única fonte de arte. Isso não está concluído nesta etapa e não deve ser divulgado como pronto.
