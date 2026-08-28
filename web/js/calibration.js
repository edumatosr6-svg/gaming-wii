// Captura de calibração e assistente guiado de alcance (F5, F12).
//
// POR QUE ISTO RODA NO CLIENTE: é aqui que existem as amostras na taxa cheia e
// a interface de "segure parado"/repetição. O resultado viaja ao servidor no
// perfil de calibração, e é o servidor que aplica o offset no mapeamento e é a
// AUTORIDADE sobre a validade dos alcances.
//
// Lógica pura: (estado anterior, amostras, tempo) → novo estado. Sem timers,
// sem DOM e sem rede neste módulo — o tempo entra por parâmetro, para que os
// casos de fonte lenta e janela instável sejam testáveis com fluxos sintéticos
// em vez de esperas reais.

import {
  CALIB_WINDOW_MS,
  CALIB_WINDOW_MAX_MS,
  CALIB_MIN_SAMPLES_FLOOR,
  CALIB_STABILITY_PP_DEG,
  CALIB_MAX_RETRIES,
  WIZARD_STEPS,
  RANGE_MIN_DEG,
  RANGE_MAX_DEG,
} from './config.js';

const DEG = Math.PI / 180;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Média CIRCULAR: `alpha` é cíclico, e a média aritmética de 359° e 1° é 180°,
// que é o oposto exato do centro real. A média dos vetores unitários resolve
// isso, e o mesmo tratamento vale para os demais ângulos quando a janela
// cruzar a descontinuidade — por isso é aplicada aos três, não só ao yaw.
export function circularMeanDeg(anglesDeg) {
  if (anglesDeg.length === 0) {
    return null;
  }
  let sumSin = 0;
  let sumCos = 0;
  for (const angle of anglesDeg) {
    sumSin += Math.sin(angle * DEG);
    sumCos += Math.cos(angle * DEG);
  }
  if (sumSin === 0 && sumCos === 0) {
    return null; // amostras diametralmente opostas: média indefinida
  }
  return Math.atan2(sumSin / anglesDeg.length, sumCos / anglesDeg.length) / DEG;
}

// Diferença angular mínima entre dois ângulos, em (-180, 180].
export function angularDiffDeg(a, b) {
  let diff = (a - b) % 360;
  if (diff > 180) {
    diff -= 360;
  } else if (diff <= -180) {
    diff += 360;
  }
  return diff;
}

// Uma amostra só entra na janela se os três ângulos forem utilizáveis. `alpha`
// nulo (fonte sem yaw) invalida a amostra PARA A CALIBRAÇÃO: um centro sem yaw
// não tem como recentrar o eixo horizontal, e aceitá-lo em silêncio produziria
// uma calibração que parece ter funcionado (PC5).
function isUsableSample(sample) {
  return (
    !!sample &&
    isFiniteNumber(sample.alpha) &&
    isFiniteNumber(sample.beta) &&
    isFiniteNumber(sample.gamma)
  );
}

// Janela de captura do centro/extremo (F5). A captura é a MÉDIA de uma janela
// curta com o aparelho parado, NUNCA uma amostra instantânea: se a amostra
// única pegar um pico de ruído, o viés contamina a sessão inteira.
export function createCaptureWindow(startMs) {
  const samples = [];
  let discarded = 0;

  return {
    push(sample) {
      if (isUsableSample(sample)) {
        samples.push({ alpha: sample.alpha, beta: sample.beta, gamma: sample.gamma });
      } else {
        discarded += 1;
      }
    },

    get count() {
      return samples.length;
    },

    get discarded() {
      return discarded;
    },

    // Avalia a janela no instante `nowMs`. Três desfechos possíveis, e eles
    // são DISTINTOS de propósito:
    //   'capturing'    — ainda coletando (janela padrão ou estendida);
    //   'done'         — centro médio disponível;
    //   'unstable'     — o usuário se mexeu: pedir REPETIÇÃO;
    //   'slow_source'  — a fonte não entrega amostras suficientes: pedir TROCA
    //                    DE FONTE.
    // Confundir os dois últimos produziria exatamente o laço de repetição
    // infinita que a spec proíbe: repetir não conserta uma fonte a 5 Hz.
    poll(nowMs) {
      const elapsed = nowMs - startMs;
      if (elapsed < CALIB_WINDOW_MS) {
        return { status: 'capturing', progress: elapsed / CALIB_WINDOW_MS };
      }
      if (samples.length < CALIB_MIN_SAMPLES_FLOOR) {
        if (elapsed < CALIB_WINDOW_MAX_MS) {
          // Janela ESTENDIDA: exigir contagem fixa de amostras tornaria a
          // calibração impossível no piso da escada de fontes, onde o produto
          // ainda precisa ser jogável.
          return { status: 'capturing', progress: elapsed / CALIB_WINDOW_MAX_MS, extended: true };
        }
        return {
          status: 'slow_source',
          reason: 'fonte de orientação lenta demais para calibrar',
          samples: samples.length,
        };
      }

      const center = {
        alpha: circularMeanDeg(samples.map((s) => s.alpha)),
        beta: circularMeanDeg(samples.map((s) => s.beta)),
        gamma: circularMeanDeg(samples.map((s) => s.gamma)),
      };
      if (center.alpha === null || center.beta === null || center.gamma === null) {
        return { status: 'unstable', reason: 'janela sem centro definido — segure parado' };
      }

      for (const sample of samples) {
        const spread = Math.max(
          Math.abs(angularDiffDeg(sample.alpha, center.alpha)),
          Math.abs(angularDiffDeg(sample.beta, center.beta)),
          Math.abs(angularDiffDeg(sample.gamma, center.gamma))
        );
        if (spread > CALIB_STABILITY_PP_DEG) {
          return {
            status: 'unstable',
            reason: 'o aparelho se moveu durante a captura — segure parado',
            spread,
          };
        }
      }
      return { status: 'done', center, samples: samples.length };
    },
  };
}

