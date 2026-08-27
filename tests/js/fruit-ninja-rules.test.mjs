// Testes R1–R15 de specs/fruit-ninja/tests/rules.md — combos, vidas,
// dificuldade e pontuação (F6, F7, F8, KPI-5). Faixa de lógica pura.

import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../game/fruit-ninja/js/config.js';
import {
  createGameState,
  levelForElapsed,
  levelParams,
  updateStroke,
  registerFruitSlice,
  registerMissed,
  registerBombSlice,
  endGame,
  startGame,
} from '../../game/fruit-ninja/js/rules.js';
import { spawnAt, activeCount, makeRng, nextRange } from '../../game/fruit-ninja/js/entities.js';
import { fixedStep } from '../../game/fruit-ninja/js/loop.js';

const PF = { x: 0, y: config.hudHeightCss, width: 1280, height: 664 };
const DT = config.fixedStepS;
const DT_MS = DT * 1000;
const RAPIDO = config.minSliceSpeedCssPerS + 100;
const LENTO = config.minSliceSpeedCssPerS - 100;
const HOOKS = { onSlice() {}, onBomb() {}, onMiss() {}, onCalibrate() {}, onStart() {} };

function partida(seed = 1) {
  return { ...createGameState(config, seed), screen: 'jogando' };
}

/** Corta uma fruta mantendo o traço vivo (velocidade acima do limiar). */
function cortarNoTraco(state) {
  const comTraco = { ...state, blade: updateStroke(state.blade, RAPIDO, DT, config) };
  return registerFruitSlice(comTraco, config);
}

test('R1 — três frutas no mesmo traço valem 1x + 2x + 3x', () => {
  let state = partida();
  for (let i = 0; i < 3; i += 1) state = cortarNoTraco(state);
  assert.equal(state.score, config.basePoints * (1 + 2 + 3));
  assert.equal(state.blade.comboCount, 3);
});

test('R2 — três frutas em traços distintos valem 1x cada', () => {
  let state = partida();
  for (let i = 0; i < 3; i += 1) {
    state = cortarNoTraco(state);
    // Pausa maior que comboBreakMs: o traço morre entre os cortes.
    let decorrido = 0;
    while (decorrido <= config.comboBreakMs + DT_MS) {
      state = { ...state, blade: updateStroke(state.blade, LENTO, DT, config) };
      decorrido += DT_MS;
    }
  }
  assert.equal(state.score, config.basePoints * 3);
});

test('R3 — bordas da quebra de traço', () => {
  let state = partida();
  state = cortarNoTraco(state);
  state = cortarNoTraco(state);
  assert.equal(state.blade.comboCount, 2);

  // (a) abaixo do limiar por comboBreakMs - fixedStep: o traço SOBREVIVE.
  let intacto = state;
  let decorrido = 0;
  while (decorrido + DT_MS <= config.comboBreakMs - DT_MS) {
    intacto = { ...intacto, blade: updateStroke(intacto.blade, LENTO, DT, config) };
    decorrido += DT_MS;
  }
  assert.equal(intacto.blade.comboCount, 2, 'o traço quebrou cedo demais');
  const seguinte = cortarNoTraco(intacto);
  assert.equal(seguinte.score - intacto.score, config.basePoints * 3, 'o combo deveria continuar');

  // (b) seguindo até comboBreakMs + fixedStep: o traço QUEBRA.
  let quebrado = intacto;
  while (decorrido < config.comboBreakMs + DT_MS) {
    quebrado = { ...quebrado, blade: updateStroke(quebrado.blade, LENTO, DT, config) };
    decorrido += DT_MS;
  }
  assert.equal(quebrado.blade.comboCount, 0, 'o traço deveria ter quebrado');
  const recomeco = cortarNoTraco(quebrado);
  assert.equal(recomeco.score - quebrado.score, config.basePoints, 'o combo deveria ter reiniciado');

  // (c) um único passo acima do limiar zera o acumulado abaixo dele.
  let meio = state;
  for (let i = 0; i < 10; i += 1) {
    meio = { ...meio, blade: updateStroke(meio.blade, LENTO, DT, config) };
  }
  assert.ok(meio.blade.belowThresholdMs > 0);
  meio = { ...meio, blade: updateStroke(meio.blade, RAPIDO, DT, config) };
  assert.equal(meio.blade.belowThresholdMs, 0);
  assert.equal(meio.blade.strokeActive, true);
});

