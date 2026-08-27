// Testes E1–E12 de specs/fruit-ninja/tests/entities.md — arremesso, trajetória
// e metades (F3, KPI-7). Faixa de lógica pura: `node --test`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../game/fruit-ninja/js/config.js';
import {
  makeRng,
  computeLaunch,
  launchLimits,
  spawnAt,
  spawnFromLevel,
  stepEntities,
  sliceEntityById,
  sliceCandidates,
  activeCount,
  canSpawn,
} from '../../game/fruit-ninja/js/entities.js';
import { createGameState, levelParams } from '../../game/fruit-ninja/js/rules.js';
import { fixedStep } from '../../game/fruit-ninja/js/loop.js';

const PF = { x: 0, y: config.hudHeightCss, width: 1280, height: 664 };
const BOTTOM = PF.y + PF.height;
const DT = config.fixedStepS;
const G = config.gravityCssPerS2;
const HOOKS = { onSlice() {}, onBomb() {}, onMiss() {}, onCalibrate() {}, onStart() {} };

function partida(seed = 1234) {
  return { ...createGameState(config, seed), screen: 'jogando' };
}

test('E1 — mesma semente produz estados idênticos', () => {
  const rodar = () => {
    let state = partida(777);
    for (let i = 0; i < 600; i += 1) {
      state = fixedStep(state, { x: 0, y: 0 }, { x: 0, y: 0 }, config, PF, HOOKS);
    }
    return JSON.stringify(state);
  };
  assert.equal(rodar(), rodar());
});

test('E2 — a trajetória independe da taxa de quadros (KPI-7)', () => {
  const simular = (dt) => {
    const passos = Math.round(2 / dt);
    let state = spawnAt(
      partida(31),
      'fruit',
      { x: 300, y: BOTTOM + config.spawnBelowCss },
      { x: 90, y: -1050 }, // forte o bastante para ainda estar no ar aos 2 s
      config,
    ).state;
    for (let i = 0; i < passos; i += 1) {
      state = stepEntities(state, dt, config, PF).state;
    }
    return state.entities[0];
  };

  const a = simular(1 / 60);
  const b = simular(1 / 144);
  assert.ok(a && b, 'a entidade deveria continuar viva após 2 s');
  assert.ok(
    Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) <= config.dtToleranceCss,
    `posições divergiram: ${JSON.stringify(a.pos)} vs ${JSON.stringify(b.pos)}`,
  );
});

test('E3 — toda entidade nasce abaixo da borda inferior, subindo e dentro do X do playfield', () => {
  let state = partida(9);
  for (let level = 0; level <= config.maxLevel; level += 1) {
    const params = levelParams(level, config);
    for (let i = 0; i < 20; i += 1) {
      const spawned = spawnFromLevel(state, params, PF, config);
      state = spawned.state;
      const ent = state.entities.at(-1);
      assert.ok(ent.pos.y > BOTTOM, `nasceu acima da borda: ${ent.pos.y}`);
      assert.ok(ent.vel.y < 0, 'deveria nascer subindo');
      assert.ok(ent.pos.x >= PF.x && ent.pos.x <= PF.x + PF.width, 'X fora do playfield');
      state = { ...state, entities: [] }; // libera o teto de simultâneas
    }
  }
});

test('E4 — a integração é balística exata (p0 + v0·t + g·t²/2)', () => {
  const pos0 = { x: 400, y: BOTTOM + config.spawnBelowCss };
  const vel0 = { x: 130, y: -820 };
  let state = spawnAt(partida(5), 'fruit', pos0, vel0, config).state;

  for (let passo = 1; passo <= 200; passo += 1) {
    state = stepEntities(state, DT, config, PF).state;
    const ent = state.entities[0];
    if (!ent) break;
    const t = passo * DT;
    const esperadoX = pos0.x + vel0.x * t;
    const esperadoY = pos0.y + vel0.y * t + (G * t * t) / 2;
    assert.ok(
      Math.hypot(ent.pos.x - esperadoX, ent.pos.y - esperadoY) <= config.dtToleranceCss,
      `divergiu no passo ${passo}`,
    );
  }
});

