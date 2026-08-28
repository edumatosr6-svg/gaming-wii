// Cola da interface do controle: máquina de estados visuais, conexão
// automática, escada de fontes de orientação, assistente de calibração,
// botões e modo imersivo.

import { createConnection, addressFromLocation } from './connection.js';
import { loadLastAddress, loadRangesProfile, saveRangesProfile } from './storage.js';
import { createMotionThrottle, buildMotionMessage, createProviders } from './motion.js';
import {
  selectSource,
  isSelectableSource,
  probeWithTimeout,
  createStallWatch,
  createStatusThrottle,
} from './sources.js';
import { createCaptureWindow, createWizard, buildCalibrateMessage } from './calibration.js';
import { wireTouchButtons, onActivate } from './controls.js';
import { vibrate } from './haptics.js';
import {
  MOTION_SEND_HZ,
  DEFAULT_PORT,
  RECONNECT_DELAY_MS,
  STATUS_MIN_INTERVAL_MS,
  SOURCE_LABELS,
  CALIB_WINDOW_MAX_MS,
} from './config.js';

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
const sourceBanner = document.getElementById('source-banner');
const sourceLabel = document.getElementById('source-label');
const magIndicator = document.getElementById('mag-indicator');
const debugLine = document.getElementById('debug-line');
const calibrateButton = document.getElementById('calibrate-button');
const rangeButton = document.getElementById('range-button');
const captureButton = document.getElementById('capture-button');
const skipWizardButton = document.getElementById('skip-wizard-button');
const wizardSteps = document.querySelectorAll('#wizard-steps [data-step]');
const wizardHold = document.getElementById('wizard-hold');
const wizardProgress = document.getElementById('wizard-progress');
const wizardMessage = document.getElementById('wizard-message');
const padScreen = document.getElementById('pad-screen');
const rotateHint = document.getElementById('rotate-hint');
const sensorTip = document.getElementById('sensor-tip');

// --- Estado do cliente (ClientViewState) -----------------------------------
const view = {
  state: 'conectando',
  source: null,
  magRejected: false,
  wizardStep: null,
};

let stopMotion = null;
let reconnectTimer = null;
let lastCloseInfo = '—';
let sentCount = 0;
let useSecureSocket = true;
let latestOrientation = null;
let activeCapture = null; // { window, purpose: 'center' | 'wizard', startedMs }
let wizard = null;
let stallWatch = null;
const providers = createProviders();
const statusThrottle = createStatusThrottle(STATUS_MIN_INTERVAL_MS);
const motionThrottle = createMotionThrottle(MOTION_SEND_HZ);

// Interruptores de diagnóstico da precisão (F15). São parâmetros do próprio
// produto — cada frente tem o SEU interruptor, de propósito: ligar e desligar
// as quatro em bloco tornaria impossível atribuir uma regressão de precisão a
// uma frente específica, que é justamente o que se está tentando medir.
const params = new URLSearchParams(window.location.search);
const forcedSource = params.get('src');
const fusionOptions = {
  useMag: params.get('mag') !== 'off',
  rejectMag: params.get('magreject') !== 'off',
};

// --- Máquina de estados visuais (F2.5) -------------------------------------
// Único mecanismo de alternância de tela do cliente. Exatamente uma tela fica
// visível; as demais recebem `hidden`, que o CSS honra com `display: none`.
// Toda mudança de tela passa por aqui — nenhum outro trecho mexe em `.hidden`
// de uma seção, senão dois caminhos concorrentes voltam a permitir duas telas
// visíveis ao mesmo tempo.
function setScreen(state) {
  view.state = state;
  for (const element of screenElements) {
    element.hidden = element.dataset.screen !== state;
  }
  // Ponta do sensor (F2.11/W23): aparência distinta por estado.
  sensorTip.dataset.connState = state;
  // O indicador de fonte existe em `conectado` e `calibrando` (F2.13).
  sourceBanner.hidden = !(state === 'conectado' || state === 'calibrando');
}

