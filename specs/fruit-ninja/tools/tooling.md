# fruit-ninja — Tooling

## Test runner

- **Comando único da suíte inteira: `pytest -q`** na raiz do projeto (exigência das
  coding directives). Ele já orquestra as três faixas descritas abaixo.

### Faixa 1 — lógica pura (`node --test`)

- Testes de `input.js` (mapeamento absoluto), `blade.js`, `entities.js`, `slicing.js`,
  `rules.js` e do avanço do loop, em `tests/js/*.test.mjs`, executados **dentro do
  pytest** por um teste que invoca `node --test` como subprocesso e falha se a suíte JS
  falhar (mesmo mecanismo já usado pelo Duck Shooting em `tests/test_js_suite.py`).
- Node.js é ferramenta de desenvolvimento apenas — só o runner embutido, nada de npm.
- Arquivos sugeridos: `fruit-ninja-pointing.test.mjs`, `fruit-ninja-slicing.test.mjs`,
  `fruit-ninja-entities.test.mjs`, `fruit-ninja-rules.test.mjs`,
  `fruit-ninja-blade-loop.test.mjs`.

### Faixa 2 — integração em navegador headless (**obrigatória**)

- Playwright + Chromium (já instalados e configurados) carregando a página **real**
  servida pelo servidor **real** em loopback, com o dublê de gamepad injetado por
  `add_init_script` (contrato em `tests/integration-browser.md`).
- **Não podem ser marcados como opcionais nem pulados em silêncio.** Se o navegador não
  estiver instalado, a suíte **falha** com a instrução
  `playwright install chromium` — pular era exatamente o modo de falha que deixou
  defeitos passarem neste repositório: a suíte anterior passava com dezenas de testes de
  lógica pura enquanto o produto era inutilizável, porque **toda a faixa de defeitos
  vivia na integração**.
- Arquivo sugerido: `tests/test_fruit_ninja_headless.py`, reutilizando os fixtures de
  `tests/conftest.py` (servidor em loopback + gamepad fake do servidor). Nenhum teste
  desta faixa exige celular, driver de gamepad ou GPU.

### Faixa 3 — procedimentos manuais (hardware real)

- Marcados `@pytest.mark.hardware` e **excluídos da execução padrão** (configuração já
  existente no projeto). Cada procedimento declara um **critério observável** (o que o
  operador deve ver), conforme `tests/manual.md`.
- **Teste marcado nunca conta como cobertura**: nenhum relatório pode declarar
  `SUCCESS` apoiado numa faixa de comportamento cuja verificação foi adiada; o veredito
  precisa listar explicitamente o que ficou por verificar.

## Verificações estáticas específicas da spec

Automatizadas como testes na execução padrão (arquivo sugerido:
`tests/test_fruit_ninja_static.py`), correspondendo a X1–X11 de
`tests/static-constraints.md`:

1. `navigator.getGamepads` só em `js/input.js` (X1).
2. Nenhum `new WebSocket` em `game/fruit-ninja/`; `fetch`/`XMLHttpRequest` no máximo em
   `js/rumble.js`, com comentário de justificativa (X2, X3).
3. Nenhum `localStorage`/`sessionStorage`/`document.cookie` (X4).
4. Nenhum import ou `src`/`href` que resolva fora de `game/fruit-ninja/` (X5).
5. Nenhum arquivo alterado fora de `game/fruit-ninja/` e `tests/` — em especial
   `server/` (X6, por `git diff --name-only`).
6. Pureza de `slicing.js`, `entities.js`, `rules.js`, `blade.js` (X7); `rAF` só em
   `loop.js` e `getContext('2d')` só em `render.js` (X8).
7. Constantes de tuning só em `js/config.js`, com os nomes usados na spec (X9).
8. Nenhuma engine/dependência introduzida (X10), contrato `window.__fruitNinja`
   completo — `getState`, `getConfig`, `setGamepadIndex`, `setSeed`, `spawnForTest`
   (X11) — e invariantes de `config.js` (X12: `0 <= deadzone < maxTilt <= 1`,
   `bladeMaxStepCss` derivado de `trailReferenceSpeedCssPerS`, `bombChance > 0`).

## Lint e formatação

- JavaScript: `prettier` local (aspas simples, ponto e vírgula) sobre
  `game/fruit-ninja/**/*.js` — **não é etapa de build**; os arquivos servidos são os
  versionados.
- Python dos testes novos: `ruff` + `black` (linha 100), como o resto de `tests/`.
- Comandos: `prettier --check "game/fruit-ninja/**/*.js"`, `ruff check tests`,
  `black --check tests`.

## Scripts utilitários

- Nenhum novo. O jogo sobe com o servidor já existente
  (`python server/main.py`), na rota `/game/fruit-ninja/`. Se algo parecer exigir
  alteração no servidor, é sinal de que a decisão de rota precisa ser revista na spec —
  não contornada no código.

## CI (não exigido pelo MVP)

Se houver CI, o pipeline é `prettier --check` → `ruff check` → `black --check` →
`pytest -q`, incluindo a faixa headless. Nenhum job pode exigir celular, driver de
gamepad ou GPU.
