# Testes — Integração em navegador headless [F1, F4, F9–F14, KPI-1, KPI-9]

Faixa **obrigatória na execução padrão** (`pytest -q`), com **Playwright + Chromium**,
já instalados e configurados no projeto. Não pode ser marcada como opcional nem pulada
em silêncio: sem o navegador, a suíte **falha** com a instrução de instalação
(`playwright install chromium`).

Por que esta faixa existe: neste repositório já houve suíte verde de lógica pura com o
produto inutilizável — toda a faixa de defeitos vivia na integração (DOM, ligação entre
input e tela, carregamento dos módulos). Lógica pura não prova que o jogo **liga** as
peças.

## Ambiente do teste

- Servidor: o servidor real do `wii-controller` em loopback, sem TLS, com gamepad fake
  (mesmos fixtures de `tests/conftest.py`). A página é carregada da rota real
  `/game/fruit-ninja/`. **Nenhuma alteração no servidor** é feita para estes testes.
- **Dublê de gamepad** (contrato obrigatório, injetado com `add_init_script` antes de
  qualquer script da página): substitui `navigator.getGamepads` por uma função que
  devolve `[gp]`, com
  `gp = { index: 0, id: 'Fake XInput', connected: true, mapping: 'standard', axes: [0,0,ax,ay], buttons: [...], timestamp, vibrationActuator }`.
  O teste controla `ax`, `ay` e os botões via `window.__fakeGamepad.set({...})`.
  O evento `gamepadconnected` **não** é disparado pelo dublê em B2 — o jogo tem que
  descobrir o pad por polling (F1.7).
- Leitura de estado: `window.__fruitNinja.getState()` (contrato de diagnóstico, F14).
- Nenhum teste exige celular, driver de gamepad ou GPU.

## Casos

- **B1 — Carrega limpo (KPI-9)**: dado o servidor no ar, quando a página
  `/game/fruit-ninja/` é aberta, então o status é 200, `window.__fruitNinja` existe,
  a lista de erros de console está vazia e nenhuma requisição de **recurso do jogo**
  falha (0 respostas `>= 400` para HTML/CSS/JS do jogo). `/favicon.ico` é ignorado por
  decisão explícita de F14.2 — corrigi-lo exigiria mexer no servidor.
- **B2 — Aguardando controle (F11.1)**: com `navigator.getGamepads` devolvendo lista
  vazia, a tela visível é `aguardando`, com texto de instrução não vazio; nenhum erro
  de console. Ao passar o dublê a devolver o pad (sem disparar `gamepadconnected`), a
  tela muda para `calibracao` em `<= 500 ms` de relógio real.
- **B3 — Apontamento absoluto fim-a-fim (KPI-1)**: dado o jogo em `jogando` e
  calibrado no centro, quando os eixos vão por dois caminhos distintos
  (A: centro → canto superior esquerdo → alvo; B: centro → canto inferior direito →
  alvo) e param no mesmo valor de eixo, então após `<= pointingSettleMs` a
  `state.blade.pos` é a mesma nos dois caminhos, com diferença `<= 1 px CSS`.
  **Este é o caso que reprova a implementação por velocidade no produto real**, não só
  na função pura.
- **B4 — Neutro volta ao centro**: levar os eixos ao extremo, mantê-los 1 s e devolvê-los
  ao valor calibrado ⇒ `blade.pos` volta ao centro do `playfield`
  (`<= pointingToleranceCss`), sem deriva residual.
- **B5 — Calibração muda a área alcançável (F12)**: com os eixos em `(0.3, 0.0)`,
  pressionar `A` (calibrar) ⇒ `blade.pos` converge para o centro; devolver os eixos a
  `(0, 0)` ⇒ a lâmina vai para a esquerda do centro, na proporção prevista por F1.
- **B6 — Bloqueio de início por instabilidade (F12.3)**: oscilando os eixos além de
  `calibrationStableRadiusCss`, `Start` não inicia a partida (tela continua
  `calibracao`); mantendo estável por `calibrationStableMs`, `Start` inicia
  (`screen = 'jogando'`).
- **B7 — Corte fim-a-fim (F4)**: com `window.__fruitNinja.setSeed(42)` antes de
  iniciar a partida (determinismo) e uma fruta colocada por
  `spawnForTest('fruit', {pos, vel})` numa posição conhecida, dirigir os eixos para
  atravessá-la rapidamente ⇒ `score` aumenta, a entidade fica `sliced`, duas metades
  aparecem em `state.halves` e `fruitsSliced` incrementa em 1. Nenhum erro de console
  durante o corte.
- **B8 — Recorde só em memória (F8.3)**: após uma partida com `score > 0`,
  `state.highScore == score`; recarregar a página ⇒ `highScore == 0`. Verificar
  também que `localStorage` e `sessionStorage` ficam vazios após a partida.
- **B9 — Pausa e retomada por perda do gamepad (F11.3/F11.4)**: em partida, fazer o
  dublê devolver lista vazia ⇒ tela `aguardando`, e após 1 s de relógio real
  `elapsedS`, `score`, `lives` e as posições das entidades estão inalterados. Ao
  devolver o pad, a tela volta a `jogando` com o mesmo `score`/`lives` e o rastro
  vazio (T7), sem corte espúrio (nenhum aumento de `score` no quadro do retorno).
- **B10 — Exatamente uma tela visível (F11.5)**: em cada uma das quatro transições
  (`aguardando → calibracao → jogando → gameOver`), exatamente um elemento de tela está
  visível no DOM (checagem por geometria/visibilidade real, não só por classe CSS).
- **B11 — Rumble não derruba o quadro (F9.3)**: injetar `vibrationActuator.playEffect`
  que lança exceção ⇒ ao cortar uma fruta, `score` aumenta, o loop continua avançando
  (`elapsedS` cresce) e no máximo um aviso aparece no console (nenhum erro não
  tratado).
- **B12 — Sem assets externos (F10.1/F14.4)**: durante toda a sessão de teste, nenhuma
  requisição para host diferente do servidor de teste e nenhuma requisição a arquivo
  `.mp3`/`.wav`/`.ogg`/`.png`/`.jpg`.
- **B13 — Áudio antes do gesto (F10.2)**: chamar o caminho de som antes de qualquer
  interação não gera erro de console nem exceção não tratada; após o primeiro gesto, o
  `AudioContext` está em `running`.
- **B14 — Game over por bomba (F5.1)**: colocar uma bomba em posição conhecida com
  `spawnForTest('bomb', {pos, vel})` e dirigir a lâmina para atravessá-la ⇒
  `screen = 'gameOver'` e `gameOverReason = 'bomb'` imediatamente, mesmo com
  `lives > 0`; a tela de game over exibe o motivo em português.
- **B15 — Diagnóstico é somente leitura (F14.5)**: mutar o objeto devolvido por
  `getState()` (ex.: `state.score = 999`) não altera o `score` real na leitura
  seguinte; `spawnForTest` não altera `level` nem `elapsedS` (F14.7).
- **B16 — Sem mouse/teclado como jogabilidade (F12.5)**: mover o mouse sobre o canvas e
  pressionar setas/teclas não altera `blade.pos` nem inicia a partida.
- **B17 — Calibrar não gera rede (F12.6)**: com um interceptador de requisições ativo,
  pressionar `A` (calibrar) na tela de calibração e em partida não produz **nenhuma**
  requisição de rede — a calibração é local ao jogo.

## Fora do alcance desta faixa

Sensação de latência, distinguibilidade sonora, fluidez percebida e qualidade do
apontamento com o celular real: procedimentos manuais em `tests/manual.md`, com critério
observável.
