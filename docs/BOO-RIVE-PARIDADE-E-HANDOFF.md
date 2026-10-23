# Boobot — paridade visual SVG / Rive e repasse técnico

Data: 23/10/2026. **Não declarar a migração Rive concluída.**

## Decisão de produto
O SVG/CSS original é a referência visual e o renderer de produção. O Rive foi deixado como preview **desligado por padrão** em Configurações → Geral → Animação dos Boos. Isso não é um recuo no objetivo de animação, mas uma proteção da qualidade até haver comprovação.

## Onde mexer
- Referência visual e estados: `apps/desktop/src/renderer/src/features/app/PoliAvatar.tsx`, `PoliAvatar.css`, `boo-appearance.ts`.
- Acessórios vetoriais: `BooAccessories.tsx`, `BooCaps.tsx` (curva, reta, para trás).
- Fonte Rive determinística: `apps/desktop/boo-rive/generate.cjs` → `scene.rml` → `src/renderer/public/boo-rive.riv`, compilado com a CLI Rive instalada.
- Runtime: `RiveBooAvatar.tsx`, `booRendererPreference.ts`. Os dados de cor, olhar e expressões são enviados por ViewModel.
- Testes: `src/renderer/src/features/app/PoliAvatar.test.tsx`, `SettingsPage.test.tsx`, `scripts/verify-rive-electron.cjs`, `scripts/preview-boo-caps.cjs`.

## O que foi melhorado agora
- Gradiente radial de brilho ambiente no Rive com ligação por cor, reflexo superior reposicionado para as coordenadas SVG e sombra do chão 108×18, com cor do Boo e opacidade .15.
- Aura pulsan­te em camada e timeline próprios da máquina de estados. Piscada centralizada no rosto e acompanhamento do olhar já feitos no incremento anterior.
- Acessórios de cabeça e rosto em SVG overlay Rive acompanham aproximada­mente o deslocamento vertical do mascote.
- Bonés reconstruídos como cúpulas com painéis de tecido e abas tridimensionais diferenciadas, validadas em captura local JPEG.
- Preferência SVG/Rive é local à interface, reversível, sem migrar perfis nem sobrescrever permissões.

## Limitações que **ainda impedem declarar paridade**
1. O SVG usa curvas CSS de flutuação com `pitsSpeed` e `pitsAmplitude` individualizados; o Rive ainda tem timeline fixa de deslocamento 4 unidades em 276 frames. Para ficar igual, os ajustes devem virar bindings ou controles reais de timeline.
2. Os acessórios ainda são elementos SVG sobrepostos, não objetos articulados na mesma hierarquia Rive. A sincronização via CSS é aproximação; o ideal é rig por bone/transform compartilhado. Não descolar boné e olhos.
3. Rive exibe apenas idle/falando/piscar/olhar. Reações a carinho, happy, coding, thinking, sleep, done, dizzy, boop e surprised ainda alternam para SVG; converter estas expressões antes de selecionar Rive como padrão.
4. Mesmo com tamanho/posição ajustados, os gradientes nativos Rive não foram aprovados visualmente lado a lado com o SVG em todas as 12 silhuetas e paletas.
5. Benchmark Rive 1, 10, 40 instâncias reais e uso de GPU/CPU/memória ainda falta. O benchmark antigo de 40 agentes tinha apenas um canvas Rive elegível — não comprova escalabilidade.

## Critério de aceite para outro agente ou continuidade
- Capturas da MESMA silhueta, cor, acessórios, tamanho e estado em SVG e Rive, quadro estático e vídeo, nos tamanhos 80, 160, 240 px. Não retocar a referência SVG para combinar com o Rive.
- Comparar aura, sombra, reflexo, olhos, piscadas, expressão, movimento, velocidade e amplitude com tolerância visual conservadora.
- Todas as 12 silhuetas e os bonés não podem deformar, atravessar rosto ou descolar ao flutuar.
- Todos os 10 estados/re­ações devem ter transição definida, respeitando reduced motion e política de visibilidade.
- Testar 1/10/40/100 avatares, incluindo consumo do WASM local e alternância de tema/troca de host.
- Rodar `node boo-rive/generate.cjs`, `rive boo-rive --verify`, `rive boo-rive --once`, `npm run typecheck`, testes Vitest focados, build e smoke Electron.
- Só após aprovação visual explícita habilitar Rive por padrão, sem apagar fallback SVG antes de haver ganho verificável.

## Plano de PWA
Vide `docs/PLANO-PWA-HOSTS-2026-10-23.md`; PWA ainda não implementada. O desktop host e Tailscale são a base. Não transportar segredos de pareamento, filesystem nem execução de agente para o service worker.
