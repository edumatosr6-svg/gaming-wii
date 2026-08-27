// Desenho em Canvas 2D e visibilidade das telas. Único módulo que chama
// `getContext('2d')` (X8) e o único, junto com `loop.js`, que toca o
// navegador. Não altera estado de jogo (F13.4): só lê.

const SCREEN_NAMES = ['aguardando', 'calibracao', 'jogando', 'gameOver'];

export function createRenderer(canvas, doc) {
  const ctx = canvas.getContext('2d');
  const screens = new Map(
    SCREEN_NAMES.map((name) => [name, doc.querySelector(`[data-screen="${name}"]`)]),
  );
  const hud = {
    score: doc.getElementById('hud-score'),
    high: doc.getElementById('hud-high'),
    lives: doc.getElementById('hud-lives'),
    combo: doc.getElementById('hud-combo'),
    level: doc.getElementById('hud-level'),
    stability: doc.getElementById('calibracao-estado'),
    gameOverReason: doc.getElementById('gameover-motivo'),
    gameOverScore: doc.getElementById('gameover-pontos'),
  };
  return { canvas, ctx, screens, hud, dpr: 1 };
}

/**
 * Ajusta o buffer do Canvas ao viewport e devolve o `playfield` — o mesmo
 * retângulo usado pelo apontamento, pelo spawn e pelos testes.
 */
export function resize(renderer, config, view) {
  const dpr = view.devicePixelRatio || 1;
  const widthCss = renderer.canvas.clientWidth || view.innerWidth;
  const heightCss = renderer.canvas.clientHeight || view.innerHeight;
  renderer.canvas.width = Math.round(widthCss * dpr);
  renderer.canvas.height = Math.round(heightCss * dpr);
  renderer.dpr = dpr;
  return {
    x: 0,
    y: config.hudHeightCss,
    width: widthCss,
    height: Math.max(heightCss - config.hudHeightCss, 1),
  };
}

/** Exatamente uma tela visível em qualquer instante (F11.5). */
export function showScreen(renderer, name) {
  for (const [key, element] of renderer.screens) {
    if (!element) continue;
    element.hidden = key !== name;
  }
}

function drawBackground(ctx, playfield) {
  const gradient = ctx.createLinearGradient(0, playfield.y, 0, playfield.y + playfield.height);
  gradient.addColorStop(0, '#101322');
  gradient.addColorStop(1, '#1d1533');
  ctx.fillStyle = gradient;
  ctx.fillRect(playfield.x, playfield.y, playfield.width, playfield.height);
}

function drawFruit(ctx, entity, config) {
  const color = config.fruitColors[entity.colorIndex % config.fruitColors.length];
  ctx.beginPath();
  ctx.arc(entity.pos.x, entity.pos.y, entity.radiusCss, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
    entity.pos.x - entity.radiusCss * 0.3,
    entity.pos.y - entity.radiusCss * 0.3,
    entity.radiusCss * 0.28,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
}

/** Bomba visualmente inconfundível (F5): corpo escuro, aro de alerta e pavio. */
function drawBomb(ctx, entity) {
  ctx.beginPath();
  ctx.arc(entity.pos.x, entity.pos.y, entity.radiusCss, 0, Math.PI * 2);
  ctx.fillStyle = '#15171c';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ff4d4d';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(entity.pos.x, entity.pos.y - entity.radiusCss);
  ctx.quadraticCurveTo(
    entity.pos.x + entity.radiusCss * 0.7,
    entity.pos.y - entity.radiusCss * 1.5,
    entity.pos.x + entity.radiusCss * 0.2,
    entity.pos.y - entity.radiusCss * 1.9,
  );
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(entity.pos.x + entity.radiusCss * 0.2, entity.pos.y - entity.radiusCss * 1.9, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
}

function drawHalf(ctx, half, config) {
  const color = config.fruitColors[half.colorIndex % config.fruitColors.length];
  ctx.save();
  ctx.translate(half.pos.x, half.pos.y);
  ctx.rotate(half.angleRad);
  ctx.beginPath();
  ctx.arc(0, 0, half.radiusCss, half.side > 0 ? 0 : Math.PI, half.side > 0 ? Math.PI : Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Rastro: polilinha pelas amostras retidas, com espessura e opacidade
 * decrescentes da ponta para a cauda. Nenhum ponto inventado entre elas — o
 * rastro precisa ser capaz de MOSTRAR um engasgo, não de escondê-lo (F2.6).
 */
function drawTrail(ctx, samples, config) {
  if (samples.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < samples.length; i += 1) {
    const ratio = i / (samples.length - 1);
    ctx.beginPath();
    ctx.moveTo(samples[i - 1].x, samples[i - 1].y);
    ctx.lineTo(samples[i].x, samples[i].y);
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.75 * ratio})`;
    ctx.lineWidth = config.trailWidthCss * (0.25 + 0.75 * ratio);
    ctx.stroke();
  }
}

function drawBlade(ctx, pos, config) {
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, config.bladeRadiusCss, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

export function draw(renderer, state, config, playfield) {
  const ctx = renderer.ctx;
  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  ctx.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);

  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(0, 0, playfield.width, playfield.y + playfield.height);
  drawBackground(ctx, playfield);

  for (const half of state.halves) drawHalf(ctx, half, config);
  for (const entity of state.entities) {
    if (entity.state !== 'active') continue;
    if (entity.kind === 'bomb') drawBomb(ctx, entity);
    else drawFruit(ctx, entity, config);
  }

  drawTrail(ctx, state.blade.samples, config);
  drawBlade(ctx, state.blade.pos, config);
}

export function updateHud(renderer, state) {
  const hud = renderer.hud;
  if (hud.score) hud.score.textContent = String(state.score);
  if (hud.high) hud.high.textContent = String(state.highScore);
  if (hud.lives) hud.lives.textContent = '♥'.repeat(state.lives) || '—';
  if (hud.combo) hud.combo.textContent = String(state.blade.comboCount);
  if (hud.level) hud.level.textContent = String(state.level + 1);
}

export function updateCalibrationScreen(renderer, stability) {
  if (!renderer.hud.stability) return;
  renderer.hud.stability.textContent = stability.stable ? 'estável' : 'instável';
  renderer.hud.stability.dataset.stable = stability.stable ? 'sim' : 'nao';
}

const REASON_TEXT = {
  bomb: 'Você cortou uma bomba!',
  'no-lives': 'Você ficou sem vidas!',
};

export function updateGameOverScreen(renderer, state) {
  if (renderer.hud.gameOverReason) {
    renderer.hud.gameOverReason.textContent = REASON_TEXT[state.gameOverReason] || 'Fim de jogo';
  }
  if (renderer.hud.gameOverScore) {
    renderer.hud.gameOverScore.textContent = `Pontos: ${state.score} · Recorde da sessão: ${state.highScore}`;
  }
}
