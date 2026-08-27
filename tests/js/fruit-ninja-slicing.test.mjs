// Testes S1–S16 de specs/fruit-ninja/tests/slicing.md — corte por movimento e
// bombas (F4, F5, KPI-6). Faixa de lógica pura: `node --test`.
//
// O corte é intersecção SEGMENTO x CÍRCULO ENTRE QUADROS, no referencial da
// entidade. Testar só a posição do quadro atual passa no teste e falha no jogo
// (tunneling) — por isso S1 e S6 carregam verificações negativas explícitas
// contra as duas implementações ingênuas que este módulo existe para descartar.

import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../game/fruit-ninja/js/config.js';
import {
  detectSlices,
  bladeSpeed,
  segmentOriginDistance,
} from '../../game/fruit-ninja/js/slicing.js';
import {
  spawnAt,
  stepEntities,
  sliceCandidates,
  makeRng,
  nextRange,
} from '../../game/fruit-ninja/js/entities.js';
import { createGameState, levelParams, registerMissed } from '../../game/fruit-ninja/js/rules.js';
import { fixedStep } from '../../game/fruit-ninja/js/loop.js';

const PF = { x: 0, y: config.hudHeightCss, width: 1280, height: 664 };
const CENTER = { x: PF.x + PF.width / 2, y: PF.y + PF.height / 2 };
const DT = config.fixedStepS;
const R = config.fruitRadiusCss;

/** Candidato mínimo no formato que `detectSlices` consome. */
function fruta(id, pos, prevPos = pos) {
  return {
    id,
    kind: 'fruit',
    radiusCss: R,
    prevPos: { ...prevPos },
    pos: { ...pos },
    state: 'active',
  };
}

/** Segmento com velocidade exata pedida, centrado em `mid`, na horizontal. */
function gestoHorizontal(mid, speedCssPerS, y = mid.y) {
  const meia = (speedCssPerS * DT) / 2;
  return [
    { x: mid.x - meia, y },
    { x: mid.x + meia, y },
  ];
}

test('S1 — anti-tunneling: lâmina rápida atravessa a fruta sem parar dentro dela', () => {
  const alvo = fruta(1, CENTER);
  const meia = (4 * R + 10) / 2;
  const prev = { x: CENTER.x - meia, y: CENTER.y };
  const curr = { x: CENTER.x + meia, y: CENTER.y };

  // Pré-condição do caso: NENHUM extremo está dentro do círculo.
  assert.ok(Math.hypot(prev.x - CENTER.x, prev.y - CENTER.y) > R);
  assert.ok(Math.hypot(curr.x - CENTER.x, curr.y - CENTER.y) > R);
  assert.ok(bladeSpeed(prev, curr, DT) >= config.minSliceSpeedCssPerS);

  const cortes = detectSlices(prev, curr, [alvo], DT, config);
  assert.equal(cortes.length, 1);
  assert.equal(cortes[0].entityId, 1);
});

test('S1 (negativo) — testar só a posição do quadro atual NÃO detecta o corte', () => {
  const meia = (4 * R + 10) / 2;
  const prev = { x: CENTER.x - meia, y: CENTER.y };
  const curr = { x: CENTER.x + meia, y: CENTER.y };

  // Implementação de referência ingênua: "a lâmina está dentro do círculo?".
  const ingenua = Math.hypot(curr.x - CENTER.x, curr.y - CENTER.y) <= R;
  assert.equal(
    ingenua,
    false,
    'a implementação por posição deveria falhar aqui — S1 não discrimina nada',
  );
});

test('S2 — posição sobre a fruta sem gesto não corta', () => {
  const alvo = fruta(1, CENTER);
  const parada = { x: CENTER.x, y: CENTER.y };
  assert.deepEqual(detectSlices(parada, parada, [alvo], DT, config), []);
});

