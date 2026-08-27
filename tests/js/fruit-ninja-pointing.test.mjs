// Testes P1–P11 de specs/fruit-ninja/tests/pointing.md — apontamento absoluto
// e calibração (F1, F12, KPI-1). Faixa de lógica pura: `node --test`.
//
// Esta é a faixa que reprova a implementação por velocidade, que é o requisito
// nº 1 do jogo. P1 carrega a verificação NEGATIVA correspondente: uma
// implementação de referência por velocidade tem que falhar o mesmo critério,
// senão o teste não discrimina nada.

import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../game/fruit-ninja/js/config.js';
import {
  axesToTarget,
  smoothTowards,
  playfieldCenter,
  createCalibration,
  calibrationFromSample,
  createStabilityState,
  updateStability,
} from '../../game/fruit-ninja/js/input.js';
import { createGameState } from '../../game/fruit-ninja/js/rules.js';
import { createSession, advanceFrame } from '../../game/fruit-ninja/js/loop.js';

const PF = { x: 0, y: config.hudHeightCss, width: 1280, height: 664 };
const NEUTRAL = createCalibration();

function sample(rawX, rawY, extra = {}) {
  return {
    rawX,
    rawY,
    buttons: { a: false, start: false },
    connected: true,
    timestampMs: 0,
    ...extra,
  };
}

/** Implementação de REFERÊNCIA por velocidade — o comportamento a descartar. */
function velocityReference(path, playfield) {
  const center = playfieldCenter(playfield);
  let pos = { x: center.x, y: center.y };
  const gain = 600; // px/s por unidade de eixo
  const dt = 1 / 60;
  for (const [ax, ay] of path) {
    pos = { x: pos.x + ax * gain * dt, y: pos.y + ay * gain * dt };
  }
  return pos;
}

const PATH_A = [
  [0, 0],
  [0.5, 0.5],
  [-0.8, 0.2],
  [0.3, -0.4],
];
const PATH_B = [
  [0, 0],
  [-1, -1],
  [1, 1],
  [0.3, -0.4],
];

test('P1 — apontamento é independente do caminho percorrido', () => {
  const lastOf = (path) =>
    path.map(([ax, ay]) => axesToTarget(ax, ay, NEUTRAL, config, PF)).at(-1);

  const endA = lastOf(PATH_A);
  const endB = lastOf(PATH_B);

  // Igualdade EXATA de ponto flutuante: a última amostra é a mesma, então a
  // posição tem que ser bit a bit a mesma, não "parecida".
  assert.equal(endA.x, endB.x);
  assert.equal(endA.y, endB.y);
});

test('P1 (negativo) — uma implementação por velocidade REPROVA o critério de P1', () => {
  const endA = velocityReference(PATH_A, PF);
  const endB = velocityReference(PATH_B, PF);

  // Documentação executável: se este assert passasse a falhar, P1 teria
  // deixado de discriminar apontamento absoluto de apontamento por velocidade
  // e o teste acima viraria decoração.
  assert.notEqual(
    `${endA.x},${endA.y}`,
    `${endB.x},${endB.y}`,
    'a referência por velocidade deveria depender do caminho — P1 não discrimina nada',
  );
});

test('P2 — axesToTarget não tem memória', () => {
  const probe = () => axesToTarget(0.3, -0.4, NEUTRAL, config, PF);
  const first = probe();
  const ruido = [
    [0.9, 0.9],
    [-0.2, 0.7],
    [0, 0],
    [-1, 0.5],
  ];
  for (let i = 0; i < 100; i += 1) {
    const [ax, ay] = ruido[i % ruido.length];
    axesToTarget(ax, ay, NEUTRAL, config, PF);
    const again = probe();
    assert.equal(again.x, first.x);
    assert.equal(again.y, first.y);
  }

  // Ordem embaralhada: cada entrada mantém o seu próprio resultado.
  const entradas = [
    [0.1, 0.2],
    [-0.6, 0.4],
    [0.7, -0.7],
    [0, 0.35],
  ];
  const direto = new Map(
    entradas.map(([ax, ay]) => [`${ax},${ay}`, axesToTarget(ax, ay, NEUTRAL, config, PF)]),
  );
  for (const [ax, ay] of [...entradas].reverse()) {
    const again = axesToTarget(ax, ay, NEUTRAL, config, PF);
    const esperado = direto.get(`${ax},${ay}`);
    assert.equal(again.x, esperado.x);
    assert.equal(again.y, esperado.y);
  }
});

