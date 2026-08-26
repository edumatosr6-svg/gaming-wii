// Canal de rumble do jogo (F8) — ÚNICO módulo autorizado a falar com o
// servidor fora da Gamepad API.
//
// POR QUE ESTE MÓDULO EXISTE: o caminho principal de rumble é o
// GamepadHapticActuator da própria Gamepad API. O suporte a esse actuator é
// irregular entre versões de navegador; quando a detecção falha, este módulo
// sinaliza o rumble ao servidor por HTTP (`POST /rumble`), que o repassa ao
// celular como mensagem `vibrate`. É uma exceção documentada pela spec
// (F8.3), não o desenho principal — o resto do jogo permanece um consumidor
// puro da Gamepad API.

// Detecta suporte ao actuator no gamepad corrente.
function actuatorFor(gamepad) {
  if (gamepad === null) {
    return null;
  }
  const actuator = gamepad.vibrationActuator;
  if (actuator && typeof actuator.playEffect === 'function') {
    return actuator;
  }
  return null;
}

// Dispara rumble: actuator quando suportado; senão, fallback HTTP.
export function rumble(gamepad, intensity, durationMs) {
  const actuator = actuatorFor(gamepad);
  if (actuator !== null) {
    actuator
      .playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: intensity,
        weakMagnitude: intensity,
      })
      .catch(() => fallbackRumble(intensity, durationMs));
    return;
  }
  fallbackRumble(intensity, durationMs);
}

// Fallback HTTP (F8.3): parâmetros por query string, sem corpo.
function fallbackRumble(intensity, durationMs) {
  const params = new URLSearchParams({
    intensity: String(intensity),
    duration_ms: String(durationMs),
  });
  fetch(`/rumble?${params.toString()}`, { method: 'POST' }).catch(() => {
    // rumble é melhor-esforço: falha silenciosa não afeta a jogabilidade
  });
}
