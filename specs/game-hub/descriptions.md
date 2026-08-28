# game-hub — Descriptions

> Hub / menu principal do projeto webgaming: uma tela inicial onde o usuário escolhe
> qual dos jogos jogar, em vez de cair direto dentro de um jogo específico.

## Contexto atual

Hoje `game/index.html` abre diretamente o Duck Shooting (jogo padrão do
[wii-controller](../wii-controller/descriptions.md)), e o Fruit Ninja vive em
`game/fruit-ninja/`, acessível só por quem sabe a URL. Não existe navegação entre os
jogos nem uma tela de entrada que os apresente.

## Features

- **Menu principal (hub)**: página inicial do projeto (`game/index.html` deixa de ser
  o Duck Shooting direto e passa a ser este menu) que lista os jogos disponíveis —
  hoje Duck Shooting e Fruit Ninja — e permite escolher qual abrir.
- **Navegação para o jogo escolhido**: ao selecionar um jogo, o hub leva o usuário
  para a página daquele jogo (a UI existente de cada jogo não muda).
- **Voltar ao hub**: de dentro de cada jogo deve dar para voltar ao menu principal
  (ex.: botão/atalho), sem precisar editar a URL manualmente.
- **Preparado para crescer**: novos jogos que forem adicionados ao projeto no futuro
  devem poder entrar na lista do hub sem reestruturar o hub inteiro.

## KPIs

- <a definir pelo spec-loop, com foco em: tempo para escolher e entrar em um jogo,
  ausência de regressão nos jogos existentes>

## Arquitetura / restrições

- Mesmas restrições do projeto ([wii-controller/descriptions.md](../wii-controller/descriptions.md)):
  cliente sem build step — HTML, CSS e JS puros, sem framework, sem npm.
- O hub é só navegação/apresentação; não deve interferir na lógica dos jogos
  (`game/js/`, `game/fruit-ninja/js/`) nem no controle via WebSocket/gamepad virtual.
- Os jogos continuam consumindo o gamepad virtual normalmente a partir de suas
  próprias páginas — o hub não precisa (e não deve) ler input de controle.
