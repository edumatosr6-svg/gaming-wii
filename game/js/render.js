// Desenho em Canvas 2D — única parte (com input.js/loop.js) que toca o
// navegador. Assets são formas geométricas (placeholder por diretiva).

import { duckPosition, DUCK_RADIUS, WORLD, VEGETATION_BAND } from './entities.js';

export function drawFrame(ctx, state, overlay) {
  const { width, height } = WORLD;
  // Céu
  ctx.fillStyle = '#8ecae6';
  ctx.fillRect(0, 0, width, height);
  // Vegetação na base
  ctx.fillStyle = '#2a9d34';
  ctx.fillRect(0, height * (1 - VEGETATION_BAND), width, height * VEGETATION_BAND);

  // Patos (ordem do array = ordem de desenho; o último fica por cima)
  for (const duck of state.ducks) {
    if (!duck.alive || duck.escaped) {
      continue;
    }
    const pos = duckPosition(duck);
    ctx.fillStyle = '#6b4f2a';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, DUCK_RADIUS, DUCK_RADIUS * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f7d20';
    ctx.beginPath();
    ctx.arc(pos.x + DUCK_RADIUS * 0.6, pos.y - DUCK_RADIUS * 0.4, DUCK_RADIUS * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mira
  const cx = state.crosshair.x * width;
  const cy = state.crosshair.y * height;
  ctx.strokeStyle = '#d90429';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx, cy + 22);
  ctx.stroke();

  // HUD
  ctx.fillStyle = '#111';
  ctx.font = '18px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Rodada ${state.round}`, 12, 24);
  ctx.fillText(`Pontos ${state.score}`, 12, 46);
  ctx.fillText(`Recorde ${state.highScore}`, 12, 68);
  ctx.fillText(`Munição ${'|'.repeat(state.ammo)}`, 12, 90);
  ctx.fillText(`Acertos ${state.hitsInRound}/${state.requiredHits}`, 12, 112);
  if (state.streak > 1) {
    ctx.fillText(`Sequência x${state.streak}`, 12, 134);
  }

  if (overlay && overlay.visible) {
    drawOverlay(ctx, overlay);
  }
}

// Overlay de latência (F11): p50/p95, taxa de amostras e FPS.
function drawOverlay(ctx, overlay) {
  const { width } = WORLD;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(width - 240, 8, 232, 118);
  ctx.fillStyle = '#8f8';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  const m = overlay.metrics || {};
  const lines = [
    `lat p50: ${(m.latency_ms_p50 ?? 0).toFixed(1)} ms`,
    `lat p95: ${(m.latency_ms_p95 ?? 0).toFixed(1)} ms`,
    `net/proc: ${(m.net_ms ?? 0).toFixed(1)}/${(m.proc_ms ?? 0).toFixed(2)} ms`,
    `jitter: ${(m.jitter_ms ?? 0).toFixed(1)} ms`,
    `motion: ${(m.motion_rate_hz ?? 0).toFixed(0)} Hz`,
    `fps: ${overlay.fps.toFixed(0)}`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, width - 228, 30 + i * 16));
}

// Telas de texto (aguardando controle, calibração, fim de rodada, game over).
export function drawMessage(ctx, title, subtitle) {
  const { width, height } = WORLD;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(title, width / 2, height / 2 - 20);
  ctx.font = '18px sans-serif';
  ctx.fillText(subtitle, width / 2, height / 2 + 20);
}
