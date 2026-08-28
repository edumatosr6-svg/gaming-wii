// Módulo ÚNICO de configuração do cliente (software-specs.md, Data Models /
// "Config do cliente"). Mesma regra do servidor: estes valores nunca aparecem
// espalhados como números mágicos no resto do código.
//
// DIVISÃO DE DONO: este módulo é dono das constantes de CAPTURA de calibração,
// do ASSISTENTE, da ESCADA DE FONTES e da FUSÃO — tudo isso roda no cliente,
// que é onde estão os sensores crus, a taxa cheia de amostras e a UI de
// "segure parado". As constantes de MAPEAMENTO (zona morta, sensibilidade,
// alcances padrão, suavização) são do servidor e NÃO têm cópia aqui: o
// mapeamento continua no servidor, e uma constante duplicada entre os dois
// lados é divergência silenciosa esperando acontecer.
//
// ÚNICA DUPLICAÇÃO PERMITIDA: RANGE_MIN_DEG/RANGE_MAX_DEG (abaixo).

// --- Captura da janela de calibração (F5) ----------------------------------
// A captura é a MÉDIA de uma janela curta com o aparelho parado, nunca uma
// amostra instantânea: se a amostra única pegar um pico de ruído, o viés
// contamina a sessão inteira — calibrar errado é pior que não calibrar.
export const CALIB_WINDOW_MS = 600;
// Piso de amostras: a média de 8 amostras reduz o ruído de média zero a ~35%
// do de uma amostra isolada. Sob fonte lenta a janela se ESTENDE até
// CALIB_WINDOW_MAX_MS buscando essas 8, em vez de exigir contagem fixa — que
// tornaria a calibração impossível justamente no piso da escada (F13), onde o
// produto ainda precisa ser jogável (KPI-23).
export const CALIB_WINDOW_MAX_MS = 1000;
export const CALIB_MIN_SAMPLES_FLOOR = 8;
// Abaixo desta taxa a fonte é declarada lenta demais e a calibração é recusada
// com motivo nomeado — a 8 Hz a mira já seria inutilizável de qualquer forma.
// Recusar é honesto; travar num laço de repetição não é.
export const CALIB_MIN_SOURCE_HZ = 8;
// Afastamento máximo de qualquer amostra em relação à média da janela. Acima
// disso a janela é INVALIDADA e o usuário repete ("segure parado"). Janela
// instável e fonte lenta são casos distintos: a primeira pede repetição, a
// segunda diz que a fonte não serve.
export const CALIB_STABILITY_PP_DEG = 3.0;
export const CALIB_MAX_RETRIES = 2;

// --- Assistente de calibração guiada (F12) ---------------------------------
// O assistente é a primeira coisa entre o usuário e o jogo: a soma das
// durações configuradas (capturas + transições) tem de caber neste orçamento.
export const WIZARD_BUDGET_MS = 20000;
// Transição entre etapas: tempo para o usuário ler a instrução e se posicionar
// antes da próxima captura.
export const WIZARD_STEP_TRANSITION_MS = 1500;
export const WIZARD_STEPS = ['neutro', 'esquerda', 'direita', 'cima', 'baixo'];

// --- Fonte de orientação: escada de degradação (F13) ------------------------
// Frequência PEDIDA EXPLICITAMENTE à API de sensores moderna.
export const SENSOR_HZ = 60;
// Um degrau só é considerado disponível se amostras REALMENTE chegarem dentro
// desta janela — não basta a API existir e a permissão ser concedida. É o modo
// de falha real do evento clássico sob economia de bateria.
export const SOURCE_PROBE_MS = 1500;
// Amostras cessando por mais que isto durante o uso ⇒ desce um degrau em
// runtime e atualiza o indicador da tela.
export const SOURCE_STALL_MS = 2000;
// Os QUATRO degraus da escada, do melhor para o pior. `synthetic` NÃO está
// aqui de propósito: é fonte de diagnóstico, fora da escada, nunca elegível
// pela detecção automática (F13.1). Se a detecção pudesse cair nela, um
// aparelho sem sensores "funcionaria" em cima de dados inventados — o pior
// modo de falha possível para este projeto.
export const SOURCE_LADDER = ['fusion_mag', 'fusion_nomag', 'sensor_api', 'deviceorientation'];
export const DIAGNOSTIC_SOURCE = 'synthetic';
export const SOURCE_LABELS = {
  fusion_mag: 'fusão + bússola',
  fusion_nomag: 'fusão (sem bússola)',
  sensor_api: 'sensores do sistema',
  deviceorientation: 'orientação clássica',
  synthetic: 'sintética (diagnóstico)',
};

// --- Fusão de sensores (F14) ------------------------------------------------
// Filtro complementar: o giroscópio integra (resposta rápida, deriva lenta) e
// os outros dois sensores corrigem devagar.
export const FUSION_ACC_GAIN = 0.02;
// Sob agitação o vetor medido não é a gravidade: a correção de pitch/roll é
// SUSPENSA quando o módulo se afasta de 1 g mais que esta tolerância.
export const FUSION_ACC_TOL_G = 0.2;
export const FUSION_MAG_GAIN = 0.01;
// Faixa do campo magnético terrestre. Fora dela, a leitura é descartada.
export const FUSION_MAG_MIN_UT = 25;
export const FUSION_MAG_MAX_UT = 65;
// Afastamento máximo do módulo em relação à linha de base da sessão (%).
export const FUSION_MAG_DEV_PCT = 20;
// Afastamento máximo da inclinação magnética (ângulo entre o campo medido e a
// gravidade) em relação à linha de base da sessão.
export const FUSION_MAG_DIP_TOL_DEG = 15;
// Histerese do estado de rejeição, para o indicador não piscar a cada amostra.
export const FUSION_MAG_HYSTERESIS_MS = 500;

// --- Protocolo / rede -------------------------------------------------------
export const MOTION_SEND_HZ = 60; // espelha MOTION_SEND_HZ de server/config.py
export const DEFAULT_PORT = '8443'; // espelha PORT de server/config.py
export const RECONNECT_DELAY_MS = 800; // < 5 s exigidos por F9.5, com folga
// `status` é de BAIXA FREQUÊNCIA (F13/F14): no `hello`, a cada mudança e no
// máximo 1×/s. Embutir fonte e rejeição magnética no `motion` é proibido —
// são constantes na maior parte do tempo e engordariam a mensagem mais
// frequente do protocolo.
export const STATUS_MIN_INTERVAL_MS = 1000;

// --- Duplicação permitida (uma só) -----------------------------------------
// RANGE_MIN_DEG/RANGE_MAX_DEG existem nos dois lados APENAS para o cliente
// pré-validar cada direção durante o assistente e evitar uma ida ao servidor
// só para receber um "não". Em caso de divergência, VALE A DECISÃO DO
// SERVIDOR: um perfil que passe aqui e seja rejeitado lá produz
// `calibration_applied {accepted: false}` e o assistente exibe o motivo.
//
// O alcance PADRÃO de cada direção deliberadamente NÃO está aqui: pular o
// assistente envia um perfil SEM `ranges`, e é o servidor (dono dessa
// constante) que aplica o padrão nas quatro direções. Copiar o número para cá
// seria a segunda duplicação, que as diretrizes proíbem.
export const RANGE_MIN_DEG = 10;
export const RANGE_MAX_DEG = 45;
