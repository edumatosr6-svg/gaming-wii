// Game loop com passo de tempo fixo (F13) e transições de tela (F11/F12).
//
// `advanceFrame` recebe `delta` como argumento e não toca no navegador: é
// assim que a faixa de lógica pura consegue exercitar o loop inteiro sem
// `requestAnimationFrame` (tests/loop.md). O `rAF` aparece uma única vez neste
// arquivo, dentro de `startLoop` (X8).

import { axesToTarget, smoothTowards, calibrationFromSample, updateStability, createStabilityState, createCalibration } from './input.js';
import { pushSample, clearTrail } from './blade.js';
import { sliceCandidates, stepEntities, sliceEntityById, spawnFromLevel, canSpawn } from './entities.js';
import { detectSlices, bladeSpeed } from './slicing.js';
import { levelForElapsed, levelParams, updateStroke, registerFruitSlice, registerBombSlice, registerMissed, startGame } from './rules.js';

/** Estado de sessão: o que é do quadro, não da partida. */
export function createSession(config, playfield) {
  const center = { x: playfield.x + playfield.width / 2, y: playfield.y + playfield.height / 2 };
  return {
    calibration: createCalibration(),
    stability: createStabilityState(),
    accumulatorS: 0,
    clockMs: 0,
    framePos: { x: center.x, y: center.y },
    prevButtons: { a: false, start: false },
    resumeScreen: null,
    config,
  };
}

/**
 * Posições dos passos fixos dentro de um quadro (F13.2).
 *
 * Devolve `steps + 1` pontos: `[0]` é a amostra do quadro anterior e
 * `[steps]` é a amostra atual, ambas por identidade. Os segmentos são
 * `(pontos[i], pontos[i+1])`, portanto contíguos por construção — usar a
 * mesma posição em todos os passos (segmentos degenerados) reabriria o
 * tunneling que F4 existe para evitar.
 */
export function framePositions(prevPos, currPos, steps) {
  const points = [{ x: prevPos.x, y: prevPos.y }];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    points.push({ x: prevPos.x + (currPos.x - prevPos.x) * t, y: prevPos.y + (currPos.y - prevPos.y) * t });
  }
  if (steps >= 1) points.push({ x: currPos.x, y: currPos.y });
  return points;
}

function noop() {}

const NO_HOOKS = { onSlice: noop, onBomb: noop, onMiss: noop, onCalibrate: noop, onStart: noop };

/**
 * Um passo fixo completo (P3.2). Devolve o novo estado do jogo.
 */
export function fixedStep(state, segStart, segEnd, config, playfield, hooks) {
  const dtS = config.fixedStepS;

  let next = { ...state, elapsedS: state.elapsedS + dtS };
  next.level = levelForElapsed(next.elapsedS, config);

  // a. entidades avançam antes do teste de corte: `prevPos`/`pos` da entidade
  //    são as duas pontas do movimento relativo de F4.
  const stepped = stepEntities(next, dtS, config, playfield);
  next = stepped.state;

  // b. traço/combo, com a velocidade do passo fixo (medida única de F4/F6).
  const speed = bladeSpeed(segStart, segEnd, dtS);
  next = { ...next, blade: updateStroke(next.blade, speed, dtS, config) };

  // c. cortes, em ordem de criação crescente.
  const slices = detectSlices(segStart, segEnd, sliceCandidates(next), dtS, config);
  for (const slice of slices) {
    const entity = next.entities.find((item) => item.id === slice.entityId);
    if (!entity || entity.state !== 'active') continue;
    if (entity.kind === 'bomb') {
      next = sliceEntityById(next, slice.entityId, slice.dirRad, config);
      next = registerBombSlice(next);
      hooks.onBomb(slice);
      return next; // partida encerrada no mesmo passo
    }
    next = sliceEntityById(next, slice.entityId, slice.dirRad, config);
    next = registerFruitSlice(next, config);
    hooks.onSlice(slice);
  }

  // d. frutas perdidas custam vida; bomba caída é inofensiva.
  if (stepped.missed.some((item) => item.kind === 'fruit')) hooks.onMiss(stepped.missed);
  next = registerMissed(next, stepped.missed);
  if (next.screen === 'gameOver') return next;

  // e. arremessos do nível corrente. Com o teto de simultâneas atingido, o
  //    arremesso é adiado (o cronômetro não é zerado), não descartado.
  const params = levelParams(next.level, config);
  const spawnTimerS = next.spawnTimerS + dtS;
  if (spawnTimerS >= params.spawnIntervalS) {
    if (canSpawn(next, params)) {
      const spawned = spawnFromLevel(next, params, playfield, config);
      next = { ...spawned.state, spawnTimerS: spawnTimerS - params.spawnIntervalS };
    } else {
      next = { ...next, spawnTimerS };
    }
  } else {
    next = { ...next, spawnTimerS };
  }

  // f. rastro: uma amostra por passo fixo, na posição interpolada — nunca
  //    decimado abaixo da taxa de amostragem (F2, KPI-3).
  next = { ...next, blade: pushSample({ ...next.blade, pos: { x: segEnd.x, y: segEnd.y } }, { x: segEnd.x, y: segEnd.y, t: next.elapsedS * 1000 }, config) };

  return next;
}

