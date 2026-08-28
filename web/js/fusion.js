// Fusão de orientação no cliente, em JS puro (F14).
//
// POR QUE ESTE MÓDULO EXISTE NO CLIENTE: os sensores crus só existem aqui, e
// enviar giroscópio + acelerômetro + magnetômetro a 60 Hz multiplicaria o
// tráfego da mensagem mais frequente do protocolo. A fusão existe justamente
// para caber em três números — a saída é a orientação na convenção do
// `DeviceOrientationEvent`, exatamente o contrato que o servidor já consome
// (F4). O que muda com a fusão é a PROCEDÊNCIA e a QUALIDADE da orientação,
// nunca a semântica dos campos: é isso que permite trocar de degrau da escada
// sem tocar no mapeamento nem nos vetores de teste de sentido dos eixos.
//
// Modelo: filtro complementar sobre quatérnion.
//   - o giroscópio integra a orientação (resposta rápida, deriva lenta);
//   - o acelerômetro corrige pitch e roll pela direção da gravidade, e a
//     correção é SUSPENSA sob agitação (o vetor medido deixa de ser gravidade);
//   - o magnetômetro corrige APENAS o yaw, e só quando a leitura passa na
//     validação de interferência.
//
// Funções puras de (estado anterior, amostras, dt) — testáveis com fluxos
// sintéticos, sem hardware, sem permissão e sem rede.

import {
  FUSION_ACC_GAIN,
  FUSION_ACC_TOL_G,
  FUSION_MAG_GAIN,
  FUSION_MAG_MIN_UT,
  FUSION_MAG_MAX_UT,
  FUSION_MAG_DEV_PCT,
  FUSION_MAG_DIP_TOL_DEG,
  FUSION_MAG_HYSTERESIS_MS,
} from './config.js';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
// Peso da linha de base móvel do campo magnético: lenta o bastante para não
// ser arrastada por uma interferência curta, rápida o bastante para acompanhar
// a mudança real de ambiente ao longo da sessão.
const MAG_BASELINE_GAIN = 0.02;
// dt acima disto é considerado salto (aba suspensa, sensor engasgado): o passo
// é descartado em vez de integrar um giro gigante de uma vez só.
const MAX_STEP_S = 0.25;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Vetor válido = três componentes finitas. Amostra ausente ou com NaN é
// tratada como "sensor não reportou", nunca propagada para a orientação (PC17).
function readVector(sample) {
  if (!sample) {
    return null;
  }
  const { x, y, z } = sample;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }
  return [x, y, z];
}

