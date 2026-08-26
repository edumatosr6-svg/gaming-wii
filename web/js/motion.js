// Leitura e throttle do giroscópio (F4). Lógica pura exportada para testes.

// Cria o throttle de amostras de orientação para MOTION_SEND_HZ (padrão 60).
// push(sample, nowMs) devolve a amostra quando ela deve ser enviada, ou null
// quando deve ser descartada — nenhuma amostra fica retida por mais de um
// período (W1): a mais recente sempre é elegível no próximo tick.
export function createMotionThrottle(hz) {
  const periodMs = 1000 / hz;
  let lastEmitMs = Number.NEGATIVE_INFINITY;
  return {
    push(sample, nowMs) {
      if (nowMs - lastEmitMs >= periodMs) {
        lastEmitMs = nowMs;
        return sample;
      }
      return null;
    },
  };
}

// Constrói a mensagem `motion` do protocolo (nomes curtos de propósito).
export function buildMotionMessage(beta, gamma, timestampMs) {
  return { type: 'motion', b: beta, g: gamma, t: timestampMs };
}

// Ajusta beta/gamma do DeviceOrientationEvent para o aparelho em paisagem:
// em landscape-primary o eixo físico frente-trás vira gamma e o
// esquerda-direita vira beta (com sinal dependente do lado da rotação).
export function adjustForLandscape(beta, gamma, orientationType) {
  if (orientationType === 'landscape-secondary') {
    return { b: -gamma, g: beta };
  }
  // landscape-primary (padrão do fluxo; retrato não é suportado no uso)
  return { b: gamma, g: -beta };
}

// Liga a leitura real do sensor (só chamado no navegador, não nos testes).
export function startMotion(sendFn, hz, nowFn = () => performance.now()) {
  const throttle = createMotionThrottle(hz);
  const handler = (event) => {
    if (event.beta === null || event.gamma === null) {
      return;
    }
    const orientationType = screen.orientation ? screen.orientation.type : '';
    const adjusted = adjustForLandscape(event.beta, event.gamma, orientationType);
    const now = nowFn();
    const sample = throttle.push(buildMotionMessage(adjusted.b, adjusted.g, now), now);
    if (sample !== null) {
      sendFn(sample);
    }
  };
  window.addEventListener('deviceorientation', handler);
  return () => window.removeEventListener('deviceorientation', handler);
}

// Detecta suporte/permite sensores; falha alto com causa provável (F2.3).
export async function requestSensorAccess() {
  if (!window.isSecureContext) {
    throw new Error(
      'Contexto não seguro: os sensores exigem HTTPS. Abra a URL https:// e aceite o certificado.'
    );
  }
  if (typeof DeviceOrientationEvent === 'undefined') {
    throw new Error('Este navegador não expõe o sensor de orientação (DeviceOrientationEvent).');
  }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const result = await DeviceOrientationEvent.requestPermission();
    if (result !== 'granted') {
      throw new Error('Permissão de sensores negada pelo usuário.');
    }
  }
}