test('S3 — limiar de velocidade, nas três bordas', () => {
  const limiar = config.minSliceSpeedCssPerS;
  const alvo = () => fruta(1, CENTER);

  const abaixo = gestoHorizontal(CENTER, limiar - 1);
  assert.ok(bladeSpeed(...abaixo, DT) < limiar);
  assert.equal(detectSlices(...abaixo, [alvo()], DT, config).length, 0, 'abaixo do limiar');

  const exato = gestoHorizontal(CENTER, limiar);
  assert.ok(bladeSpeed(...exato, DT) >= limiar, 'a comparação no limiar tem que ser inclusiva');
  assert.equal(detectSlices(...exato, [alvo()], DT, config).length, 1, 'exatamente no limiar');

  const acima = gestoHorizontal(CENTER, limiar + 1);
  assert.equal(detectSlices(...acima, [alvo()], DT, config).length, 1, 'acima do limiar');
});

test('S4 — distância mínima ao centro, nas três bordas', () => {
  const alvo = () => fruta(1, CENTER);
  const rapido = 400; // meia-largura ampla, muito acima do limiar

  const passar = (offsetY) =>
    detectSlices(
      { x: CENTER.x - rapido, y: CENTER.y + offsetY },
      { x: CENTER.x + rapido, y: CENTER.y + offsetY },
      [alvo()],
      DT,
      config,
    );

  assert.equal(passar(R + 0.5).length, 0, 'r + delta não deveria cortar');
  assert.equal(passar(R).length, 1, 'tangência (r exato) tem que cortar — comparação inclusiva');
  assert.equal(passar(R - 0.5).length, 1, 'r - delta tem que cortar');

  // A distância usada é mesmo a do segmento, não a dos extremos.
  const d = segmentOriginDistance(-rapido, R, rapido, R);
  assert.ok(Math.abs(d.distance - R) < 1e-9);
});

test('S5 — fruta rápida sobre lâmina lenta não corta (o gesto é do jogador)', () => {
  const prevPos = { x: CENTER.x, y: CENTER.y - 3 * R };
  const pos = { x: CENTER.x, y: CENTER.y + 3 * R };
  assert.ok(Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y) > 2 * R, 'a fruta tem que ser rápida');

  const alvo = fruta(1, pos, prevPos);
  const lenta = gestoHorizontal(CENTER, config.minSliceSpeedCssPerS - 10);
  assert.equal(detectSlices(...lenta, [alvo], DT, config).length, 0);
});

test('S6 — fruta rápida com gesto válido corta (referencial relativo)', () => {
  const prevPos = { x: CENTER.x, y: CENTER.y - 50 };
  const pos = { x: CENTER.x, y: CENTER.y + 50 };
  assert.ok(Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y) > 2 * R);

  const prev = { x: CENTER.x - 100, y: CENTER.y };
  const curr = { x: CENTER.x + 100, y: CENTER.y };
  assert.ok(bladeSpeed(prev, curr, DT) >= config.minSliceSpeedCssPerS);

  const cortes = detectSlices(prev, curr, [fruta(1, pos, prevPos)], DT, config);
  assert.equal(cortes.length, 1, 'o referencial relativo deveria detectar o cruzamento');
});

test('S6 (negativo) — usar só a posição final da fruta NÃO detecta o cruzamento', () => {
  const pos = { x: CENTER.x, y: CENTER.y + 50 };
  const prev = { x: CENTER.x - 100, y: CENTER.y };
  const curr = { x: CENTER.x + 100, y: CENTER.y };

  // Referência ingênua: fruta congelada na posição final (prevPos == pos).
  const cortes = detectSlices(prev, curr, [fruta(1, pos, pos)], DT, config);
  assert.equal(
    cortes.length,
    0,
    'a implementação por posição final deveria falhar aqui — S6 não discrimina nada',
  );
});

test('S7 — entidade já cortada não é reportada de novo', () => {
  const alvo = { ...fruta(1, CENTER), state: 'sliced' };
  const rapido = gestoHorizontal(CENTER, 20000);
  assert.equal(detectSlices(...rapido, [alvo], DT, config).length, 0);

  // E o mesmo segmento continua cortando enquanto ela está ativa.
  assert.equal(detectSlices(...rapido, [fruta(1, CENTER)], DT, config).length, 1);
});

