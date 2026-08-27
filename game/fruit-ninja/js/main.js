// Ligação das peças: polling do gamepad, quadro, desenho e o contrato de
// diagnóstico `window.__fruitNinja` (F14). Nenhuma regra de jogo mora aqui.

import { config, cloneConfig } from './config.js';
import { readGamepad } from './input.js';
import { createGameState, setPendingSeed } from './rules.js';
import { spawnAt } from './entities.js';
import { advanceFrame, createSession, startLoop } from './loop.js';
import {
  createRenderer,
  resize,
  showScreen,
  draw,
  updateHud,
  updateCalibrationScreen,
  updateGameOverScreen,
} from './render.js';
import { playSlice, playBomb, playMiss, unlock, contextState } from './audio.js';
import { playRumble, slicePattern, penaltyPattern } from './rumble.js';

const canvas = document.getElementById('game-canvas');
const renderer = createRenderer(canvas, document);

let playfield = resize(renderer, config, window);
let state = createGameState(config);
let session = createSession(config, playfield);
let gamepadIndex = 0;
let currentPad = null;
let lastScreen = null;

window.addEventListener('resize', () => {
  playfield = resize(renderer, config, window);
});

// Único listener de gesto do jogo: destrava o áudio (F10.2). Não controla a
// lâmina — o jogo não aceita mouse nem teclado como jogabilidade (F12.5). Não
// é o único caminho: ver `destravarAudio` abaixo, usado nas bordas de botão.
window.addEventListener('pointerdown', () => unlock(), { once: false });

/**
 * Destrava o áudio a partir de um gesto do JOGADOR (F10.2).
 *
 * Por que também no gamepad: F12.5 proíbe mouse e teclado como jogabilidade,
 * então quem joga só com o celular nunca produz um `pointerdown` nesta página.
 * Ligar o áudio apenas ao ponteiro deixava F10 morto no único caminho de uso
 * que o produto existe para servir — o jogo ficava mudo a partida inteira.
 *
 * `unlock()` já trata a própria falha e devolve `null` quando o áudio não está
 * disponível; o `try` aqui é a garantia estrutural de que nem uma exceção
 * inesperada dele sobe para dentro do quadro (F9.3/B11).
 */
function destravarAudio() {
  try {
    unlock();
  } catch (error) {
    console.warn('[fruit-ninja] não foi possível destravar o áudio:', error);
  }
}

const hooks = {
  // Bordas de botão do gamepad (F12): o primeiro `A` ou `Start` da sessão é o
  // gesto que habilita o som.
  onCalibrate: () => {
    destravarAudio();
  },
  onStart: () => {
    destravarAudio();
  },
  onSlice: () => {
    playSlice(config);
    playRumble(currentPad, slicePattern(config));
  },
  onBomb: () => {
    playBomb(config);
    playRumble(currentPad, penaltyPattern(config));
  },
  onMiss: () => {
    playMiss(config);
    playRumble(currentPad, penaltyPattern(config));
  },
};

function tick(deltaS, nowMs) {
  // Sem segundo argumento: quem fala com a Gamepad API é `input.js` (X1).
  const sample = readGamepad(gamepadIndex, undefined, nowMs);
  currentPad = sample.pad || null;

  const advanced = advanceFrame(session, state, deltaS, sample, config, playfield, hooks);
  session = advanced.session;
  state = advanced.state;

  if (state.screen !== lastScreen) {
    showScreen(renderer, state.screen);
    lastScreen = state.screen;
  }
  if (state.screen === 'calibracao') updateCalibrationScreen(renderer, session.stability);
  if (state.screen === 'gameOver') updateGameOverScreen(renderer, state);

  draw(renderer, state, config, playfield);
  updateHud(renderer, state);
}

showScreen(renderer, state.screen);
lastScreen = state.screen;
startLoop(tick);

/**
 * Contrato de diagnóstico da faixa de navegador headless (F14). Existe porque
 * inspecionar pixels do Canvas não é capaz de reprovar as regras do jogo;
 * nenhum caminho da jogabilidade o aciona.
 */
window.__fruitNinja = {
  getState() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.comboCount = state.blade.comboCount;
    copy.playfield = { ...playfield };
    return copy;
  },
  getConfig() {
    return cloneConfig(config);
  },
  setGamepadIndex(index) {
    gamepadIndex = index;
  },
  setSeed(seed) {
    state = setPendingSeed(state, seed);
  },
  spawnForTest(kind, params) {
    const spawned = spawnAt(state, kind, params.pos, params.vel, config);
    state = spawned.state;
    return spawned.id;
  },
  // Auxiliar de B13: o estado do AudioContext não cabe no GameState.
  audioContextState() {
    return contextState();
  },
};
