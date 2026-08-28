// Testes de specs/game-hub/tests/catalog.md — catálogo de jogos (F4) e
// separação de responsabilidades (catálogo vs. renderização), lógica pura,
// sem navegador (tools/tooling.md do game-hub).
import test from 'node:test';
import assert from 'node:assert/strict';

import { games } from '../../game/games.js';
import { validateCatalog } from '../../game/hub.js';

test('catálogo padrão contém exatamente duck-shooting e fruit-ninja', () => {
  assert.equal(games.length, 2);

  const duckShooting = games.find((entry) => entry.id === 'duck-shooting');
  assert.ok(duckShooting, 'catálogo não tem entrada duck-shooting');
  assert.equal(duckShooting.name, 'Duck Shooting');
  assert.equal(duckShooting.url, 'duck-shooting/index.html');

  const fruitNinja = games.find((entry) => entry.id === 'fruit-ninja');
  assert.ok(fruitNinja, 'catálogo não tem entrada fruit-ninja');
  assert.equal(fruitNinja.name, 'Fruit Ninja');
  assert.equal(fruitNinja.url, 'fruit-ninja/index.html');
});

test('cada entrada do catálogo tem id/name/url não vazios e id único', () => {
  const ids = new Set();
  for (const entry of games) {
    assert.ok(entry.id, `entrada sem id: ${JSON.stringify(entry)}`);
    assert.ok(entry.name, `entrada sem name: ${JSON.stringify(entry)}`);
    assert.ok(entry.url, `entrada sem url: ${JSON.stringify(entry)}`);
    assert.ok(!ids.has(entry.id), `id duplicado: ${entry.id}`);
    ids.add(entry.id);
  }
  assert.doesNotThrow(() => validateCatalog(games));
});

test('validateCatalog falha com erro claro quando há id duplicado', () => {
  const duplicado = [
    { id: 'jogo-teste', name: 'Jogo Teste', url: 'jogo-teste/index.html' },
    { id: 'jogo-teste', name: 'Jogo Teste 2', url: 'jogo-teste-2/index.html' },
  ];
  assert.throws(() => validateCatalog(duplicado), /jogo-teste/);
});

test('validateCatalog aceita catálogo estendido com uma terceira entrada (F4)', () => {
  const estendido = [
    ...games,
    { id: 'jogo-teste', name: 'Jogo Teste', url: 'jogo-teste/index.html' },
  ];
  assert.equal(estendido.length, 3);
  assert.doesNotThrow(() => validateCatalog(estendido));
});

test('validateCatalog rejeita entrada sem url', () => {
  assert.throws(() => validateCatalog([{ id: 'sem-url', name: 'Sem URL', url: '' }]));
});