/**
 * Avança um quadro. `sample` é a única leitura de input do quadro (F13): os
 * passos fixos interpolam entre a amostra anterior e esta.
 */
export function advanceFrame(session, state, deltaS, sample, config, playfield, hooks = {}) {
  const handlers = { ...NO_HOOKS, ...hooks };
  let nextSession = { ...session };
  let next = state;

  // --- perda e retorno do controle (F11/P5) --------------------------------
  if (!sample.connected) {
    if (next.screen !== 'aguardando') {
      nextSession.resumeScreen = next.screen;
      next = { ...next, screen: 'aguardando', blade: clearTrail(next.blade) };
    }
    nextSession.prevButtons = { a: false, start: false };
    nextSession.accumulatorS = 0;
    return { session: nextSession, state: next, steps: 0, points: [] };
  }

  const target = axesToTarget(sample.rawX, sample.rawY, nextSession.calibration, config, playfield);

  if (next.screen === 'aguardando') {
    // Descoberta por polling (F1.7): o jogo não espera `gamepadconnected`.
    const resume = nextSession.resumeScreen || 'calibracao';
    nextSession.resumeScreen = null;
    // O rastro volta vazio e o próximo segmento começa aqui: sem corte
    // espúrio no quadro do retorno (P5.2/T7).
    next = { ...next, screen: resume, blade: { ...clearTrail(next.blade), pos: { x: target.x, y: target.y } } };
    nextSession.framePos = { x: target.x, y: target.y };
    nextSession.stability = createStabilityState();
  }

  // --- posição exibida ------------------------------------------------------
  const clampedDeltaS = Math.min(Math.max(deltaS, 0), config.maxFrameDeltaS);
  const prevPos = nextSession.framePos;
  const currPos = smoothTowards(prevPos, target, clampedDeltaS, config);
  nextSession.clockMs += clampedDeltaS * 1000;

  // --- botões (F12): bordas de subida --------------------------------------
  const aEdge = sample.buttons.a && !nextSession.prevButtons.a;
  const startEdge = sample.buttons.start && !nextSession.prevButtons.start;
  nextSession.prevButtons = { a: sample.buttons.a, start: sample.buttons.start };

  if (aEdge) {
    if (next.screen === 'gameOver') {
      next = { ...next, screen: 'calibracao' };
      nextSession.stability = createStabilityState();
    } else {
      // Calibração é local ao jogo: nenhuma mensagem sai daqui (F12/F14).
      nextSession.calibration = calibrationFromSample(sample);
      handlers.onCalibrate(nextSession.calibration);
    }
  }

  if (next.screen === 'calibracao') {
    nextSession.stability = updateStability(
      nextSession.stability,
      currPos,
      playfield,
      clampedDeltaS * 1000,
      config,
    );
    if (startEdge && nextSession.stability.stable) {
      next = startGame(next, config);
      handlers.onStart();
    }
  } else if (next.screen === 'gameOver' && startEdge) {
    next = startGame(next, config);
    handlers.onStart();
  }

  // --- passos fixos ---------------------------------------------------------
  let steps = 0;
  let points = [];
  if (next.screen === 'jogando') {
    nextSession.accumulatorS += clampedDeltaS;
    steps = Math.floor(nextSession.accumulatorS / config.fixedStepS);
    nextSession.accumulatorS -= steps * config.fixedStepS;
    if (steps > 0) {
      points = framePositions(prevPos, currPos, steps);
      for (let i = 0; i < steps; i += 1) {
        next = fixedStep(next, points[i], points[i + 1], config, playfield, handlers);
        if (next.screen === 'gameOver') break;
      }
    }
  } else {
    // Fora da partida o rastro continua vivo, para a tela de calibração
    // mostrar o que a inclinação está fazendo.
    nextSession.accumulatorS = 0;
    next = {
      ...next,
      blade: pushSample({ ...next.blade, pos: currPos }, { x: currPos.x, y: currPos.y, t: nextSession.clockMs }, config),
    };
  }

  nextSession.framePos = currPos;
  next = { ...next, blade: { ...next.blade, pos: { x: currPos.x, y: currPos.y }, target: { x: target.x, y: target.y } } };

  return { session: nextSession, state: next, steps, points };
}

/**
 * Ponte com o navegador — único ponto do jogo que usa `requestAnimationFrame`.
 * `tick` recebe o delta em segundos e devolve o controle ao chamador.
 *
 * O próximo quadro é agendado em `finally`: uma exceção continua subindo (e
 * aparecendo no console, porque esconder defeito real seria pior), mas não
 * pode deixar o jogo congelado para sempre — F9.3 exige que o loop siga
 * avançando mesmo quando um caminho auxiliar falha.
 */
export function startLoop(tick) {
  let last = null;
  let running = true;
  const frame = (nowMs) => {
    if (!running) return;
    const deltaS = last === null ? 0 : (nowMs - last) / 1000;
    last = nowMs;
    try {
      tick(deltaS, nowMs);
    } finally {
      if (running) requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
  return () => {
    running = false;
  };
}
