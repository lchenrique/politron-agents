# Componentes e referências de terceiros

## Paseo

A conexão entre hosts utiliza `@getpaseo/relay` 0.12.0, de Mohamed Boudra, sob Apache License 2.0. A biblioteca fornece o canal criptografado; autorização, RPC e interface do Boobot são implementados neste projeto. As licenças das dependências transitivas permanecem nos respectivos pacotes.

- Repositório: https://github.com/getpaseo/paseo
- Referência consultada: `0eee4fd9b0d03b3bdcc01812fc07b6cad692f544`.
- Licença preservada em `licenses/paseo-APACHE-2.0.txt` e no pacote distribuído.
- A fila de processos Git também usa a ideia de admissão limitada do Paseo; a implementação do Boobot foi escrita para seus contratos existentes.

## OpenMausBot

Foram estudadas as filas por conversa e o registro de runtimes independentes de https://github.com/milind-soni/OpenMausBot, referência `aaf90ed6acceb81d102b32ff96514db922317c98`. Não foram copiados módulos de `enterprise/` nem código desse projeto nesta entrega.

## WebSocket

`ws` 8.18.3 utiliza a licença MIT, preservada no pacote `node_modules/ws/LICENSE`. A execução no processo principal utiliza o transporte Node, separado do navegador do usuário.