test('R4 — comboCount reflete as frutas do traço e nunca é negativo', () => {
  let state = partida();
  assert.equal(state.blade.comboCount, 0);
  for (let n = 1; n <= 5; n += 1) {
    state = cortarNoTraco(state);
    assert.equal(state.blade.comboCount, n);
    assert.ok(state.blade.comboCount >= 0);
  }

  let quebrado = state;
  let decorrido = 0;
  while (decorrido <= config.comboBreakMs + DT_MS) {
    quebrado = { ...quebrado, blade: updateStroke(quebrado.blade, LENTO, DT, config) };
    decorrido += DT_MS;
  }
  assert.equal(quebrado.blade.comboCount, 0);
});

test('R5 — a quebra de traço usa a velocidade recebida, não um relógio', () => {
  const blade = partida().blade;
  // A mesma entrada dá a mesma saída, independentemente de quando é chamada.
  const a = updateStroke(blade, LENTO, DT, config);
  const b = updateStroke(blade, LENTO, DT, config);
  assert.deepEqual(a, b);
  assert.equal(a.belowThresholdMs, DT_MS);

  // O acumulado vem do argumento dtS, não do tempo de parede.
  const dobro = updateStroke(blade, LENTO, DT * 2, config);
  assert.equal(dobro.belowThresholdMs, DT_MS * 2);
});

test('R6 — cada fruta perdida custa exatamente uma vida', () => {
  const state = partida();
  const um = registerMissed(state, [{ id: 1, kind: 'fruit' }]);
  assert.equal(um.lives, config.startingLives - 1);

  const dois = registerMissed(um, [
    { id: 2, kind: 'fruit' },
    { id: 3, kind: 'fruit' },
  ]);
  assert.equal(dois.lives, config.startingLives - 3);

  // Reprocessar a lista vazia não decrementa de novo.
  assert.equal(registerMissed(um, []).lives, um.lives);
});

test('R7 — vidas em zero encerram a partida e o valor nunca fica negativo', () => {
  let state = { ...partida(), lives: 1 };
  state = registerMissed(state, [
    { id: 1, kind: 'fruit' },
    { id: 2, kind: 'fruit' },
    { id: 3, kind: 'fruit' },
  ]);
  assert.equal(state.lives, 0);
  assert.ok(state.lives >= 0, 'lives não pode ficar negativo');
  assert.equal(state.screen, 'gameOver');
  assert.equal(state.gameOverReason, 'no-lives');

  // O piso em zero precisa ser exercitado a partir de `lives` JÁ em zero: se o
  // teste só decrementa a partir de 1, o retorno antecipado de `endGame`
  // esconde a ausência do piso e o caso vira decorativo.
  const jaEmZero = registerMissed({ ...partida(), lives: 0 }, [{ id: 9, kind: 'fruit' }]);
  assert.ok(jaEmZero.lives >= 0, `lives ficou negativo: ${jaEmZero.lives}`);
});

test('R8 — bomba não cortada que cai não custa vida', () => {
  const state = partida();
  const depois = registerMissed(state, [{ id: 1, kind: 'bomb' }]);
  assert.equal(depois.lives, config.startingLives);
  assert.notEqual(depois.screen, 'gameOver');
});

