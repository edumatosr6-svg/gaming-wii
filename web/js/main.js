// Cola da interface do controle: máquina de estados visuais, conexão
// automática, sensores, botões e modo imersivo.

import { createConnection, loadLastAddress, addressFromLocation } from './connection.js';
import { startMotion, requestSensorAccess } from './motion.js';
import { wireTouchButtons, onActivate } from './controls.js';
import { vibrate } from './haptics.js';

const MOTION_SEND_HZ = 60; // espelha MOTION_SEND_HZ de server/config.py
const DEFAULT_PORT = '8443'; // espelha PORT de server/config.py
const RECONNECT_DELAY_MS = 800; // < 5 s exigidos por F9.5, com folga

const screenElements = document.querySelectorAll('#screens [data-screen]');
const ipInput = document.getElementById('ip-input');
const portInput = document.getElementById('port-input');
const connectButton = document.getElementById('connect-button');
const reconnectButton = document.getElementById('reconnect-button');
const pairManuallyButton = document.getElementById('pair-manually-button');
const connectingAddress = document.getElementById('connecting-address');
const closeReason = document.getElementById('close-reason');
const errorBanner = document.getElementById('error-banner');
const statusBanner = document.getElementById('status-banner');
const debugLine = document.getElementById('debug-line');
const calibrateButton = document.getElementById('calibrate-button');
const padScreen = document.getElementById('pad-screen');
const rotateHint = document.getElementById('rotate-hint');
const sensorTip = document.getElementById('sensor-tip');

let stopMotion = null;
let reconnectTimer = null;
let lastCloseInfo = '—';
let sentCount = 0;
let useSecureSocket = true;

// --- Máquina de estados visuais (F2.5) -------------------------------------
// Único mecanismo de alternância de tela do cliente. Exatamente uma tela fica
// visível; as demais recebem `hidden`, que o CSS honra com `display: none`.
// Toda mudança de tela passa por aqui — nenhum outro trecho mexe em `.hidden`
// de uma seção, senão dois caminhos concorrentes voltam a permitir duas telas
// visíveis ao mesmo tempo.
function setScreen(state) {
  for (const element of screenElements) {
    element.hidden = element.dataset.screen !== state;
  }
  // Ponta do sensor (F2.11/W23): aparência distinta por estado de
  // ClientViewState — o "LED infravermelho" reflete a conexão/mira.
  sensorTip.dataset.connState = state;
}

// O estado da conexão fica visível em 100% do tempo (F9.6): a faixa de status
// vive fora das telas e é atualizada em toda transição.
function setStatus(state, text) {
  statusBanner.dataset.state = state;
  statusBanner.textContent = text;
}

function setAddressInUse(ip, port) {
  // Exposto no DOM para que o endereço efetivamente usado seja observável
  // (F3.2) sem depender do console do aparelho.
  statusBanner.dataset.address = `${ip}:${port}`;
  connectingAddress.textContent = `${ip}:${port}`;
}

function showError(message) {
  // Falhar alto no cliente (F2.3): erro visível e nomeado.
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.hidden = true;
}

// --- Endereço do servidor ---------------------------------------------------

function currentAddress() {
  return { ip: ipInput.value.trim(), port: portInput.value.trim() || DEFAULT_PORT };
}

function connectTo(ip, port) {
  setAddressInUse(ip, port);
  setScreen('conectando');
  setStatus('conectando', `conectando a ${ip}:${port}…`);
  connection.connect(ip, port, { secure: useSecureSocket });
}

function tryConnect() {
  clearError();
  const { ip, port } = currentAddress();
  if (ip === '') {
    showError('Informe o IP do PC (mostrado no terminal do servidor).');
    setScreen('pareamento');
    setStatus('pareamento', 'aguardando endereço');
    return;
  }
  connectTo(ip, port);
}

// Reconexão automática (F9.5): uma queda de Wi-Fi ou um congelamento momentâneo
// da aba não pode deixar o controle inerte à espera de um toque que o jogador
// não tem como saber que precisa dar. O caminho por toque continua existindo
// (botão "Tentar agora"), mas não é o único.
function scheduleReconnect(delayMs = RECONNECT_DELAY_MS) {
  if (reconnectTimer !== null) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    const { ip, port } = currentAddress();
    if (ip !== '' && !connection.isOpen) {
      connectTo(ip, port);
    }
  }, delayMs);
}

function handleDrop(description) {
  lastCloseInfo = description;
  closeReason.textContent = description;
  setScreen('desconectado');
  setStatus('desconectado', `desconectado — ${description} — reconectando…`);
  scheduleReconnect();
}