// Duração máxima de uma captura, usada pela UI para não ficar aberta
// indefinidamente esperando estabilidade (F5.7/KPI-21).
export const CAPTURE_MAX_MS = CALIB_WINDOW_MAX_MS;

// Alcance de uma direção: módulo da diferença angular entre o extremo
// capturado e o centro capturado. As quatro direções são calculadas de forma
// INDEPENDENTE — nenhuma é derivada da média das outras, porque o ponto da
// F12 é justamente que o alcance do pulso é assimétrico entre direções.
export function rangeForStep(step, center, extreme) {
  if (step === 'esquerda' || step === 'direita') {
    return Math.abs(angularDiffDeg(extreme.alpha, center.alpha));
  }
  return Math.abs(angularDiffDeg(extreme.beta, center.beta));
}

const STEP_TO_DIRECTION = {
  esquerda: 'left',
  direita: 'right',
  cima: 'up',
  baixo: 'down',
};

// Pré-validação do alcance no cliente. É CONVENIÊNCIA — evita uma ida ao
// servidor só para receber um "não". A autoridade é o servidor: um perfil que
// passe aqui e seja rejeitado lá produz `calibration_applied {accepted:false}`
// e o assistente exibe o motivo em vez de seguir como se tivesse calibrado.
export function isPlausibleRange(value) {
  return isFiniteNumber(value) && value >= RANGE_MIN_DEG && value <= RANGE_MAX_DEG;
}

// Máquina de estados do assistente (F12/P6). Cinco etapas, na ordem
// neutro → esquerda → direita → cima → baixo, uma visível por vez.
export function createWizard() {
  let index = 0;
  let center = null;
  const ranges = {};
  // Direções em que o usuário esgotou as tentativas: ficam de FORA do payload,
  // e o servidor (dono de DEFAULT_RANGE_DEG) aplica o padrão daquela direção.
  // O cliente não guarda uma cópia do número — copiá-lo para cá seria uma
  // segunda constante duplicada entre os dois lados.
  const defaulted = [];
  let retries = 0;

  return {
    get step() {
      return index < WIZARD_STEPS.length ? WIZARD_STEPS[index] : null;
    },
    get done() {
      return index >= WIZARD_STEPS.length;
    },
    get retries() {
      return retries;
    },
    get center() {
      return center;
    },
    get defaultedDirections() {
      return [...defaulted];
    },

    // Alimenta o assistente com o resultado de uma captura concluída.
    // Devolve o que a UI precisa mostrar e fazer a seguir.
    submitCapture(captureResult) {
      if (index >= WIZARD_STEPS.length) {
        return { action: 'done' };
      }
      const step = WIZARD_STEPS[index];

      if (captureResult.status === 'slow_source') {
        // Não é caso de repetir: a fonte é que não serve (F5.8).
        return { action: 'change_source', step, reason: captureResult.reason };
      }
      if (captureResult.status !== 'done') {
        retries += 1;
        return {
          action: 'retry',
          step,
          reason: captureResult.reason || 'janela instável',
          retries,
        };
      }

      if (step === 'neutro') {
        center = captureResult.center;
        index += 1;
        retries = 0;
        return { action: 'next', step: WIZARD_STEPS[index] };
      }

      const value = rangeForStep(step, center, captureResult.center);
      if (!isPlausibleRange(value)) {
        retries += 1;
        if (retries > CALIB_MAX_RETRIES) {
          // Não prende o usuário num laço: segue com o padrão daquela direção.
          defaulted.push(STEP_TO_DIRECTION[step]);
          index += 1;
          retries = 0;
          return {
            action: 'defaulted',
            step,
            reason: `alcance fora de ${RANGE_MIN_DEG}°–${RANGE_MAX_DEG}°`,
            next: index < WIZARD_STEPS.length ? WIZARD_STEPS[index] : null,
          };
        }
        return {
          action: 'retry',
          step,
          reason: `alcance de ${value.toFixed(1)}° fora de ${RANGE_MIN_DEG}°–${RANGE_MAX_DEG}°`,
          retries,
        };
      }

      ranges[STEP_TO_DIRECTION[step]] = value;
      index += 1;
      retries = 0;
      return {
        action: index >= WIZARD_STEPS.length ? 'done' : 'next',
        step: index < WIZARD_STEPS.length ? WIZARD_STEPS[index] : null,
      };
    },

    // Perfil montado até aqui, no formato do payload de `calibrate`.
    // `ranges` sai como null quando NENHUMA direção foi medida (equivale a
    // pular): o servidor aplica DEFAULT_RANGE_DEG nas quatro.
    profile() {
      return {
        center,
        ranges: Object.keys(ranges).length > 0 ? { ...ranges } : null,
      };
    },
  };
}

// Payload de `calibrate` (F5/F12). `center` e `ranges` são independentes:
// reenviar só `ranges` numa reconexão é válido, e é o que P3.4 pede.
export function buildCalibrateMessage(center, ranges) {
  const message = { type: 'calibrate' };
  if (center) {
    message.center = { a: center.alpha, b: center.beta, g: center.gamma };
  }
  if (ranges) {
    message.ranges = ranges;
  }
  return message;
}
