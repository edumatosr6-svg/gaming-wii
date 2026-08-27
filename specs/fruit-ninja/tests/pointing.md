# Testes — Apontamento absoluto e calibração [F1, F12, KPI-1]

Faixa: **lógica pura** (`node --test`, sem navegador, sem celular), exceto onde
indicado. Esta é a faixa que reprova a implementação por velocidade — o requisito nº 1
do `descriptions.md`.

## Automatizados — `input.js` (`axesToTarget`, função pura)

- **P1 — Path-independence (critério do requisito nº 1)**:
  - Dado o conjunto de caminhos A = [(0,0), (0.5,0.5), (−0.8,0.2), (0.3,−0.4)] e
    B = [(0,0), (−1,−1), (1,1), (0.3,−0.4)] — caminhos distintos, mesma amostra final.
  - Quando `axesToTarget` é aplicada a cada amostra em ordem, com a mesma calibração e
    o mesmo `playfield`.
  - Então o resultado da última amostra é **idêntico** (igualdade exata de ponto
    flutuante) nos dois caminhos.
  - Reforço: uma implementação de referência por **velocidade**
    (`pos += axis * gain * dt`) deve **falhar** este teste — o teste inclui essa
    verificação negativa como documentação executável de que P1 discrimina os dois
    comportamentos.

- **P2 — Ausência de memória**: `axesToTarget` chamada 100 vezes com a mesma entrada,
  intercalada com entradas arbitrárias, devolve sempre o mesmo valor; a função não
  possui estado de módulo (chamar em ordem embaralhada dá os mesmos resultados por
  entrada).

- **P3 — Neutro é centro**: dada calibração `(a, b)` e amostra `(a, b)`, o alvo é o
  centro do `playfield`, com diferença `<= pointingToleranceCss`.

- **P4 — Bordas, cantos e clamp**: com a fórmula única de F1 (remoção da zona morta
  preservando a direção + normalização por eixo por `maxTilt - deadzone`), as amostras
  recentradas `(±maxTilt, 0)` e `(0, ±maxTilt)` projetam exatamente as bordas
  direita/esquerda/inferior/superior do `playfield`; `(±maxTilt, ±maxTilt)` projeta os
  cantos; amostras além de `maxTilt` (ex. `±1.0` com `maxTilt = 0.7`) ficam **na**
  borda, nunca fora do `playfield`. Orientação verificada: eixo Y positivo do gamepad
  corresponde a Y maior no Canvas (para baixo), sem inversão. Também verificado que a
  configuração respeita `0 <= deadzone < maxTilt <= 1`.

- **P5 — Zona morta contínua**: com `m = deadzone − ε` o alvo é o centro exato; com
  `m = deadzone + ε` o deslocamento em relação ao centro tende a 0 conforme `ε → 0`
  (testado com `ε` = 1e−3, 1e−4, 1e−5: deslocamento decrescente e `< 1 px CSS`). Um
  mapeamento que ignora a zona morta sem remover o offset (salto ao sair dela) falha.

- **P6 — Convergência da suavização**: simulando o filtro com `dt = 1/60`, partindo de
  duas posições iniciais opostas (canto superior esquerdo e canto inferior direito) e
  aplicando a mesma inclinação constante, ambas convergem para o mesmo ponto, com
  diferença `<= pointingToleranceCss`, em `<= pointingSettleMs` de tempo simulado. Um
  filtro com termo de velocidade/acúmulo não converge e falha.

- **P7 — Sem divergência com entrada constante**: mantida a inclinação por 30 s
  simulados, a posição não sai de uma vizinhança de `pointingToleranceCss` do alvo (não
  há deriva — o modo de falha característico da interpretação por velocidade).

## Automatizados — calibração (`input.js`, puro) [F12]

- **P8 — Calibrar recentra**: gravada `calibration = (a, b)`, a amostra `(a, b)` mapeia
  para o centro do `playfield` (`<= pointingToleranceCss`).
- **P9 — Deslocamento consistente da área alcançável**: com `calibration = (a, b)`, a
  amostra `(a + d, b + e)` produz a mesma posição que a amostra `(d, e)` produziria com
  `calibration = (0, 0)`, para 20 pares `(d, e)` amostrados na faixa válida.
- **P10 — Critério de estabilidade**: dada uma sequência de posições dentro de
  `calibrationStableRadiusCss` por `calibrationStableMs − δ`, o estado é "instável" e o
  início é bloqueado; ao completar `calibrationStableMs`, passa a "estável" e libera. Um
  desvio além do raio no meio da janela reinicia a contagem.
- **P11 — Recalibrar em partida**: aplicar nova calibração com `score`/`lives`
  definidos não altera nenhum dos dois e recentra a lâmina.

## Estáticos

- **P12 — Fonte única de input**: `navigator.getGamepads` aparece somente em
  `game/fruit-ninja/js/input.js` (F1.6). Ver também `tests/static-constraints.md`.

## Integração em navegador (referência cruzada)

O comportamento fim-a-fim do apontamento com o gamepad substituído por dublê está em
`tests/integration-browser.md` (B3, B4) — a faixa pura não prova que o jogo **liga** a
função ao que aparece na tela.
