# Testes — Rastro da lâmina [F2, KPI-3]

Faixa: **lógica pura** (`node --test`) para o histórico; a aparência do rastro é
procedimento manual com critério observável (M3).

## Automatizados — `blade.js`

- **T1 — Pureza e imutabilidade**: `pushSample(state, {x, y, t})` devolve novo estado
  sem mutar o recebido; não lê relógio (recebe `t`), não toca DOM/Canvas.
- **T2 — Expiração por idade**: amostras com idade `> trailDurationMs` em relação à mais
  recente são descartadas; a mais recente nunca é descartada, mesmo que o intervalo
  entre quadros exceda `trailDurationMs`.
- **T3 — Limite de amostras**: com quadros muito rápidos, `samples.length` nunca excede
  `maxTrailSamples`, e o descarte por limite remove sempre a **mais antiga** (ordem
  crescente de `t` preservada).
- **T4 — Faixa de `trailDurationMs`**: o valor em `config.js` está entre 150 ms e
  400 ms (F2.3).
- **T5 — Continuidade (KPI-3)**: dada uma trajetória simulada de velocidade constante
  `trailReferenceSpeedCssPerS` (800 px CSS/s) amostrada a 60 Hz, a distância entre
  amostras consecutivas retidas é `<= bladeMaxStepCss` para todas elas (0 saltos), com
  `bladeMaxStepCss = 1.5 * trailReferenceSpeedCssPerS / 60 = 20 px CSS`. O teste inclui
  a verificação negativa: injetando as mesmas amostras e descartando uma a cada duas
  (decimação), os passos passam a ~26,7 px e o critério **reprova** — é assim que se
  sabe que T5 não é vacuoso.
- **T6 — Sem interpolação inventada**: o rastro retornado para desenho contém
  exatamente as amostras empilhadas — nem mais pontos (suavização que esconde engasgo),
  nem menos (F2.6). Verificado comparando a lista de saída com a sequência injetada.
- **T7 — Limpeza no retorno do controle**: após o evento de reconexão (F11/P5), o
  histórico é esvaziado e a primeira amostra seguinte não gera segmento com a posição
  antiga (evita corte espúrio) — verificado pela ausência de segmento entre a última
  amostra pré-pausa e a primeira pós-pausa.
- **T8 — Velocidade da lâmina**: `speedCssPerS` calculada entre as duas amostras mais
  recentes é `|Δp| / Δt`; com `Δt = 0` retorna 0, sem `NaN` nem `Infinity`.
