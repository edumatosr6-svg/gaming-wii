// Único módulo do jogo que fala com a Gamepad API (F1.6 / X1). Converte
// inclinação em POSIÇÃO ABSOLUTA da lâmina — nenhum outro módulo sabe de onde
// o input veio, e nenhuma parte deste arquivo integra eixo ao longo do tempo.

const STANDARD_AXIS_X = 2; // analógico direito, horizontal (XInput / `standard`)
const STANDARD_AXIS_Y = 3; // analógico direito, vertical
const STANDARD_BUTTON_A = 0;
const STANDARD_BUTTON_START = 9;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Invariante do InputSample: eixo cru sempre em [-1, 1]. */
export function clampAxis(value) {
  const numeric = Number.isFinite(value) ? value : 0;
  return clamp(numeric, -1, 1);
}

export function playfieldCenter(playfield) {
  return { x: playfield.x + playfield.width / 2, y: playfield.y + playfield.height / 2 };
}

/**
 * Conversão de eixo para posição absoluta (F1) — PURA E SEM MEMÓRIA.
 *
 * Por que sem memória: o requisito nº 1 é que a mesma inclinação produza
 * sempre a mesma posição, qualquer que tenha sido o caminho até ela. Uma
 * implementação por velocidade (`pos += axis * gain * dt`) depende do
 * histórico e reprova em P1 por construção.
 */
export function axesToTarget(rawX, rawY, calibration, config, playfield) {
  const center = playfieldCenter(playfield);

  // 1. Recentragem pela calibração (sempre subtração, nunca multiplicação).
  const cx = clampAxis(rawX) - calibration.x;
  const cy = clampAxis(rawY) - calibration.y;

  // 2. Magnitude e direção.
  const m = Math.hypot(cx, cy);
  if (m <= config.deadzone) return center;
  const ux = cx / m;
  const uy = cy / m;

  // 3. Normalização única: remove a zona morta preservando a direção e
  //    normaliza por eixo pela MESMA escala (`maxTilt - deadzone`). Duas
  //    fórmulas concorrentes aqui seriam o salto na borda da zona morta.
  const scale = config.maxTilt - config.deadzone;
  const nx = clamp((ux * (m - config.deadzone)) / scale, -1, 1);
  const ny = clamp((uy * (m - config.deadzone)) / scale, -1, 1);

  // 4. Projeção no playfield. Y do gamepad é positivo para baixo, igual ao Y
  //    do Canvas: sem inversão.
  return {
    x: playfield.x + (playfield.width * (nx + 1)) / 2,
    y: playfield.y + (playfield.height * (ny + 1)) / 2,
  };
}

/**
 * Passa-baixa de primeira ordem entre a posição exibida e o alvo (F1).
 * Convergente por construção: com o alvo constante, `pos` tende a `target` e
 * fica nele. Não há termo de velocidade nem acúmulo — o alvo continua sendo
 * a única fonte da posição.
 */
export function smoothTowards(pos, target, dtS, config) {
  if (!(dtS > 0)) return { x: pos.x, y: pos.y };
  if (config.smoothingTauMs <= 0) return { x: target.x, y: target.y };
  const alpha = 1 - Math.exp((-dtS * 1000) / config.smoothingTauMs);
  return {
    x: pos.x + (target.x - pos.x) * alpha,
    y: pos.y + (target.y - pos.y) * alpha,
  };
}

export function createCalibration() {
  return { x: 0, y: 0 };
}

/** Grava a inclinação corrente como novo neutro (F12). */
export function calibrationFromSample(sample) {
  return { x: clampAxis(sample.rawX), y: clampAxis(sample.rawY) };
}

export function createStabilityState() {
  return { stableMs: 0, stable: false };
}

/**
 * Critério de estabilidade da calibração (F12.3 / P10): a lâmina precisa
 * ficar dentro de `calibrationStableRadiusCss` do centro por
 * `calibrationStableMs` contínuos. Sair do raio reinicia a contagem.
 */
export function updateStability(state, bladePos, playfield, dtMs, config) {
  const center = playfieldCenter(playfield);
  const distance = Math.hypot(bladePos.x - center.x, bladePos.y - center.y);
  if (distance > config.calibrationStableRadiusCss) return { stableMs: 0, stable: false };
  const stableMs = state.stableMs + dtMs;
  return { stableMs, stable: stableMs >= config.calibrationStableMs };
}

export function disconnectedSample(timestampMs = 0) {
  return {
    rawX: 0,
    rawY: 0,
    buttons: { a: false, start: false },
    connected: false,
    timestampMs,
  };
}

/**
 * ÚNICO ponto do jogo que toca a Gamepad API (F1.6 / X1). O parâmetro `source`
 * existe só para a lógica pura injetar um dublê; no jogo real a chamada é
 * `navigator.getGamepads()` aqui e em lugar nenhum mais.
 */
export function pollGamepads(source) {
  try {
    if (source) {
      return typeof source.getGamepads === 'function' ? source.getGamepads() || [] : [];
    }
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
    return navigator.getGamepads() || [];
  } catch {
    return [];
  }
}

/**
 * Lê o gamepad por POLLING (F1.7): o jogo nunca depende do evento
 * `gamepadconnected`, que o dublê dos testes de navegador não dispara.
 */
export function readGamepad(gamepadIndex, source, timestampMs = 0) {
  const pads = pollGamepads(source);
  const pad = pads[gamepadIndex] || Array.prototype.find.call(pads, (p) => p && p.connected);
  if (!pad || !pad.connected) return disconnectedSample(timestampMs);
  const axes = pad.axes || [];
  const buttons = pad.buttons || [];
  const pressed = (index) => Boolean(buttons[index] && buttons[index].pressed);
  return {
    rawX: clampAxis(axes[STANDARD_AXIS_X]),
    rawY: clampAxis(axes[STANDARD_AXIS_Y]),
    buttons: { a: pressed(STANDARD_BUTTON_A), start: pressed(STANDARD_BUTTON_START) },
    connected: true,
    timestampMs: typeof pad.timestamp === 'number' ? pad.timestamp : timestampMs,
    pad,
  };
}
