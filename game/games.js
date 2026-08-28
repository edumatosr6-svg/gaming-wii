// Catálogo de jogos do hub (specs/game-hub/software-specs.md — F4, Data Model
// GameEntry). Fonte única de dados: nenhuma lógica de renderização mora aqui.
//
// Cada entrada segue o formato:
//   { id: string, name: string, url: string, description?: string }
//
// `url` é relativo a `game/` (esta pasta), ex.: 'duck-shooting/index.html'.

export const games = [
  {
    id: 'duck-shooting',
    name: 'Duck Shooting',
    url: 'duck-shooting/index.html',
    description: 'Aponte e atire nos patos usando o celular como controle de movimento.',
  },
  {
    id: 'fruit-ninja',
    name: 'Fruit Ninja',
    url: 'fruit-ninja/index.html',
    description: 'Corte as frutas em voo e evite as bombas.',
  },
];
