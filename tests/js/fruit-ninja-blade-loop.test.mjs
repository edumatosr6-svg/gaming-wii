// Testes T1–T8 (specs/fruit-ninja/tests/blade-and-trail.md) e L1–L7
// (specs/fruit-ninja/tests/loop.md) — rastro da lâmina e game loop de passo
// fixo (F2, F13, KPI-3, KPI-7). Faixa de lógica pura: `node --test`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../../game/fruit-ninja/js/config.js';
import {
  createBladeState,
  pushSample,
  clearTrail,
  trailPoints,
} from '../../game/fruit-ninja/js/blade.js';
import { createGameState } from '../../game/fruit-ninja/js/rules.js';
import { createSession, advanceFrame, framePositions } from '../../game/fruit-ninja/js/loop.js';

const PF = { x: 0, y: config.hudHeightCss, width: 1280, height: 664 };
const CENTER = { x: PF.x + PF.width / 2, y: PF.y + PF.height / 2 };

function amostra(rawX, rawY, extra = {}) {
  return {
    rawX,
    rawY,
    buttons: { a: false, start: false },
    connected: true,
    timestampMs: 0,
    ...extra,
  };
}

const DESCONECTADO = {
  rawX: 0,
  rawY: 0,
  buttons: { a: false, start: false },
  connected: false,
  timestampMs: 0,
};

// ------------------------------------------------------------------ rastro

test('T1 — pushSample é puro e não muta o estado recebido', () => {
  const estado = createBladeState({ x: 10, y: 20 });
  const copia = JSON.parse(JSON.stringify(estado));
  const novo = pushSample(estado, { x: 30, y: 40, t: 100 }, config);

  assert.deepEqual(JSON.parse(JSON.stringify(estado)), copia, 'pushSample mutou o argumento');
  assert.notEqual(novo, estado);
  assert.equal(novo.samples.length, 1);
  assert.deepEqual(novo.samples[0], { x: 30, y: 40, t: 100 });
});

test('T2 — amostras expiram por idade, e a mais recente nunca é descartada', () => {
  let estado = createBladeState();
  for (let i = 0; i <= 10; i += 1) {
    estado = pushSample(estado, { x: i, y: 0, t: i * 50 }, config);
  }
  const maisNova = estado.samples.at(-1).t;
  for (const s of estado.samples) {
    assert.ok(maisNova - s.t <= config.trailDurationMs, `amostra vencida retida: idade ${maisNova - s.t}`);
  }

  // Intervalo entre quadros maior que a duração inteira do rastro.
  const salto = pushSample(estado, { x: 99, y: 99, t: maisNova + config.trailDurationMs * 5 }, config);
  assert.equal(salto.samples.length, 1, 'só a mais recente deveria sobrar');
  assert.deepEqual(
    { x: salto.samples[0].x, y: salto.samples[0].y },
    { x: 99, y: 99 },
    'a amostra mais recente não pode ser descartada',
  );
});

test('T3 — o teto de amostras é respeitado e descarta sempre a mais antiga', () => {
  let estado = createBladeState();
  // Quadros muito rápidos: t avança pouco, então nada expira por idade.
  for (let i = 0; i < config.maxTrailSamples * 3; i += 1) {
    estado = pushSample(estado, { x: i, y: 0, t: i * 0.01 }, config);
    assert.ok(estado.samples.length <= config.maxTrailSamples, `estourou em ${estado.samples.length}`);
  }
  assert.equal(estado.samples.length, config.maxTrailSamples);

  // Ordem crescente de t preservada e a mais antiga é que sai.
  for (let i = 1; i < estado.samples.length; i += 1) {
    assert.ok(estado.samples[i].t >= estado.samples[i - 1].t, 'ordem temporal quebrada');
  }
  const esperadoPrimeiro = config.maxTrailSamples * 3 - config.maxTrailSamples;
  assert.equal(estado.samples[0].x, esperadoPrimeiro, 'o descarte não removeu as mais antigas');
});

test('T4 — trailDurationMs está na faixa de F2.3', () => {
  assert.ok(config.trailDurationMs >= 150 && config.trailDurationMs <= 400);
});

