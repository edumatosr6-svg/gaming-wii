// Leitura e throttle do sensor de orientação (F4). Lógica pura exportada
// para testes. Pegada VERTICAL (retrato): o aparelho é segurado em pé como um
// Wii Remote e a amostra vai CRUA para o servidor — os três ângulos do
// DeviceOrientationEvent (alpha/beta/gamma) são necessários para derivar a
// direção da ponta, e é o `mapping.py` do servidor que converte em posição
// apontada. Nenhum ajuste de paisagem aqui: o antigo `adjustForLandscape` era
// do layout de paisagem e produziria eixo trocado/invertido na pegada
// vertical (F4 — "Atenção herdada da revisão").

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
// `alpha` pode ser null quando o sensor não reporta yaw (contrato W3/M8b);
// a calibração do servidor absorve o zero arbitrário de alpha (F4/F5).
export function buildMotionMessage(alpha, beta, gamma, timestampMs) {
  return {
    type: 'motion',
    a: typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : null,
    b: beta,
    g: gamma,
    t: timestampMs,
  };
}

// Liga a leitura real do sensor (só chamado no navegador, não nos testes).
export function startMotion(sendFn, hz, nowFn = () => performance.now()) {
  const throttle = createMotionThrottle(hz);
  const handler = (event) => {
    if (event.beta === null || event.gamma === null) {
      return;
    }
    const now = nowFn();
    const sample = throttle.push(buildMotionMessage(event.alpha, event.beta, event.gamma, now), now);
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
