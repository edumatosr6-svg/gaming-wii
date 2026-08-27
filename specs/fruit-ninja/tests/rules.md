# Testes — Combos, vidas, dificuldade e pontuação [F6, F7, F8, KPI-5]

Faixa: **lógica pura** (`node --test`).

## Automatizados — combos [F6]

- **R1 — Combo no mesmo traço**: três frutas cortadas dentro de um traço contínuo
  (velocidade sempre `>= minSliceSpeedCssPerS`) somam `basePoints * (1 + 2 + 3)`.
- **R2 — Traços distintos**: as mesmas três frutas cortadas com pausas
  `> comboBreakMs` entre elas somam `basePoints * 3`.
- **R3 — Bordas da quebra de traço**: com a velocidade medida por passo fixo (mesma
  medida de F4/S3) e `belowThresholdMs` acumulando `fixedStepS` por passo abaixo do
  limiar: queda abaixo do limiar por `comboBreakMs − fixedStepS` **não** quebra o traço
  (o combo continua); por `comboBreakMs + fixedStepS` quebra (o próximo corte volta a
  valer `basePoints`). Um passo acima do limiar zera `belowThresholdMs`.
- **R4 — Contador exibido**: `comboCount` é o número de frutas já cortadas no traço
  corrente, nunca negativo, e volta a 0 na quebra.
- **R5 — Pureza da regra de traço**: a decisão de quebra usa o histórico de velocidade
  recebido como argumento; `rules.js` não consulta relógio nem `Date`.

## Automatizados — vidas e progressão [F7]

- **R6 — Miss custa uma vida**: cada fruta `missed` decrementa `lives` em exatamente 1;
  reprocessar o mesmo evento não decrementa de novo.
- **R7 — Fim por vidas**: `lives` chegando a 0 ⇒ `screen = 'gameOver'`,
  `gameOverReason = 'no-lives'`, no mesmo passo; `lives` nunca fica negativo.
- **R8 — Bomba não cortada não custa vida** (referência cruzada S14).
- **R9 — Curva de dificuldade**: para todo `N` em `0..maxLevel−1`, os parâmetros do
  nível `N+1` são não-menos-difíceis em todos os eixos (`spawnIntervalS` não aumenta;
  `maxSimultaneous`, `launchSpeedRange` e `bombChance` não diminuem) e estritamente mais
  difíceis em pelo menos dois.
- **R10 — Nível depende só do tempo**: `level = min(floor(elapsedS / levelDurationS),
  maxLevel)`; simular a mesma duração com `dt = 1/60` e `dt = 1/144` dá o mesmo nível
  em todos os instantes de amostragem.
- **R11 — Saturação**: acima de `maxLevel`, os parâmetros permanecem constantes.

## Automatizados — pontuação [F8]

- **R12 — Monotonicidade**: `score` nunca decresce durante uma partida.
- **R13 — Recorde de sessão**: ao fim da partida, `highScore = max(highScore, score)`;
  uma partida pior não rebaixa o recorde.
- **R14 — Sem persistência**: nenhuma escrita em `localStorage`/`sessionStorage`/cookie
  (verificação estática em `tests/static-constraints.md`, X4); em navegador, recarregar
  a página zera o recorde (`tests/integration-browser.md`, B8).

## Automatizado — estratégia degenerada [KPI-5]

- **R15 — Agitar não compensa**: simulação determinística de 60 s de partida, com o
  mesmo conjunto de sementes (10 sementes), comparando duas políticas de lâmina:
  - *varredura aleatória em alta velocidade* (posição alvo sorteada a cada 100 ms,
    sempre acima do limiar de velocidade);
  - *apontamento deliberado* (lâmina persegue a fruta ativa mais próxima e desvia de
    bombas).
  - Então: em `>= 9` das 10 sementes, a pontuação da varredura aleatória é `< 50%` da
    pontuação do apontamento deliberado (a bomba encerra a partida cedo).
  - Este teste é o que impede o jogo de virar um teste de agitação — se ele falhar, a
    penalidade de bomba ou a `bombChance` estão frouxas demais.
