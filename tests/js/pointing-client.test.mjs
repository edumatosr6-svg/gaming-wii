// Testes de specs/wii-controller/tests/pointing-client.md (PC1–PC27).
//
// Alvo: a lógica JS pura do cliente que passou a existir com a revisão de
// precisão — fusão de sensores, rejeição magnética, escada de fontes, captura
// de janela de calibração e assistente de alcance.
//
// POR QUE ESTE ARQUIVO EXISTE: pela decisão de "Divisão do processamento entre
// cliente e servidor", essa lógica saiu do alcance da suíte Python. A spec
// exige cobertura EQUIVALENTE do lado JS — sem estes casos, a frente de
// precisão fica sem rede de segurança justamente onde é mais fácil quebrar em
// silêncio. Rodam via `node --test` dentro do `pytest` (um comando único).
//
// Todos os casos são alimentados por fluxos sintéticos. Nenhum exige hardware,
// permissão de navegador ou rede.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCaptureWindow,
  circularMeanDeg,
  angularDiffDeg,
  createWizard,
  buildCalibrateMessage,
  rangeForStep,
  isPlausibleRange,
} from '../../web/js/calibration.js';
import { createFusionState, fusionStep, matrixToEuler } from '../../web/js/fusion.js';
import {
  selectSource,
  nextSourceBelow,
  createStallWatch,
  createStatusThrottle,
  isSelectableSource,
  isAutoSelectable,
  probeWithTimeout,
} from '../../web/js/sources.js';
import { buildMotionMessage, createMotionThrottle } from '../../web/js/motion.js';
import * as cfg from '../../web/js/config.js';

// --------------------------------------------------------------- utilitários

const DEG = Math.PI / 180;

// Matriz de rotação device→mundo para um trio da convenção do
// DeviceOrientationEvent (Z-X'-Y'' intrínseco).
function eulerToMatrix(alpha, beta, gamma) {
  const ca = Math.cos(alpha * DEG);
  const sa = Math.sin(alpha * DEG);
  const cb = Math.cos(beta * DEG);
  const sb = Math.sin(beta * DEG);
  const cg = Math.cos(gamma * DEG);
  const sg = Math.sin(gamma * DEG);
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
}

// Leva um vetor do referencial do mundo para o do aparelho (R transposta).
function worldToDevice(R, v) {
  return [
    R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
    R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
    R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
  ];
}

// Campo magnético terrestre de referência: norte (+Y) com inclinação de 60°.
const DIP_DEG = 60;
const FIELD_UT = [0, 50 * Math.cos(DIP_DEG * DEG), -50 * Math.sin(DIP_DEG * DEG)];
// Campo corrompido: módulo fora da faixa terrestre e direção girada — o caso
// da mesa metálica / gabinete / monitor, que é a regra e não a exceção.
const FIELD_CORRUPTED = [90 * Math.sin(50 * DEG), 90 * Math.cos(50 * DEG), -20];

function sensorSampleFor(orientation, field = FIELD_UT, gyro = { x: 0, y: 0, z: 0 }) {
  const R = eulerToMatrix(orientation.alpha, orientation.beta, orientation.gamma);
  const acc = worldToDevice(R, [0, 0, 1]);
  const mag = worldToDevice(R, field);
  return {
    gyro,
    acc: { x: acc[0], y: acc[1], z: acc[2] },
    mag: { x: mag[0], y: mag[1], z: mag[2] },
  };
}

const NEUTRO = { alpha: 0, beta: 0, gamma: 0 };
const HZ60_MS = 1000 / 60;

