// Escada de degradação da fonte de orientação (F13).
//
// As fontes formam uma escada, da melhor para a pior. O cliente usa a melhor
// DISPONÍVEL, informa na tela qual está em uso e continua jogável na pior
// delas. Nenhuma delas pode ser condição para o produto funcionar — um
// aparelho sem magnetômetro ainda joga.
//
// DETECÇÃO EM TEMPO DE EXECUÇÃO, NUNCA POR NOME DE NAVEGADOR: um degrau só é
// considerado disponível se (a) a API existir, (b) a permissão for concedida e
// (c) amostras REALMENTE CHEGAREM dentro de SOURCE_PROBE_MS. Decidir por
// `navigator.userAgent` é proibido — é a decisão que envelhece mal e que não
// tem como perceber o modo de falha real do evento clássico, que é existir,
// conceder permissão e mesmo assim não emitir nada sob economia de bateria.
//
// A saída da camada é sempre a orientação na convenção do
// `DeviceOrientationEvent` (contrato da F4): o resto do cliente e todo o
// servidor não sabem qual degrau produziu a amostra.

import { SOURCE_LADDER, DIAGNOSTIC_SOURCE, SOURCE_PROBE_MS, SOURCE_STALL_MS } from './config.js';

// Seleciona o degrau percorrendo a escada e SONDANDO cada um. `probe(source)`
// devolve uma promessa que resolve para true quando aquele degrau entregou
// amostra real dentro do orçamento, e false caso contrário.
//
// `forced` (do parâmetro `?src=`) desliga a detecção: a fonte indicada é usada
// SEM SONDAGEM, e se ela não puder sequer iniciar o resultado é ERRO VISÍVEL —
// nunca uma queda calada para outra fonte, que faria uma sessão de diagnóstico
// medir silenciosamente a coisa errada.
//
// Por que a fonte forçada não é sondada: a sondagem espera uma amostra chegar
// dentro do orçamento, e uma fonte roteirizada (diagnóstico, testes headless)
// só emite quando o roteiro manda. Sondá-la reprovaria toda fonte forçada cujo
// primeiro evento demora mais que o orçamento — inclusive a costura que os
// casos headless usam para exercitar assistente, indicador de fonte e
// indicador de interferência. `canStart` verifica apenas que o provedor existe
// e aceita registrar, que é a pergunta correta para uma fonte explicitamente
// escolhida por quem está diagnosticando.
export async function selectSource(probe, forced = null, canStart = null) {
  if (forced !== null && forced !== undefined && forced !== '') {
    if (!isSelectableSource(forced)) {
      return { source: null, forced: true, error: `fonte desconhecida: ${forced}` };
    }
    const available = canStart === null ? true : await canStart(forced);
    if (!available) {
      return { source: null, forced: true, error: `fonte forçada indisponível: ${forced}` };
    }
    return { source: forced, forced: true, error: null };
  }

  // A detecção automática percorre APENAS a escada. `synthetic` está fora dela
  // de propósito: se a detecção pudesse cair na fonte sintética, um aparelho
  // sem sensores "funcionaria" em cima de dados inventados — o pior modo de
  // falha possível para um projeto cujo defeito histórico é passar em teste e
  // não funcionar no aparelho.
  for (const candidate of SOURCE_LADDER) {
    if (await probe(candidate)) {
      return { source: candidate, forced: false, error: null };
    }
  }
  return {
    source: null,
    forced: false,
    error:
      'nenhuma fonte de orientação disponível: verifique se a página está em HTTPS ' +
      'e se a permissão de sensores foi concedida',
  };
}

// Fontes que `?src=` aceita: os quatro degraus MAIS a fonte de diagnóstico.
export function isSelectableSource(name) {
  return SOURCE_LADDER.includes(name) || name === DIAGNOSTIC_SOURCE;
}

// `synthetic` nunca é elegível pela detecção automática (F13.1).
export function isAutoSelectable(name) {
  return SOURCE_LADDER.includes(name);
}

// Próximo degrau abaixo do atual, ou null se já está no piso. A fonte de
// diagnóstico não participa da degradação: forçada é forçada.
export function nextSourceBelow(current) {
  const index = SOURCE_LADDER.indexOf(current);
  if (index < 0 || index + 1 >= SOURCE_LADDER.length) {
    return null;
  }
  return SOURCE_LADDER[index + 1];
}

// Vigia de amostras: se a fonte em uso parar de emitir por mais que
// SOURCE_STALL_MS, o cliente desce um degrau em runtime, atualiza o rótulo e
// marca o `status` como pendente de envio (F13.6). Puro: o tempo entra por
// parâmetro.
export function createStallWatch(source, nowMs) {
  let current = source;
  let lastSampleMs = nowMs;
  return {
    get source() {
      return current;
    },
    noteSample(atMs) {
      lastSampleMs = atMs;
    },
    // Devolve o novo degrau quando houve degradação, ou null.
    poll(atMs) {
      if (atMs - lastSampleMs <= SOURCE_STALL_MS) {
        return null;
      }
      const next = nextSourceBelow(current);
      if (next === null) {
        return null;
      }
      current = next;
      lastSampleMs = atMs;
      return next;
    },
  };
}

// Sondagem padrão de um degrau: registra o provedor e espera uma amostra REAL
// chegar dentro do orçamento. `start(onSample)` devolve uma função de parada.
// A promessa resolve false por timeout — presença de API não conta como
// disponibilidade (PC21).
export function probeWithTimeout(start, budgetMs = SOURCE_PROBE_MS, scheduler = setTimeout) {
  return new Promise((resolve) => {
    let settled = false;
    let stop = null;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (typeof stop === 'function') {
        stop();
      }
      resolve(value);
    };
    try {
      stop = start(() => finish(true));
    } catch {
      finish(false); // API existe mas explode ao registrar: degrau indisponível
      return;
    }
    if (stop === null || stop === undefined) {
      finish(false); // provedor recusou registrar (API ausente/permissão negada)
      return;
    }
    scheduler(() => finish(false), budgetMs);
  });
}

// Limitador do `status`: baixa frequência, no máximo 1×/s (F13/F14). Embutir
// fonte e rejeição magnética no `motion` é proibido — são constantes na maior
// parte do tempo e engordariam a mensagem mais frequente do protocolo.
export function createStatusThrottle(minIntervalMs) {
  let lastSentMs = Number.NEGATIVE_INFINITY;
  let lastPayload = null;
  return {
    // Devolve a mensagem quando ela deve ser enviada, ou null.
    push(source, magRejected, nowMs, { force = false } = {}) {
      const payload = `${source}|${magRejected}`;
      const changed = payload !== lastPayload;
      if (!changed && !force) {
        return null;
      }
      if (!force && nowMs - lastSentMs < minIntervalMs) {
        return null;
      }
      lastSentMs = nowMs;
      lastPayload = payload;
      return { type: 'status', source, mag_rejected: magRejected };
    },
  };
}