test('E5 — o ápice fica dentro do playfield e o tempo de voo respeita minAirtimeS', () => {
  for (let level = 0; level <= config.maxLevel; level += 1) {
    const params = levelParams(level, config);
    let rng = makeRng(1000 + level);
    for (let i = 0; i < 50; i += 1) {
      const passo = computeLaunch(rng, params, PF, config);
      rng = passo.rng;
      const { pos, vel, vyBorderCssPerS } = passo.launch;

      // Ápice: subida total = v²/2g acima do ponto de nascimento.
      const apexY = pos.y - (vel.y * vel.y) / (2 * G);
      assert.ok(apexY >= PF.y, `ápice saiu pelo topo no nível ${level}: ${apexY}`);
      assert.ok(apexY <= BOTTOM, `ápice abaixo da borda inferior no nível ${level}`);

      // Tempo de voo dentro da área jogável: sobe e desce a partir da borda.
      const airtime = (2 * vyBorderCssPerS) / G;
      assert.ok(
        airtime >= config.minAirtimeS,
        `tempo de voo ${airtime.toFixed(3)}s < ${config.minAirtimeS}s no nível ${level}`,
      );
    }
  }
});

test('E6 — os arremessos variam em X, ângulo e força, dentro das faixas do nível', () => {
  for (let level = 0; level <= config.maxLevel; level += 1) {
    const params = levelParams(level, config);
    const limites = launchLimits(PF, config);
    let rng = makeRng(4242 + level);
    const xs = new Set();
    const angulos = new Set();
    const forcas = new Set();

    for (let i = 0; i < 50; i += 1) {
      const passo = computeLaunch(rng, params, PF, config);
      rng = passo.rng;
      const { x, angleRad, speedFraction, vyBorderCssPerS } = passo.launch;
      xs.add(x);
      angulos.add(angleRad);
      forcas.add(speedFraction);

      const xMin = PF.x + PF.width * config.spawnXRange[0];
      const xMax = PF.x + PF.width * config.spawnXRange[1];
      assert.ok(x >= xMin - 1e-9 && x <= xMax + 1e-9, 'X fora da faixa de spawn');
      assert.ok(
        angleRad >= config.launchAngleRangeRad[0] - 1e-9 &&
          angleRad <= config.launchAngleRangeRad[1] + 1e-9,
        'ângulo fora da faixa',
      );
      assert.ok(
        speedFraction >= params.launchSpeedRange[0] - 1e-9 &&
          speedFraction <= params.launchSpeedRange[1] + 1e-9,
        'força fora da faixa do nível',
      );
      assert.ok(vyBorderCssPerS <= limites.vyBorderMax + 1e-9, 'força acima do teto físico');
    }

    assert.ok(xs.size >= 10, `nível ${level}: só ${xs.size} valores de X`);
    assert.ok(angulos.size >= 10, `nível ${level}: só ${angulos.size} ângulos`);
    assert.ok(forcas.size >= 10, `nível ${level}: só ${forcas.size} forças`);
  }
});

test('E7 — miss acontece uma única vez, e só descendo', () => {
  // Fruta descendo abaixo da borda: marcada `missed` exatamente uma vez.
  let state = spawnAt(
    partida(3),
    'fruit',
    { x: 500, y: BOTTOM + config.fruitRadiusCss },
    { x: 0, y: 400 },
    config,
  ).state;

  const primeiro = stepEntities(state, DT, config, PF);
  assert.deepEqual(
    primeiro.missed.map((item) => item.kind),
    ['fruit'],
  );
  const segundo = stepEntities(primeiro.state, DT, config, PF);
  assert.deepEqual(segundo.missed, [], 'a mesma fruta não pode ser reportada duas vezes');
  assert.equal(segundo.state.entities.length, 0, 'a fruta resolvida sai no passo seguinte');

  // Fruta ainda SUBINDO abaixo da borda (caso do spawn) não é miss.
  //
  // A posição tem que estar FUNDO o bastante para satisfazer a condição de
  // borda (`pos.y - raio > bottom`) mesmo depois de um passo de subida: senão
  // o teste passa por causa do raio e nunca exercita a guarda `vel.y > 0`,
  // que é justamente o que ele existe para proteger.
  const fundo = BOTTOM + config.fruitRadiusCss + 60;
  const subindo = spawnAt(partida(3), 'fruit', { x: 500, y: fundo }, { x: 0, y: -800 }, config)
    .state;
  const antes = subindo.entities[0];
  assert.ok(
    antes.pos.y - antes.radiusCss > BOTTOM,
    'pré-condição: a fruta precisa estar abaixo da borda por mais que o raio',
  );
  const passo = stepEntities(subindo, DT, config, PF);
  const depois = passo.state.entities[0];
  assert.ok(
    depois.pos.y - depois.radiusCss > BOTTOM,
    'pré-condição: continua abaixo da borda após o passo — só a direção a salva',
  );
  assert.deepEqual(passo.missed, [], 'entidade subindo no spawn não pode contar como perdida');
  assert.equal(depois.state, 'active');
});