function wrap180(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

// ============================================================================
// Captura de janela do centro e dos extremos [F5]
// ============================================================================

test('PC1 — a captura é a MÉDIA da janela, não a última amostra', () => {
  const janela = createCaptureWindow(0);
  const CENTRO = 100.0;
  let ultima = null;
  // Ruído de média zero: metade para cada lado, alternando.
  for (let i = 0; i < 36; i += 1) {
    ultima = { alpha: CENTRO + (i % 2 ? 0.8 : -0.8), beta: 10 + (i % 2 ? 0.6 : -0.6), gamma: 0 };
    janela.push(ultima);
  }
  const resultado = janela.poll(cfg.CALIB_WINDOW_MS);

  assert.equal(resultado.status, 'done');
  assert.ok(
    Math.abs(resultado.center.alpha - CENTRO) < 0.2,
    `centro ${resultado.center.alpha} distante mais de 0.2° do conhecido`
  );
  assert.notEqual(
    resultado.center.alpha,
    ultima.alpha,
    'o centro coincidiu com a ÚLTIMA amostra — é captura instantânea disfarçada'
  );
});

test('PC2 — média circular no yaw (359° e 1° ⇒ ~0°, nunca ~180°)', () => {
  const janela = createCaptureWindow(0);
  for (let i = 0; i < 20; i += 1) {
    janela.push({ alpha: i % 2 ? 359.0 : 1.0, beta: 0, gamma: 0 });
  }
  const resultado = janela.poll(cfg.CALIB_WINDOW_MS);
  assert.equal(resultado.status, 'done');
  const centro = wrap180(resultado.center.alpha);
  assert.ok(
    Math.abs(centro) < 0.5,
    `média aritmética simples produziria ~180°; obtido ${centro}`
  );

  // E a função de média circular isolada tem a mesma propriedade.
  assert.ok(Math.abs(wrap180(circularMeanDeg([359, 1, 359, 1]))) < 0.5);
});

test('PC3 — janela instável é rejeitada com motivo, sem produzir perfil', () => {
  const janela = createCaptureWindow(0);
  for (let i = 0; i < 30; i += 1) {
    janela.push({ alpha: 10, beta: 0, gamma: 0 });
  }
  // Uma amostra isolada afastada mais que CALIB_STABILITY_PP_DEG da média.
  janela.push({ alpha: 10 + cfg.CALIB_STABILITY_PP_DEG + 5, beta: 0, gamma: 0 });

  const resultado = janela.poll(cfg.CALIB_WINDOW_MS);
  assert.equal(resultado.status, 'unstable');
  assert.ok(resultado.reason, 'rejeição sem motivo para exibir');
  assert.equal(resultado.center, undefined, 'produziu centro apesar de instável');
});

test('PC4a — fonte a 12 Hz: a janela ESTENDE e a captura conclui', () => {
  const janela = createCaptureWindow(0);
  // 12 Hz ⇒ ~7 amostras em 600 ms: abaixo do piso de 8.
  for (let i = 0; i < 7; i += 1) {
    janela.push({ alpha: 5, beta: 1, gamma: 0 });
  }
  const naJanelaPadrao = janela.poll(cfg.CALIB_WINDOW_MS);
  assert.equal(naJanelaPadrao.status, 'capturing', 'deveria estender, não concluir nem recusar');
  assert.equal(naJanelaPadrao.extended, true);

  // A janela estendida alcança o piso de amostras e conclui.
  janela.push({ alpha: 5, beta: 1, gamma: 0 });
  const estendida = janela.poll(cfg.CALIB_WINDOW_MS + 300);
  assert.equal(estendida.status, 'done');
  assert.ok(estendida.samples >= cfg.CALIB_MIN_SAMPLES_FLOOR);
});

test('PC4b — fonte a 5 Hz: recusa nomeando a fonte lenta, sem pedir repetição', () => {
  const janela = createCaptureWindow(0);
  for (let i = 0; i < 3; i += 1) {
    janela.push({ alpha: 5, beta: 1, gamma: 0 });
  }
  const resultado = janela.poll(cfg.CALIB_WINDOW_MAX_MS);

  assert.equal(
    resultado.status,
    'slow_source',
    'fonte lenta virou pedido de repetição — é o laço infinito que a spec proíbe'
  );
  assert.match(resultado.reason, /lenta/i);
  assert.equal(resultado.center, undefined, 'aceitou um centro sobre 3 amostras');
});

test('PC5 — amostras inválidas são descartadas, sem exceção nem centro NaN', () => {
  const janela = createCaptureWindow(0);
  for (let i = 0; i < 12; i += 1) {
    janela.push({ alpha: 5, beta: 1, gamma: 0 });
  }
  janela.push({ alpha: NaN, beta: 1, gamma: 0 });
  janela.push(null);
  janela.push(undefined);
  janela.push({ beta: 1, gamma: 0 }); // `a` ausente
  janela.push({ alpha: 5, beta: null, gamma: 0 });

  const resultado = janela.poll(cfg.CALIB_WINDOW_MS);
  assert.equal(resultado.status, 'done');
  assert.equal(janela.discarded, 5);
  assert.ok(Number.isFinite(resultado.center.alpha));
  assert.ok(Number.isFinite(resultado.center.beta));

  // Se sobrarem poucas, é recusa — nunca exceção.
  const magra = createCaptureWindow(0);
  for (let i = 0; i < 5; i += 1) {
    magra.push({ alpha: NaN, beta: NaN, gamma: NaN });
  }
  assert.equal(magra.poll(cfg.CALIB_WINDOW_MAX_MS).status, 'slow_source');
});

test('PC6 — a captura é limitada pela configuração do CLIENTE', () => {
  // O cliente é o dono destas constantes; o servidor não tem cópia.
  assert.ok(cfg.CALIB_WINDOW_MS <= cfg.CALIB_WINDOW_MAX_MS);
  assert.ok(cfg.CALIB_WINDOW_MAX_MS <= 1000, 'janela máxima acima do orçamento de entrada');

  // Não fica aberta indefinidamente esperando estabilidade: no pior caso
  // (nenhuma amostra), o desfecho vem em CALIB_WINDOW_MAX_MS.
  const vazia = createCaptureWindow(0);
  assert.equal(vazia.poll(cfg.CALIB_WINDOW_MAX_MS).status, 'slow_source');
});

// ============================================================================
// Assistente de calibração guiada [F12]
// ============================================================================

const capturaOk = (alpha, beta, gamma = 0) => ({
  status: 'done',
  center: { alpha, beta, gamma },
});

test('PC7 — cinco etapas, na ordem, uma por vez', () => {
  const wizard = createWizard();
  const ordem = [wizard.step];
  const fluxo = [
    capturaOk(100, 10),
    capturaOk(120, 10),
    capturaOk(75, 10),
    capturaOk(100, 28),
    capturaOk(100, -5),
  ];
  for (const captura of fluxo) {
    wizard.submitCapture(captura);
    if (!wizard.done) ordem.push(wizard.step);
  }
  assert.deepEqual(ordem, ['neutro', 'esquerda', 'direita', 'cima', 'baixo']);
  assert.equal(wizard.done, true);
});

test('PC8 — quatro alcances independentes, calculados do centro', () => {
  const wizard = createWizard();
  wizard.submitCapture(capturaOk(100, 10)); // neutro
  wizard.submitCapture(capturaOk(120, 10)); // esquerda: |120-100| = 20
  wizard.submitCapture(capturaOk(75, 10)); //  direita:  |75-100|  = 25
  wizard.submitCapture(capturaOk(100, 28)); // cima:     |28-10|   = 18
  wizard.submitCapture(capturaOk(100, -5)); // baixo:    |-5-10|   = 15

  const { ranges } = wizard.profile();
  assert.ok(Math.abs(ranges.left - 20) < 1e-6);
  assert.ok(Math.abs(ranges.right - 25) < 1e-6);
  assert.ok(Math.abs(ranges.up - 18) < 1e-6);
  assert.ok(Math.abs(ranges.down - 15) < 1e-6);

  // Nenhum é derivado da média dos outros: os quatro são distintos.
  assert.equal(new Set(Object.values(ranges).map((v) => Math.round(v))).size, 4);

  // E o cálculo por etapa usa o eixo certo (yaw para os laterais, pitch para
  // os verticais) — trocar os eixos aqui produziria alcance cruzado.
  assert.ok(
    Math.abs(rangeForStep('direita', { alpha: 100, beta: 10 }, { alpha: 75, beta: 10 }) - 25) < 1e-6
  );
  assert.ok(
    Math.abs(rangeForStep('cima', { alpha: 100, beta: 10 }, { alpha: 100, beta: 28 }) - 18) < 1e-6
  );
});

test('PC9 — alcance degenerado é rejeitado e a etapa se repete', () => {
  const wizard = createWizard();
  wizard.submitCapture(capturaOk(100, 10));
  assert.equal(wizard.step, 'esquerda');

  // O usuário não se moveu: 3° está abaixo de RANGE_MIN_DEG.
  const resultado = wizard.submitCapture(capturaOk(103, 10));
  assert.equal(resultado.action, 'retry');
  assert.equal(wizard.step, 'esquerda', 'avançou apesar do alcance degenerado');
  assert.equal(wizard.profile().ranges, null, 'perfil contém o valor degenerado');

  // Idem acima de RANGE_MAX_DEG.
  const grande = wizard.submitCapture(capturaOk(100 + cfg.RANGE_MAX_DEG + 10, 10));
  assert.equal(grande.action, 'retry');

  assert.equal(isPlausibleRange(cfg.RANGE_MIN_DEG - 0.1), false);
  assert.equal(isPlausibleRange(cfg.RANGE_MAX_DEG + 0.1), false);
  assert.equal(isPlausibleRange(20), true);
});

test('PC10 — após CALIB_MAX_RETRIES a etapa cai no padrão e avança', () => {
  const wizard = createWizard();
  wizard.submitCapture(capturaOk(100, 10));
  for (let i = 0; i < cfg.CALIB_MAX_RETRIES; i += 1) {
    assert.equal(wizard.submitCapture(capturaOk(103, 10)).action, 'retry');
  }
  const saida = wizard.submitCapture(capturaOk(103, 10));
  assert.equal(saida.action, 'defaulted', 'prendeu o usuário no laço de repetição');
  assert.equal(wizard.step, 'direita', 'não avançou após oferecer o padrão');
  assert.deepEqual(wizard.defaultedDirections, ['left']);

  // A direção que caiu no padrão fica FORA do payload: quem é dono de
  // DEFAULT_RANGE_DEG é o servidor, e o cliente não guarda cópia do número.
  wizard.submitCapture(capturaOk(75, 10));
  wizard.submitCapture(capturaOk(100, 28));
  wizard.submitCapture(capturaOk(100, -5));
  const { ranges } = wizard.profile();
  assert.equal(ranges.left, undefined);
  assert.ok(ranges.right && ranges.up && ranges.down);
});

test('PC11 — pular produz perfil sem alcances (o padrão é do servidor)', () => {
  const pulado = createWizard().profile();
  assert.equal(pulado.ranges, null);
  assert.equal(pulado.center, null);

  const mensagem = buildCalibrateMessage(pulado.center, pulado.ranges);
  assert.deepEqual(mensagem, { type: 'calibrate' });

  // Nenhuma constante de alcance padrão foi copiada para a config do cliente:
  // a única duplicação permitida entre os dois lados é RANGE_MIN/RANGE_MAX.
  assert.equal(cfg.DEFAULT_RANGE_DEG, undefined);
  assert.equal(typeof cfg.RANGE_MIN_DEG, 'number');
  assert.equal(typeof cfg.RANGE_MAX_DEG, 'number');
});

test('PC11 — persistência: apenas os quatro alcances, com schemaVersion', async () => {
  // `localStorage` não existe no Node: um dublê mínimo basta, porque o alvo é
  // a lógica de persistência, não a API do navegador.
  const loja = new Map();
  globalThis.localStorage = {
    getItem: (k) => (loja.has(k) ? loja.get(k) : null),
    setItem: (k, v) => loja.set(k, String(v)),
    removeItem: (k) => loja.delete(k),
  };
  const storage = await import('../../web/js/storage.js');

  const alcances = { left: 20, right: 25, up: 18, down: 15 };
  storage.saveRangesProfile(alcances);
  assert.deepEqual(storage.loadRangesProfile(), alcances);

  // O CENTRO nunca é persistido — ele depende da postura do momento.
  const bruto = JSON.parse(loja.get('wii-controller.ranges-profile'));
  assert.equal(bruto.center, undefined);
  assert.equal(bruto.schemaVersion, storage.RANGES_SCHEMA_VERSION);

  // schemaVersion desconhecido é tratado como perfil AUSENTE, nunca aplicado
  // parcialmente (metade antigo, metade novo, sem ninguém perceber).
  loja.set(
    'wii-controller.ranges-profile',
    JSON.stringify({ schemaVersion: 999, ranges: alcances })
  );
  assert.equal(storage.loadRangesProfile(), null);

  // Perfil incompleto também conta como ausente.
  loja.set(
    'wii-controller.ranges-profile',
    JSON.stringify({ schemaVersion: storage.RANGES_SCHEMA_VERSION, ranges: { left: 20 } })
  );
  assert.equal(storage.loadRangesProfile(), null);

  // Lista FECHADA de duas chaves.
  assert.equal(storage.STORAGE_KEYS.length, 2);
  delete globalThis.localStorage;
});

test('PC11b — o orçamento de tempo do assistente cabe na configuração', () => {
  const capturas = 5 * cfg.CALIB_WINDOW_MS;
  const transicoes = 5 * cfg.WIZARD_STEP_TRANSITION_MS;
  assert.ok(
    capturas + transicoes <= cfg.WIZARD_BUDGET_MS,
    `assistente configurado em ${capturas + transicoes} ms > ${cfg.WIZARD_BUDGET_MS} ms`
  );
  // Pior caso, com todas as janelas estendidas por fonte lenta.
  const pior = 5 * cfg.CALIB_WINDOW_MAX_MS + transicoes;
  assert.ok(pior <= cfg.WIZARD_BUDGET_MS, `pior caso ${pior} ms estoura o orçamento`);
});

// ============================================================================
// Fusão de sensores e rejeição magnética [F14]
// ============================================================================

function rodarFluxo(amostras, options = {}) {
  const state = createFusionState();
  let saida = null;
  let trocas = 0;
  let anterior = false;
  amostras.forEach((amostra, i) => {
    saida = fusionStep(state, amostra, HZ60_MS, i * HZ60_MS, options);
    if (saida.magRejected !== anterior) {
      trocas += 1;
      anterior = saida.magRejected;
    }
  });
  return { saida, trocas, state };
}

function fluxoComTrechoCorrompido(n = 600, inicio = 200, fim = 500) {
  const bom = sensorSampleFor(NEUTRO, FIELD_UT);
  const ruim = sensorSampleFor(NEUTRO, FIELD_CORRUPTED);
  return Array.from({ length: n }, (_, i) => (i >= inicio && i < fim ? ruim : bom));
}

test('PC12 — a rejeição magnética reduz o erro de yaw (KPI-24)', () => {
  const fluxo = fluxoComTrechoCorrompido();
  const comRejeicao = rodarFluxo(fluxo, { rejectMag: true });
  const semRejeicao = rodarFluxo(fluxo, { rejectMag: false });

  const erro = (r) => Math.abs(wrap180(r.saida.orientation.alpha));
  assert.ok(
    erro(comRejeicao) < erro(semRejeicao),
    `rejeição não ajudou: com=${erro(comRejeicao)} sem=${erro(semRejeicao)}`
  );
  assert.ok(erro(comRejeicao) <= 5, `erro de yaw ${erro(comRejeicao)}° acima de 5°`);
});

test('PC13 — estabilidade estática: < 0.5° em 60 s simulados', () => {
  const amostra = sensorSampleFor(NEUTRO);
  const { saida } = rodarFluxo(Array.from({ length: 60 * 60 }, () => amostra));
  assert.ok(Math.abs(wrap180(saida.orientation.alpha)) < 0.5);
  assert.ok(Math.abs(saida.orientation.beta) < 0.5);
  assert.ok(Math.abs(saida.orientation.gamma) < 0.5);
});

test('PC14 — viés de giroscópio converge, em vez de crescer sem limite', () => {
  // 1 °/s de viés em pitch, com acelerômetro coerente.
  const amostra = sensorSampleFor(NEUTRO, FIELD_UT, { x: 1, y: 0, z: 0 });
  const { saida } = rodarFluxo(Array.from({ length: 60 * 60 }, () => amostra));
  const erroPitch = Math.abs(saida.orientation.beta);
  assert.ok(
    erroPitch < 2,
    `erro de pitch ${erroPitch}° — sem correção seriam 60° após 60 s de viés`
  );
});

test('PC15 — sem magnetômetro a fusão opera em fusion_nomag', () => {
  const ALVO = { alpha: 0, beta: 20, gamma: 0 };
  const R = eulerToMatrix(ALVO.alpha, ALVO.beta, ALVO.gamma);
  const acc = worldToDevice(R, [0, 0, 1]);
  const amostra = { gyro: { x: 0, y: 0, z: 0 }, acc: { x: acc[0], y: acc[1], z: acc[2] } };

  const { saida } = rodarFluxo(
    Array.from({ length: 1200 }, () => amostra),
    { useMag: false }
  );
  assert.ok(Math.abs(saida.orientation.beta - 20) < 1, `pitch ${saida.orientation.beta}`);
  assert.equal(saida.magRejected, false);
  assert.ok(Number.isFinite(saida.orientation.alpha), 'yaw relativo virou NaN');
});

test('PC16 — aceleração forte suspende a correção por gravidade', () => {
  const state = createFusionState();
  const parado = sensorSampleFor(NEUTRO);
  for (let i = 0; i < 60; i += 1) {
    fusionStep(state, parado, HZ60_MS, i * HZ60_MS);
  }

  // Aparelho sacudido: módulo do acelerômetro bem fora de 1 g.
  const sacudido = {
    ...parado,
    acc: { x: 0, y: 0, z: 1 + cfg.FUSION_ACC_TOL_G + 0.5 },
  };
  const durante = fusionStep(state, sacudido, HZ60_MS, 1000);
  assert.equal(durante.accSuspended, true, 'correção de gravidade não foi suspensa');

  // Ao normalizar, a correção volta.
  const depois = fusionStep(state, parado, HZ60_MS, 1020);
  assert.equal(depois.accSuspended, false);
});

test('PC17 — entradas hostis não produzem exceção nem NaN', () => {
  const state = createFusionState();
  const hostis = [
    { gyro: { x: NaN, y: 0, z: 0 }, acc: null, mag: undefined, dtMs: 0 },
    { gyro: null, acc: { x: NaN, y: NaN, z: NaN }, dtMs: -5 },
    { dtMs: 99999 },
    {},
    { gyro: { x: 1, y: 2, z: 3 }, dtMs: NaN },
    { gyro: { x: 1, y: 2, z: 3 }, acc: { x: 0, y: 0, z: 0 }, dtMs: 16 },
  ];
  for (const amostra of hostis) {
    const saida = fusionStep(state, amostra, amostra.dtMs, 0);
    assert.ok(Number.isFinite(saida.orientation.alpha), `alpha NaN para ${JSON.stringify(amostra)}`);
    assert.ok(Number.isFinite(saida.orientation.beta));
    assert.ok(Number.isFinite(saida.orientation.gamma));
  }
});

test('PC18 — histerese: interferência oscilante não faz o indicador piscar', () => {
  const bom = sensorSampleFor(NEUTRO, FIELD_UT);
  const ruim = sensorSampleFor(NEUTRO, FIELD_CORRUPTED);
  // Oscila a CADA amostra (60 Hz) por 10 s simulados.
  const fluxo = Array.from({ length: 600 }, (_, i) => (i % 2 === 0 ? ruim : bom));
  const { trocas } = rodarFluxo(fluxo);

  // Sem histerese seriam ~600 trocas; o teto é ~1 por FUSION_MAG_HYSTERESIS_MS.
  const duracaoMs = 600 * HZ60_MS;
  const teto = Math.ceil(duracaoMs / cfg.FUSION_MAG_HYSTERESIS_MS) + 1;
  assert.ok(trocas <= teto, `${trocas} trocas de estado (teto ${teto}) — indicador piscando`);
});

test('PC19 — a saída respeita a convenção do contrato (F4)', () => {
  for (const alvo of [
    { alpha: 0, beta: 0, gamma: 0 },
    { alpha: 30, beta: 10, gamma: -20 },
    { alpha: 350, beta: -45, gamma: 80 },
  ]) {
    // A conversão matriz→Euler é a peça que garante que trocar de fonte não
    // inverte nem troca eixo — o defeito que M17/M18 pegam no servidor.
    const obtido = matrixToEuler(eulerToMatrix(alvo.alpha, alvo.beta, alvo.gamma));
    assert.ok(Math.abs(wrap180(obtido.alpha - alvo.alpha)) < 1e-6, `alpha ${obtido.alpha}`);
    assert.ok(Math.abs(obtido.beta - alvo.beta) < 1e-6, `beta ${obtido.beta}`);
    assert.ok(Math.abs(obtido.gamma - alvo.gamma) < 1e-6, `gamma ${obtido.gamma}`);

    // Faixas do contrato.
    assert.ok(obtido.alpha >= 0 && obtido.alpha < 360);
    assert.ok(obtido.beta >= -180 && obtido.beta < 180);
    assert.ok(obtido.gamma >= -90 && obtido.gamma < 90);
  }
});

// ============================================================================
// Escada de fontes de orientação [F13]
// ============================================================================

const sondaQueAceita = (disponiveis) => async (nome) => disponiveis.includes(nome);

test('PC20 — a seleção desce a escada na ordem da tabela', async () => {
  assert.equal(
    (await selectSource(sondaQueAceita(['fusion_nomag', 'sensor_api', 'deviceorientation']))).source,
    'fusion_nomag'
  );
  assert.equal(
    (await selectSource(sondaQueAceita(['sensor_api', 'deviceorientation']))).source,
    'sensor_api'
  );
  assert.equal(
    (await selectSource(sondaQueAceita(['deviceorientation']))).source,
    'deviceorientation'
  );
  assert.equal(nextSourceBelow('fusion_mag'), 'fusion_nomag');
  assert.equal(nextSourceBelow('deviceorientation'), null);
});

test('PC21 — a detecção exige AMOSTRA recebida, não presença de API', async () => {
  // Provedor que existe, concede permissão e registra... mas nunca emite.
  const mudo = () => () => {};
  const emiteJa = (onSample) => {
    onSample();
    return () => {};
  };
  const agenda = (fn) => fn(); // timeout imediato, para o teste não esperar

  assert.equal(await probeWithTimeout(mudo, 10, agenda), false);
  assert.equal(await probeWithTimeout(emiteJa, 10, agenda), true);

  // Provedor ausente (API inexistente) devolve null ⇒ indisponível.
  assert.equal(await probeWithTimeout(() => null, 10, agenda), false);
});

test('PC23 — queda em runtime desce um degrau', () => {
  const vigia = createStallWatch('fusion_mag', 0);
  assert.equal(vigia.poll(cfg.SOURCE_STALL_MS - 1), null, 'degradou antes da hora');

  const degradado = vigia.poll(cfg.SOURCE_STALL_MS + 100);
  assert.equal(degradado, 'fusion_nomag');
  assert.equal(vigia.source, 'fusion_nomag');

  // Amostras voltando impedem novas degradações.
  vigia.noteSample(cfg.SOURCE_STALL_MS + 200);
  assert.equal(vigia.poll(cfg.SOURCE_STALL_MS + 300), null);
});

test('PC24a — ?src força a fonte, e forçar indisponível não cai calado', async () => {
  const forcada = await selectSource(sondaQueAceita([]), 'synthetic', async () => true);
  assert.equal(forcada.source, 'synthetic');
  assert.equal(forcada.forced, true);

  const indisponivel = await selectSource(sondaQueAceita([]), 'fusion_mag', async () => false);
  assert.equal(indisponivel.source, null, 'caiu calado para outra fonte');
  assert.match(indisponivel.error, /indispon/i);

  const desconhecida = await selectSource(sondaQueAceita([]), 'inventada', async () => true);
  assert.equal(desconhecida.source, null);

  assert.equal(isSelectableSource('synthetic'), true);
  assert.equal(isSelectableSource('inventada'), false);
});

test('PC24b — synthetic NUNCA é escolhida pela detecção automática', async () => {
  // Todos os quatro degraus indisponíveis, e sem ?src.
  const resultado = await selectSource(sondaQueAceita([]));
  assert.equal(
    resultado.source,
    null,
    'a detecção automática caiu na fonte sintética — um aparelho sem sensores ' +
      '"funcionaria" sobre dados inventados'
  );
  assert.ok(resultado.error, 'nenhuma fonte disponível deve produzir erro visível');

  // Mesmo com a sintética "disponível", ela não é elegível automaticamente.
  const comSintetica = await selectSource(sondaQueAceita(['synthetic']));
  assert.equal(comSintetica.source, null);

  assert.equal(isAutoSelectable('synthetic'), false);
  assert.equal(cfg.SOURCE_LADDER.includes('synthetic'), false);
  assert.equal(cfg.SOURCE_LADDER.length, 4);
});

test('PC25 — ?mag=off e ?magreject=off medem coisas diferentes', () => {
  const fluxo = fluxoComTrechoCorrompido();

  const semMag = rodarFluxo(fluxo, { useMag: false });
  const semRejeicao = rodarFluxo(fluxo, { rejectMag: false });
  const completo = rodarFluxo(fluxo, {});

  const erro = (r) => Math.abs(wrap180(r.saida.orientation.alpha));

  // ?mag=off equivale a operar sem bússola: o yaw não é puxado pelo campo
  // falso (segue só pelo giroscópio).
  assert.ok(erro(semMag) <= 5, `?mag=off deveria ignorar a bússola: ${erro(semMag)}°`);
  assert.equal(semMag.saida.magRejected, false);

  // ?magreject=off mantém a correção SEM rejeitar: a bússola mentindo puxa.
  assert.ok(
    erro(semRejeicao) > erro(completo),
    'os dois interruptores produziram o mesmo resultado — não separam ' +
      '"a fusão ajuda?" de "a rejeição ajuda?"'
  );
  assert.equal(semRejeicao.saida.magRejected, false, '?magreject=off ainda rejeitou');
});

// ============================================================================
// Contrato de saída para o protocolo [F4, F14.8]
// ============================================================================

test('PC26 — `motion` não engorda: exatamente type, a, b, g, t', () => {
  const mensagem = buildMotionMessage(137.0, 12.5, -3.0, 1000.0);
  assert.deepEqual(Object.keys(mensagem).sort(), ['a', 'b', 'g', 't', 'type']);
  assert.equal(mensagem.type, 'motion');

  // Nenhuma leitura crua de sensor, nenhuma fonte, nenhuma rejeição magnética.
  for (const proibido of ['acc', 'mag', 'gyro', 'source', 'mag_rejected', 'magRejected']) {
    assert.equal(mensagem[proibido], undefined, `campo proibido no motion: ${proibido}`);
  }

  // `a` inválido vira null (fonte sem yaw), sem inventar valor.
  assert.equal(buildMotionMessage(NaN, 1, 2, 3).a, null);
  assert.equal(buildMotionMessage(undefined, 1, 2, 3).a, null);

  // E o throttle não retém a amostra mais recente por mais de um período.
  const throttle = createMotionThrottle(cfg.MOTION_SEND_HZ);
  assert.notEqual(throttle.push(mensagem, 0), null);
  assert.equal(throttle.push(mensagem, 1), null);
  assert.notEqual(throttle.push(mensagem, 1000 / cfg.MOTION_SEND_HZ), null);
});

test('PC27 — `status` em baixa frequência: no máximo 1×/s além da inicial', () => {
  const throttle = createStatusThrottle(cfg.STATUS_MIN_INTERVAL_MS);
  let enviadas = 0;

  // A inicial é forçada (vai junto do `hello`).
  if (throttle.push('fusion_mag', false, 0, { force: true })) enviadas += 1;

  // 60 mudanças de estado em 1 s.
  for (let i = 1; i <= 60; i += 1) {
    if (throttle.push('fusion_mag', i % 2 === 0, i * 16, {})) enviadas += 1;
  }
  assert.ok(enviadas <= 2, `${enviadas} mensagens de status em 1 s (esperado <= 2)`);

  // Sem mudança nenhuma, não há envio — mesmo passado o intervalo.
  const estavel = createStatusThrottle(cfg.STATUS_MIN_INTERVAL_MS);
  estavel.push('sensor_api', false, 0, { force: true });
  assert.equal(estavel.push('sensor_api', false, 5000, {}), null);

  // Mudança real depois do intervalo passa.
  const mudanca = estavel.push('deviceorientation', false, 6000, {});
  assert.deepEqual(mudanca, {
    type: 'status',
    source: 'deviceorientation',
    mag_rejected: false,
  });
});
