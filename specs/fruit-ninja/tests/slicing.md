# Testes — Corte por movimento [F4, F5, KPI-6]

Faixa: **lógica pura** (`node --test`). O corte é a regra mais sutil do jogo: é
intersecção **segmento × círculo entre quadros**, não teste de posição no quadro atual.
Testar só a posição passa em teste e falha no jogo (tunneling), que é o caso de uso
principal.

## Automatizados — `slicing.js`

- **S1 — Anti-tunneling (lâmina rápida)**: dada fruta parada de raio `r` no centro e
  `bladePrev`/`bladeCurr` em lados opostos, a `4r + 10 px` um do outro, **nenhum**
  extremo dentro do círculo, com velocidade acima do limiar → **corta**. Uma
  implementação que testa apenas `bladeCurr` dentro do círculo falha.
- **S2 — Posição sem gesto não corta**: `bladePrev == bladeCurr` exatamente sobre o
  centro da fruta (velocidade 0) → **não corta** (F4.2).
- **S3 — Limiar de velocidade (bordas)**: mesma trajetória atravessando a fruta, com
  `dt = fixedStepS` (a velocidade é sempre medida por **passo fixo**, sobre o segmento
  interpolado — regra única de F4):
  - `|Δ|/dt = minSliceSpeedCssPerS − δ` → não corta;
  - `|Δ|/dt = minSliceSpeedCssPerS` (exatamente no limiar, comparação inclusiva) →
    corta;
  - `|Δ|/dt = minSliceSpeedCssPerS + δ` → corta.
- **S4 — Distância mínima (bordas)**: segmento cuja distância mínima ao centro é
  `r + δ` → não corta; `r` exatamente (tangente, comparação inclusiva) → corta;
  `r − δ` → corta.
- **S5 — Fruta rápida, lâmina lenta**: fruta com deslocamento no passo maior que seu
  diâmetro passando por cima de lâmina abaixo do limiar de velocidade → **não corta**
  (o gesto é do jogador, F4.5).
- **S6 — Fruta rápida, gesto válido**: fruta com deslocamento por passo `> 2r`
  cruzando lâmina em movimento acima do limiar → **corta** (validação do referencial
  relativo, F4.6). Uma implementação que usa apenas a posição final da fruta falha.
- **S7 — Corte único**: entidade cortada em um passo não é reportada de novo nos passos
  seguintes, mesmo com o segmento continuando dentro do círculo (F4.7).
- **S8 — Múltiplos cortes no mesmo passo**: três frutas alinhadas atravessadas por um
  único segmento retornam três resultados, ordenados por `entityId` crescente, em duas
  ordens de inserção diferentes no array de entidades (determinismo, F4.8).
- **S9 — Segmento degenerado**: `bladePrev == bladeCurr` e fruta cujo círculo contém o
  ponto — não corta (cai em S2); `dt = 0` não causa divisão por zero nem `NaN`
  (retorna lista vazia).
- **S10 — Ponto e direção do corte**: o `SliceResult` traz um ponto dentro do círculo da
  fruta e uma direção `dirRad` paralela ao segmento — usada pelas metades (F3.6).
- **S11 — Pureza**: nenhuma referência a `Math.random`, `Date`, `performance`,
  `document`, `window` ou Canvas em `slicing.js` (checagem estática acompanha em
  `tests/static-constraints.md`).
- **S12 — Varredura aleatória (KPI-6, falsos positivos)**: 100 segmentos gerados com
  semente fixa passando a `r + δ` de frutas → 0 cortes; 100 travessias com
  deslocamento `> 4r` → 100 cortes.

## Automatizados — bombas [F5]

- **S13 — Corte de bomba encerra a partida**: bomba cortada por segmento válido →
  `screen = 'gameOver'`, `gameOverReason = 'bomb'`, no mesmo passo, independentemente
  de `lives`.
- **S14 — Bomba não cortada é inofensiva**: bomba que cruza a borda inferior sem corte
  → removida, `lives`, `score` e combo inalterados (F5.2).
- **S15 — Mesma física**: bomba e fruta lançadas com os mesmos parâmetros e semente têm
  trajetórias idênticas (F5.3); diferem apenas em `kind`, `radiusCss` e aparência.
- **S16 — `bombChance` monotônica**: `bombChance` do nível `N+1` `>=` do nível `N`, e
  `> 0` em todos os níveis (F5.4).

## Manuais (referência cruzada)

Distinguibilidade visual da bomba (critério observável) está em `tests/manual.md` (M2).
