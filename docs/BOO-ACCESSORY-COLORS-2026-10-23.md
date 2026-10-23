# Boo Studio — posicionamento e cores dos acessórios

Em 23/10/2026, após a unificação da arte SVG, o editor passou a permitir a personalização das partes colorizáveis de cada acessório, com comportamento idêntico no SVG padrão e no overlay vetorial do Rive experimental.

## O que mudou

- Chapéu de bruxa: `lift: 8` unidades do artboard (para cima), relativo à altura da silhueta. Fones: `lift: 7`. O cálculo da âncora continua adaptativo e considera largura e altura do corpo.
- Selecionar um item de cabeça ou rosto no Boo Studio mostra as cores editáveis da peça. Por exemplo, o boné tem copa, aba e detalhes; os óculos têm armação e lentes. A prévia reage às alterações.
- As escolhas ficam no registro **do Boo** em `pitsAccessoryColors`, um mapa entre ID do acessório e cores por componente (`#RRGGBB`). Trocar de acessório não perde a paleta anterior. **Restaurar cores** afeta só o acessório selecionado; **Restaurar aparência** zera todas as paletas.
- As cores são renderizadas pelo mesmo componente `BooPetAccessories.tsx` tanto no SVG quanto nos SVGs sobrepostos ao canvas Rive. Isso não converte os acessórios em rigs nativos do `.riv`.
- O backend persiste as cores na própria entidade do agente, valida IDs, quantidade e hexadecimal antes de salvar, e permite autoedição de paletas sem alterar permissões ou configurações sensíveis.

## Arquivos

`src/shared/boo-accessory-colors.ts` centraliza a validação, `src/renderer/src/features/app/BooAccessoryColorEditor.tsx` desenha os controles, `PoliCustomizer.tsx` os exibe, `BooAccessories.tsx` passa a paleta para os vetores e `PoliAvatar.tsx` / `RiveBooAvatar.tsx` propagam a preferência. `src/main/v9/store.ts` persiste os valores e `boo-profile.ts` valida a autoedição.

## Verificações

Testes automatizados cobrem mudança de cores por parte, paletas distintas para cabeça e rosto, restauração isolada, cores efetivas nos vetores, encaixe do chapéu e do fone em quatro silhuetas, segurança do payload, persistência após reabrir SQLite e equivalência do overlay Rive. O SVG permanece o padrão e o Rive continua experimental.