test('P3 — o neutro calibrado é o centro do playfield', () => {
  const center = playfieldCenter(PF);
  for (const [a, b] of [
    [0, 0],
    [0.21, -0.13],
    [-0.4, 0.4],
  ]) {
    const calibration = calibrationFromSample(sample(a, b));
    const target = axesToTarget(a, b, calibration, config, PF);
    assert.ok(Math.hypot(target.x - center.x, target.y - center.y) <= config.pointingToleranceCss);
  }
});

test('P4 — bordas, cantos e clamp', () => {
  const center = playfieldCenter(PF);
  const right = axesToTarget(config.maxTilt, 0, NEUTRAL, config, PF);
  const left = axesToTarget(-config.maxTilt, 0, NEUTRAL, config, PF);
  const down = axesToTarget(0, config.maxTilt, NEUTRAL, config, PF);
  const up = axesToTarget(0, -config.maxTilt, NEUTRAL, config, PF);

  assert.ok(Math.abs(right.x - (PF.x + PF.width)) <= 1e-9, 'borda direita');
  assert.ok(Math.abs(left.x - PF.x) <= 1e-9, 'borda esquerda');
  assert.ok(Math.abs(down.y - (PF.y + PF.height)) <= 1e-9, 'borda inferior');
  assert.ok(Math.abs(up.y - PF.y) <= 1e-9, 'borda superior');

  // Orientação: Y positivo do gamepad é Y maior no Canvas (para baixo).
  assert.ok(down.y > center.y);
  assert.ok(up.y < center.y);

  const canto = axesToTarget(config.maxTilt, config.maxTilt, NEUTRAL, config, PF);
  assert.ok(Math.abs(canto.x - (PF.x + PF.width)) <= 1e-9);
  assert.ok(Math.abs(canto.y - (PF.y + PF.height)) <= 1e-9);

  // Além de maxTilt: fica NA borda, nunca fora.
  for (const [ax, ay] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const p = axesToTarget(ax, ay, NEUTRAL, config, PF);
    assert.ok(p.x >= PF.x - 1e-9 && p.x <= PF.x + PF.width + 1e-9, `x fora: ${p.x}`);
    assert.ok(p.y >= PF.y - 1e-9 && p.y <= PF.y + PF.height + 1e-9, `y fora: ${p.y}`);
  }

  assert.ok(0 <= config.deadzone && config.deadzone < config.maxTilt && config.maxTilt <= 1);
});

test('P5 — a zona morta é contínua (sem salto na borda)', () => {
  const center = playfieldCenter(PF);

  const dentro = axesToTarget(config.deadzone - 1e-6, 0, NEUTRAL, config, PF);
  assert.equal(dentro.x, center.x);
  assert.equal(dentro.y, center.y);

  let anterior = Infinity;
  for (const eps of [1e-3, 1e-4, 1e-5]) {
    const fora = axesToTarget(config.deadzone + eps, 0, NEUTRAL, config, PF);
    const desloc = Math.hypot(fora.x - center.x, fora.y - center.y);
    assert.ok(desloc < 1, `salto de ${desloc} px ao sair da zona morta com eps=${eps}`);
    assert.ok(desloc < anterior, 'o deslocamento deveria decrescer com eps');
    anterior = desloc;
  }
});

test('P6 — a suavização converge para o mesmo ponto vindo de cantos opostos', () => {
  const alvo = axesToTarget(0.4, -0.3, NEUTRAL, config, PF);
  const dt = 1 / 60;
  const quadros = Math.ceil(config.pointingSettleMs / 1000 / dt);

  let a = { x: PF.x, y: PF.y };
  let b = { x: PF.x + PF.width, y: PF.y + PF.height };
  for (let i = 0; i < quadros; i += 1) {
    a = smoothTowards(a, alvo, dt, config);
    b = smoothTowards(b, alvo, dt, config);
  }

  assert.ok(
    Math.hypot(a.x - b.x, a.y - b.y) <= config.pointingToleranceCss,
    'as duas origens não convergiram para o mesmo ponto',
  );
  assert.ok(Math.hypot(a.x - alvo.x, a.y - alvo.y) <= config.pointingToleranceCss);
});

test('P7 — inclinação constante por 30 s não produz deriva', () => {
  const alvo = axesToTarget(0.35, 0.2, NEUTRAL, config, PF);
  const dt = 1 / 60;
  let pos = playfieldCenter(PF);
  for (let i = 0; i < 30 / dt; i += 1) {
    pos = smoothTowards(pos, alvo, dt, config);
    if (i > config.pointingSettleMs / 1000 / dt) {
      assert.ok(
        Math.hypot(pos.x - alvo.x, pos.y - alvo.y) <= config.pointingToleranceCss,
        `deriva no quadro ${i}`,
      );
    }
  }
});