function norm(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v) {
  const n = norm(v);
  if (n === 0) {
    return null;
  }
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function quatNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (n === 0 || !Number.isFinite(n)) {
    return [1, 0, 0, 0]; // estado degenerado volta à identidade, nunca NaN
  }
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Matriz de rotação DEVICE → MUNDO a partir do quatérnion (w, x, y, z).
function quatToMatrix(q) {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

function wrap360(deg) {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function wrap180(deg) {
  let wrapped = ((deg + 180) % 360) - 180;
  if (wrapped < -180) {
    wrapped += 360;
  }
  return wrapped;
}

// Matriz de rotação → (alpha, beta, gamma) da convenção do
// `DeviceOrientationEvent`: ordem intrínseca Z-X'-Y'', com
// alpha ∈ [0, 360), beta ∈ [-180, 180) e gamma ∈ [-90, 90) (contrato da F4).
//
// A restrição de gamma a [-90, 90) é o que desambigua a representação: o mesmo
// giro físico admite dois trios de Euler, e escolher o errado inverteria eixo
// — o defeito que M17/M18 pegam do lado do servidor. Quando o ramo principal
// produz |gamma| > 90, o trio equivalente (alpha+180, 180-beta, gamma∓180) é o
// que respeita a convenção.
export function matrixToEuler(R) {
  let alpha = Math.atan2(-R[0][1], R[1][1]) * DEG;
  let beta = Math.asin(Math.max(-1, Math.min(1, R[2][1]))) * DEG;
  let gamma = Math.atan2(-R[2][0], R[2][2]) * DEG;

  if (gamma > 90 || gamma < -90) {
    alpha += 180;
    beta = 180 - beta;
    gamma += gamma > 0 ? -180 : 180;
  }
  return { alpha: wrap360(alpha), beta: wrap180(beta), gamma: wrap180(gamma) };
}

// Estado inicial da fusão. `q` é a orientação device → mundo.
export function createFusionState() {
  return {
    q: [1, 0, 0, 0],
    magBaselineUt: null, // módulo médio das leituras ACEITAS na sessão
    magBaselineDipDeg: null, // inclinação magnética média das aceitas
    magRejected: false,
    magLastChangeMs: Number.NEGATIVE_INFINITY,
    accSuspended: false,
  };
}

// Avalia se a leitura magnética deve ser descartada (o ponto da frente 4).
// Descarta quando o módulo sai da faixa do campo terrestre, quando se afasta
// demais da linha de base da sessão, ou quando a INCLINAÇÃO magnética (ângulo
// entre o campo e a gravidade) se afasta demais da linha de base.
//
// Melhor derivar devagar pelo giroscópio que ser puxado por uma bússola
// mentindo — mesa metálica, gabinete, monitor e fonte são o caso comum, não a
// exceção, e é justamente onde o aparelho fica durante o uso.
export function evaluateMagnetic(state, magVector, gravityDevice) {
  const magnitude = norm(magVector);
  if (magnitude < FUSION_MAG_MIN_UT || magnitude > FUSION_MAG_MAX_UT) {
    return { valid: false, reason: 'modulo_fora_da_faixa', magnitude, dipDeg: null };
  }
  if (state.magBaselineUt !== null) {
    const deviationPct = (Math.abs(magnitude - state.magBaselineUt) / state.magBaselineUt) * 100;
    if (deviationPct > FUSION_MAG_DEV_PCT) {
      return { valid: false, reason: 'modulo_fora_da_linha_de_base', magnitude, dipDeg: null };
    }
  }
  const magUnit = normalize(magVector);
  const gravityUnit = normalize(gravityDevice);
  let dipDeg = null;
  if (magUnit !== null && gravityUnit !== null) {
    const cosAngle = Math.max(-1, Math.min(1, dot(magUnit, gravityUnit)));
    dipDeg = Math.acos(cosAngle) * DEG;
    if (
      state.magBaselineDipDeg !== null &&
      Math.abs(dipDeg - state.magBaselineDipDeg) > FUSION_MAG_DIP_TOL_DEG
    ) {
      return { valid: false, reason: 'inclinacao_fora_da_linha_de_base', magnitude, dipDeg };
    }
  }
  return { valid: true, reason: null, magnitude, dipDeg };
}

// Aplica a histerese ao estado de rejeição: uma mudança só é COMETIDA se já
// passou FUSION_MAG_HYSTERESIS_MS desde a última. Sem isso, uma interferência
// intermitente faria o indicador da tela piscar a cada amostra (F14.7/PC18) —
// e um indicador que pisca não informa nada.
function commitMagRejection(state, candidate, nowMs) {
  if (candidate === state.magRejected) {
    return;
  }
  if (nowMs - state.magLastChangeMs < FUSION_MAG_HYSTERESIS_MS) {
    return;
  }
  state.magRejected = candidate;
  state.magLastChangeMs = nowMs;
}

// Um passo da fusão. Muta e devolve `state` (estado explícito, passado por
// parâmetro — sem estado global).
//
// Contrato das unidades, declarado porque trocar uma delas em silêncio é o
// jeito mais fácil de quebrar a fusão sem quebrar nenhum teste de tipo:
//   gyro: graus por segundo, no referencial do aparelho;
//   acc:  em g (múltiplos da gravidade), com módulo ≈ 1 em repouso;
//   mag:  em µT, no referencial do aparelho;
//   dtMs: milissegundos desde a amostra anterior.
//
// `options.useMag = false`  → opera como `fusion_nomag` (interruptor ?mag=off);
// `options.rejectMag = false` → corrige com o magnetômetro SEM rejeitar
//                               (interruptor ?magreject=off). Os dois existem
//                               separados porque "a fusão ajuda?" e "a
//                               rejeição ajuda?" são perguntas diferentes, e
//                               responder às duas é o que o KPI-22 exige.
export function fusionStep(state, sample, dtMs, nowMs, options = {}) {
  const useMag = options.useMag !== false;
  const rejectMag = options.rejectMag !== false;

  // dt hostil (zero, negativo, NaN ou salto) não integra nada e não produz
  // NaN: a orientação anterior simplesmente permanece (PC17).
  const dtS = isFiniteNumber(dtMs) ? dtMs / 1000 : 0;
  const step = dtS > 0 && dtS <= MAX_STEP_S ? dtS : 0;

  const gyro = readVector(sample && sample.gyro);
  const acc = readVector(sample && sample.acc);
  const mag = useMag ? readVector(sample && sample.mag) : null;

  // Direção da gravidade estimada, no referencial do aparelho: é a linha 2 da
  // matriz device→mundo (o "para cima" do mundo visto pelo aparelho).
  let R = quatToMatrix(state.q);
  const gravityEstimated = [R[2][0], R[2][1], R[2][2]];

  // Incremento de rotação corretivo, em RADIANOS POR AMOSTRA (não por
  // segundo): os pesos da spec são "por amostra", e essa diferença não é
  // cosmética. Tratados como taxa, os mesmos 0.02/0.01 deixam a correção fraca
  // demais para segurar um viés de giroscópio — o erro de pitch estabiliza
  // dezenas de graus fora do lugar em vez de convergir abaixo de 2° (F14.3).
  let correction = [0, 0, 0];

  // --- Correção por acelerômetro: pitch e roll ------------------------------
  const accUnit = acc ? normalize(acc) : null;
  const accMagnitudeG = acc ? norm(acc) : null;
  const accUsable = accUnit !== null && Math.abs(accMagnitudeG - 1) <= FUSION_ACC_TOL_G;
  state.accSuspended = acc !== null && !accUsable;
  if (accUsable) {
    // O erro é o produto vetorial entre a gravidade medida e a estimada: o
    // eixo resultante é perpendicular às duas, ou seja, HORIZONTAL — por
    // construção esta correção não mexe no yaw, que é o que a torna segura de
    // aplicar sempre que houver gravidade confiável.
    const error = cross(accUnit, gravityEstimated);
    correction = [
      correction[0] + FUSION_ACC_GAIN * error[0],
      correction[1] + FUSION_ACC_GAIN * error[1],
      correction[2] + FUSION_ACC_GAIN * error[2],
    ];
  }

  // --- Correção por magnetômetro: apenas o yaw ------------------------------
  let magEvaluation = null;
  if (mag !== null) {
    magEvaluation = evaluateMagnetic(state, mag, gravityEstimated);
    if (rejectMag) {
      commitMagRejection(state, !magEvaluation.valid, isFiniteNumber(nowMs) ? nowMs : 0);
    } else {
      state.magRejected = false;
    }
    const accepted = rejectMag ? magEvaluation.valid && !state.magRejected : true;
    if (magEvaluation.valid) {
      // Linha de base da sessão só aprende com leituras ACEITAS — deixar a
      // interferência entrar na média seria ensinar o filtro a aceitar a
      // mentira depois de alguns segundos dela.
      state.magBaselineUt =
        state.magBaselineUt === null
          ? magEvaluation.magnitude
          : state.magBaselineUt +
            MAG_BASELINE_GAIN * (magEvaluation.magnitude - state.magBaselineUt);
      if (magEvaluation.dipDeg !== null) {
        state.magBaselineDipDeg =
          state.magBaselineDipDeg === null
            ? magEvaluation.dipDeg
            : state.magBaselineDipDeg +
              MAG_BASELINE_GAIN * (magEvaluation.dipDeg - state.magBaselineDipDeg);
      }
    }
    if (accepted) {
      // Campo medido levado ao referencial do mundo; o erro de rumo é o desvio
      // da componente horizontal em relação ao norte (+Y do mundo).
      const magWorld = [
        R[0][0] * mag[0] + R[0][1] * mag[1] + R[0][2] * mag[2],
        R[1][0] * mag[0] + R[1][1] * mag[1] + R[1][2] * mag[2],
        R[2][0] * mag[0] + R[2][1] * mag[1] + R[2][2] * mag[2],
      ];
      const headingErrorRad = Math.atan2(magWorld[0], magWorld[1]);
      if (Number.isFinite(headingErrorRad)) {
        // Aplicada em torno da VERTICAL DO MUNDO (expressa no referencial do
        // aparelho), o que a mantém restrita ao yaw.
        const yawGain = -FUSION_MAG_GAIN * headingErrorRad;
        correction = [
          correction[0] + yawGain * gravityEstimated[0],
          correction[1] + yawGain * gravityEstimated[1],
          correction[2] + yawGain * gravityEstimated[2],
        ];
      }
    }
  } else if (!useMag) {
    state.magRejected = false;
  }

  // --- Integração: giroscópio (por segundo) + correções (por amostra) ------
  // O incremento total de rotação, em radianos no referencial do aparelho, é a
  // soma do giro integrado no intervalo com as correções da amostra. Um dt
  // hostil (zero, negativo ou salto) zera apenas o termo do giroscópio: as
  // correções continuam valendo, então o filtro nunca congela nem produz NaN.
  const deltaX = (gyro ? gyro[0] * RAD * step : 0) + correction[0];
  const deltaY = (gyro ? gyro[1] * RAD * step : 0) + correction[1];
  const deltaZ = (gyro ? gyro[2] * RAD * step : 0) + correction[2];

  if (deltaX !== 0 || deltaY !== 0 || deltaZ !== 0) {
    const [w, x, y, z] = state.q;
    // q ← q + ½ · q ⊗ (0, Δθ), com Δθ já em radianos.
    const dw = 0.5 * (-x * deltaX - y * deltaY - z * deltaZ);
    const dx = 0.5 * (w * deltaX + y * deltaZ - z * deltaY);
    const dy = 0.5 * (w * deltaY - x * deltaZ + z * deltaX);
    const dz = 0.5 * (w * deltaZ + x * deltaY - y * deltaX);
    state.q = quatNormalize([w + dw, x + dx, y + dy, z + dz]);
  }

  R = quatToMatrix(state.q);
  const euler = matrixToEuler(R);
  // Guarda final: nenhuma entrada hostil pode vazar NaN para o protocolo.
  const safe = {
    alpha: Number.isFinite(euler.alpha) ? euler.alpha : 0,
    beta: Number.isFinite(euler.beta) ? euler.beta : 0,
    gamma: Number.isFinite(euler.gamma) ? euler.gamma : 0,
  };
  return {
    state,
    orientation: safe,
    magRejected: state.magRejected,
    magEvaluation,
    accSuspended: state.accSuspended,
  };
}

// Roda um fluxo sintético inteiro (conveniência para testes e diagnóstico).
export function runFusion(samples, options = {}) {
  const state = options.state || createFusionState();
  let last = null;
  for (const sample of samples) {
    last = fusionStep(state, sample, sample.dtMs, sample.tMs, options);
  }
  return last === null ? { state, orientation: { alpha: 0, beta: 0, gamma: 0 } } : last;
}
