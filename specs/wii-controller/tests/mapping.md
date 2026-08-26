# Testes — Mapping (inclinação → eixo) [F4, F5]

Alvo: `server/mapping.py` (puro, sem I/O). Rodam com `pytest -q`, sem driver, rede ou
celular. Prioridade máxima da suíte.

## Caminho feliz

- **M1 — Centro calibrado**
  Dado offset de calibração igual à orientação atual, quando converter a amostra,
  então o eixo resultante é exatamente (0.0, 0.0).
- **M2 — Zona morta**
  Dado um ângulo dentro da zona morta (ex.: metade de `DEAD_ZONE_DEG`), quando
  converter, então o resultado é (0.0, 0.0) em ambos os eixos.
- **M3 — Monotonicidade**
  Dado uma sequência de ângulos crescentes da borda da zona morta até `MAX_ANGLE_DEG`,
  quando converter cada um, então os valores de saída são estritamente crescentes.
- **M4 — Saturação**
  Dado ângulos iguais e maiores que `MAX_ANGLE_DEG` (ex.: máximo, máximo+10°, 180°),
  quando converter, então a saída é exatamente 1.0 (e -1.0 no lado negativo).
- **M5 — Simetria**
  Dado um ângulo θ e o ângulo -θ, quando converter ambos, então as saídas têm mesmo
  módulo e sinais opostos.
- **M6 — Offset de calibração aplicado antes de tudo**
  Dado offset de 20° e amostra de 20°, então saída (0,0); dado amostra de
  20° + zona morta + δ, então saída positiva pequena.

## Bordas e falhas

- **M7 — Valores extremos**: ±180°, ±90°, 0° não lançam exceção e ficam em [-1, 1].
- **M8 — Entradas inválidas**: NaN, None/null e strings numéricas inválidas resultam
  em saída neutra (0,0) ou erro controlado documentado — nunca exceção não tratada
  nem valor fora de [-1, 1].
- **M9 — Determinismo**: a mesma amostra convertida duas vezes com a mesma config
  produz exatamente o mesmo resultado (sem estado escondido, exceto o filtro de
  suavização quando ativado, que deve ser um objeto explícito com estado próprio).
- **M10 — Suavização desligada**: com `SMOOTHING_ALPHA = 0` (desligada), a saída é a
  conversão direta sem atraso de amostras.
- **M11 — Suavização ligada**: com suavização ativa, um degrau de entrada converge
  para o valor final e nunca o ultrapassa (sem overshoot para média exponencial).
- **M12 — Continuidade na saturação**: a curva de saturação suave não tem salto:
  saída em `MAX_ANGLE_DEG - ε` difere de 1.0 por menos que uma tolerância pequena.

## Rumble (fórmula de combinação) [F8]

- **M13 — Combinação de motores**: (0,0) → intensidade 0; (1,1) → 1; valores
  intermediários ficam em [0,1] e são monotônicos em cada motor.
- **M14 — Saturação de rumble**: intensidade > 1 ou < 0 e duração negativa são
  saturadas aos limites válidos sem exceção (critério F8.2).

## Calibração [F5]

- **M15 — Recalibração repetida**: calibrar em A, depois em B: apenas o offset B é
  aplicado (sem acúmulo). Critério F5.2.
- **M16 — Calibrar sem amostra prévia**: offset nulo aplicado, sem erro (F5.3).
