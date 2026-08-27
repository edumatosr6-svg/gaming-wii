# Testes — Arremesso, trajetória e metades [F3, KPI-7]

Faixa: **lógica pura** (`node --test`). `entities.js` recebe estado e devolve estado.

## Automatizados — `entities.js`

- **E1 — Determinismo com semente**: mesma semente + mesma sequência de passos ⇒
  estados serializados idênticos em duas execuções (pré-condição de E2 e de R9).
- **E2 — Independência da taxa de quadros (KPI-7)**: simular 2 s com `dt = 1/60` e com
  `dt = 1/144`, mesma semente e mesmos instantes de arremesso ⇒ posições finais de
  todas as entidades dentro de `dtToleranceCss`.
- **E3 — Spawn na base**: toda entidade nasce abaixo da borda inferior da área jogável,
  com `vel.y` negativo (subindo), e com posição X dentro do `playfield`.
- **E4 — Trajetória balística**: com gravidade constante, a posição no instante `t`
  corresponde a `p0 + v0·t + g·t²/2` dentro de `dtToleranceCss` (integração correta e
  sem termos extras).
- **E5 — Ápice dentro da tela**: em 50 arremessos por nível (semente fixa), o ápice fica
  dentro do `playfield` (não sai pelo topo) e o tempo de voo é `>= minAirtimeS` (F3.4).
- **E6 — Variedade**: em 50 arremessos com a mesma semente, X inicial, ângulo e força
  assumem `>= 10` valores distintos cada, todos dentro das faixas do nível (F3.3).
- **E7 — Miss**: fruta não cortada que cruza a borda inferior descendo é marcada
  `missed` exatamente uma vez e removida no passo seguinte; uma fruta ainda subindo
  abaixo da borda **não** é marcada `missed` (borda do caso de spawn).
- **E8 — Metades**: cortar uma fruta cria exatamente 2 metades; a média vetorial das
  velocidades é igual à velocidade da fruta no instante do corte
  (`<= dtToleranceCss` de erro), e as componentes perpendiculares ao corte têm sinais
  opostos e módulos iguais (F3.6).
- **E9 — Metades são inertes**: metades não aparecem na lista testada por `slicing.js`,
  não pontuam, não custam vida, e são removidas ao sair do `playfield`.
- **E10 — Limite de simultâneas**: o número de entidades ativas nunca excede
  `maxSimultaneous` do nível corrente; se o limite está atingido, o arremesso é adiado,
  não descartado silenciosamente com estado inconsistente.
- **E11 — Pureza**: nenhuma referência a `Math.random`, `Date`, `performance`,
  `document`, `window` ou Canvas em `entities.js`; o PRNG vem do estado (F3.7).
- **E12 — Imutabilidade**: o estado passado como argumento não é mutado (comparação com
  uma cópia profunda feita antes da chamada).