test('P8 — calibrar recentra', () => {
  const center = playfieldCenter(PF);
  const calibration = calibrationFromSample(sample(0.3, -0.22));
  const target = axesToTarget(0.3, -0.22, calibration, config, PF);
  assert.ok(Math.hypot(target.x - center.x, target.y - center.y) <= config.pointingToleranceCss);
});

test('P9 — a calibração desloca a área alcançável de forma consistente', () => {
  const calibration = { x: 0.18, y: -0.11 };
  for (let i = 0; i < 20; i += 1) {
    const d = -0.5 + (i / 19) * 1.0;
    const e = 0.5 - (i / 19) * 1.0;
    const comCalib = axesToTarget(calibration.x + d, calibration.y + e, calibration, config, PF);
    const semCalib = axesToTarget(d, e, NEUTRAL, config, PF);
    assert.ok(Math.abs(comCalib.x - semCalib.x) <= 1e-9, `x difere no par ${i}`);
    assert.ok(Math.abs(comCalib.y - semCalib.y) <= 1e-9, `y difere no par ${i}`);
  }
});

test('P10 — a estabilidade exige a janela inteira dentro do raio', () => {
  const center = playfieldCenter(PF);
  const dtMs = 1000 / 60;
  const dentro = { x: center.x + config.calibrationStableRadiusCss / 2, y: center.y };
  const fora = { x: center.x + config.calibrationStableRadiusCss * 2, y: center.y };

  let estado = createStabilityState();
  const quadrosQuase = Math.floor(config.calibrationStableMs / dtMs);
  for (let i = 0; i < quadrosQuase; i += 1) {
    estado = updateStability(estado, dentro, PF, dtMs, config);
  }
  assert.equal(estado.stable, false, 'estável antes de completar a janela');

  estado = updateStability(estado, dentro, PF, dtMs, config);
  assert.equal(estado.stable, true, 'não ficou estável ao completar a janela');

  // Um desvio no meio da janela reinicia a contagem.
  let reinicio = createStabilityState();
  for (let i = 0; i < quadrosQuase; i += 1) {
    reinicio = updateStability(reinicio, dentro, PF, dtMs, config);
  }
  reinicio = updateStability(reinicio, fora, PF, dtMs, config);
  assert.equal(reinicio.stableMs, 0);
  assert.equal(reinicio.stable, false);
  reinicio = updateStability(reinicio, dentro, PF, dtMs, config);
  assert.equal(reinicio.stable, false, 'a contagem não reiniciou após sair do raio');
});

test('P11 — recalibrar em partida não altera score nem vidas e recentra a lâmina', () => {
  const center = playfieldCenter(PF);
  let state = { ...createGameState(config), screen: 'jogando', score: 250, lives: 2 };
  let session = createSession(config, PF);
  const dt = 1 / 60;

  // Inclinação constante fora do centro, sem calibrar: a lâmina se afasta.
  for (let i = 0; i < 30; i += 1) {
    const passo = advanceFrame(session, state, dt, sample(0.5, 0.3), config, PF);
    session = passo.session;
    state = passo.state;
  }
  assert.ok(Math.hypot(state.blade.pos.x - center.x, state.blade.pos.y - center.y) > 50);

  const scoreAntes = state.score;
  const vidasAntes = state.lives;

  // Borda de subida de A com a MESMA inclinação: novo neutro.
  const calib = advanceFrame(
    session,
    state,
    dt,
    sample(0.5, 0.3, { buttons: { a: true, start: false } }),
    config,
    PF,
  );
  session = calib.session;
  state = calib.state;

  for (let i = 0; i < 40; i += 1) {
    const passo = advanceFrame(
      session,
      state,
      dt,
      sample(0.5, 0.3, { buttons: { a: true, start: false } }),
      config,
      PF,
    );
    session = passo.session;
    state = passo.state;
  }

  assert.equal(state.score, scoreAntes, 'calibrar alterou o score');
  assert.equal(state.lives, vidasAntes, 'calibrar alterou as vidas');
  assert.ok(
    Math.hypot(state.blade.pos.x - center.x, state.blade.pos.y - center.y) <=
      config.pointingToleranceCss,
    'a lâmina não voltou ao centro após calibrar',
  );
});
