// Testes G1–G12 (specs/wii-controller/tests/duck-shooting.md) — lógica pura
// de game/js/ rodando no runner nativo do Node (sem npm, sem navegador).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGameState,
  difficultyForRound,
  fireShot,
  reload,
  resolveRoundEnd,
  restart,
  MAX_AMMO,
  BASE_HIT_POINTS,
  STREAK_BONUS_STEP,
} from '../../game/js/rules.js';
import {
  createRng,
  spawnDucks,
  duckPosition,
  updateDucks,
  findHit,
  killDuck,
  waveFinished,
  DUCK_RADIUS,
  WORLD,
  VEGETATION_BAND,
} from '../../game/js/entities.js';
import { crosshairFromAxes } from '../../game/js/aim.js';
import { normalizeGamepadAxes } from '../../game/js/input.js';

const PARAMS = difficultyForRound(1);

test('G1: munição — decremento, zero não abate, nunca negativa', () => {
  let state = { ...createGameState(), phase: 'playing' };
  assert.equal(state.ammo, MAX_AMMO);
  for (let i = 0; i < MAX_AMMO; i += 1) {
    state = fireShot(state, false).state;
  }
  assert.equal(state.ammo, 0);
  const empty = fireShot(state, true); // mesmo "acertando", sem munição
  assert.equal(empty.event, 'no-ammo');
  assert.equal(empty.state.ammo, 0);
  assert.equal(empty.state.score, state.score);
  assert.equal(empty.state.hitsInRound, state.hitsInRound);
  assert.ok(empty.state.ammo >= 0);
});

test('G2: recarga automática volta a munição para o máximo', () => {
  let state = { ...createGameState(), ammo: 0 };
  state = reload(state);
  assert.equal(state.ammo, MAX_AMMO);
  // resolveRoundEnd com critério atingido também recarrega
  const advanced = resolveRoundEnd({ ...createGameState(), ammo: 0, hitsInRound: 99 });
  assert.equal(advanced.ammo, MAX_AMMO);
});

test('G3: pontuação com bônus de sequência e reset no erro', () => {
  let state = { ...createGameState(), ammo: 99 };
  const hit1 = fireShot(state, true);
  assert.equal(hit1.state.score, BASE_HIT_POINTS);
  assert.equal(hit1.state.streak, 1);
  const hit2 = fireShot(hit1.state, true);
  const bonus2 = Math.round(BASE_HIT_POINTS * (1 + STREAK_BONUS_STEP));
  assert.equal(hit2.state.score, BASE_HIT_POINTS + bonus2);
  assert.equal(hit2.state.streak, 2);
  const hit3 = fireShot(hit2.state, true);
  assert.ok(hit3.state.score - hit2.state.score > bonus2); // bônus crescente
  const miss = fireShot(hit3.state, false);
  assert.equal(miss.state.streak, 0); // reset no primeiro erro
  const after = fireShot(miss.state, true);
  assert.equal(after.state.score - miss.state.score, BASE_HIT_POINTS); // base de novo
});

test('G4: avanço de rodada e game over pelo critério', () => {
  const base = createGameState();
  const pass = resolveRoundEnd({ ...base, hitsInRound: base.requiredHits });
  assert.equal(pass.phase, 'roundEnd');
  assert.equal(pass.round, base.round + 1);
  assert.equal(pass.hitsInRound, 0);
  const fail = resolveRoundEnd({ ...base, hitsInRound: base.requiredHits - 1, score: 500 });
  assert.equal(fail.phase, 'gameOver');
  assert.equal(fail.highScore, 500);
});

test('G5: curva de dificuldade monotônica com aumento estrito (F10.4)', () => {
  for (let n = 1; n < 12; n += 1) {
    const current = difficultyForRound(n);
    const next = difficultyForRound(n + 1);
    assert.ok(next.duckCount >= current.duckCount);
    assert.ok(next.speedMin >= current.speedMin);
    assert.ok(next.speedMax >= current.speedMax);
    const strict =
      next.duckCount > current.duckCount ||
      next.speedMin > current.speedMin ||
      next.speedMax > current.speedMax;
    assert.ok(strict, `rodada ${n + 1} sem aumento estrito`);
  }
});

test('G6: recorde de sessão em memória, preservado no restart', () => {
  const over = resolveRoundEnd({ ...createGameState(), hitsInRound: 0, score: 900 });
  assert.equal(over.highScore, 900);
  const again = restart({ ...over, score: 900 });
  assert.equal(again.highScore, 900);
  assert.equal(again.score, 0);
});

