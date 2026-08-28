// Persistência no aparelho — LISTA FECHADA DE DUAS CHAVES (F3.5/F12.8).
//
// Este é o ÚNICO módulo do cliente que toca `localStorage`. A regra da spec é
// literal: exatamente duas chaves, o último endereço e o perfil de alcances.
// Estado de jogo continua proibido. Centralizar aqui é o que torna a regra
// verificável por inspeção — com o acesso espalhado, "quantas chaves existem?"
// vira uma busca no projeto inteiro, e uma terceira chave entra sem ninguém
// notar.
//
// Por que o perfil de alcances pode ser persistido e o centro NÃO: o alcance
// confortável do pulso é configuração da pessoa e não muda entre sessões; o
// centro depende da postura naquele momento (sentado, deitado, em pé), e um
// centro velho é pior que nenhum — por isso a captura de centro acontece na
// entrada de toda sessão (F12).

const ADDRESS_KEY = 'wii-controller.last-address';
const RANGES_KEY = 'wii-controller.ranges-profile';

// Lista fechada: qualquer chave fora daqui reprova a verificação estática.
export const STORAGE_KEYS = [ADDRESS_KEY, RANGES_KEY];

// Versão do formato do perfil salvo. Um `schemaVersion` desconhecido é
// DESCARTADO e tratado como perfil ausente — nunca aplicado parcialmente, que
// produziria um alcance meio antigo e meio novo sem ninguém perceber.
export const RANGES_SCHEMA_VERSION = 1;

const RANGE_DIRECTIONS = ['left', 'right', 'up', 'down'];

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // localStorage indisponível ou JSON corrompido: perfil ausente
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage indisponível não impede o uso do controle
  }
}

// --- Chave 1: último endereço usado com sucesso (F3.4) ----------------------

export function loadLastAddress() {
  const parsed = readJson(ADDRESS_KEY);
  if (parsed && typeof parsed.ip === 'string' && typeof parsed.port === 'string') {
    return { ip: parsed.ip, port: parsed.port };
  }
  return null;
}

export function saveLastAddress(ip, port) {
  writeJson(ADDRESS_KEY, { ip, port: String(port) });
}

// --- Chave 2: perfil de alcances (F12.6) ------------------------------------

// Devolve os quatro alcances salvos, ou null (perfil ausente). Um perfil
// incompleto ou de schema desconhecido conta como ausente.
export function loadRangesProfile() {
  const parsed = readJson(RANGES_KEY);
  if (!parsed || parsed.schemaVersion !== RANGES_SCHEMA_VERSION) {
    return null;
  }
  const ranges = parsed.ranges;
  if (!ranges || typeof ranges !== 'object') {
    return null;
  }
  const complete = RANGE_DIRECTIONS.every(
    (key) => typeof ranges[key] === 'number' && Number.isFinite(ranges[key]) && ranges[key] > 0
  );
  if (!complete) {
    return null;
  }
  const result = {};
  for (const key of RANGE_DIRECTIONS) {
    result[key] = ranges[key];
  }
  return result;
}

// Persiste APENAS os quatro alcances — nunca o centro (F12/Data Models).
export function saveRangesProfile(ranges) {
  writeJson(RANGES_KEY, {
    schemaVersion: RANGES_SCHEMA_VERSION,
    createdAt: Date.now(),
    ranges,
  });
}

export function clearRangesProfile() {
  try {
    localStorage.removeItem(RANGES_KEY);
  } catch {
    // idem
  }
}