test('R9 — a curva de dificuldade é monotônica e estrita em ao menos dois eixos', () => {
  for (let n = 0; n < config.maxLevel; n += 1) {
    const atual = levelParams(n, config);
    const proximo = levelParams(n + 1, config);

    assert.ok(proximo.spawnIntervalS <= atual.spawnIntervalS, `spawnIntervalS subiu em ${n + 1}`);
    assert.ok(proximo.maxSimultaneous >= atual.maxSimultaneous, `maxSimultaneous caiu em ${n + 1}`);
    assert.ok(proximo.bombChance >= atual.bombChance, `bombChance caiu em ${n + 1}`);
    assert.ok(
      proximo.launchSpeedRange[0] >= atual.launchSpeedRange[0] &&
        proximo.launchSpeedRange[1] >= atual.launchSpeedRange[1],
      `launchSpeedRange caiu em ${n + 1}`,
    );

    const estritos = [
      proximo.spawnIntervalS < atual.spawnIntervalS,
      proximo.maxSimultaneous > atual.maxSimultaneous,
      proximo.bombChance > atual.bombChance,
      proximo.launchSpeedRange[0] > atual.launchSpeedRange[0],
    ].filter(Boolean).length;
    assert.ok(estritos >= 2, `nível ${n + 1} só é estritamente mais difícil em ${estritos} eixo(s)`);
  }
});

test('R10 — o nível depende só do tempo e independe da taxa de quadros', () => {
  for (const elapsed of [0, 15, 29.99, 30, 61, 149, 150, 400]) {
    assert.equal(
      levelForElapsed(elapsed, config),
      Math.min(Math.floor(elapsed / config.levelDurationS), config.maxLevel),
    );
  }

  const amostrar = (dt) => {
    const niveis = [];
    let elapsed = 0;
    for (let i = 0; i < Math.round(200 / dt); i += 1) {
      elapsed += dt;
      if (i % Math.round(1 / dt) === 0) niveis.push(levelForElapsed(elapsed, config));
    }
    return niveis;
  };
  assert.deepEqual(amostrar(1 / 60), amostrar(1 / 144));
});

test('R11 — acima de maxLevel os parâmetros saturam', () => {
  const teto = levelParams(config.maxLevel, config);
  for (const level of [config.maxLevel + 1, config.maxLevel + 10, 999]) {
    assert.deepEqual(levelParams(level, config), teto);
  }
  assert.equal(levelForElapsed(1e6, config), config.maxLevel);
});

test('R12 — o score nunca decresce durante uma partida', () => {
  let state = partida(555);
  let anterior = state.score;
  const pos = (t) => ({ x: 200 + 700 * Math.abs(Math.sin(t / 40)), y: 300 + 200 * Math.cos(t / 30) });

  for (let i = 0; i < 6000; i += 1) {
    state = fixedStep(state, pos(i), pos(i + 1), config, PF, HOOKS);
    assert.ok(state.score >= anterior, `score caiu no passo ${i}`);
    anterior = state.score;
    if (state.screen === 'gameOver') break;
  }
});

test('R13 — o recorde da sessão guarda o melhor e não é rebaixado', () => {
  const boa = endGame({ ...partida(), score: 500, highScore: 0 }, 'no-lives');
  assert.equal(boa.highScore, 500);

  const ruim = endGame({ ...boa, score: 120 }, 'bomb');
  assert.equal(ruim.highScore, 500, 'uma partida pior não pode rebaixar o recorde');

  // E o recorde sobrevive ao início da partida seguinte.
  const nova = startGame(ruim, config);
  assert.equal(nova.highScore, 500);
  assert.equal(nova.score, 0);
  assert.equal(nova.lives, config.startingLives);
});

test('R14 — cortar bomba encerra com o motivo correto', () => {
  const state = registerBombSlice({ ...partida(), score: 90, lives: 3 });
  assert.equal(state.screen, 'gameOver');
  assert.equal(state.gameOverReason, 'bomb');
  assert.equal(state.highScore, 90);
});

// ------------------------------------------------- KPI-5: agitar não compensa

/**
 * Simula 60 s de partida com uma política de lâmina. Devolve o score final.
 *
 * `politica(state, pos, rng)` devolve a próxima posição da lâmina.
 */
