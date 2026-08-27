# Testes — Restrições arquiteturais (verificações estáticas) [F1, F8, F9, F14, KPI-8]

Faixa: **estática**, automatizada dentro do `pytest -q` (varredura de arquivos em
`game/fruit-ninja/`). São baratas e pegam exatamente as regressões que a arquitetura
deste slug proíbe.

- **X1 — Fonte única de input**: `navigator.getGamepads` aparece **somente** em
  `js/input.js` (F1.6).
- **X2 — Nada de WebSocket**: nenhuma ocorrência de `new WebSocket` em
  `game/fruit-ninja/`. A única exceção permitida (fallback de rumble) usa `fetch` em
  `js/rumble.js`, não WebSocket (F9.4).
- **X3 — Rede isolada**: `fetch(`/`XMLHttpRequest` aparecem no máximo em `js/rumble.js`,
  que contém um comentário explicando por que o módulo existe (exceção herdada do
  `wii-controller`).
- **X4 — Sem persistência**: nenhuma ocorrência de `localStorage`, `sessionStorage` ou
  `document.cookie` em `game/fruit-ninja/` (F8.4).
- **X5 — Sem imports externos**: todo `import ... from '...'` em
  `game/fruit-ninja/` usa caminho relativo que resolve **dentro** de
  `game/fruit-ninja/`; nenhuma referência a `web/`, `game/js/`, `../../` para fora, nem
  a URL de CDN. Nenhum `<script src>`/`<link href>` para domínio externo (F14.3/F14.4).
- **X6 — Servidor intocado**: o diff da entrega não altera nenhum arquivo fora de
  `game/fruit-ninja/` e `tests/` — em especial `server/` (F14.1). Verificável por
  `git diff --name-only` contra a base da entrega.
- **X7 — Pureza dos módulos puros**: `slicing.js`, `entities.js`, `rules.js` e
  `blade.js` não contêm `document`, `window`, `canvas`, `Math.random`, `Date.now`,
  `performance.now`, `setTimeout` nem `requestAnimationFrame`.
- **X8 — Toque no navegador restrito**: `requestAnimationFrame` aparece somente em
  `js/loop.js`; `getContext('2d')` somente em `js/render.js`.
- **X9 — Sem números mágicos de tuning**: todas as constantes listadas em Data Models
  existem em `js/config.js` com os nomes da spec, e os módulos puros as recebem por
  argumento ou as importam de `config.js` — nenhum literal numérico de tuning
  (gravidade, limiares, durações, vidas) aparece fora de `config.js`.
- **X10 — Sem engine nem dependência**: nenhuma referência a Phaser/PixiJS/Three.js,
  nenhum `package.json` novo, nenhuma pasta `node_modules` sob `game/fruit-ninja/`.
- **X11 — Contrato de diagnóstico presente**: `window.__fruitNinja` é definido em
  exatamente um módulo e expõe `getState`, `getConfig`, `setGamepadIndex`, `setSeed` e
  `spawnForTest` (F14.5) — a faixa de navegador depende dele.
- **X12 — Invariantes de configuração**: `config.js` satisfaz
  `0 <= deadzone < maxTilt <= 1`, `smoothingTauMs <= 60`,
  `150 <= trailDurationMs <= 400`,
  `bladeMaxStepCss == 1.5 * trailReferenceSpeedCssPerS / 60` e `bombChance > 0` em
  todos os níveis — checagem barata que evita spec violada por tuning.
