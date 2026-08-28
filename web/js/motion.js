// Leitura da orientação e throttle das amostras `motion` (F4, F13, F14).
//
// Pegada VERTICAL (retrato): o aparelho é segurado em pé como um Wii Remote e
// a amostra vai para o servidor como TRÊS ÂNGULOS na convenção do
// `DeviceOrientationEvent` — os três são necessários para derivar a direção da
// ponta, e é o `mapping.py` do servidor que converte em posição apontada.
// Nenhum ajuste de paisagem aqui: o antigo `adjustForLandscape` era do layout
// de paisagem e produziria eixo trocado/invertido na pegada vertical.
//
// CONTRATO INVARIANTE DESTA REVISÃO: qualquer que seja o degrau da escada em
// uso (F13), a saída é sempre a mesma convenção de três ângulos. O que muda
// com a fusão é a PROCEDÊNCIA e a QUALIDADE da orientação, nunca a semântica
// do campo — é isso que permite trocar de fonte sem tocar no mapeamento. É
// PROIBIDO enviar leitura crua de sensor: a fusão existe no cliente
// justamente para caber em três números.

import { SENSOR_HZ } from './config.js';
import { createFusionState, fusionStep } from './fusion.js';

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
// EXATAMENTE cinco campos: `type`, `a`, `b`, `g`, `t`. Nenhuma leitura crua de
// sensor, nenhum campo de fonte ou de rejeição magnética — esses viajam em
// `status`, de baixa frequência. Precisão nova não pode ser paga com tráfego
// na mensagem mais frequente do protocolo (PC26).
export function buildMotionMessage(alpha, beta, gamma, timestampMs) {
  return {
    type: 'motion',
    a: typeof alpha === 'number' && Number.isFinite(alpha) ? alpha : null,
    b: beta,
    g: gamma,
    t: timestampMs,
  };
}

// --- Fonte de diagnóstico `synthetic` (F13) --------------------------------
// Amostras roteirizadas, usadas por testes headless e por diagnóstico. NUNCA
// elegível pela detecção automática — só por forçamento explícito (`?src=`).
// A costura é do próprio produto: é o mesmo mecanismo de forçamento de fonte
// usado para investigar precisão no aparelho, não um caminho que só existe em
// teste.
//
// Aceita dois formatos de amostra, de propósito:
//   { alpha, beta, gamma }  — orientação direta (roteiros de apontamento);
//   { gyro, acc, mag }      — sensores crus, que passam pela fusão REAL, o que
//                             permite exercitar a rejeição magnética de ponta
//                             a ponta em navegador headless.
export function createSyntheticSource(globalTarget = globalThis) {
  const listeners = new Set();
  const state = createFusionState();
  let magRejected = false;
  let options = {};

  const api = {
    // Injeta uma amostra no fluxo. Retorna a orientação resultante.
    push(sample, nowMs = Date.now()) {
      let orientation;
      if (sample && typeof sample.alpha === 'number') {
        orientation = { alpha: sample.alpha, beta: sample.beta, gamma: sample.gamma };
      } else {
        const step = fusionStep(state, sample, sample && sample.dtMs, nowMs, options);
        orientation = step.orientation;
        magRejected = step.magRejected;
      }
      for (const listener of listeners) {
        listener(orientation, { magRejected });
      }
      return orientation;
    },
    get magRejected() {
      return magRejected;
    },
    start(onSample, sourceOptions = {}) {
      options = sourceOptions;
      listeners.add(onSample);
      return () => listeners.delete(onSample);
    },
  };

  // Handle nomeado para o roteiro externo (teste headless e diagnóstico).
  globalTarget.wiiControllerSynthetic = api;
  return api;
}

// --- Degraus reais da escada (F13) -----------------------------------------

// Degrau 4: evento clássico. É o PISO — menos amostras e mais irregulares
// (economia de bateria do navegador), pior precisão. Ainda assim tem de ser
// jogável (KPI-23).
export function startDeviceOrientation(onSample, target = globalThis) {
  if (typeof target.DeviceOrientationEvent === 'undefined' || !target.addEventListener) {
    return null;
  }
  const handler = (event) => {
    if (event.beta === null || event.gamma === null) {
      return;
    }
    onSample({ alpha: event.alpha, beta: event.beta, gamma: event.gamma });
  };
  target.addEventListener('deviceorientation', handler);
  return () => target.removeEventListener('deviceorientation', handler);
}

// Degrau 3: API de sensores moderna, com a FREQUÊNCIA PEDIDA EXPLICITAMENTE —
// sem isso o navegador escolhe uma taxa de economia de bateria e a mira fica
// irregular sem nenhum sinal de que foi isso que aconteceu.
export function startSensorApi(onSample, target = globalThis) {
  const Ctor = target.AbsoluteOrientationSensor || target.RelativeOrientationSensor;
  if (typeof Ctor !== 'function') {
    return null;
  }
  let sensor;
  try {
    sensor = new Ctor({ frequency: SENSOR_HZ });
  } catch {
    return null;
  }
  sensor.addEventListener('reading', () => {
    const q = sensor.quaternion;
    if (!q) {
      return;
    }
    // A API entrega quatérnion [x, y, z, w]; a fusão usa [w, x, y, z].
    onSample(quaternionToOrientation([q[3], q[0], q[1], q[2]]));
  });
  try {
    sensor.start();
  } catch {
    return null;
  }
  return () => sensor.stop();
}