function simular(seed, politica) {
  let state = partida(seed);
  let pos = { x: PF.x + PF.width / 2, y: PF.y + PF.height / 2 };
  let rng = makeRng(seed * 7919 + 13);
  const sorteio = (lo, hi) => {
    const passo = nextRange(rng, lo, hi);
    rng = passo.rng;
    return passo.value;
  };

  const passos = Math.round(60 / DT);
  for (let i = 0; i < passos; i += 1) {
    const proxima = politica(state, pos, sorteio, i);
    state = fixedStep(state, pos, proxima, config, PF, HOOKS);
    pos = proxima;
    if (state.screen === 'gameOver') break;
  }
  return state.score;
}

/** Varredura aleatória em alta velocidade: "agitar o aparelho". */
function politicaAgitar(state, pos, sorteio, passo) {
  // Alvo novo a cada 100 ms, perseguido em alta velocidade.
  const trocaACada = Math.round(0.1 / DT);
  if (passo % trocaACada === 0 || !politicaAgitar.alvo) {
    politicaAgitar.alvo = {
      x: sorteio(PF.x, PF.x + PF.width),
      y: sorteio(PF.y, PF.y + PF.height),
    };
  }
  const alvo = politicaAgitar.alvo;
  const dx = alvo.x - pos.x;
  const dy = alvo.y - pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Passo bem acima do limiar de corte, sem escolher o que cortar.
  const avanco = Math.min(dist, 30);
  return { x: pos.x + (dx / dist) * avanco, y: pos.y + (dy / dist) * avanco };
}

/** Apontamento deliberado: persegue a fruta mais próxima e desvia de bombas. */
function politicaDeliberada(state, pos) {
  const ativas = state.entities.filter((ent) => ent.state === 'active');
  const frutas = ativas.filter((ent) => ent.kind === 'fruit');
  const bombas = ativas.filter((ent) => ent.kind === 'bomb');
  if (frutas.length === 0) return { x: pos.x, y: pos.y };

  let alvo = frutas[0];
  let melhor = Infinity;
  for (const fruta of frutas) {
    const d = Math.hypot(fruta.pos.x - pos.x, fruta.pos.y - pos.y);
    if (d < melhor) {
      melhor = d;
      alvo = fruta;
    }
  }

  const dx = alvo.pos.x - pos.x;
  const dy = alvo.pos.y - pos.y;
  const dist = Math.hypot(dx, dy) || 1;
  const avanco = Math.min(dist, 14); // acima do limiar de corte, mas controlado
  const proxima = { x: pos.x + (dx / dist) * avanco, y: pos.y + (dy / dist) * avanco };

  // Desvia: se o segmento passa perto de uma bomba, segura a lâmina.
  for (const bomba of bombas) {
    const ax = pos.x - bomba.prevPos.x;
    const ay = pos.y - bomba.prevPos.y;
    const bx = proxima.x - bomba.pos.x;
    const by = proxima.y - bomba.pos.y;
    const mx = bx - ax;
    const my = by - ay;
    const l2 = mx * mx + my * my;
    let t = l2 === 0 ? 0 : -(ax * mx + ay * my) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(ax + mx * t, ay + my * t);
    if (d <= bomba.radiusCss + 25) return { x: pos.x, y: pos.y };
  }
  return proxima;
}

test('R15 — agitar não compensa apontar (KPI-5)', () => {
  const sementes = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const resultados = [];

  for (const seed of sementes) {
    politicaAgitar.alvo = null;
    const agitando = simular(seed, politicaAgitar);
    const apontando = simular(seed, politicaDeliberada);
    resultados.push({ seed, agitando, apontando });
  }

  if (process.env.FN_DEBUG) console.log(JSON.stringify(resultados));
  const vantagens = resultados.filter((r) => r.agitando < 0.5 * r.apontando);
  assert.ok(
    vantagens.length >= 9,
    `apontar só venceu com folga em ${vantagens.length}/10 sementes: ` +
      JSON.stringify(resultados),
  );
});
