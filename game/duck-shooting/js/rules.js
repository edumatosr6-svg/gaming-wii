// Regras do Duck Shooting: munição, rodadas, pontuação (puro, testável).
// Recebe estado, devolve estado. Não toca Canvas nem input (diretiva).

export const MAX_AMMO = 3;
export const BASE_HIT_POINTS = 100;
export const STREAK_BONUS_STEP = 0.5; // multiplicador = 1 + streak * passo

// Tabela de dificuldade (F10.4): rodada N+1 tem velocidade e quantidade de
// patos >= rodada N, com aumento estrito em pelo menos um parâmetro.
export function difficultyForRound(round) {
  const n = Math.max(1, Math.floor(round));
  return {
    duckCount: Math.min(2 + n, 10),
    speedMin: 60 + (n - 1) * 12,
    speedMax: 110 + (n - 1) * 18,
    wobbleAmplitude: Math.min(10 + (n - 1) * 8, 90),
    wobbleFrequency: 0.8 + (n - 1) * 0.15,
    requiredHits: Math.max(1, Math.ceil((2 + n) * 0.5)),
    waveTimeS: Math.max(6, 12 - (n - 1) * 0.5),
  };
}

export function createGameState() {
  return {
    ducks: [],
    crosshair: { x: 0.5, y: 0.5 },
    ammo: MAX_AMMO,
    round: 1,
    hitsInRound: 0,
    requiredHits: difficultyForRound(1).requiredHits,
    score: 0,
    streak: 0,
    highScore: 0, // recorde em memória da página — sem localStorage
    phase: 'calibration',
  };
}

// Disparo (evento pontual na transição do botão). `hit` indica se o tiro
// intersectou um pato (a resolução da colisão vem de entities.js).
// Devolve { state, event } com event em: 'shot-hit' | 'shot-miss' | 'no-ammo'.
export function fireShot(state, hit) {
  if (state.ammo <= 0) {
    // Sem munição: não decrementa, não abate, feedback distinto (F10.2).
    return { state, event: 'no-ammo' };
  }
  const ammo = state.ammo - 1;
  if (hit) {
    const streak = state.streak + 1;
    const multiplier = 1 + (streak - 1) * STREAK_BONUS_STEP;
    const score = state.score + Math.round(BASE_HIT_POINTS * multiplier);
    return {
      state: {
        ...state,
        ammo,
        streak,
        score,
        hitsInRound: state.hitsInRound + 1,
      },
      event: 'shot-hit',
    };
  }
  return { state: { ...state, ammo, streak: 0 }, event: 'shot-miss' };
}

// Recarga automática ao fim da leva/rodada (F10, G2).
export function reload(state) {
  return { ...state, ammo: MAX_AMMO };
}

// Fim da leva/rodada: avança se atingiu o critério, senão game over (G4).
export function resolveRoundEnd(state) {
  if (state.hitsInRound >= state.requiredHits) {
    const nextRound = state.round + 1;
    return {
      ...reload(state),
      round: nextRound,
      hitsInRound: 0,
      requiredHits: difficultyForRound(nextRound).requiredHits,
      ducks: [],
      phase: 'roundEnd',
    };
  }
  return {
    ...state,
    phase: 'gameOver',
    highScore: Math.max(state.highScore, state.score),
    ducks: [],
  };
}

// Reinício de partida preservando o recorde da sessão (G6).
export function restart(state) {
  const fresh = createGameState();
  return { ...fresh, highScore: Math.max(state.highScore, state.score), phase: 'playing' };
}
