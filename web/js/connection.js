// WebSocket, reconexão e estado da conexão (F3, F9).
//
// A persistência mora em `storage.js`, que é o único módulo do cliente a tocar
// `localStorage` e mantém a lista fechada de duas chaves (F3.5/F12.8).

import { loadLastAddress, saveLastAddress } from './storage.js';

export { loadLastAddress, saveLastAddress };

// Monta a URL do WebSocket a partir de IP e porta. O padrão é seguro (`wss`),
// que é o modo em que o servidor roda (HTTPS é exigido pelos sensores, F1).
export function wsUrl(ip, port, secure = true) {
  return `${secure ? 'wss' : 'ws'}://${ip}:${port}/ws`;
}

// Deriva o endereço do servidor da origem da própria página (F3.1/F3.2): a
// página do controle é servida pelo PC de destino, então o endereço já está na
// URL aberta — pedir que o usuário digite o que a página já sabe é fricção e
// fonte de erro. Devolve null quando não há origem utilizável (`file://`),
// caso em que o pareamento manual é o caminho. Puro, testável sem navegador.
export function addressFromLocation(location, defaultPort) {
  const hostname = location && location.hostname ? location.hostname : '';
  if (hostname === '') {
    return null;
  }
  const secure = location.protocol === 'https:';
  const port = location.port !== '' ? location.port : String(defaultPort);
  return { ip: hostname, port, secure };
}

// Cria a conexão de controle.
// callbacks: onOpen, onClose, onError, onVibrate, onCalibrationApplied.
export function createConnection(callbacks) {
  let socket = null;
  let sessionId = null;
  // Geração da tentativa corrente. A reconexão automática (F9.5) abre sockets
  // novos enquanto os antigos ainda estão fechando; sem esta guarda, os eventos
  // do socket obsoleto derrubam o estado da tentativa nova e a reconexão entra
  // em laço.
  let generation = 0;

  function send(messageObject) {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(messageObject));
    }
  }

  function connect(ip, port, { secure = true, timeoutMs = 5000 } = {}) {
    disconnect();
    generation += 1;
    const myGeneration = generation;
    const isCurrent = () => myGeneration === generation;
    const url = wsUrl(ip, port, secure);
    socket = new WebSocket(url);
    const mySocket = socket;
    const timeout = setTimeout(() => {
      if (isCurrent() && mySocket.readyState !== WebSocket.OPEN) {
        mySocket.close();
        callbacks.onError(
          `Não foi possível conectar a ${ip}:${port} em ${timeoutMs / 1000}s. Confira o IP e a rede.`
        );
      }
    }, timeoutMs);

    mySocket.addEventListener('open', () => {
      clearTimeout(timeout);
      if (!isCurrent()) {
        return;
      }
      saveLastAddress(ip, port);
      callbacks.onOpen();
    });
    mySocket.addEventListener('close', (event) => {
      clearTimeout(timeout);
      if (!isCurrent()) {
        return;
      }
      callbacks.onClose(event.code, event.reason);
    });
    mySocket.addEventListener('error', () => {
      clearTimeout(timeout);
      if (!isCurrent()) {
        return;
      }
      callbacks.onError(`Falha na conexão com ${ip}:${port}.`);
    });
    mySocket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return; // mensagem ruim do servidor: ignora
      }
      if (data.type === 'hello') {
        sessionId = data.session_id;
      } else if (data.type === 'ping') {
        send({ type: 'pong', t: data.t });
      } else if (data.type === 'vibrate') {
        callbacks.onVibrate(data.intensity, data.duration_ms);
      } else if (data.type === 'calibration_applied') {
        // Um perfil rejeitado NUNCA passa em silêncio (F12/KPI-14): o
        // assistente precisa do motivo para exibir e oferecer refazer, em vez
        // de seguir como se tivesse calibrado.
        if (typeof callbacks.onCalibrationApplied === 'function') {
          callbacks.onCalibrationApplied(data.accepted, data.reason, data.effective);
        }
      }
    });
  }

  function disconnect() {
    if (socket !== null) {
      socket.close();
      socket = null;
    }
    sessionId = null;
  }

  return {
    connect,
    disconnect,
    send,
    get sessionId() {
      return sessionId;
    },
    get isOpen() {
      return socket !== null && socket.readyState === WebSocket.OPEN;
    },
  };
}
