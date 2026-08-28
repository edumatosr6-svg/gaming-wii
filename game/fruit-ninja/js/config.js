// Única fonte de constantes de tuning do jogo (F14, X9): nenhum número de
// ajuste vive fora deste arquivo. Os módulos puros recebem `config` como
// argumento; os módulos de navegador o importam daqui.

// Velocidade de referência do KPI-3. Declarada antes do objeto porque
// `bladeMaxStepCss` é derivada dela (X12), não um valor independente.
const trailReferenceSpeedCssPerS = 800;

// Folga de 1,5 sobre o passo ideal a 60 Hz: uma implementação que decima o
// rastro (uma amostra a cada duas) produz ~26,7 px e reprova (F2.5).
const bladeMaxStepCss = (1.5 * trailReferenceSpeedCssPerS) / 60;

export const config = Object.freeze({
  // --- F1: apontamento absoluto -------------------------------------------
  // A zona morta do jogo é a *segunda* do caminho (o servidor do
  // wii-controller já aplica a sua), então é pequena de propósito.
  deadzone: 0.05,
  maxTilt: 0.7,
  // Constante de tempo do passa-baixa. Pequena o bastante para convergir
  // dentro de `pointingToleranceCss` em `pointingSettleMs` mesmo partindo do
  // canto oposto do playfield.
  smoothingTauMs: 30,
  pointingSettleMs: 250,
  pointingToleranceCss: 1,

  // --- F2: rastro ----------------------------------------------------------
  trailDurationMs: 220,
  maxTrailSamples: 96,
  trailReferenceSpeedCssPerS,
  bladeMaxStepCss,
  trailWidthCss: 14,
  bladeRadiusCss: 7,

  // --- F3: arremesso e trajetória -----------------------------------------
  gravityCssPerS2: 900,
  minAirtimeS: 1,
  fruitRadiusCss: 38,
  bombRadiusCss: 30,
  // Quanto abaixo da borda inferior do playfield a entidade nasce.
  spawnBelowCss: 40,
  // Margem entre o ápice da trajetória e o topo do playfield (F3.4/E5).
  apexMarginCss: 24,
  // Ângulo em relação à vertical, para os dois lados.
  launchAngleRangeRad: [-0.5, 0.5],
  // Fração horizontal do playfield onde as entidades podem nascer.
  spawnXRange: [0.12, 0.88],
  // Impulso perpendicular ao corte dado a cada metade (F3.6).
  halfImpulseCssPerS: 140,
  halfAngularVelRadPerS: 6,

  // --- F4: corte por movimento --------------------------------------------
  minSliceSpeedCssPerS: 420,

  // --- F6/F8: combos e pontuação ------------------------------------------
  comboBreakMs: 180,
  basePoints: 10,

  // --- F7: vidas e progressão ---------------------------------------------
  startingLives: 3,
  levelDurationS: 30,
  maxLevel: 5,
  // `launchSpeedRange` é fração da velocidade vertical máxima que ainda
  // mantém o ápice dentro do playfield (ver entities.js): assim a
  // dificuldade não depende da resolução da tela, e F3.4 vale em qualquer
  // viewport. Todos os eixos são monotônicos na direção de mais difícil e
  // ao menos dois crescem estritamente a cada nível (F7.4/R9).
  levels: Object.freeze([
    Object.freeze({ spawnIntervalS: 1.3, maxSimultaneous: 3, launchSpeedRange: Object.freeze([0.7, 0.82]), bombChance: 0.06 }),
    Object.freeze({ spawnIntervalS: 1.15, maxSimultaneous: 4, launchSpeedRange: Object.freeze([0.73, 0.85]), bombChance: 0.09 }),
    Object.freeze({ spawnIntervalS: 1.0, maxSimultaneous: 5, launchSpeedRange: Object.freeze([0.76, 0.88]), bombChance: 0.12 }),
    Object.freeze({ spawnIntervalS: 0.88, maxSimultaneous: 6, launchSpeedRange: Object.freeze([0.79, 0.91]), bombChance: 0.15 }),
    Object.freeze({ spawnIntervalS: 0.78, maxSimultaneous: 7, launchSpeedRange: Object.freeze([0.82, 0.94]), bombChance: 0.18 }),
    Object.freeze({ spawnIntervalS: 0.7, maxSimultaneous: 8, launchSpeedRange: Object.freeze([0.85, 0.97]), bombChance: 0.22 }),
  ]),

  // --- F9: rumble ----------------------------------------------------------
  sliceRumbleMs: 60,
  penaltyRumbleMs: 220,
  sliceRumbleIntensity: 0.35,
  penaltyRumbleIntensity: 1,

  // --- F10: áudio sintetizado ---------------------------------------------
  // Três envelopes/timbres declaradamente distintos (F10.3).
  audio: Object.freeze({
    slice: Object.freeze({ type: 'triangle', startHz: 1200, endHz: 320, durationS: 0.12, gain: 0.18 }),
    bomb: Object.freeze({ type: 'sawtooth', startHz: 180, endHz: 40, durationS: 0.6, gain: 0.32 }),
    miss: Object.freeze({ type: 'sine', startHz: 420, endHz: 140, durationS: 0.28, gain: 0.14 }),
  }),

  // --- F13: loop -----------------------------------------------------------
  fixedStepS: 1 / 120,
  maxFrameDeltaS: 0.25,

  // --- F12: calibração -----------------------------------------------------
  calibrationStableRadiusCss: 40,
  calibrationStableMs: 700,

  // --- tolerâncias e layout ------------------------------------------------
  dtToleranceCss: 1,
  hudHeightCss: 56,

  // Paleta das frutas (decorativa, sem KPI): cor por `colorIndex`.
  fruitColors: Object.freeze(['#e5484d', '#f5a524', '#46a758', '#8e4ec6', '#e93d82', '#0090ff']),
  // Tom mais claro da polpa por fruta, usado no interior das metades.
  fruitFleshColors: Object.freeze(['#ffd9d2', '#fff0c9', '#e3f9d5', '#ecdcff', '#ffd9ea', '#cdeeff']),

  // --- visual: decorativo, sem KPI (ver F14 — "qualidade estética") --------
  // Números de desenho ficam aqui pela mesma razão dos demais: nenhum
  // "número mágico" solto em render.js (F14).
  visual: Object.freeze({
    starCount: 70,
    nebulaCount: 3,
    particlesPerSlice: 12,
    particleLifeMs: 480,
    particleSpeedCssPerS: 260,
    particleGravityCssPerS2: 700,
    particleRadiusCss: 3.2,
    bombPulseHz: 2.4,
    bombSparkHz: 6,
    comboPopThreshold: 2,
    hitFlashMs: 420,
  }),
});

/** Cópia profunda simples do config, para `getConfig()` e para testes. */
export function cloneConfig(source = config) {
  return JSON.parse(JSON.stringify(source));
}
