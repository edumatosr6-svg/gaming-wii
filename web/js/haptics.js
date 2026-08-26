// Vibração do aparelho (F8). Padrão proporcional à intensidade.

// Converte intensidade [0..1] + duração em um padrão para a Vibration API.
// Intensidade é aproximada por duty cycle (a API não tem amplitude): fatias
// de 30 ms com proporção ligada/desligada conforme a intensidade. Pura,
// testável sem navegador.
export function patternFor(intensity, durationMs) {
  const safeIntensity = Math.min(1, Math.max(0, Number(intensity) || 0));
  const safeDuration = Math.max(0, Math.floor(Number(durationMs) || 0));
  if (safeIntensity === 0 || safeDuration === 0) {
    return []; // cancela vibração em andamento (F8.2)
  }
  if (safeIntensity >= 0.95) {
    return [safeDuration];
  }
  const sliceMs = 30;
  const onMs = Math.max(5, Math.round(sliceMs * safeIntensity));
  const offMs = sliceMs - onMs;
  const pattern = [];
  let elapsed = 0;
  while (elapsed < safeDuration) {
    pattern.push(Math.min(onMs, safeDuration - elapsed));
    elapsed += onMs;
    if (elapsed < safeDuration && offMs > 0) {
      pattern.push(offMs);
      elapsed += offMs;
    }
  }
  return pattern;
}

// Aciona a Vibration API com o padrão calculado (só no navegador).
export function vibrate(intensity, durationMs) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  const pattern = patternFor(intensity, durationMs);
  if (pattern.length === 0) {
    navigator.vibrate(0);
  } else {
    navigator.vibrate(pattern);
  }
}
