# Design e interface

O design existente, seus temas, fontes, painéis, navegação e identidade dos Polis/Pits são ativos do produto. Consulte [`../ESTRATEGIA_UX_WORKSPACES.md`](../ESTRATEGIA_UX_WORKSPACES.md) para a experiência desejada, [`../PAINEIS_E_ABAS.md`](../PAINEIS_E_ABAS.md) para o comportamento dos painéis e [`../KOKONUTUI_INTEGRACAO.md`](../KOKONUTUI_INTEGRACAO.md) para os limites das adaptações Kokonut UI.

## Contratos a preservar

- Usar dados reais e estados da API. Não transportar exemplos demonstrativos para a aplicação.
- Manter aprovações e permissões sob autoridade do backend; estados visuais não autorizam ações.
- Preservar a identidade SVG dos avatares Poli/Pits e a seleção de equipes por agentes reais.
- Evitar controles duplicados de modelo e permissões. Só expor opções que o runtime suporta.
- Respeitar teclado, telas estreitas e `prefers-reduced-motion`.
- Diffs representam alterações persistidas; não sugerir aceitar, rejeitar ou desfazer quando não houver API correspondente.

O documento de painéis registra limitações como a prévia de arquivos somente leitura e o layout persistido globalmente no dispositivo. Consulte o código atual antes de assumir que esses limites mudaram.