test('G7: spawn na faixa de vegetação com parâmetros da rodada', () => {
  const rng = createRng(123);
  const ducks = spawnDucks(PARAMS, rng);
  assert.equal(ducks.length, PARAMS.duckCount);
  for (const duck of ducks) {
    assert.ok(duck.spawn.y >= WORLD.height * (1 - VEGETATION_BAND));
    assert.ok(duck.spawn.x >= 0 && duck.spawn.x <= WORLD.width);
    const climb = -duck.velocity.y;
    assert.ok(climb >= PARAMS.speedMin && climb <= PARAMS.speedMax);
    assert.equal(duck.alive, true);
    assert.equal(duck.escaped, false);
  }
});

test('G8: pato não abatido cruza o topo e é marcado como escapado', () => {
  const rng = createRng(7);
  let ducks = spawnDucks({ ...PARAMS, duckCount: 1 }, rng);
  for (let i = 0; i < 3000 && !ducks[0].escaped; i += 1) {
    ducks = updateDucks(ducks, 1 / 60);
  }
  assert.equal(ducks[0].escaped, true);
  assert.ok(duckPosition(ducks[0]).y < 0);
  assert.ok(waveFinished(ducks));
});

test('G9: colisão inclusiva na borda exata da hitbox', () => {
  const duck = {
    id: 0,
    spawn: { x: 300, y: 300 },
    velocity: { x: 0, y: 0 },
    wobble: { amplitude: 0, frequency: 0, phase: 0 },
    age: 0,
    alive: true,
    escaped: false,
  };
  assert.equal(findHit([duck], 300, 300), duck); // centro
  assert.equal(findHit([duck], 300 + DUCK_RADIUS, 300), duck); // borda: inclusivo
  assert.equal(findHit([duck], 300 + DUCK_RADIUS + 0.001, 300), null); // fora
});

test('G10: sobreposição — um tiro abate exatamente um, o de cima', () => {
  const at = (id) => ({
    id,
    spawn: { x: 200, y: 200 },
    velocity: { x: 0, y: 0 },
    wobble: { amplitude: 0, frequency: 0, phase: 0 },
    age: 0,
    alive: true,
    escaped: false,
  });
  const ducks = [at(0), at(1)]; // índice 1 é desenhado por último (mais acima)
  const hit = findHit(ducks, 200, 200);
  assert.equal(hit.id, 1);
  const after = killDuck(ducks, hit.id);
  assert.equal(after.filter((d) => d.alive).length, 1);
  assert.equal(after[0].alive, true); // o de baixo continua vivo
});

test('G11: física idêntica com dt=1/60 e dt=1/144 (F10.6)', () => {
  const spawn = () => spawnDucks(PARAMS, createRng(42)); // mesma semente
  let at60 = spawn();
  let at144 = spawn();
  for (let i = 0; i < 120; i += 1) {
    at60 = updateDucks(at60, 1 / 60); // 2.0 s
  }
  for (let i = 0; i < 288; i += 1) {
    at144 = updateDucks(at144, 1 / 144); // 2.0 s
  }
  for (let i = 0; i < at60.length; i += 1) {
    const p60 = duckPosition(at60[i]);
    const p144 = duckPosition(at144[i]);
    assert.ok(Math.abs(p60.x - p144.x) < 1e-6, `x diverge no pato ${i}`);
    assert.ok(Math.abs(p60.y - p144.y) < 1e-6, `y diverge no pato ${i}`);
  }
});

test('G12: mesma semente → mesmas trajetórias', () => {
  const a = spawnDucks(PARAMS, createRng(99));
  const b = spawnDucks(PARAMS, createRng(99));
  assert.deepEqual(a, b);
  const c = spawnDucks(PARAMS, createRng(100));
  assert.notDeepEqual(a, c);
});

// ---------------------------------------------------------------------------
// G20–G23: mira absoluta (posição, não taxa) [F10.7–F10.10, KPI-16, KPI-18]
// Alvo: a função pura que deriva a posição da mira da leitura ATUAL do eixo
// (game/js/aim.js) e a normalização da convenção da Gamepad API
// (game/js/input.js).

test('G20: eixo constante ⇒ mira parada (F10.7)', () => {
  // Reprova a implementação por velocidade (`pos += eixo × ganho × dt`), na
  // qual a mira andaria a cada quadro.
  const axis = { x: 0.5, y: 0 };
  const first = crosshairFromAxes(axis.x, axis.y, WORLD.width, WORLD.height);
  const dts = [1 / 60, 1 / 144, 1 / 30, 0.0123];
  for (let frame = 0; frame < 120; frame += 1) {
    // dt varia de propósito: a posição não pode depender dele de forma alguma
    const dt = dts[frame % dts.length];
    void dt;
    const current = crosshairFromAxes(axis.x, axis.y, WORLD.width, WORLD.height);
    assert.equal(current.x, first.x, `a mira deslocou em x no quadro ${frame}`);
    assert.equal(current.y, first.y, `a mira deslocou em y no quadro ${frame}`);
  }
});

