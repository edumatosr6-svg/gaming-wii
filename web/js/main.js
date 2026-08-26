// Cola da interface do controle: pareamento, fullscreen, sensores, botões.

import { createConnection, loadLastAddress } from './connection.js';
import { startMotion, requestSensorAccess } from './motion.js';
import { wireTouchButtons } from './controls.js';
import { vibrate } from './haptics.js';

const MOTION_SEND_HZ = 60; // espelha MOTION_SEND_HZ de server/config.py
const DEFAULT_PORT = '8443'; // espelha PORT de server/config.py

const pairScreen = document.getElementById('pair-screen');
const padScreen = document.getElementById('pad-screen');
const ipInput = document.getElementById('ip-input');
const portInput = document.getElementById('port-input');
const connectButton = document.getElementById('connect-button');
const errorBanner = document.getElementById('error-banner');
const statusBanner = document.getElementById('status-banner');
const calibrateButton = document.getElementById('calibrate-button');
const rotateHint = document.getElementById('rotate-hint');

let stopMotion = null;
let reconnectTimer = null;
let lastCloseInfo = '—';
let sentCount = 0;

// Reconexão automática: uma queda de Wi-Fi ou um congelamento momentâneo da
// aba não pode exigir que o jogador volte à tela de pareamento (F9.3).
function scheduleReconnect(delayMs = 1000) {
  if (reconnectTimer !== null) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const { ip, port } = currentAddress();
    if (ip !== '' && !connection.isOpen) {
      connection.connect(ip, port);
    }
  }, delayMs);
}

function showError(message) {
  // Falhar alto no cliente (F2.3): erro visível e nomeado.
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
}

function setStatus(text, connected) {
  statusBanner.textContent = text;
  statusBanner.classList.toggle('connected', connected);
  statusBanner.classList.toggle('disconnected', !connected);
}

const connection = createConnection({
  onOpen: async () => {
    clearError();
    pairScreen.hidden = true;
    padScreen.hidden = false;
    setStatus('conectado', true);
    await enterImmersiveMode();
    try {
      await requestSensorAccess();
      if (stopMotion !== null) {
        stopMotion();
      }
      stopMotion = startMotion((msg) => connection.send(msg), MOTION_SEND_HZ);
    } catch (error) {
      showError(`Sensores indisponíveis: ${error.message}`);
    }
  },
  onClose: (code, reason) => {
    connectButton.disabled = false;
    connectButton.textContent = 'Conectar';
    lastCloseInfo = `código ${code}${reason ? ` (${reason})` : ''}`;
    setStatus(`desconectado — ${lastCloseInfo} — reconectando…`, false);
    scheduleReconnect();
  },
  onError: (message) => {
    connectButton.disabled = false;
    connectButton.textContent = 'Conectar';
    showError(message);
    setStatus('desconectado — toque para reconectar', false);
    scheduleReconnect();
  },
  onVibrate: (intensity, durationMs) => {
    vibrate(intensity, durationMs);
  },
});

async function enterImmersiveMode() {
  // Fullscreen + paisagem (F2); se o lock falhar, orienta visualmente.
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // fullscreen negado: segue funcional
  }
  try {
    await screen.orientation.lock('landscape');
    rotateHint.hidden = true;
  } catch {
    rotateHint.hidden = false; // pede para girar o aparelho manualmente
  }
}

function currentAddress() {
  return { ip: ipInput.value.trim(), port: portInput.value.trim() || DEFAULT_PORT };
}

function tryConnect() {
  clearError();
  const { ip, port } = currentAddress();
  if (ip === '') {
    showError('Informe o IP do PC (mostrado no terminal do servidor).');
    return;
  }
  connectButton.disabled = true;
  connectButton.textContent = 'Conectando…';
  connection.connect(ip, port);
}

connectButton.addEventListener('click', tryConnect);

// Reconexão por um toque no banner de status (F9.3).
statusBanner.addEventListener('click', () => {
  if (!connection.isOpen) {
    const { ip, port } = currentAddress();
    connection.connect(ip, port);
  }
});

// Na conexão automática o navegador nega fullscreen (exige gesto do usuário).
// A retentativa fica em `touchend` e acontece só uma vez: pedir fullscreen
// durante um toque em andamento faz o Chrome cancelar esse toque, engolindo o
// botão que o jogador acabou de apertar.
let immersiveRetried = false;
padScreen.addEventListener(
  'touchend',
  () => {
    if (!immersiveRetried && !document.fullscreenElement) {
      immersiveRetried = true;
      enterImmersiveMode();
    }
  },
  { passive: true }
);

function sendCalibrate() {
  connection.send({ type: 'calibrate' });
  sentCount += 1;
  calibrateButton.classList.add('pressed');
  setStatus('centro calibrado', true);
  setTimeout(() => {
    calibrateButton.classList.remove('pressed');
    if (connection.isOpen) {
      setStatus('conectado', true);
    }
  }, 1200);
}

// O pipeline de toque chama preventDefault em toda a área dos botões, o que
// impede o navegador de sintetizar o `click` — no celular a calibração precisa
// vir de `touchstart`. O `click` fica para mouse/desktop.
calibrateButton.addEventListener(
  'touchstart',
  (event) => {
    event.preventDefault();
    sendCalibrate();
  },
  { passive: false }
);
calibrateButton.addEventListener('click', sendCalibrate);

wireTouchButtons(document.getElementById('buttons-area'), (msg) => {
  connection.send(msg);
  sentCount += 1;
});

// Linha de diagnóstico: sem acesso ao console do celular, o estado real da
// conexão precisa estar visível na própria tela do controle.
const debugLine = document.getElementById('debug-line');
setInterval(() => {
  debugLine.textContent = `${connection.isOpen ? 'ABERTO' : 'FECHADO'} · enviados ${sentCount} · última queda: ${lastCloseInfo}`;
}, 500);

// A página foi servida pelo próprio PC, então o endereço do servidor é o da
// própria URL — pré-preenche com ele e conecta sozinho. localStorage (F3.2)
// fica como fallback para quando a página for aberta fora do servidor.
const last = loadLastAddress();
if (window.location.hostname !== '') {
  ipInput.value = window.location.hostname;
  portInput.value = window.location.port || DEFAULT_PORT;
  tryConnect();
} else if (last !== null) {
  ipInput.value = last.ip;
  portInput.value = last.port;
} else {
  portInput.value = DEFAULT_PORT;
}

// Impede gestos de scroll/zoom/duplo-toque fora dos botões (F2).
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.target.closest('#pair-screen') === null) {
      event.preventDefault();
    }
  },
  { passive: false }
);
document.addEventListener('dblclick', (event) => event.preventDefault());
