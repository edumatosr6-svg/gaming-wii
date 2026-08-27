// POR QUE ESTE MÓDULO EXISTE
//
// F14 proíbe qualquer tráfego de rede no jogo — o input vem exclusivamente da
// Gamepad API. A única exceção declarada pela spec é o retorno tátil (F9):
// quando o gamepad lido não expõe `vibrationActuator`, o `wii-controller` já
// oferece um `POST /rumble` que faz o celular vibrar. Sem esse caminho, o
// feedback tátil simplesmente não existiria em parte dos navegadores.
//
// Por isso `fetch` aparece NESTE arquivo e em nenhum outro do jogo (X2/X3), e
// toda falha aqui é engolida: rumble nunca pode derrubar o quadro (F9.3).

let warned = false;

function warnOnce(error) {
  if (warned) return;
  warned = true;
  console.warn('[fruit-ninja] rumble indisponível:', error);
}

/** Dois padrões distintos e distinguíveis, definidos em `config.js` (F9.1). */
export function slicePattern(config) {
  return { durationMs: config.sliceRumbleMs, intensity: config.sliceRumbleIntensity };
}

export function penaltyPattern(config) {
  return { durationMs: config.penaltyRumbleMs, intensity: config.penaltyRumbleIntensity };
}

/**
 * Dispara um pulso. Nunca lança: sem atuador tenta o fallback HTTP; sem
 * fallback, retorna em silêncio.
 */
export function playRumble(pad, pattern) {
  try {
    const actuator = pad && pad.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      const result = actuator.playEffect('dual-rumble', {
        duration: pattern.durationMs,
        strongMagnitude: pattern.intensity,
        weakMagnitude: pattern.intensity,
      });
      if (result && typeof result.catch === 'function') result.catch(warnOnce);
      return;
    }
  } catch (error) {
    warnOnce(error);
    return;
  }
  fallbackRumble(pattern);
}

/** Fallback herdado do `wii-controller` — a exceção arquitetural única. */
export function fallbackRumble(pattern) {
  if (typeof fetch !== 'function') return;
  try {
    fetch('/rumble', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: pattern.durationMs, intensity: pattern.intensity }),
    }).catch(warnOnce);
  } catch (error) {
    warnOnce(error);
  }
}