test('E8 — cortar cria duas metades cuja média vetorial é a velocidade da fruta', () => {
  const vel = { x: 70, y: -260 };
  let state = spawnAt(partida(11), 'fruit', { x: 640, y: 400 }, vel, config).state;
  const dirRad = 0.6;
  state = sliceEntityById(state, 1, dirRad, config);

  assert.equal(state.halves.length, 2);
  const [h1, h2] = state.halves;

  assert.ok(Math.abs((h1.vel.x + h2.vel.x) / 2 - vel.x) <= config.dtToleranceCss);
  assert.ok(Math.abs((h1.vel.y + h2.vel.y) / 2 - vel.y) <= config.dtToleranceCss);

  // Componentes perpendiculares ao corte: sinais opostos e módulos iguais.
  const perpX = -Math.sin(dirRad);
  const perpY = Math.cos(dirRad);
  const comp = (h) => (h.vel.x - vel.x) * perpX + (h.vel.y - vel.y) * perpY;
  const c1 = comp(h1);
  const c2 = comp(h2);
  assert.ok(c1 * c2 < 0, 'as metades deveriam ir para lados opostos');
  assert.ok(Math.abs(Math.abs(c1) - Math.abs(c2)) <= 1e-9, 'impulsos assimétricos');
  assert.ok(Math.abs(Math.abs(c1) - config.halfImpulseCssPerS) <= 1e-9);
});

test('E9 — metades são inertes e somem ao sair do playfield', () => {
  let state = spawnAt(partida(12), 'fruit', { x: 640, y: 400 }, { x: 0, y: 0 }, config).state;
  state = sliceEntityById(state, 1, 0, config);

  // Não são candidatas a corte.
  const idsCortaveis = sliceCandidates(state).map((ent) => ent.id);
  assert.ok(!idsCortaveis.includes(state.halves[0].id));
  assert.equal(idsCortaveis.length, 0, 'a fruta cortada saiu dos candidatos');

  // Caem para fora sem gerar miss (não custam vida nem pontuam).
  let atual = { ...state, entities: [] };
  const scoreAntes = atual.score;
  const vidasAntes = atual.lives;
  for (let i = 0; i < 2000 && atual.halves.length > 0; i += 1) {
    const passo = stepEntities(atual, DT, config, PF);
    assert.deepEqual(passo.missed, [], 'metade não pode gerar evento de perda');
    atual = passo.state;
  }
  assert.equal(atual.halves.length, 0, 'as metades deveriam ter sido removidas');
  assert.equal(atual.score, scoreAntes);
  assert.equal(atual.lives, vidasAntes);
});

test('E10 — o teto de simultâneas do nível nunca é excedido', () => {
  let state = partida(2024);
  // Lâmina parada: nada é cortado, só arremessos e perdas.
  const parada = { x: 0, y: 0 };
  for (let i = 0; i < 120 * 90; i += 1) {
    state = fixedStep(state, parada, parada, config, PF, HOOKS);
    if (state.screen === 'gameOver') break;
    const params = levelParams(state.level, config);
    assert.ok(
      activeCount(state) <= params.maxSimultaneous,
      `nível ${state.level}: ${activeCount(state)} ativas > ${params.maxSimultaneous}`,
    );
  }

  // Com o teto atingido, o arremesso é ADIADO — o cronômetro não é zerado.
  const params = levelParams(0, config);
  let cheio = partida(1);
  for (let i = 0; i < params.maxSimultaneous; i += 1) {
    cheio = spawnAt(cheio, 'fruit', { x: 100 + i, y: 400 }, { x: 0, y: -10 }, config).state;
  }
  assert.equal(canSpawn(cheio, params), false);
  const comTimer = { ...cheio, spawnTimerS: params.spawnIntervalS };
  const depois = fixedStep(comTimer, { x: 0, y: 0 }, { x: 0, y: 0 }, config, PF, HOOKS);
  assert.equal(activeCount(depois), params.maxSimultaneous, 'arremessou além do teto');
  assert.ok(depois.spawnTimerS >= params.spawnIntervalS, 'o cronômetro foi zerado silenciosamente');
});

test('E12 — o estado recebido não é mutado', () => {
  let state = spawnAt(partida(8), 'fruit', { x: 300, y: 500 }, { x: 20, y: -300 }, config).state;
  const copia = JSON.parse(JSON.stringify(state));

  stepEntities(state, DT, config, PF);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), copia, 'stepEntities mutou o argumento');

  sliceEntityById(state, 1, 0.3, config);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), copia, 'sliceEntityById mutou o argumento');

  spawnAt(state, 'bomb', { x: 1, y: 2 }, { x: 0, y: 0 }, config);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), copia, 'spawnAt mutou o argumento');
});
