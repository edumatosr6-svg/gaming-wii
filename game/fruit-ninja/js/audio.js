// Som sintetizado com Web Audio (F10): três timbres declarados em
// `config.js`, nenhum arquivo externo, nenhuma requisição de rede.
//
// O `AudioContext` só nasce depois do primeiro gesto do usuário, exigência de
// autoplay dos navegadores. Antes disso as chamadas de som não fazem nada e
// não lançam — áudio indisponível nunca pode interromper a jogabilidade.

let audioContext = null;
let unlocked = false;

function contextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

/** Chamado a partir de um gesto real do usuário. */
export function unlock() {
  const Ctor = contextClass();
  if (!Ctor) return null;
  try {
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === 'suspended') audioContext.resume();
    unlocked = true;
  } catch (error) {
    console.warn('[fruit-ninja] áudio indisponível:', error);
    audioContext = null;
  }
  return audioContext;
}

export function contextState() {
  return audioContext ? audioContext.state : 'none';
}

function playTone(spec) {
  if (!unlocked || !audioContext) return;
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.startHz, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(spec.endHz, 1), now + spec.durationS);
    gain.gain.setValueAtTime(spec.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.durationS);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + spec.durationS);
  } catch (error) {
    console.warn('[fruit-ninja] falha ao sintetizar som:', error);
  }
}

export function playSlice(config) {
  playTone(config.audio.slice);
}

export function playBomb(config) {
  playTone(config.audio.bomb);
}

export function playMiss(config) {
  playTone(config.audio.miss);
}
