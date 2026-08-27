# Testes — Game loop e passo de tempo fixo [F13, KPI-7]

Faixa: **lógica pura** (`node --test`) para o acumulador e a interpolação — a função de
avanço do loop deve ser exportada de forma testável sem `requestAnimationFrame` (recebe
`delta` como argumento). O `rAF` em si é exercitado na faixa de navegador
(`tests/integration-browser.md`).

## Automatizados

- **L1 — Equivalência 60 Hz vs 144 Hz (KPI-7)**: mesma partida (mesma semente, mesmas
  amostras de input reamostradas para cada taxa), avançada por 2 s de tempo simulado
  com quadros de 1/60 s e de 1/144 s ⇒ número de passos fixos diferindo em **no máximo
  1** (regra única de F13.1, a mesma de L5) e estados finais dentro de
  `dtToleranceCss` (= 1 px CSS).
- **L2 — Segmentos contíguos**: para um quadro que gera `n >= 2` passos fixos, os
  segmentos de lâmina satisfazem `segmento[i].fim == segmento[i+1].inicio` (igualdade
  exata), `segmento[0].inicio == amostra do quadro anterior` e
  `segmento[n−1].fim == amostra do quadro atual`. Uma implementação que usa a mesma
  posição de lâmina em todos os passos do quadro (segmentos degenerados) falha.
- **L3 — Cobertura sem lacuna**: a soma dos comprimentos dos segmentos do quadro é igual
  à distância entre as duas amostras (interpolação linear, sem buraco).
- **L4 — Clamp de delta**: um quadro com `delta = 2 s` executa no máximo
  `maxFrameDeltaS / fixedStepS` passos (sem espiral da morte) e a simulação continua
  consistente no quadro seguinte.
- **L5 — Acumulador**: o resto de tempo não consumido é preservado entre quadros
  (somando `delta`s fracionários, o número total de passos após 1 s é
  `1 / fixedStepS ± 1` — mesma tolerância de L1 e de F13.1, não há duas regras).
- **L6 — Sem lógica fora do passo fixo**: avançar o loop com `delta = 0` não altera o
  estado de jogo (nenhuma entidade se move, `elapsedS` não muda).
- **L7 — Pausa por perda de gamepad**: com `connected = false`, nenhum passo fixo é
  executado — `elapsedS`, entidades, `score` e `lives` ficam idênticos após vários
  quadros (F11.3).
