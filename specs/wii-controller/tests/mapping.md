# Testes — Mapping (apontamento → posição) [F4, F5]

Alvo: `server/mapping.py` (puro, sem I/O). Rodam com `pytest -q`, sem driver, rede ou
celular. Prioridade máxima da suíte.

O modelo sob teste é o **apontamento absoluto na pegada vertical** (F4): a amostra de
orientação (`a`, `b`, `g`) converte na posição apontada (x, y) ∈ [-1, 1]², função pura
da amostra atual + calibração. Os casos usam **vetores de teste sintéticos da pegada
vertical**: orientação neutra = aparelho em pé na mão, topo (ponta) apontado para a
tela, calibrado; as deflexões descritas ("ponta para a direita 10°", "ponta para cima
15°", "rolagem 30° com ponta fixa") são definidas como tuplas (a, b, g) documentadas no
próprio arquivo de teste, derivadas da convenção do `DeviceOrientationEvent`.

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
- **M8b — Alpha nulo**: amostra com `a = null/None` (sensor sem yaw) não lança
  exceção e produz saída em [-1, 1] (comportamento degradado documentado — F4.4).
- **M10 — Suavização desligada**: com `SMOOTHING_ALPHA = 0` (desligada), a saída é a
  conversão direta sem atraso de amostras.
- **M11 — Suavização ligada**: com suavização ativa, um degrau de entrada converge
  para o valor final e nunca o ultrapassa (sem overshoot para média exponencial).
- **M12 — Continuidade na saturação**: a curva de saturação suave não tem salto:
  saída em `MAX_ANGLE_DEG - ε` difere de 1.0 por menos que uma tolerância pequena.

## Modelo de apontamento na pegada vertical [F4.3, F4.6, F4.7, F4.8, KPI-16..KPI-18]

- **M17 — Sentido dos eixos (KPI-18)**: dado o vetor sintético "ponta para a direita",
  então x > 0; "ponta para a esquerda" ⇒ x < 0; "ponta para cima" ⇒ y > 0; "ponta
  para baixo" ⇒ y < 0 (critério F4.6). *Reprova exatamente o eixo trocado/invertido
  que reaproveitar o mapeamento de paisagem produziria.*
- **M18 — Rolagem não move a mira (KPI-18)**: dado vetores que variam apenas a rolagem
  (torção no eixo longitudinal) mantendo a direção da ponta fixa, quando converter,
  então (x, y) permanece constante dentro da tolerância definida no teste (critério
  F4.7 — "para onde o infravermelho aponta?" é a única pergunta que importa).
- **M19 — Apontamento absoluto, independente de histórico (KPI-16)**: dado a mesma
  amostra final precedida por duas sequências de amostras completamente diferentes
  (suavização desligada), quando converter, então o (x, y) final é **exatamente
  igual** nos dois casos (critério F4.3). *É a propriedade que a implementação por
  velocidade viola: com integração, o resultado dependeria do caminho percorrido.*
- **M20 — Orçamento de resposta da suavização (KPI-17)**: com `SMOOTHING_ALPHA`
  padrão e amostras sintéticas a 60 Hz, um degrau de entrada atinge 90% do valor
  final em ≤ 100 ms (≤ 6 amostras) (critério F4.8).

## Rumble (fórmula de combinação) [F8]

- **M13 — Combinação de motores**: (0,0) → intensidade 0; (1,1) → 1; valores
  intermediários ficam em [0,1] e são monotônicos em cada motor.
- **M14 — Saturação de rumble**: intensidade > 1 ou < 0 e duração negativa são
  saturadas aos limites válidos sem exceção (critério F8.2).

## Calibração [F5]

- **M15 — Recalibração repetida**: calibrar em A, depois em B: apenas o offset B é
  aplicado (sem acúmulo). Critério F5.2.
- **M16 — Calibrar sem amostra prévia**: offset nulo aplicado, sem erro (F5.3).