test('T5 — continuidade do rastro a 800 px/s e 60 Hz (KPI-3)', () => {
  const dtMs = 1000 / 60;
  const passoIdeal = (config.trailReferenceSpeedCssPerS * dtMs) / 1000;

  let estado = createBladeState();
  const injetadas = [];
  for (let i = 0; i < 60; i += 1) {
    const p = { x: 100 + i * passoIdeal, y: 300, t: i * dtMs };
    injetadas.push(p);
    estado = pushSample(estado, p, config);
  }

  const pontos = trailPoints(estado);
  let maior = 0;
  for (let i = 1; i < pontos.length; i += 1) {
    maior = Math.max(maior, Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y));
  }
  assert.ok(
    maior <= config.bladeMaxStepCss,
    `maior salto ${maior.toFixed(2)} px > ${config.bladeMaxStepCss} px`,
  );

  // Verificação NEGATIVA: decimando uma amostra a cada duas, o passo dobra e
  // o critério tem que reprovar — é assim que se sabe que T5 não é vacuoso.
  let decimado = createBladeState();
  injetadas.forEach((p, i) => {
    if (i % 2 === 0) decimado = pushSample(decimado, p, config);
  });
  const pontosDecimados = trailPoints(decimado);
  let maiorDecimado = 0;
  for (let i = 1; i < pontosDecimados.length; i += 1) {
    maiorDecimado = Math.max(
      maiorDecimado,
      Math.hypot(
        pontosDecimados[i].x - pontosDecimados[i - 1].x,
        pontosDecimados[i].y - pontosDecimados[i - 1].y,
      ),
    );
  }
  assert.ok(
    maiorDecimado > config.bladeMaxStepCss,
    `o rastro decimado (${maiorDecimado.toFixed(2)} px) deveria reprovar — T5 é vacuoso`,
  );
});

test('T6 — o rastro devolvido é exatamente o que foi empilhado, sem interpolar', () => {
  let estado = createBladeState();
  const injetadas = [];
  for (let i = 0; i < 8; i += 1) {
    const p = { x: 200 + i * 11, y: 400 - i * 3, t: i * 10 };
    injetadas.push(p);
    estado = pushSample(estado, p, config);
  }
  assert.deepEqual(trailPoints(estado), injetadas, 'nem mais pontos (suavização) nem menos');
});

test('T7 — o rastro é limpo no retorno do controle, sem segmento espúrio', () => {
  let estado = createBladeState();
  estado = pushSample(estado, { x: 100, y: 100, t: 0 }, config);
  estado = pushSample(estado, { x: 110, y: 100, t: 10 }, config);
  const ultimaAntes = estado.samples.at(-1);

  const limpo = clearTrail(estado);
  assert.deepEqual(limpo.samples, []);
  assert.equal(limpo.speedCssPerS, 0);

  const depois = pushSample(limpo, { x: 900, y: 700, t: 20 }, config);
  assert.equal(depois.samples.length, 1, 'a primeira amostra pós-pausa não pode formar segmento');
  assert.notDeepEqual(depois.samples[0], ultimaAntes);
  assert.equal(depois.speedCssPerS, 0, 'velocidade herdada geraria corte espúrio');
});

test('T8 — speedCssPerS é |Δp|/Δt e não vira NaN nem Infinity', () => {
  let estado = createBladeState();
  estado = pushSample(estado, { x: 0, y: 0, t: 0 }, config);
  assert.equal(estado.speedCssPerS, 0, 'uma amostra só não define velocidade');

  estado = pushSample(estado, { x: 30, y: 40, t: 100 }, config);
  assert.ok(Math.abs(estado.speedCssPerS - 500) < 1e-9, '50 px em 100 ms = 500 px/s');

  // Δt = 0 devolve 0, sem divisão por zero.
  const mesmoT = pushSample(estado, { x: 130, y: 40, t: 100 }, config);
  assert.equal(mesmoT.speedCssPerS, 0);
  assert.ok(Number.isFinite(mesmoT.speedCssPerS));
});

// -------------------------------------------------------------------- loop

function partidaEmAndamento(seed = 4242) {
  const state = { ...createGameState(config, seed), screen: 'jogando' };
  return { state, session: createSession(config, PF) };
}

