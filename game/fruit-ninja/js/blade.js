// Histórico de posições da lâmina — módulo PURO (X7): recebe estado e devolve
// estado novo, recebe o instante `t` como argumento e nunca lê relógio nem
// desenha. O rastro é o revelador da qualidade do apontamento, então ele não
// pode ser reamostrado nem decimado: mostrar um engasgo é função dele.

export function createBladeState(pos = { x: 0, y: 0 }) {
  return {
    pos: { x: pos.x, y: pos.y },
    target: { x: pos.x, y: pos.y },
    samples: [],
    speedCssPerS: 0,
    strokeActive: false,
    belowThresholdMs: 0,
    comboCount: 0,
  };
}

/** Velocidade entre as duas amostras mais recentes; `dt = 0` devolve 0. */
function speedFromSamples(samples) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const prev = samples[samples.length - 2];
  const dtMs = last.t - prev.t;
  if (!(dtMs > 0)) return 0;
  return (Math.hypot(last.x - prev.x, last.y - prev.y) * 1000) / dtMs;
}

/**
 * Empilha uma amostra e expira as antigas (F2). O estado recebido não é
 * mutado; a amostra mais recente nunca é descartada, mesmo que o intervalo
 * entre quadros exceda `trailDurationMs`.
 */
export function pushSample(state, sample, config) {
  const samples = state.samples.concat([{ x: sample.x, y: sample.y, t: sample.t }]);
  const newest = samples[samples.length - 1].t;

  let firstKept = 0;
  while (firstKept < samples.length - 1 && newest - samples[firstKept].t > config.trailDurationMs) {
    firstKept += 1;
  }
  let kept = samples.slice(firstKept);
  // Teto de memória para quadros muito rápidos: o descarte remove sempre a
  // amostra mais antiga, preservando a ordem crescente de `t`.
  if (kept.length > config.maxTrailSamples) kept = kept.slice(kept.length - config.maxTrailSamples);

  return { ...state, samples: kept, speedCssPerS: speedFromSamples(kept) };
}

/**
 * Limpeza no retorno do controle (F11/P5, T7): as amostras anteriores à pausa
 * não representam movimento real; mantê-las produziria um segmento gigante e
 * um corte espúrio no quadro do retorno.
 */
export function clearTrail(state) {
  return { ...state, samples: [], speedCssPerS: 0 };
}

/** Amostras retidas, exatamente como empilhadas — sem interpolação (F2.6). */
export function trailPoints(state) {
  return state.samples.map((sample) => ({ x: sample.x, y: sample.y, t: sample.t }));
}

export function setPosition(state, pos) {
  return { ...state, pos: { x: pos.x, y: pos.y } };
}

export function setTarget(state, target) {
  return { ...state, target: { x: target.x, y: target.y } };
}