test('G21: independência de histórico (KPI-16, F10.8)', () => {
  const finalAxis = { x: -0.37, y: 0.62 };
  const sequenceA = [
    { x: 0, y: 0 },
    { x: 1, y: -1 },
    { x: 0.2, y: 0.9 },
    finalAxis,
  ];
  const sequenceB = [
    { x: -1, y: 1 },
    { x: 0.85, y: -0.4 },
    { x: 0, y: 0 },
    finalAxis,
  ];
  const runSequence = (sequence) => {
    let position = null;
    for (const axis of sequence) {
      position = crosshairFromAxes(axis.x, axis.y, WORLD.width, WORLD.height);
    }
    return position;
  };
  const endA = runSequence(sequenceA);
  const endB = runSequence(sequenceB);
  assert.deepEqual(endA, endB, 'a posição final da mira dependeu do histórico');
  // e é igual à derivação direta do valor final, sem histórico nenhum
  assert.deepEqual(
    endA,
    crosshairFromAxes(finalAxis.x, finalAxis.y, WORLD.width, WORLD.height)
  );
});

test('G22: centro, bordas e sentido na tela (F10.7, F10.9)', () => {
  const { width, height } = WORLD;
  const center = crosshairFromAxes(0, 0, width, height);
  assert.ok(Math.abs(center.x - width / 2) <= 1, 'eixo (0,0) deve mirar o centro em x');
  assert.ok(Math.abs(center.y - height / 2) <= 1, 'eixo (0,0) deve mirar o centro em y');

  // Bordas correspondentes (tolerância de 1 px)
  const topRight = crosshairFromAxes(1, 1, width, height);
  assert.ok(Math.abs(topRight.x - width) <= 1, 'x = +1 deve mirar a borda direita');
  assert.ok(Math.abs(topRight.y - 0) <= 1, 'y = +1 deve mirar a borda SUPERIOR');
  const bottomLeft = crosshairFromAxes(-1, -1, width, height);
  assert.ok(Math.abs(bottomLeft.x - 0) <= 1, 'x = -1 deve mirar a borda esquerda');
  assert.ok(Math.abs(bottomLeft.y - height) <= 1, 'y = -1 deve mirar a borda INFERIOR');

  // Sentido, sobre o valor JÁ NORMALIZADO
  const right = crosshairFromAxes(0.5, 0, width, height);
  assert.ok(right.x > center.x, 'x > 0 deve pôr a mira à direita do centro');
  const left = crosshairFromAxes(-0.5, 0, width, height);
  assert.ok(left.x < center.x, 'x < 0 deve pôr a mira à esquerda do centro');
  const up = crosshairFromAxes(0, 0.5, width, height);
  assert.ok(up.y < center.y, 'y > 0 deve pôr a mira ACIMA do centro (y de tela menor)');
  const down = crosshairFromAxes(0, -0.5, width, height);
  assert.ok(down.y > center.y, 'y < 0 deve pôr a mira ABAIXO do centro');
});

test('G23: normalização da convenção da Gamepad API (KPI-18, F10.10)', () => {
  const { width, height } = WORLD;
  const center = crosshairFromAxes(0, 0, width, height);

  // axes[3] NEGATIVO no standard mapping = stick para CIMA ⇒ y interno POSITIVO
  const up = normalizeGamepadAxes(0, -0.5);
  assert.ok(up.y > 0, 'axes[3] < 0 (cima) deve normalizar para y interno positivo');
  const upAim = crosshairFromAxes(up.x, up.y, width, height);
  assert.ok(upAim.y < center.y, 'stick para cima deve pôr a mira ACIMA do centro');

  // axes[3] POSITIVO = stick para baixo ⇒ y interno negativo, mira abaixo
  const down = normalizeGamepadAxes(0, 0.5);
  assert.ok(down.y < 0, 'axes[3] > 0 (baixo) deve normalizar para y interno negativo');
  const downAim = crosshairFromAxes(down.x, down.y, width, height);
  assert.ok(downAim.y > center.y, 'stick para baixo deve pôr a mira ABAIXO do centro');

  // axes[2] (horizontal) NÃO é invertido
  const rightRaw = normalizeGamepadAxes(0.5, 0);
  assert.equal(rightRaw.x, 0.5, 'o eixo horizontal não pode ser invertido');
  const rightAim = crosshairFromAxes(rightRaw.x, rightRaw.y, width, height);
  assert.ok(rightAim.x > center.x, 'axes[2] > 0 deve pôr a mira à direita');
  const leftRaw = normalizeGamepadAxes(-0.5, 0);
  assert.equal(leftRaw.x, -0.5);
  const leftAim = crosshairFromAxes(leftRaw.x, leftRaw.y, width, height);
  assert.ok(leftAim.x < center.x, 'axes[2] < 0 deve pôr a mira à esquerda');
});