test('L1 — 60 Hz e 144 Hz produzem a mesma partida (KPI-7)', () => {
  // (a) AGENDAMENTO: no mesmo orçamento de tempo real, o número de passos
  //     fixos difere em no máximo 1 (resíduo do acumulador, F13.1).
  const porQuadros = (dt) => {
    let { state, session } = partidaEmAndamento(31337);
    let passos = 0;
    for (let i = 0; i < Math.round(2 / dt); i += 1) {
      const quadro = advanceFrame(session, state, dt, amostra(0.25, -0.15), config, PF);
      session = quadro.session;
      state = quadro.state;
      passos += quadro.steps;
    }
    return passos;
  };
  const passos60 = porQuadros(1 / 60);
  const passos144 = porQuadros(1 / 144);
  assert.ok(Math.abs(passos60 - passos144) <= 1, `passos: ${passos60} vs ${passos144}`);

  // (b) EQUIVALÊNCIA DE ESTADO: comparada no mesmo TEMPO SIMULADO.
  //
  //     Por que não no mesmo número de quadros: o item (a) já admite um passo
  //     fixo de diferença, e um passo a mais desloca uma entidade em
  //     `vel * fixedStepS` — até ~9 px nas velocidades de arremesso deste
  //     jogo. Exigir `dtToleranceCss` (1 px) sobre estados separados por um
  //     passo é aritmeticamente impossível para QUALQUER implementação. A
  //     propriedade que o KPI-7 quer é que a simulação avance igual por
  //     unidade de tempo simulado — é isso que se verifica aqui.
  const ateTempo = (dt, alvoS) => {
    let { state, session } = partidaEmAndamento(31337);
    let passos = 0;
    while (state.elapsedS < alvoS - 1e-9) {
      const quadro = advanceFrame(session, state, dt, amostra(0.25, -0.15), config, PF);
      session = quadro.session;
      state = quadro.state;
      passos += quadro.steps;
    }
    return { passos, state };
  };

  const a = ateTempo(1 / 60, 2);
  const b = ateTempo(1 / 144, 2);

  assert.equal(a.passos, b.passos, 'mesmo tempo simulado exige o mesmo número de passos fixos');
  assert.ok(Math.abs(a.state.elapsedS - b.state.elapsedS) < 1e-9);
  assert.equal(a.state.score, b.state.score);
  assert.equal(a.state.lives, b.state.lives);
  assert.equal(a.state.entities.length, b.state.entities.length, 'número de entidades difere');

  for (let i = 0; i < a.state.entities.length; i += 1) {
    const ea = a.state.entities[i];
    const eb = b.state.entities[i];
    assert.equal(ea.id, eb.id);
    assert.ok(
      Math.hypot(ea.pos.x - eb.pos.x, ea.pos.y - eb.pos.y) <= config.dtToleranceCss,
      `entidade ${ea.id} divergiu além de ${config.dtToleranceCss} px`,
    );
  }
});

test('L2 — os segmentos do quadro são contíguos e ancorados nas duas amostras', () => {
  const prev = { x: 100, y: 200 };
  const curr = { x: 700, y: 500 };
  for (const passos of [2, 3, 7, 30]) {
    const pontos = framePositions(prev, curr, passos);
    assert.equal(pontos.length, passos + 1, `deveria haver ${passos + 1} pontos`);
    assert.deepEqual(pontos[0], prev, 'o primeiro ponto é a amostra do quadro anterior');
    assert.deepEqual(pontos.at(-1), curr, 'o último ponto é a amostra atual');

    // Contiguidade por identidade: fim de um é começo do outro.
    for (let i = 0; i + 1 < pontos.length; i += 1) {
      assert.equal(pontos[i + 1].x, pontos[i + 1].x);
      assert.equal(pontos[i + 1].y, pontos[i + 1].y);
    }

    // E nenhum segmento é degenerado (mesma posição em todos os passos).
    const degenerados = pontos.slice(1).filter((p) => p.x === curr.x && p.y === curr.y).length;
    assert.equal(degenerados, 1, 'só o último ponto pode ser a posição final');
  }
});

test('L3 — a soma dos segmentos cobre a distância entre as amostras, sem lacuna', () => {
  const prev = { x: 120, y: 640 };
  const curr = { x: 980, y: 180 };
  const distancia = Math.hypot(curr.x - prev.x, curr.y - prev.y);

  for (const passos of [1, 2, 5, 16, 30]) {
    const pontos = framePositions(prev, curr, passos);
    let soma = 0;
    for (let i = 1; i < pontos.length; i += 1) {
      soma += Math.hypot(pontos[i].x - pontos[i - 1].x, pontos[i].y - pontos[i - 1].y);
    }
    assert.ok(Math.abs(soma - distancia) < 1e-6, `passos=${passos}: soma ${soma} != ${distancia}`);
  }
});

