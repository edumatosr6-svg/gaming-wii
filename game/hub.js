// Renderização do hub (specs/game-hub/software-specs.md — F1, F2, F4).
//
// Este módulo não conhece o catálogo de jogos além do que recebe por
// parâmetro (injeção de dependência) — quem quiser testar com um catálogo
// diferente (vazio, estendido, etc.) não precisa tocar aqui, só passar outro
// array de `GameEntry` (ver games.js).

/**
 * Valida um catálogo de jogos (F4 / tests/catalog.md).
 *
 * Não é chamada em runtime do navegador — é uma checagem de dados, pensada
 * para rodar em teste/lint, e lança um erro claro quando os dados estão
 * inconsistentes (id vazio, url vazia, id duplicado).
 *
 * @param {Array<{id: string, name: string, url: string, description?: string}>} catalog
 */
export function validateCatalog(catalog) {
  const seen = new Set();
  for (const entry of catalog) {
    if (!entry.id) {
      throw new Error(`entrada de catálogo sem id: ${JSON.stringify(entry)}`);
    }
    if (!entry.name) {
      throw new Error(`entrada de catálogo sem name (id: ${entry.id})`);
    }
    if (!entry.url) {
      throw new Error(`entrada de catálogo sem url (id: ${entry.id})`);
    }
    if (seen.has(entry.id)) {
      throw new Error(`id duplicado no catálogo de jogos: ${entry.id}`);
    }
    seen.add(entry.id);
  }
  return true;
}

/**
 * Renderiza o catálogo de jogos dentro de `container` (elemento DOM).
 *
 * Catálogo vazio renderiza um estado vazio, sem lançar erro (F1).
 * Cada entrada vira um `<a href="entry.url">` real (F2) — navegação de
 * verdade, sem `preventDefault` nem interceptação de clique.
 *
 * @param {Element} container
 * @param {Array<{id: string, name: string, url: string, description?: string}>} catalog
 */
export function renderHub(container, catalog) {
  container.innerHTML = '';

  if (!catalog || catalog.length === 0) {
    const empty = container.ownerDocument.createElement('p');
    empty.className = 'hub-empty';
    empty.textContent = 'Nenhum jogo disponível no momento.';
    container.appendChild(empty);
    return;
  }

  const list = container.ownerDocument.createElement('ul');
  list.className = 'hub-list';

  for (const entry of catalog) {
    const item = container.ownerDocument.createElement('li');
    item.className = 'hub-item';
    item.dataset.gameId = entry.id;

    const link = container.ownerDocument.createElement('a');
    link.className = 'hub-link';
    link.href = entry.url;

    const title = container.ownerDocument.createElement('span');
    title.className = 'hub-link-name';
    title.textContent = entry.name;
    link.appendChild(title);

    if (entry.description) {
      const desc = container.ownerDocument.createElement('span');
      desc.className = 'hub-link-description';
      desc.textContent = entry.description;
      link.appendChild(desc);
    }

    item.appendChild(link);
    list.appendChild(item);
  }

  container.appendChild(list);
}
