// Desenho em Canvas 2D e visibilidade das telas. Único módulo que chama
// `getContext('2d')` (X8) e o único, junto com `loop.js`, que toca o
// navegador. Não altera estado de jogo (F13.4): só lê.
//
// O estado de animação decorativo (partículas, estrelas, flash de impacto)
// mora só aqui, dentro de `renderer` — nunca em `state` — porque não é
// jogável e não tem KPI (F14, "qualidade estética"): é seguro perdê-lo,
// recriá-lo ou fazê-lo divergir entre quadros sem afetar nenhuma regra.

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
  return {
    canvas,
    ctx,
    screens,
    hud,
    dpr: 1,
    // --- só decorativo a partir daqui -------------------------------------
    stars: [],
    particles: [],
    prevHalfIds: new Set(),
    lastDrawMs: null,
    startMs: performanceNow(),
    lastCombo: 0,
    prevScreen: null,
    hitFlashUntilMs: 0,
  };
}

function performanceNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/** PRNG determinístico só para posicionar estrelas — não é o RNG do jogo. */
function starRng(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStarfield(config) {
  const rnd = starRng(0x9e3779b9);
  const stars = [];
  for (let i = 0; i < config.visual.starCount; i += 1) {
    stars.push({
      xFrac: rnd(),
      yFrac: rnd(),
      radius: 0.5 + rnd() * 1.6,
      phase: rnd() * Math.PI * 2,
      speed: 0.4 + rnd() * 0.8,
    });
  }
  const nebulae = [];
  for (let i = 0; i < config.visual.nebulaCount; i += 1) {
    nebulae.push({
      xFrac: 0.15 + rnd() * 0.7,
      yFrac: 0.15 + rnd() * 0.6,
      radiusFrac: 0.22 + rnd() * 0.18,
      hue: [265, 200, 330][i % 3],
      phase: rnd() * Math.PI * 2,
    });
  }
  return { stars, nebulae };
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
  if (!renderer.stars.length) {
    const built = buildStarfield(config);
    renderer.stars = built.stars;
    renderer.nebulae = built.nebulae;
  }
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

function drawBackground(ctx, playfield, renderer, nowMs) {
  const top = playfield.y;
  const bottom = playfield.y + playfield.height;
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, '#141a33');
  gradient.addColorStop(0.55, '#1c1440');
  gradient.addColorStop(1, '#170f2b');
  ctx.fillStyle = gradient;
  ctx.fillRect(playfield.x, top, playfield.width, playfield.height);

  const tSec = (nowMs - renderer.startMs) / 1000;

  ctx.save();
  ctx.beginPath();
  ctx.rect(playfield.x, top, playfield.width, playfield.height);
  ctx.clip();

  for (const nebula of renderer.nebulae || []) {
    const cx = playfield.x + nebula.xFrac * playfield.width;
    const cy = top + nebula.yFrac * playfield.height;
    const pulse = 0.85 + 0.15 * Math.sin(tSec * 0.25 + nebula.phase);
    const radius = nebula.radiusFrac * Math.max(playfield.width, playfield.height) * pulse;
    const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    blob.addColorStop(0, `hsla(${nebula.hue}, 70%, 55%, 0.16)`);
    blob.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const star of renderer.stars) {
    const twinkle = 0.4 + 0.6 * Math.max(0, Math.sin(tSec * star.speed + star.phase));
    ctx.globalAlpha = twinkle * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playfield.x + star.xFrac * playfield.width, top + star.yFrac * playfield.height, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const vignette = ctx.createRadialGradient(
    playfield.x + playfield.width / 2,
    top + playfield.height * 0.55,
    playfield.height * 0.25,
    playfield.x + playfield.width / 2,
    top + playfield.height * 0.55,
    playfield.height * 0.9,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(4,3,12,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(playfield.x, top, playfield.width, playfield.height);

  ctx.restore();
}

function withShadowedEllipse(ctx, x, y, rx, ry, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFruit(ctx, entity, config, nowMs) {
  const color = config.fruitColors[entity.colorIndex % config.fruitColors.length];
  const r = entity.radiusCss;
  const wobble = Math.sin((nowMs / 1000) * 3 + entity.id) * 0.05;

  withShadowedEllipse(ctx, entity.pos.x, entity.pos.y + r * 0.9, r * 0.85, r * 0.28, 0.22);

  ctx.save();
  ctx.translate(entity.pos.x, entity.pos.y);
  ctx.rotate(wobble);

  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.05);
  body.addColorStop(0, lighten(color, 0.55));
  body.addColorStop(0.55, color);
  body.addColorStop(1, darken(color, 0.35));

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = darken(color, 0.5);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(r * 0.28, r * 0.05, r * 0.14, r * 0.32, 0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fill();

  ctx.restore();
}

/** Bomba visualmente inconfundível (F5): corpo escuro, aro de alerta e pavio. */
function drawBomb(ctx, entity, config, nowMs) {
  const r = entity.radiusCss;
  const tSec = nowMs / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(tSec * Math.PI * 2 * config.visual.bombPulseHz);

  withShadowedEllipse(ctx, entity.pos.x, entity.pos.y + r * 0.9, r * 0.85, r * 0.28, 0.28);

  ctx.save();
  ctx.translate(entity.pos.x, entity.pos.y);

  ctx.save();
  ctx.globalAlpha = 0.35 + 0.35 * pulse;
  ctx.shadowColor = '#ff3b3b';
  ctx.shadowBlur = 14 + 10 * pulse;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.02, 0, Math.PI * 2);
  ctx.strokeStyle = '#ff4d4d';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#3a3f4c');
  body.addColorStop(0.6, '#1a1c24');
  body.addColorStop(1, '#08090c');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `rgba(255,77,77,${0.6 + 0.4 * pulse})`;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.7, -r * 1.5, r * 0.2, -r * 1.9);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();

  const sparkOn = Math.sin(tSec * Math.PI * 2 * config.visual.bombSparkHz) > 0.2;
  ctx.beginPath();
  ctx.arc(r * 0.2, -r * 1.9, sparkOn ? 5.5 : 3.5, 0, Math.PI * 2);
  ctx.fillStyle = sparkOn ? '#fff1b8' : '#ffb84d';
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = sparkOn ? 12 : 4;
  ctx.fill();

  ctx.restore();
}

function drawHalf(ctx, half, config) {
  const color = config.fruitColors[half.colorIndex % config.fruitColors.length];
  const flesh = config.fruitFleshColors[half.colorIndex % config.fruitFleshColors.length];
  const r = half.radiusCss;
  const startAngle = half.side > 0 ? 0 : Math.PI;
  const endAngle = half.side > 0 ? Math.PI : Math.PI * 2;

  ctx.save();
  ctx.translate(half.pos.x, half.pos.y);
  ctx.rotate(half.angleRad);

  const rind = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  rind.addColorStop(0, lighten(color, 0.4));
  rind.addColorStop(1, darken(color, 0.3));
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = rind;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, startAngle, endAngle);
  ctx.closePath();
  ctx.fillStyle = flesh;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-r * 0.82, 0);
  ctx.lineTo(r * 0.82, 0);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();

  ctx.fillStyle = darken(flesh, 0.35);
  const seedY = half.side > 0 ? r * 0.35 : -r * 0.35;
  for (const dx of [-0.32, 0, 0.32]) {
    ctx.beginPath();
    ctx.ellipse(dx * r, seedY, r * 0.06, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// -------------------------------------------------------------- partículas

function spawnJuiceBurst(renderer, pos, colorIndex, config) {
  const color = config.fruitColors[colorIndex % config.fruitColors.length];
  for (let i = 0; i < config.visual.particlesPerSlice; i += 1) {
    const angle = (Math.PI * 2 * i) / config.visual.particlesPerSlice + Math.random() * 0.5;
    const speed = config.visual.particleSpeedCssPerS * (0.4 + Math.random() * 0.9);
    renderer.particles.push({
      x: pos.x,
      y: pos.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      color,
      radius: config.visual.particleRadiusCss * (0.6 + Math.random() * 0.8),
      bornMs: renderer.lastDrawMs,
      lifeMs: config.visual.particleLifeMs * (0.7 + Math.random() * 0.6),
    });
  }
}

function updateAndDrawParticles(ctx, renderer, config, nowMs, dtS) {
  if (!renderer.particles.length) return;
  const gravity = config.visual.particleGravityCssPerS2;
  const kept = [];
  for (const p of renderer.particles) {
    const ageMs = nowMs - p.bornMs;
    if (ageMs >= p.lifeMs) continue;
    p.vy += gravity * dtS;
    p.x += p.vx * dtS;
    p.y += p.vy * dtS;
    const lifeRatio = 1 - ageMs / p.lifeMs;
    ctx.beginPath();
    ctx.globalAlpha = Math.max(lifeRatio, 0);
    ctx.fillStyle = p.color;
    ctx.arc(p.x, p.y, p.radius * (0.5 + 0.5 * lifeRatio), 0, Math.PI * 2);
    ctx.fill();
    kept.push(p);
  }
  ctx.globalAlpha = 1;
  renderer.particles = kept;
}

function detectNewSlices(renderer, state, config) {
  const currentIds = new Set();
  for (const half of state.halves) {
    currentIds.add(half.id);
    if (!renderer.prevHalfIds.has(half.id)) {
      spawnJuiceBurst(renderer, half.pos, half.colorIndex, config);
    }
  }
  renderer.prevHalfIds = currentIds;
}

// ------------------------------------------------------------------ rastro

/**
 * Rastro: polilinha pelas amostras retidas, com espessura e opacidade
 * decrescentes da ponta para a cauda. Nenhum ponto inventado entre elas — o
 * rastro precisa ser capaz de MOSTRAR um engasgo, não de escondê-lo (F2.6).
 */
function drawTrail(ctx, samples, config) {
  if (samples.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.shadowColor = 'rgba(140,220,255,0.9)';
  for (let i = 1; i < samples.length; i += 1) {
    const ratio = i / (samples.length - 1);
    ctx.beginPath();
    ctx.moveTo(samples[i - 1].x, samples[i - 1].y);
    ctx.lineTo(samples[i].x, samples[i].y);
    ctx.strokeStyle = `rgba(215,244,255,${0.15 + 0.75 * ratio})`;
    ctx.lineWidth = config.trailWidthCss * (0.25 + 0.75 * ratio);
    ctx.shadowBlur = 10 * ratio;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlade(ctx, pos, config, nowMs) {
  const pulse = 0.85 + 0.15 * Math.sin(nowMs / 140);
  ctx.save();
  ctx.shadowColor = 'rgba(180,235,255,0.95)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, config.bladeRadiusCss * pulse, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, config.bladeRadiusCss * 1.9, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(215,244,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawHitFlash(ctx, playfield, renderer, nowMs, config) {
  if (nowMs >= renderer.hitFlashUntilMs) return;
  const remainMs = renderer.hitFlashUntilMs - nowMs;
  const alpha = clamp01(remainMs / config.visual.hitFlashMs) * 0.45;
  ctx.fillStyle = `rgba(255,40,40,${alpha})`;
  ctx.fillRect(playfield.x, 0, playfield.width, playfield.y + playfield.height);
}

// --------------------------------------------------------------- utilidades

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mix(hex, target, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const t = clamp01(amount);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function lighten(hex, amount) {
  return mix(hex, '#ffffff', amount);
}

function darken(hex, amount) {
  return mix(hex, '#000000', amount);
}

export function draw(renderer, state, config, playfield) {
  const ctx = renderer.ctx;
  const nowMs = performanceNow();
  const dtS = renderer.lastDrawMs === null ? 0 : Math.min((nowMs - renderer.lastDrawMs) / 1000, 0.25);

  if (state.screen !== renderer.prevScreen) {
    if (state.screen === 'gameOver' && state.gameOverReason === 'bomb') {
      renderer.hitFlashUntilMs = nowMs + config.visual.hitFlashMs;
    }
    if (state.screen !== 'jogando') {
      renderer.particles = [];
      renderer.prevHalfIds = new Set();
    }
    renderer.prevScreen = state.screen;
  }

  ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
  ctx.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);

  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(0, 0, playfield.width, playfield.y + playfield.height);
  drawBackground(ctx, playfield, renderer, nowMs);

  detectNewSlices(renderer, state, config);

  for (const half of state.halves) drawHalf(ctx, half, config);
  for (const entity of state.entities) {
    if (entity.state !== 'active') continue;
    if (entity.kind === 'bomb') drawBomb(ctx, entity, config, nowMs);
    else drawFruit(ctx, entity, config, nowMs);
  }

  updateAndDrawParticles(ctx, renderer, config, nowMs, dtS);

  drawTrail(ctx, state.blade.samples, config);
  drawBlade(ctx, state.blade.pos, config, nowMs);

  drawHitFlash(ctx, playfield, renderer, nowMs, config);

  renderer.lastDrawMs = nowMs;
}

export function updateHud(renderer, state) {
  const hud = renderer.hud;
  if (hud.score) hud.score.textContent = String(state.score);
  if (hud.high) hud.high.textContent = String(state.highScore);
  if (hud.lives) hud.lives.textContent = '♥'.repeat(state.lives) || '—';
  if (hud.combo) {
    hud.combo.textContent = String(state.blade.comboCount);
    if (state.blade.comboCount > renderer.lastCombo) {
      hud.combo.classList.remove('pop');
      void hud.combo.offsetWidth;
      hud.combo.classList.add('pop');
    }
    renderer.lastCombo = state.blade.comboCount;
  }
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
