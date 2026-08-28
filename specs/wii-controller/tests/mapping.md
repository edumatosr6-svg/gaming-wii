# Testes — Mapping (apontamento → posição) [F4, F5]

Alvo: `server/mapping.py` (puro, sem I/O). Rodam com `pytest -q`, sem driver, rede ou
celular. Prioridade máxima da suíte.

O modelo sob teste é o **apontamento absoluto na pegada vertical** (F4): a amostra de
orientação (`a`, `b`, `g`) converte na posição apontada (x, y) ∈ [-1, 1]², função pura
da amostra atual + calibração. Os casos usam **vetores de teste sintéticos da pegada
vertical**: orientação neutra = aparelho em pé na mão, topo (ponta) apontado para a
tela, calibrado; as deflexões descritas ("ponta para a direita 10°", "ponta para cima
15°", "rolagem 30° com ponta fixa") são definidas como tuplas (a, b, g) documentadas no
próprio arquivo de teste, derivadas da convenção do `DeviceOrientationEvent`. A
procedência da amostra é irrelevante para estes testes: pelo contrato da F4, a fusão do
cliente entrega os ângulos na mesma convenção.

**Mudanças desta revisão (precisão):** a zona morta é **por eixo** e o limite é **por
direção** (perfil de calibração), substituindo o par `hypot` + ângulo máximo único; a
suavização é **adaptativa por velocidade**. Onde o comportamento antigo é reproduzível,
está preservado como caso de desligamento isolado (M27), não como padrão.

## Caminho feliz

- **M1 — Centro calibrado**
  Dado offset de calibração igual à orientação atual, quando converter a amostra,
  então o eixo resultante é exatamente (0.0, 0.0).
- **M2 — Zona morta por eixo**
  Dado um ângulo dentro da zona morta **do eixo correspondente** (ex.: metade de
  `DEAD_ZONE_YAW_DEG` no yaw, metade de `DEAD_ZONE_PITCH_DEG` no pitch), quando
  converter, então o eixo correspondente é 0.0. Ver também M24, que é o caso que
  distingue as duas zonas mortas.
- **M3 — Monotonicidade**
  Dado uma sequência de ângulos crescentes da borda da zona morta até o limite da
  direção (perfil ativo ou `DEFAULT_RANGE_DEG`), quando converter cada um, então os
  valores de saída são estritamente crescentes.
- **M4 — Saturação**
  Dado ângulos iguais e maiores que o limite da direção (ex.: limite, limite+10°, 180°),
  quando converter, então a saída é exatamente 1.0 (e -1.0 no lado negativo).
- **M5 — Simetria com perfil simétrico**
  Dado um perfil com alcances iguais nas quatro direções (o padrão), um ângulo θ e o
  ângulo -θ produzem saídas de mesmo módulo e sinais opostos. *Com perfil assimétrico a
  simetria em graus deixa de valer por construção — esse é o caso M25, e é o
  comportamento desejado, não uma regressão de M5.*
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
- **M10 — Suavização desligada**: com a suavização desligada, a saída é a conversão
  direta sem atraso de amostras.
- **M11 — Suavização ligada**: com suavização ativa, um degrau de entrada converge
  para o valor final e nunca o ultrapassa (sem overshoot para média exponencial).
- **M12 — Continuidade na saturação**: a curva de saturação suave não tem salto:
  saída no limite da direção menos ε difere de 1.0 por menos que uma tolerância pequena.

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
- **M20 — Orçamento de resposta da suavização (KPI-17)**: com a suavização **adaptativa**
  padrão e amostras sintéticas a 60 Hz, um degrau de entrada atinge 90% do valor
  final em ≤ 100 ms (≤ 6 amostras) (critério F4.8). *Passa porque o degrau é lido como
  movimento rápido e o filtro praticamente desliga; se a velocidade for estimada de
  forma que o degrau não a acione, este caso reprova.*

## Precisão: parâmetros por eixo, limites por direção e suavização adaptativa [F4, F15]

Os casos abaixo são a razão de existir desta revisão. Cada um reprova um jeito
específico de "melhorar a precisão" que na verdade desfaz a mudança.

- **M21 — Atenuação de tremor (KPI-7, F4.11)**: dado uma orientação fixa **fora da zona
  morta** somada a ruído sintético de média zero (amplitude documentada no teste) a
  60 Hz, quando converter a sequência com a suavização adaptativa padrão, então o
  desvio-padrão da saída é **≤ 40%** do desvio-padrão da mesma sequência com suavização
  desligada. *Roda na mesma configuração de M20: os dois juntos são a prova de que
  tremor e resposta deixaram de ser negociáveis entre si.*
- **M22 — Estado estacionário do filtro (F4.12, compatível com KPI-16)**: dado duas
  sequências de amostras completamente diferentes que terminam na mesma orientação,
  quando a orientação final é mantida por 300 ms de amostras, então as duas saídas
  ficam a menos de 1% do valor não suavizado — e iguais entre si. *Impede que a
  suavização adaptativa reintroduza dependência de histórico permanente, que é
  exatamente o defeito do modelo por velocidade.*
- **M22b — Ruído não é lido como movimento (F4.14)**: dado a mesma entrada ruidosa de
  M21, quando se lê o **fator efetivo e a velocidade estimada devolvidos pela conversão**
  (observabilidade exigida por F4 — não é leitura de estado interno), então o fator
  permanece na faixa "parado" (≥ 80% de `SMOOTH_ALPHA_STILL`); e, num degrau, ele cai
  para a faixa "rápido" (≤ 20% de `SMOOTH_ALPHA_STILL`) já na amostra do degrau.
  *Reprova a estimativa de velocidade por diferença entre amostras consecutivas, que
  interpretaria o tremor como gesto rápido e desligaria o filtro justamente quando ele é
  necessário — a regressão mais provável desta frente, e invisível pela saída sozinha.*
- **M23 — Simetria de precisão do processamento (KPI-19)**: dado ruído sintético de
  **mesma amplitude** aplicado ao yaw e ao pitch, a partir do mesmo deslocamento
  normalizado e com alcances iguais, quando converter, então `std(x)/std(y)` fica entre
  0.67 e 1.5. *Verifica que o processamento não introduz assimetria; a assimetria real
  do sensor é medida no aparelho (L13).*
- **M24 — Zonas mortas diferentes por eixo (F4.9)**: dado um deslocamento θ com
  `DEAD_ZONE_PITCH_DEG < θ < DEAD_ZONE_YAW_DEG`, quando aplicado só ao yaw então
  x == 0.0; quando aplicado só ao pitch então y != 0.0. *Reprova a volta da zona morta
  radial única — com um raio só, os dois casos dariam o mesmo resultado.*
- **M25 — Limites assimétricos por direção (F4.10, F12.4)**: dado um perfil com
  `right = 25°` e `left = 15°`, quando converter +25° e -15° de yaw, então as saídas são
  +1.0 e -1.0; e converter +15° e -15° produz **módulos diferentes**. *Reprova qualquer
  normalização que comprima os quatro limites de volta a um raio único (`hypot`).*
- **M26 — Perfil ausente, degenerado ou parcial**: com perfil ausente, os quatro
  alcances são `DEFAULT_RANGE_DEG`; com alcance fora de `RANGE_MIN_DEG`–`RANGE_MAX_DEG`,
  zero ou negativo, a conversão não lança exceção, não produz divisão por zero e usa o
  padrão daquela direção; com apenas dois alcances presentes, os outros dois usam o
  padrão.
- **M27 — Desligamento isolado reproduz o comportamento anterior (F4.13, F15)**: com
  `ADAPTIVE_SMOOTHING_ENABLED = False`, zonas mortas iguais nos dois eixos, alcances
  iguais nas quatro direções e sensibilidades iguais, a saída para um conjunto de
  amostras de referência coincide com a do modelo anterior a esta revisão dentro da
  tolerância documentada no teste. *É o que permite atribuir uma regressão a uma frente
  específica.*
- **M28 — `dt` hostil no filtro adaptativo**: sequências com `t` ausente, repetido,
  regredindo ou com salto maior que 1 s não lançam exceção, não congelam o filtro e não
  produzem NaN; o filtro cai para o tempo de chegada como base (F4).

## Rumble (fórmula de combinação) [F8]

- **M13 — Combinação de motores**: (0,0) → intensidade 0; (1,1) → 1; valores
  intermediários ficam em [0,1] e são monotônicos em cada motor.
- **M14 — Saturação de rumble**: intensidade > 1 ou < 0 e duração negativa são
  saturadas aos limites válidos sem exceção (critério F8.2).

## Calibração [F5, F12 — lado servidor]

A captura da janela, a média circular e a rejeição de janela instável são do **cliente**
(F5, "Onde roda") e estão em tests/pointing-client.md (PC1–PC6). Aqui ficam apenas os
casos do servidor.

- **M15 — Recalibração repetida**: calibrar em A, depois em B: apenas o offset B é
  aplicado (sem acúmulo). Critério F5.2.
- **M16 — Calibrar sem amostra prévia**: offset nulo aplicado, sem erro (F5.3).
- **M16b — Perfil recebido substitui o anterior por inteiro**: aplicar perfil com
  alcances A, depois perfil com alcances B: valem os de B, sem mistura entre os dois.
- **M16c — Recalibrar descarta o estado do filtro**: após recalibrar, a primeira amostra
  na nova posição neutra produz (0, 0) sem arrasto da posição anterior (invariante de
  `SessionState`).
