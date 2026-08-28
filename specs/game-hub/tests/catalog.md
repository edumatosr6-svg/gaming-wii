# game-hub — Testes do catálogo de jogos (F4, Data Model GameEntry)

## Estrutura do catálogo

- **Dado** o módulo/arquivo de catálogo de jogos,
  **quando** inspecionado,
  **então** cada entrada tem `id`, `name` e `url` não vazios, e `id` é único entre todas as
  entradas.

- **Dado** o catálogo padrão,
  **quando** carregado,
  **então** contém exatamente as entradas `duck-shooting` (`name: "Duck Shooting"`, `url`
  apontando para `duck-shooting/index.html`) e `fruit-ninja` (`name: "Fruit Ninja"`, `url`
  apontando para `fruit-ninja/index.html`).

## Extensibilidade (F4)

- **Dado** o catálogo padrão com uma terceira entrada fictícia adicionada (ex.:
  `{ id: 'jogo-teste', name: 'Jogo Teste', url: 'jogo-teste/index.html' }`),
  **quando** o hub é renderizado a partir desse catálogo estendido,
  **então** o DOM contém 3 itens de jogo, incluindo o novo, sem qualquer alteração na função
  de renderização do hub (o teste passa o catálogo estendido como parâmetro/injeção, sem
  editar o módulo de renderização).

- **Dado** duas entradas do catálogo com o mesmo `id`,
  **quando** o catálogo é validado (lint/teste de dados, não em runtime do navegador),
  **então** a validação falha com um erro claro apontando o `id` duplicado — isso é
  detectável antes de rodar o hub, não um comportamento a esconder do usuário final.

## Separação de responsabilidades

- **Dado** o código do hub,
  **quando** inspecionado,
  **então** o catálogo de jogos está em um arquivo/módulo distinto do módulo que renderiza a
  lista (ex.: `games.js` vs. `hub.js`/`render.js`), permitindo teste independente de cada um.
