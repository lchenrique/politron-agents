# Boobot — medição do renderer (22/10/2026)

## Objetivo

Medir, no Electron real e em perfil temporário, o custo de manter 40 avatares na interface durante streaming de mensagens, e testar um ajuste CSS pequeno sem remover detalhes ou animações do Boo.

## Cenário reproduzível

- Windows, Electron do repositório local; build de produção via `npm run build`.
- Script: `node scripts/verify-renderer-performance.cjs`.
- 40 agentes, uma conversa, painel Mascote aberto, 180 eventos de texto e 36 `changed` por amostra, intervalos de 33 ms.
- Ordem de amostras: avatares visíveis, ocultos, ocultos, visíveis. `visibility:hidden` preserva layout; no modo oculto a animação dos avatares também é pausada.
- Perfis e evidências locais: `%TEMP%\boobot-perf-beta2-baseline-gQXR5Q\metrics.json` e `%TEMP%\boobot-perf-beta2-css-contain-S37Wr9\metrics.json`.
- Versão inicial: commit `08bf174`. Experimento: `.poli-avatar { contain: layout style; }`, mantendo o desenho SVG existente.

## Medições (média das duas amostras com avatares visíveis)

| Métrica | Antes | Com contain | Diferença |
| --- | ---: | ---: | ---: |
| CPU TaskDuration (ms) | 5.202 | 4.761 | -8,5% |
| LayoutDuration (ms) | 345,3 | 308,8 | -10,6% |
| RecalcStyleDuration (ms) | 189,3 | 150,0 | -20,8% |
| ScriptDuration (ms) | 2.479 | 2.414 | -2,6% |
| P95 de intervalo entre frames (ms) | ~16,8 | ~16,8 | Sem diferença detectável |
| Frames acima de 50 ms | 0 | 0 | Sem diferença |

As duas execuções passaram e exibiram o último texto recebido. O benefício medido é de CPU de layout/estilo neste cenário, não de FPS percebido. A primeira amostra de cada execução inclui aquecimento; são somente duas amostras por condição, portanto a magnitude não deve ser generalizada.

## Pendências

- Fazer revisão visual lado a lado em uma janela instalada; especialmente brilho, sombra, hover e escala do Boo.
- Registrar memória (heap/DOM) e tempo de atualização em conversas muito longas; este script usa um texto incremental único, não simula histórico longo.
- Repetir medição de desempenho em uma máquina sob carga normal para validar a estabilidade do ganho.

Nenhum arquivo de dados pessoais foi lido; o script cria e usa um perfil temporário.