// --- Conexão ----------------------------------------------------------------

const connection = createConnection({
  onOpen: async () => {
    clearError();
    setScreen('conectado');
    setStatus('conectado', 'conectado');
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
    handleDrop(`código ${code}${reason ? ` (${reason})` : ''}`);
  },
  onError: (message) => {
    showError(message);
    handleDrop('falha de conexão');
  },
  onVibrate: (intensity, durationMs) => {
    vibrate(intensity, durationMs);
  },
});

// --- Modo imersivo (F2.8) ---------------------------------------------------

async function enterImmersiveMode() {
  // Fullscreen + RETRATO (F2.2 — pegada vertical de Wii Remote); se o lock
  // falhar (restrição do navegador), orienta visualmente a manter em pé.
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // fullscreen negado: segue funcional
  }
  try {
    await screen.orientation.lock('portrait');
    rotateHint.hidden = true;
  } catch {
    rotateHint.hidden = false; // pede para manter o aparelho em pé
  }
}

// Na conexão automática o navegador nega fullscreen (exige gesto do usuário).
// A retentativa fica em `touchend` — gesto CONCLUÍDO — e acontece uma única
// vez: pedir fullscreen no início do toque faz o navegador cancelar a sequência
// e engolir o acionamento do botão que o jogador acabou de apertar (F2.8).
// Como o listener dos botões está registrado em `#buttons-area`, a mensagem
// `button` já saiu quando este handler roda.
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

// --- Controles --------------------------------------------------------------

function sendCalibrate() {
  // Proibição de falha silenciosa (F9.7): `connection.send` descarta sem sinal
  // com o socket fechado, então confirmar "centro calibrado" sem checar o
  // estado exibiria a confirmação de uma calibração que nunca saiu do aparelho
  // — o toque do jogador pode correr com a queda da conexão.
  if (!connection.isOpen) {
    showError('Calibração não enviada: sem conexão com o PC.');
    return;
  }
  connection.send({ type: 'calibrate' });
  sentCount += 1;
  calibrateButton.classList.add('pressed');
  setStatus('conectado', 'centro calibrado');
  setTimeout(() => {
    calibrateButton.classList.remove('pressed');
    if (connection.isOpen) {
      setStatus('conectado', 'conectado');
    }
  }, 1200);
}

// Todos os comandos usam o registro touch-first (F2.6/F2.9): o toque é o
// caminho primário e `click` é apenas adicional, para mouse no desktop.
onActivate(calibrateButton, sendCalibrate);
onActivate(connectButton, tryConnect);
onActivate(reconnectButton, () => {
  const { ip, port } = currentAddress();
  if (ip !== '') {
    connectTo(ip, port);
  } else {
    setScreen('pareamento');
    setStatus('pareamento', 'aguardando endereço');
  }
});
onActivate(pairManuallyButton, () => {
  setScreen('pareamento');
  setStatus('pareamento', 'aguardando endereço');
});

wireTouchButtons(document.getElementById('buttons-area'), (msg) => {
  connection.send(msg);
  sentCount += 1;
});

// Linha de diagnóstico: sem acesso ao console do celular, o estado real da
// conexão precisa estar visível na própria tela do controle (F9.6/F9.7).
setInterval(() => {
  debugLine.textContent = `${connection.isOpen ? 'ABERTO' : 'FECHADO'} · enviados ${sentCount} · última queda: ${lastCloseInfo}`;
}, 500);

// --- Início ----------------------------------------------------------------
// A página foi servida pelo próprio PC, então o endereço do servidor é o da
// própria URL: pré-preenche e conecta sozinho, sem digitação (F3.1/F3.2). O
// pareamento manual (com o último endereço de localStorage) é o caminho de
// exceção, para a página aberta fora do servidor (F3.3).
const origin = addressFromLocation(window.location, DEFAULT_PORT);
if (origin !== null) {
  useSecureSocket = origin.secure;
  ipInput.value = origin.ip;
  portInput.value = origin.port;
  tryConnect();
} else {
  const last = loadLastAddress();
  if (last !== null) {
    ipInput.value = last.ip;
    portInput.value = last.port;
  } else {
    portInput.value = DEFAULT_PORT;
  }
  setScreen('pareamento');
  setStatus('pareamento', 'aguardando endereço');
}

// Impede gestos de scroll/zoom/duplo-toque fora da tela de pareamento (F2.2).
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
