// Combos, pontuação, vidas e progressão — módulo PURO (X7). A decisão de
// quebra de traço usa a velocidade recebida como argumento; este módulo não
// consulta relógio, não desenha e não lê input.

import { createBladeState, clearTrail } from './blade.js';
import { makeRng } from './entities.js';

/** Estado inicial do jogo, antes de qualquer partida. */
export function createGameState(config, seed = 1) {
  return {
    screen: 'aguardando',
    score: 0,
    highScore: 0,
    lives: config.startingLives,
    elapsedS: 0,
    level: 0,
    entities: [],
    halves: [],
    blade: createBladeState(),
    rng: makeRng(seed),
    pendingSeed: seed,
    nextEntityId: 1,
    nextHalfId: 1,
    spawnTimerS: 0,
    fruitsSpawned: 0,
    fruitsSliced: 0,
    gameOverReason: null,
  };
}

/** `setSeed` só vale para a próxima partida (F14). */
export function setPendingSeed(state, seed) {
  return { ...state, pendingSeed: seed >>> 0 };
}

/** Início de partida (P2.4): zera tudo exceto recorde e calibração. */
export function startGame(state, config) {
  return {
    ...state,
    screen: 'jogando',
    score: 0,
    lives: config.startingLives,
    elapsedS: 0,
    level: 0,
    entities: [],
    halves: [],
    blade: { ...clearTrail(state.blade), comboCount: 0, strokeActive: false, belowThresholdMs: 0 },
    rng: makeRng(state.pendingSeed),
    nextEntityId: 1,
    nextHalfId: 1,
    spawnTimerS: 0,
    fruitsSpawned: 0,
    fruitsSliced: 0,
    gameOverReason: null,
  };
}

// ------------------------------------------------------------- dificuldade

export function levelForElapsed(elapsedS, config) {
  return Math.min(Math.floor(elapsedS / config.levelDurationS), config.maxLevel);
}

/** Acima de `maxLevel` a dificuldade satura, não diverge (F7.6). */
export function levelParams(level, config) {
  const index = Math.min(Math.max(level, 0), config.levels.length - 1);
  return config.levels[index];
}

// ------------------------------------------------------------------ combos

/**
 * Traço (stroke) de F6: intervalo contínuo com velocidade acima do limiar.
 * A velocidade chega pronta, medida por passo fixo — é a MESMA medida usada
 * pelo corte em F4; não existe uma segunda no jogo.
 */
export function updateStroke(blade, stepSpeedCssPerS, dtS, config) {
  if (stepSpeedCssPerS >= config.minSliceSpeedCssPerS) {
    return { ...blade, speedCssPerS: stepSpeedCssPerS, strokeActive: true, belowThresholdMs: 0 };
  }
  const belowThresholdMs = blade.belowThresholdMs + dtS * 1000;
  if (belowThresholdMs > config.comboBreakMs) {
    return {
      ...blade,
      speedCssPerS: stepSpeedCssPerS,
      strokeActive: false,
      belowThresholdMs,
      comboCount: 0,
    };
  }
  return { ...blade, speedCssPerS: stepSpeedCssPerS, belowThresholdMs };
}

// -------------------------------------------------------- eventos de corte

/** A n-ésima fruta do traço vale `basePoints * n` (F6). */
export function registerFruitSlice(state, config) {
  const n = state.blade.comboCount + 1;
  return {
    ...state,
    score: state.score + config.basePoints * n,
    fruitsSliced: state.fruitsSliced + 1,
    blade: { ...state.blade, comboCount: n, strokeActive: true },
  };
}

/** Fim de partida: o recorde da sessão vive só em memória (F8). */
export function endGame(state, reason) {
  return {
    ...state,
    screen: 'gameOver',
    gameOverReason: reason,
    highScore: Math.max(state.highScore, state.score),
    blade: { ...state.blade, comboCount: 0, strokeActive: false },
  };
}

/** Cortar bomba encerra a partida no mesmo passo, com qualquer vidas (F5.1). */
export function registerBombSlice(state) {
  return endGame(state, 'bomb');
}

/**
 * Frutas perdidas custam uma vida cada; bomba que cai é inofensiva (F5.2) —
 * o jogador precisa controlar onde a lâmina passa, não agitar o aparelho.
 */
export function registerMissed(state, missed) {
  let next = state;
  for (const item of missed) {
    if (item.kind !== 'fruit') continue;
    const lives = Math.max(next.lives - 1, 0);
    next = { ...next, lives };
    if (lives === 0) return endGame(next, 'no-lives');
  }
  return next;
}