test('S8 — múltiplos cortes no mesmo passo, ordenados por entityId', () => {
  const ys = CENTER.y;
  const alvos = [
    fruta(7, { x: CENTER.x - 120, y: ys }),
    fruta(3, { x: CENTER.x, y: ys }),
    fruta(5, { x: CENTER.x + 120, y: ys }),
  ];
  const prev = { x: CENTER.x - 400, y: ys };
  const curr = { x: CENTER.x + 400, y: ys };

  const ordemA = detectSlices(prev, curr, alvos, DT, config);
  const ordemB = detectSlices(prev, curr, [...alvos].reverse(), DT, config);

  assert.equal(ordemA.length, 3);
  assert.deepEqual(
    ordemA.map((slice) => slice.entityId),
    [3, 5, 7],
  );
  assert.deepEqual(
    ordemB.map((slice) => slice.entityId),
    [3, 5, 7],
    'a ordem de inserção não pode influenciar o resultado',
  );
});

test('S9 — segmento degenerado e dt zero não produzem NaN', () => {
  const parada = { x: CENTER.x, y: CENTER.y };
  assert.deepEqual(detectSlices(parada, parada, [fruta(1, CENTER)], DT, config), []);
  assert.deepEqual(detectSlices(parada, parada, [fruta(1, CENTER)], 0, config), []);

  const rapido = gestoHorizontal(CENTER, 20000);
  assert.deepEqual(detectSlices(...rapido, [fruta(1, CENTER)], 0, config), []);
  assert.equal(bladeSpeed(parada, { x: 10, y: 10 }, 0), 0);
  assert.ok(Number.isFinite(bladeSpeed(parada, { x: 10, y: 10 }, DT)));
});

test('S10 — o SliceResult traz ponto dentro do círculo e direção paralela ao gesto', () => {
  const prev = { x: CENTER.x - 200, y: CENTER.y - 200 };
  const curr = { x: CENTER.x + 200, y: CENTER.y + 200 };
  const [corte] = detectSlices(prev, curr, [fruta(1, CENTER)], DT, config);

  assert.ok(corte, 'deveria haver corte');
  assert.ok(
    Math.hypot(corte.point.x - CENTER.x, corte.point.y - CENTER.y) <= R,
    'o ponto do corte tem que cair dentro do círculo da fruta',
  );
  const esperado = Math.atan2(curr.y - prev.y, curr.x - prev.x);
  assert.ok(Math.abs(corte.dirRad - esperado) < 1e-9);
});

test('S12 — varredura com semente fixa: 0 falsos positivos, 100 cortes verdadeiros', () => {
  let rng = makeRng(20240827);
  const sorteio = (lo, hi) => {
    const passo = nextRange(rng, lo, hi);
    rng = passo.rng;
    return passo.value;
  };

  let falsosPositivos = 0;
  for (let i = 0; i < 100; i += 1) {
    const cx = sorteio(300, 980);
    const cy = sorteio(200, 600);
    const alvo = fruta(1, { x: cx, y: cy });
    const delta = 0.5;
    // Segmento horizontal passando a exatamente r + delta do centro.
    const lado = i % 2 === 0 ? 1 : -1;
    const y = cy + lado * (R + delta);
    const corte = detectSlices({ x: cx - 400, y }, { x: cx + 400, y }, [alvo], DT, config);
    falsosPositivos += corte.length;
  }
  assert.equal(falsosPositivos, 0, 'nenhum segmento fora do raio pode cortar');

  let cortes = 0;
  for (let i = 0; i < 100; i += 1) {
    const cx = sorteio(300, 980);
    const cy = sorteio(200, 600);
    const alvo = fruta(1, { x: cx, y: cy });
    const meia = 2 * R + 5; // travessia com deslocamento > 4r
    const ang = sorteio(0, Math.PI);
    const dx = Math.cos(ang) * meia;
    const dy = Math.sin(ang) * meia;
    const encontrados = detectSlices(
      { x: cx - dx, y: cy - dy },
      { x: cx + dx, y: cy + dy },
      [alvo],
      DT,
      config,
    );
    cortes += encontrados.length;
  }
  assert.equal(cortes, 100, 'toda travessia pelo centro tem que cortar');
});

