// Game loop com passo fixo desacoplado da taxa de quadros ("Fix Your
// Timestep"): a física usa dt constante e acumulador — comportamento igual
// a 60 e 144 Hz (F10.6). Também orquestra fases e o overlay de latência.

import {
  createGameState,
  difficultyForRound,
  fireShot,
  resolveRoundEnd,
  restart,
  MAX_AMMO,
} from './rules.js';
import {
  spawnDucks,
  updateDucks,
  findHit,
  killDuck,
  waveFinished,
  createRng,
  WORLD,
} from './entities.js';
import { sampleInput } from './input.js';
import { crosshairFromAxes } from './aim.js';
import { drawFrame, drawMessage } from './render.js';
import { playShot, playHit, playEscape, playEmpty } from './audio.js';
import { rumble } from './rumble-fallback.js';

const FIXED_DT = 1 / 120; // passo fixo da física (s)
const OVERLAY_POLL_MS = 1000; // leitura de /metrics a 1 Hz (F11)

export function startGame(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = WORLD.width;
  canvas.height = WORLD.height;

  let state = createGameState();
  state.phase = 'waitingGamepad';
  let rng = createRng(Date.now() >>> 0);
  let accumulator = 0;
  let lastFrameMs = performance.now();
  let escapedCount = 0;

  const overlay = { visible: false, metrics: {}, fps: 0 };
  let overlayTimer = null;
  let frameCount = 0;
  let fpsWindowStart = performance.now();

  // Toggle do overlay (F11.2: desligado = nenhuma requisição a /metrics).
  window.addEventListener('keydown', (event) => {
    if (event.key === 'o' || event.key === 'O') {
      overlay.visible = !overlay.visible;
      if (overlay.visible && overlayTimer === null) {
        overlayTimer = setInterval(async () => {
          try {
            const response = await fetch('/metrics');
            overlay.metrics = await response.json();
          } catch {
            // servidor fora: overlay mostra últimos valores
          }
        }, OVERLAY_POLL_MS);
      } else if (!overlay.visible && overlayTimer !== null) {
        clearInterval(overlayTimer);
        overlayTimer = null;
      }
    }
  });

  function beginWave() {
    const params = difficultyForRound(state.round);
    state = { ...state, ducks: spawnDucks(params, rng), ammo: MAX_AMMO, phase: 'playing' };
    escapedCount = 0;
  }

  function handleFire(input) {
    const x = state.crosshair.x * WORLD.width;
    const y = state.crosshair.y * WORLD.height;
    const target = findHit(state.ducks, x, y);
    const result = fireShot(state, target !== null);
    state = result.state;
    if (result.event === 'no-ammo') {
      playEmpty();
      return;
    }
    playShot();
    // Coice do disparo: vibração curta (F8.4)
    rumble(input.gamepad, 0.4, 80);
    if (result.event === 'shot-hit' && target !== null) {
      state = { ...state, ducks: killDuck(state.ducks, target.id) };
      playHit();
      // Acerto: padrão distinto e distinguível (F8.4)
      setTimeout(() => rumble(input.gamepad, 0.9, 220), 90);
    }
  }

  function stepPhysics(dt) {
    if (state.phase !== 'playing') {
      return;
    }
    const before = state.ducks.filter((d) => d.escaped).length;
    const ducks = updateDucks(state.ducks, dt);
    const after = ducks.filter((d) => d.escaped).length;
    if (after > before) {
      playEscape();
      escapedCount += after - before;
    }
    state = { ...state, ducks };
    if (waveFinished(state.ducks)) {
      state = resolveRoundEnd(state);
      if (state.phase === 'roundEnd') {
        setTimeout(() => beginWave(), 1600);
      }
    }
  }

  function frame(nowMs) {
    const input = sampleInput();
    // Mira ABSOLUTA (F10.10, contrato com F4): posição = função pura da
    // leitura atual do eixo normalizado + geometria — nunca da posição
    // anterior. Integrar velocidade aqui é proibido (F10.7/KPI-16).
    const aimPx = crosshairFromAxes(input.axisX, input.axisY, WORLD.width, WORLD.height);
    state = {
      ...state,
      crosshair: { x: aimPx.x / WORLD.width, y: aimPx.y / WORLD.height },
    };
    frameCount += 1;
    if (nowMs - fpsWindowStart >= 1000) {
      overlay.fps = (frameCount * 1000) / (nowMs - fpsWindowStart);
      frameCount = 0;
      fpsWindowStart = nowMs;
    }

    if (state.phase === 'waitingGamepad') {
      if (input.connected) {
        state = { ...state, phase: 'calibration' };
      }
    } else if (state.phase === 'calibration') {
      // Fluxo de entrada (F10): guia a calibração antes da rodada 1.
      const stable = Math.abs(input.axisX) < 0.05 && Math.abs(input.axisY) < 0.05;
      if (stable && input.firePressed) {
        rng = createRng(Date.now() >>> 0);
        beginWave();
      }
    } else if (state.phase === 'gameOver') {
      if (input.firePressed) {
        state = restart(state);
        beginWave();
      }
    } else if (input.firePressed) {
      handleFire(input);
    }

    // Física com passo fixo e acumulador
    const frameDt = Math.min(0.25, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;
    accumulator += frameDt;
    while (accumulator >= FIXED_DT) {
      stepPhysics(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    drawFrame(ctx, state, overlay);
    if (state.phase === 'waitingGamepad') {
      drawMessage(ctx, 'Aguardando controle…', 'Conecte o celular ao servidor wii-controller');
    } else if (state.phase === 'calibration') {
      drawMessage(
        ctx,
        'Calibração',
        'Segure o celular EM PÉ apontando para a tela (como um Wii Remote), toque em CALIBRAR e aperte A com a mira estável no centro'
      );
    } else if (state.phase === 'roundEnd') {
      drawMessage(ctx, `Rodada ${state.round - 1} concluída!`, 'Prepare-se…');
    } else if (state.phase === 'gameOver') {
      drawMessage(
        ctx,
        `Fim de jogo — ${state.score} pontos`,
        `Recorde da sessão: ${state.highScore}. Aperte A para jogar de novo. (${escapedCount} patos escaparam)`
      );
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