// O estado da conexão fica visível em 100% do tempo (F9.6): a faixa de status
// vive fora das telas e é atualizada em toda transição.
function setStatus(state, text) {
  statusBanner.dataset.state = state;
  statusBanner.textContent = text;
}

function setAddressInUse(ip, port) {
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

// Rótulo da fonte em uso (F2.13) e indicador de interferência (F2.14). O
// indicador de rejeição aparece e some SEM trocar de tela — trocar de tela por
// causa de uma interferência momentânea tiraria o controle da mão do jogador.
function renderSource() {
  sourceLabel.textContent = view.source === null ? '—' : SOURCE_LABELS[view.source] || view.source;
  sourceBanner.dataset.source = view.source || '';
  magIndicator.hidden = !view.magRejected;
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
// não tem como saber que precisa dar.
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

// --- Fonte de orientação (F13) ---------------------------------------------

// Sonda um degrau: registra o provedor e espera uma amostra REAL chegar. A
// presença da API não conta como disponibilidade — o modo de falha real do
// evento clássico é existir, ter permissão e mesmo assim não emitir nada.
function probeSource(name) {
  const provider = providers[name];
  if (typeof provider !== 'function') {
    return Promise.resolve(false);
  }
  return probeWithTimeout((onFirstSample) => provider(onFirstSample, fusionOptions));
}

// Verificação usada apenas para a fonte FORÇADA (`?src=`): basta que o
// provedor exista e aceite registrar. Uma fonte escolhida à mão para
// diagnóstico não precisa provar que já emitiu — ela pode estar esperando o
// roteiro começar.
function canStartSource(name) {
  const provider = providers[name];
  if (typeof provider !== 'function') {
    return false;
  }
  const stop = provider(() => {}, fusionOptions);
  if (stop === null || stop === undefined) {
    return false;
  }
  stop();
  return true;
}

function onOrientationSample(orientation, info = {}) {
  latestOrientation = orientation;
  const now = performance.now();
  if (stallWatch !== null) {
    stallWatch.noteSample(now);
  }
  if (typeof info.magRejected === 'boolean' && info.magRejected !== view.magRejected) {
    view.magRejected = info.magRejected;
    renderSource();
  }

  // Alimenta a captura de calibração em andamento com a taxa cheia.
  if (activeCapture !== null) {
    activeCapture.window.push(orientation);
  }

  const message = buildMotionMessage(
    orientation.alpha,
    orientation.beta,
    orientation.gamma,
    now
  );
  if (motionThrottle.push(message, now) !== null && connection.isOpen) {
    connection.send(message);
    sentCount += 1;
  }
  maybeSendStatus(now);
}

function maybeSendStatus(nowMs, force = false) {
  if (view.source === null || !connection.isOpen) {
    return;
  }
  const message = statusThrottle.push(view.source, view.magRejected, nowMs, { force });
  if (message !== null) {
    connection.send(message);
  }
}

async function startOrientation() {
  if (forcedSource !== null && !isSelectableSource(forcedSource)) {
    showError(`Fonte de orientação desconhecida em ?src=: ${forcedSource}`);
    return;
  }
  const selection = await selectSource(probeSource, forcedSource, canStartSource);
  if (selection.source === null) {
    // Nenhuma fonte disponível: aviso visível nomeando a causa provável, nunca
    // silenciosamente sem mira (F13.3). E jamais cair para `synthetic`, que
    // faria um aparelho sem sensores "funcionar" sobre dados inventados.
    showError(`Sem orientação: ${selection.error}`);
    return;
  }
  view.source = selection.source;
  renderSource();
  stallWatch = createStallWatch(selection.source, performance.now());

  if (stopMotion !== null) {
    stopMotion();
  }
  const provider = providers[selection.source];
  stopMotion = provider((orientation, info) => onOrientationSample(orientation, info), fusionOptions);
  maybeSendStatus(performance.now(), true);
}

// Degradação em runtime (F13/P7.5): se as amostras cessarem, desce um degrau,
// atualiza o rótulo e reporta por `status`.
setInterval(() => {
  if (stallWatch === null || forcedSource !== null) {
    return;
  }
  const degraded = stallWatch.poll(performance.now());
  if (degraded !== null) {
    view.source = degraded;
    renderSource();
    if (stopMotion !== null) {
      stopMotion();
    }
    const provider = providers[degraded];
    stopMotion = provider((orientation, info) => onOrientationSample(orientation, info), fusionOptions);
    maybeSendStatus(performance.now(), true);
  }
}, 500);

// --- Calibração (F5) e assistente de alcance (F12) --------------------------

function renderWizardStep(step) {
  view.wizardStep = step;
  for (const element of wizardSteps) {
    element.hidden = element.dataset.step !== step;
  }
}

function setWizardMessage(text) {
  wizardMessage.textContent = text;
}

// Inicia uma captura de janela. O TOQUE INICIA A CAPTURA; a mensagem sai ao
// fim da janela, com a MÉDIA das amostras (F2.6/F5) — nunca com uma amostra
// instantânea, que é o defeito que originou esta mudança.
function beginCapture(purpose) {
  const startedMs = performance.now();
  activeCapture = { window: createCaptureWindow(startedMs), purpose, startedMs };
  wizardHold.hidden = false;
  wizardProgress.hidden = false;
  setWizardMessage('');
  if (purpose === 'center') {
    setStatus('conectado', 'capturando centro — segure parado…');
  }
}

function endCapture() {
  activeCapture = null;
  wizardHold.hidden = true;
  wizardProgress.hidden = true;
}

function onCaptureFinished(result, purpose) {
  if (purpose === 'center') {
    endCapture();
    if (result.status === 'done') {
      sendCalibrate(result.center, null);
      setStatus('conectado', 'centro calibrado');
    } else if (result.status === 'slow_source') {
      showError(
        `Calibração impossível nesta fonte: ${result.reason}. ` +
          'Force outra fonte com ?src= na URL.'
      );
    } else {
      showError(`Calibração não aplicada: ${result.reason}`);
    }
    return;
  }

  const outcome = wizard.submitCapture(result);
  if (outcome.action === 'retry') {
    endCapture();
    setWizardMessage(`${outcome.reason} — toque em CAPTURAR para repetir.`);
    return;
  }
  if (outcome.action === 'change_source') {
    endCapture();
    setWizardMessage(`${outcome.reason}. Force outra fonte com ?src= na URL.`);
    return;
  }
  endCapture();
  if (outcome.action === 'defaulted') {
    setWizardMessage(`${outcome.reason} — usando o padrão desta direção.`);
  } else {
    setWizardMessage('');
  }
  if (wizard.done) {
    finishWizard();
  } else {
    renderWizardStep(wizard.step);
  }
}

function finishWizard() {
  const profile = wizard.profile();
  if (profile.ranges !== null) {
    // Persiste APENAS os quatro alcances (nunca o centro): o alcance do pulso
    // é configuração da pessoa; o centro depende da postura do momento, e um
    // centro velho é pior que nenhum.
    saveRangesProfile(profile.ranges);
  }
  sendCalibrate(profile.center, profile.ranges);
  setScreen('conectado');
  setStatus('conectado', 'conectado');
}

function startWizard() {
  wizard = createWizard();
  setScreen('calibrando');
  setStatus('conectado', 'calibrando apontamento');
  renderWizardStep(wizard.step);
  setWizardMessage('Toque em CAPTURAR e segure o aparelho parado.');
}

function sendCalibrate(center, ranges) {
  // Proibição de falha silenciosa (F9.7): `connection.send` descarta sem sinal
  // com o socket fechado, então confirmar "calibrado" sem checar o estado
  // exibiria a confirmação de uma calibração que nunca saiu do aparelho.
  if (!connection.isOpen) {
    showError('Calibração não enviada: sem conexão com o PC.');
    return;
  }
  connection.send(buildCalibrateMessage(center, ranges));
  sentCount += 1;
}

// Poll da captura: a janela pode se ESTENDER sob fonte lenta, mas nunca fica
// aberta indefinidamente esperando estabilidade (F5.7/KPI-21).
setInterval(() => {
  if (activeCapture === null) {
    return;
  }
  const now = performance.now();
  const result = activeCapture.window.poll(now);
  if (result.status === 'capturing') {
    const bar = wizardProgress.querySelector('.bar');
    if (bar !== null) {
      bar.style.width = `${Math.min(100, result.progress * 100)}%`;
    }
    if (now - activeCapture.startedMs > CALIB_WINDOW_MAX_MS + 500) {
      // Guarda dura: nem sob fonte travada a captura fica aberta para sempre.
      onCaptureFinished(
        { status: 'slow_source', reason: 'fonte de orientação lenta demais' },
        activeCapture.purpose
      );
    }
    return;
  }
  onCaptureFinished(result, activeCapture.purpose);
}, 50);

// --- Conexão ----------------------------------------------------------------

const connection = createConnection({
  onOpen: async () => {
    clearError();

    // A TELA é função do `hello`, não da seleção de fonte (transição de
    // ClientViewState). Percorrer a escada pode levar vários segundos — quatro
    // degraus × SOURCE_PROBE_MS no pior caso — e travar a troca de tela nisso
    // deixaria o jogador olhando "conectando…" com a conexão já aberta, que é
    // a falha silenciosa que a F9.6 proíbe. A seleção segue em paralelo e só
    // atualiza o indicador de fonte quando resolve.
    const saved = loadRangesProfile();
    if (saved !== null) {
      // Perfil de alcances salvo (F12.6): a segunda sessão não repete o ritual
      // das quatro etapas de extremo. O CENTRO não é reaplicado — ele depende
      // da postura de agora, e a captura de centro é rápida.
      setScreen('conectado');
      sendCalibrate(null, saved);
      setStatus('conectado', 'alcance lembrado — toque em CENTRO para calibrar o centro');
    } else {
      startWizard();
    }

    enterImmersiveMode();
    startOrientation();
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
  onCalibrationApplied: (accepted, reason) => {
    // Rejeição NUNCA passa em silêncio (F12/KPI-14): o servidor é a autoridade
    // sobre os limites, e um perfil recusado por ele tem de aparecer na tela
    // com o motivo, em vez de o cliente seguir como se tivesse calibrado.
    if (accepted) {
      clearError();
      return;
    }
    showError(`Calibração recusada pelo PC: ${reason || 'perfil inválido'}`);
    if (view.state === 'calibrando') {
      setWizardMessage(`${reason || 'perfil inválido'} — refaça a calibração.`);
    }
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

// Todos os comandos usam o registro touch-first (F2.6/F2.9): o toque é o
// caminho primário e `click` é apenas adicional, para mouse no desktop.
onActivate(calibrateButton, () => {
  if (!connection.isOpen) {
    showError('Calibração não enviada: sem conexão com o PC.');
    return;
  }
  calibrateButton.classList.add('pressed');
  setTimeout(() => calibrateButton.classList.remove('pressed'), 1200);
  beginCapture('center');
});
onActivate(rangeButton, () => {
  if (connection.isOpen) {
    startWizard();
  } else {
    showError('Sem conexão com o PC: reconecte antes de calibrar o alcance.');
  }
});
onActivate(captureButton, () => {
  if (activeCapture === null) {
    beginCapture('wizard');
  }
});
onActivate(skipWizardButton, () => {
  // Pular aplica o padrão do SERVIDOR nas quatro direções: o payload sai sem
  // `ranges`, e é o servidor (dono de DEFAULT_RANGE_DEG) que preenche. O
  // cliente não guarda uma cópia desse número.
  endCapture();
  sendCalibrate(null, null);
  setScreen('conectado');
  setStatus('conectado', 'alcance padrão aplicado');
});
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
  // Botões SUSPENSOS durante a calibração (F2.16): evita disparar no jogo
  // enquanto o usuário calibra. `motion` continua saindo — sem as amostras não
  // haveria o que capturar.
  if (view.state === 'calibrando') {
    return;
  }
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