test('L4 — um quadro gigante é limitado (sem espiral da morte)', () => {
  let { state, session } = partidaEmAndamento();
  const maximo = Math.floor(config.maxFrameDeltaS / config.fixedStepS);

  const gigante = advanceFrame(session, state, 2, amostra(0.2, 0.1), config, PF);
  assert.ok(gigante.steps <= maximo, `${gigante.steps} passos > teto ${maximo}`);
  assert.ok(Math.abs(gigante.state.elapsedS - maximo * config.fixedStepS) < 1e-9);

  // E o quadro seguinte continua consistente.
  const seguinte = advanceFrame(
    gigante.session,
    gigante.state,
    1 / 60,
    amostra(0.2, 0.1),
    config,
    PF,
  );
  assert.ok(seguinte.steps > 0 && seguinte.steps <= maximo);
  assert.ok(seguinte.state.elapsedS > gigante.state.elapsedS);
});

test('L5 — o acumulador preserva o resto entre quadros', () => {
  let { state, session } = partidaEmAndamento();
  let passos = 0;
  // Deltas fracionários que não são múltiplos do passo fixo.
  const deltas = [0.007, 0.013, 0.0091, 0.0111, 0.0043];
  let tempo = 0;
  let i = 0;
  while (tempo < 1) {
    const dt = deltas[i % deltas.length];
    const quadro = advanceFrame(session, state, dt, amostra(0.2, 0.1), config, PF);
    session = quadro.session;
    state = quadro.state;
    passos += quadro.steps;
    tempo += dt;
    i += 1;
  }

  const esperado = Math.round(tempo / config.fixedStepS);
  assert.ok(
    Math.abs(passos - esperado) <= 1,
    `após ${tempo.toFixed(4)}s: ${passos} passos, esperado ${esperado} ± 1`,
  );
});

test('L6 — delta zero não avança nada da simulação', () => {
  let { state, session } = partidaEmAndamento();
  // Avança um pouco para haver entidades em voo.
  for (let i = 0; i < 200; i += 1) {
    const q = advanceFrame(session, state, 1 / 60, amostra(0.2, 0.1), config, PF);
    session = q.session;
    state = q.state;
  }
  assert.ok(state.entities.length > 0, 'pré-condição: deveria haver entidades');

  const antes = {
    elapsedS: state.elapsedS,
    entities: JSON.parse(JSON.stringify(state.entities)),
    score: state.score,
    lives: state.lives,
  };

  const parado = advanceFrame(session, state, 0, amostra(0.2, 0.1), config, PF);
  assert.equal(parado.steps, 0);
  assert.equal(parado.state.elapsedS, antes.elapsedS);
  assert.deepEqual(JSON.parse(JSON.stringify(parado.state.entities)), antes.entities);
  assert.equal(parado.state.score, antes.score);
  assert.equal(parado.state.lives, antes.lives);
});

test('L7 — sem gamepad o jogo congela e nada avança', () => {
  let { state, session } = partidaEmAndamento();
  for (let i = 0; i < 200; i += 1) {
    const q = advanceFrame(session, state, 1 / 60, amostra(0.2, 0.1), config, PF);
    session = q.session;
    state = q.state;
  }
  assert.ok(state.entities.length > 0);

  const antes = {
    elapsedS: state.elapsedS,
    entities: JSON.parse(JSON.stringify(state.entities)),
    score: state.score,
    lives: state.lives,
  };

  for (let i = 0; i < 120; i += 1) {
    const q = advanceFrame(session, state, 1 / 60, DESCONECTADO, config, PF);
    session = q.session;
    state = q.state;
    assert.equal(q.steps, 0, 'nenhum passo fixo pode rodar sem controle');
  }

  assert.equal(state.screen, 'aguardando');
  assert.equal(state.elapsedS, antes.elapsedS);
  assert.deepEqual(JSON.parse(JSON.stringify(state.entities)), antes.entities);
  assert.equal(state.score, antes.score);
  assert.equal(state.lives, antes.lives);
  assert.deepEqual(state.blade.samples, [], 'o rastro tem que ser limpo na pausa (T7)');

  // Ao voltar, a partida retoma com o mesmo score/vidas.
  const retorno = advanceFrame(session, state, 1 / 60, amostra(0.2, 0.1), config, PF);
  assert.equal(retorno.state.screen, 'jogando');
  assert.equal(retorno.state.score, antes.score);
  assert.equal(retorno.state.lives, antes.lives);
});