// ------------------------------------------------------------------- bombas

/** Partida em andamento com uma única entidade parada no centro. */
function partidaCom(kind) {
  const base = { ...createGameState(config, 99), screen: 'jogando', lives: 3 };
  const spawn = spawnAt(base, kind, CENTER, { x: 0, y: 0 }, config);
  return spawn.state;
}

test('S13 — cortar bomba encerra a partida no mesmo passo, com vidas sobrando', () => {
  const state = partidaCom('bomb');
  assert.equal(state.lives, 3);

  const meia = 300;
  const depois = fixedStep(
    state,
    { x: CENTER.x - meia, y: CENTER.y },
    { x: CENTER.x + meia, y: CENTER.y },
    config,
    PF,
    { onBomb() {}, onSlice() {}, onMiss() {}, onCalibrate() {}, onStart() {} },
  );

  assert.equal(depois.screen, 'gameOver');
  assert.equal(depois.gameOverReason, 'bomb');
  assert.ok(depois.lives > 0, 'a bomba encerra independentemente das vidas');
});

test('S14 — bomba não cortada que cai é inofensiva', () => {
  const base = { ...createGameState(config, 7), screen: 'jogando' };
  const bottom = PF.y + PF.height;
  const spawn = spawnAt(
    base,
    'bomb',
    { x: CENTER.x, y: bottom + config.bombRadiusCss },
    { x: 0, y: 300 },
    config,
  );
  let state = spawn.state;
  const scoreAntes = state.score;
  const vidasAntes = state.lives;
  const comboAntes = state.blade.comboCount;

  const passo = stepEntities(state, DT, config, PF);
  assert.deepEqual(
    passo.missed.map((item) => item.kind),
    ['bomb'],
    'a bomba deveria ter cruzado a borda inferior',
  );

  // A bomba perdida não custa vida nem pontua, e sai do estado no passo seguinte.
  state = registerMissed(passo.state, passo.missed);
  assert.equal(state.lives, vidasAntes);
  assert.equal(state.score, scoreAntes);
  assert.equal(state.blade.comboCount, comboAntes);
  assert.notEqual(state.screen, 'gameOver');

  const seguinte = stepEntities(state, DT, config, PF);
  assert.equal(seguinte.state.entities.length, 0, 'a bomba resolvida sai no passo seguinte');
});

test('S15 — bomba e fruta têm a mesma física', () => {
  const vel = { x: 120, y: -700 };
  const pos = { x: CENTER.x, y: PF.y + PF.height };

  const trajetoria = (kind) => {
    const base = { ...createGameState(config, 4242), screen: 'jogando' };
    let state = spawnAt(base, kind, pos, vel, config).state;
    const pontos = [];
    for (let i = 0; i < 120; i += 1) {
      state = stepEntities(state, DT, config, PF).state;
      const ent = state.entities[0];
      if (!ent) break;
      pontos.push([ent.pos.x, ent.pos.y]);
    }
    return pontos;
  };

  assert.deepEqual(trajetoria('bomb'), trajetoria('fruit'));

  // Diferem só em kind e raio.
  const base = { ...createGameState(config, 1), screen: 'jogando' };
  const bomba = spawnAt(base, 'bomb', pos, vel, config).state.entities[0];
  const frutinha = spawnAt(base, 'fruit', pos, vel, config).state.entities[0];
  assert.notEqual(bomba.kind, frutinha.kind);
  assert.equal(bomba.radiusCss, config.bombRadiusCss);
  assert.equal(frutinha.radiusCss, config.fruitRadiusCss);
});

test('S16 — bombChance é positiva e não-decrescente entre níveis', () => {
  for (let level = 0; level <= config.maxLevel; level += 1) {
    const atual = levelParams(level, config);
    assert.ok(atual.bombChance > 0, `nível ${level} sem bombas`);
    if (level > 0) {
      const anterior = levelParams(level - 1, config);
      assert.ok(
        atual.bombChance >= anterior.bombChance,
        `bombChance caiu do nível ${level - 1} para ${level}`,
      );
    }
  }
});
