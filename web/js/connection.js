// WebSocket, reconexão e estado da conexão (F3, F9).

const STORAGE_KEY = 'wii-controller.last-address'; // único uso de localStorage

// Monta a URL do WebSocket a partir de IP e porta.
export function wsUrl(ip, port) {
  return `wss://${ip}:${port}/ws`;
}

// Lê/salva o último endereço usado com sucesso (somente IP/porta — F3.4).
export function loadLastAddress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed.ip === 'string' && typeof parsed.port === 'string') {
      return { ip: parsed.ip, port: parsed.port };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastAddress(ip, port) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ip, port: String(port) }));
  } catch {
    // localStorage indisponível não impede o uso
  }
}

// Cria a conexão de controle. callbacks: onOpen, onClose, onError, onVibrate.
export function createConnection(callbacks) {
  let socket = null;
  let sessionId = null;

  function send(messageObject) {
    if (socket !== null && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(messageObject));
    }
  }

  function connect(ip, port, timeoutMs = 5000) {
    disconnect();
    const url = wsUrl(ip, port);
    socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      if (socket !== null && socket.readyState !== WebSocket.OPEN) {
        socket.close();
        callbacks.onError(
          `Não foi possível conectar a ${ip}:${port} em ${timeoutMs / 1000}s. Confira o IP e a rede.`
        );
      }
    }, timeoutMs);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      saveLastAddress(ip, port);
      callbacks.onOpen();
    });
    socket.addEventListener('close', (event) => {
      clearTimeout(timeout);
      callbacks.onClose(event.code, event.reason);
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      callbacks.onError(`Falha na conexão com ${ip}:${port}.`);
    });
    socket.addEventListener('message', (event) => {
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
