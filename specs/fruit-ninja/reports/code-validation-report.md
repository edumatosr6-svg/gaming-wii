# Code Validation Report — fruit-ninja

**Veredito: SUCCESS**

Iteração 2 do Coding Loop, após retorno `FAIL CODE` do Testing Loop (caso B13). Revisão
estática — nenhum teste de comportamento executado nesta etapa — de `game/fruit-ninja/`
contra `software-specs.md`, `coding-directives.md` e `tools/`.

## Mudança desta iteração

Um único arquivo alterado: `game/fruit-ninja/js/main.js`.

- Nova função `destravarAudio()` (`main.js:52-58`): chama `unlock()` dentro de `try/catch`.
- `hooks.onCalibrate` e `hooks.onStart` (`main.js:63-68`) passam a chamá-la.

**Por que corrige a causa raiz e não o sintoma:** `loop.js:157/183/186` já emitia
`onCalibrate`/`onStart` nas bordas de subida de `A` e `Start`, mas `main.js` não
implementava esses dois hooks — caíam no `NO_HOOKS`/`noop` de `loop.js:50`. O áudio
dependia exclusivamente do listener de `pointerdown`, inalcançável para quem joga só com o
celular (F12.5 proíbe mouse/teclado como jogabilidade). O gancho que faltava era o do
próprio gamepad, e é ele que passou a ser ligado. O listener de `pointerdown` foi mantido.

**F9.3/B11 preservados:** `unlock()` já trata a própria falha internamente
(`audio.js:22-26`); o `try/catch` de `destravarAudio` é a garantia estrutural de que nem
uma exceção inesperada suba para dentro do quadro. Usa `console.warn`, não `console.error`,
para não sujar o caminho normal exigido por B1.

## Cobertura de specs

| Feature | Situação | Onde |
|---|---|---|
| F1 apontamento absoluto | implementado | `js/input.js:axesToTarget`, `smoothTowards`, `pollGamepads` |
| F2 rastro | implementado | `js/blade.js`, `js/render.js:drawTrail` |
| F3 arremesso e metades | implementado | `js/entities.js` |
| F4 corte por movimento | implementado | `js/slicing.js:detectSlices` |
| F5 bombas | implementado | `js/entities.js`, `js/rules.js:registerBombSlice` |
| F6 combos | implementado | `js/rules.js:updateStroke`, `registerFruitSlice` |
| F7 vidas e progressão | implementado | `js/rules.js`, `config.levels` |
| F8 pontuação e recorde | implementado | `js/rules.js:endGame` (só memória) |
| F9 rumble | implementado | `js/rumble.js` |
| **F10 áudio** | **implementado — agora alcançável pelo gamepad** | `js/audio.js` + `js/main.js:destravarAudio`, `hooks.onCalibrate/onStart` |
| F11 aguardando controle | implementado | `js/loop.js:advanceFrame` |
| F12 calibração | implementado | `js/input.js`, `js/loop.js` (bordas de `A`/`Start`) |
| F13 loop de passo fixo | implementado | `js/loop.js` |
| F14 entrega estática e diagnóstico | implementado | `index.html`, `js/main.js:window.__fruitNinja` |
| P1–P5 | implementados | `js/main.js` + `js/loop.js:advanceFrame` |

Data models inalterados nesta iteração e conferidos: `Config` com as 28 constantes da spec;
`BladeState`, `Entity`, `Half`, `GameState` e `SliceResult` completos.

## Verificações estáticas X1–X12

Todas reconferidas após a mudança — **as 12 passam**:

- **X1**: `navigator` não aparece em nenhum arquivo além de `js/input.js`; a chamada real
  `navigator.getGamepads()` está lá.
- **X7**: `slicing.js`, `entities.js`, `rules.js`, `blade.js` — 0 ocorrências dos termos
  proibidos. A mudança foi em `main.js`, que não é módulo puro.
- **X8**: `requestAnimationFrame` só em `js/loop.js`; `getContext('2d')` só em
  `js/render.js`.
- **X9**: `destravarAudio` não introduz literal de tuning nenhum; o único literal numérico
  de `main.js` continua sendo `gamepadIndex = 0`, que é índice, não ajuste.
- **X11**: `window.__fruitNinja` segue definido só em `js/main.js`, com as cinco funções
  exigidas.
- X2, X3, X4, X5, X6, X10, X12 inalterados pela mudança e reconferidos.

Todos os módulos importam sem erro (`import('./game/fruit-ninja/js/loop.js')` resolve a
árvore inteira). A checagem automatizada correspondente
(`tests/test_fruit_ninja_static.py`, 15 testes) passa integralmente.

## Observações

- **Ressalva de plataforma que a correção não resolve sozinha:** num navegador *headed* com
  política de autoplay estrita, entrada de gamepad **não** conta como ativação do usuário, e
  o `AudioContext` pode ficar em `suspended` até um gesto real de ponteiro/teclado. No
  Chromium headless da suíte o contexto nasce `running`, então B13 passa a ser verificável;
  no produto real isso continua sendo uma **lacuna de F10.2**, que não diz como o áudio
  destrava num jogo controlado só por gamepad. Registrado no `testing-report.md` como
  recomendação de revisão de spec (uma afordância única de "clique para habilitar o som" não
  conflitaria com F12.5, que proíbe mouse/teclado como *jogabilidade*, não como
  consentimento).
- **`levels[].launchSpeedRange` é fração, não px/s** (`js/entities.js:launchLimits`) —
  suposição sobre spec omissa, mantida da iteração anterior. E5/E6 passam nessa leitura nos
  6 níveis.
- **`audioContextState()` é uma sexta função** do contrato de diagnóstico, além das cinco
  exigidas por F14/X11, porque B13 precisa observar o estado do áudio e ele não cabe no
  `GameState`. A leitura correta de "expõe" é inclusão, não igualdade de conjunto.
- `hudHeightCss = 56` continua duplicado em `css/style.css:.hud` — duplicação inevitável
  entre layout CSS e geometria do `playfield`, comentada nos dois lados.
- **Esta validação é estática.** A prova de que o defeito B13 foi de fato eliminado depende
  do Testing Loop, em especial da faixa de navegador headless.
