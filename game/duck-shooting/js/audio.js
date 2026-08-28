// Sons sintetizados via Web Audio API (F10) — sem arquivos externos.

let context = null;

function ensureContext() {
  if (context === null) {
    context = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (context.state === 'suspended') {
    context.resume();
  }
  return context;
}

function beep(frequency, durationS, type, gainValue, sweepTo = null) {
  const ctx = ensureContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  if (sweepTo !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + durationS);
  }
  gain.gain.setValueAtTime(gainValue, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationS);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationS);
}

// Tiro: estalo curto descendente.
export function playShot() {
  beep(600, 0.12, 'square', 0.25, 120);
}

// Acerto: arpejo ascendente curto.
export function playHit() {
  beep(440, 0.1, 'triangle', 0.3, 880);
  setTimeout(() => beep(880, 0.12, 'triangle', 0.25, 1320), 80);
}

// Pato escapando: glissando descendente "zombeteiro".
export function playEscape() {
  beep(700, 0.4, 'sawtooth', 0.15, 200);
}

// Sem munição: clique seco distinto (F10.2).
export function playEmpty() {
  beep(200, 0.06, 'square', 0.15);
}