// Degraus 1 e 2: sensores CRUS + fusão própria (F14). `withMag = false` é o
// degrau `fusion_nomag` — aparelho sem magnetômetro ou permissão negada.
export function startFusionSource(
  onSample,
  { withMag = true, rejectMag = true, target = globalThis } = {}
) {
  const { Gyroscope, Accelerometer, Magnetometer } = target;
  if (typeof Gyroscope !== 'function' || typeof Accelerometer !== 'function') {
    return null;
  }
  if (withMag && typeof Magnetometer !== 'function') {
    return null;
  }

  const state = createFusionState();
  const latest = { gyro: null, acc: null, mag: null };
  let lastMs = null;
  const sensors = [];

  const emit = (nowMs) => {
    const dtMs = lastMs === null ? 0 : nowMs - lastMs;
    lastMs = nowMs;
    const step = fusionStep(state, latest, dtMs, nowMs, { useMag: withMag, rejectMag });
    onSample(step.orientation, { magRejected: step.magRejected });
  };

  try {
    const gyro = new Gyroscope({ frequency: SENSOR_HZ });
    gyro.addEventListener('reading', () => {
      // A API entrega rad/s; a fusão trabalha em graus/s.
      latest.gyro = {
        x: (gyro.x * 180) / Math.PI,
        y: (gyro.y * 180) / Math.PI,
        z: (gyro.z * 180) / Math.PI,
      };
      emit(performance.now());
    });
    sensors.push(gyro);

    const acc = new Accelerometer({ frequency: SENSOR_HZ });
    acc.addEventListener('reading', () => {
      // A API entrega m/s²; a fusão trabalha em g.
      latest.acc = { x: acc.x / 9.80665, y: acc.y / 9.80665, z: acc.z / 9.80665 };
    });
    sensors.push(acc);

    if (withMag) {
      const mag = new Magnetometer({ frequency: SENSOR_HZ });
      mag.addEventListener('reading', () => {
        latest.mag = { x: mag.x, y: mag.y, z: mag.z }; // já em µT
      });
      sensors.push(mag);
    }
    for (const sensor of sensors) {
      sensor.start();
    }
  } catch {
    for (const sensor of sensors) {
      try {
        sensor.stop();
      } catch {
        // sensor que nunca chegou a iniciar
      }
    }
    return null;
  }

  return () => {
    for (const sensor of sensors) {
      try {
        sensor.stop();
      } catch {
        // idem
      }
    }
  };
}

// Quatérnion (w, x, y, z) → convenção do `DeviceOrientationEvent`.
export function quaternionToOrientation(q) {
  const [w, x, y, z] = q;
  const R = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
  let alpha = (Math.atan2(-R[0][1], R[1][1]) * 180) / Math.PI;
  let beta = (Math.asin(Math.max(-1, Math.min(1, R[2][1]))) * 180) / Math.PI;
  let gamma = (Math.atan2(-R[2][0], R[2][2]) * 180) / Math.PI;
  if (gamma > 90 || gamma < -90) {
    alpha += 180;
    beta = 180 - beta;
    gamma += gamma > 0 ? -180 : 180;
  }
  const wrap360 = (d) => ((d % 360) + 360) % 360;
  const wrap180 = (d) => (((d + 180) % 360) + 360) % 360 - 180;
  return { alpha: wrap360(alpha), beta: wrap180(beta), gamma: wrap180(gamma) };
}

// Mapa degrau → função de início. A seleção (sondagem/degradação) é da
// `sources.js`; aqui ficam apenas os provedores concretos.
// Cada provedor recebe `(onSample, options)`, onde `options` carrega os
// interruptores de diagnóstico da F15 (`?mag=off`, `?magreject=off`). Eles são
// separados de propósito: um responde "a fusão ajuda?" e o outro "a rejeição
// ajuda?" — perguntas diferentes, e responder às duas é o que o KPI-22 exige.
export function createProviders(target = globalThis) {
  const synthetic = createSyntheticSource(target);
  return {
    fusion_mag: (onSample, options = {}) =>
      startFusionSource(onSample, {
        withMag: options.useMag !== false,
        rejectMag: options.rejectMag !== false,
        target,
      }),
    fusion_nomag: (onSample) => startFusionSource(onSample, { withMag: false, target }),
    sensor_api: (onSample) => startSensorApi(onSample, target),
    deviceorientation: (onSample) => startDeviceOrientation(onSample, target),
    synthetic: (onSample, options = {}) => synthetic.start(onSample, options),
  };
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
