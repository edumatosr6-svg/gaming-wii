# Spec Validation Report — wii-controller

**Veredito: SUCCESS**

_Iteração 2 — 2026-08-27 (rodada do modelo de apontamento + pegada vertical)_

## Pontos verificados
- [x] Completude — a mudança de conceito do `descriptions.md` está integralmente
  coberta: pegada vertical com orientação retrato (F2, F2.2), layout "corpo de Wii
  Remote" normativo com ordem vertical, dominância do botão A e proximidade de B/X/Y
  (F2.10), ponta do sensor ancorando a metáfora e refletindo o estado da conexão
  (F2.11, W23), ilustração que ensina a pegada (F2.12, W24), modelo de apontamento
  **absoluto** como requisito de primeira classe (F4), metáfora do infravermelho como
  definição do mapeamento com sentido dos eixos normativo (F4.6), rolagem sem efeito
  na mira (F4.7), ergonomia com critério observável (`MAX_ANGLE_DEG` 20° como
  parâmetro de conforto verificável em W22m; orçamento de resposta da suavização em
  F4.8), e o jogo consumindo **posição, não taxa** (F10.7–F10.10). Fruit Ninja
  referenciado ao slug próprio `specs/fruit-ninja/` com contratos herdados explícitos.
- [x] KPIs — KPI-16 (fidelidade do apontamento absoluto), KPI-17 (resposta da
  suavização, ≤ 100 ms a 90% do degrau) e KPI-18 (sentido dos eixos, incluindo a
  fronteira da Gamepad API) são mensuráveis, rastreados a features e a testes
  nomeados. KPIs pré-existentes preservados e coerentes com o novo modelo (KPI-4
  agora com a deriva de `alpha` como modo de falha declarado em L8).
- [x] Testabilidade — cada critério novo tem caso de teste: M17–M18 (sentido e
  rolagem, vetores sintéticos da pegada vertical), M19 (independência de histórico —
  a propriedade exata que a implementação por velocidade viola), M20 (orçamento de
  resposta), M8b (`alpha` nulo), G20–G22 (mira absoluta no jogo), G23 (normalização
  da Gamepad API), W22 (geometria do layout em viewport retrato), W23–W24 (ponta do
  sensor e ilustração), W22m (ergonomia manual com critério observável 4/4 direções +
  varredura só com o pulso). Caminho feliz, bordas e falhas presentes.
- [x] Consistência interna — **o problema 1 da iteração 1 está resolvido
  (`recorrente: não`)**: F10 agora define a camada de normalização da convenção de
  sinal da Gamepad API como responsabilidade única de `input.js` (função pura), F10.9
  refere-se explicitamente ao valor **normalizado**, F10.10 dá o critério na
  fronteira (`axes[3]` negativo = stick para cima ⇒ mira acima do centro) e G23 o
  automatiza — a inversão vertical fim-a-fim deixou de ser um defeito invisível para
  a suíte. Protocolo `motion` (`a/b/g/t`) consistente entre Data Models, F4, P2.4,
  W3 e tests/protocol.md (P4 documenta `a: null` válido vs campo ausente descartado);
  `SessionState`, `Config` e o invariante do `crosshair` no GameState concordam com
  as features.
- [x] Consistência com `implementation-report.md` — os 4 pedidos endereçados:

  | Pedido do relatório | Onde a spec define | Como reprova |
  |---|---|---|
  | 1. Apontamento = posição absoluta, centro calibrado = centro da tela, máximo = bordas, com teste de independência de histórico | F4 (requisito de primeira classe), F4.1–F4.3, F10.7–F10.8, invariante do GameState | M19, G20, G21, KPI-16 |
  | 2. Tensão com jogos de terceiros resolvida e documentada | F4 ("tensão resolvida por decisão": eixo transporta posição; terceiros = limitação conhecida, README deve declarar; perfis na segunda onda) | inspeção pelo impl-validator (ver Observações) |
  | 3. Ergonomia com critério observável (ângulo máximo, suavização vs resposta, sentido dos eixos) | F4 (`MAX_ANGLE_DEG` 20°/15°–30° como parâmetro de conforto; F4.8 orçamento de resposta; F4.6 sentido normativo; F10.10 fronteira da API) | W22m, M17–M18, M20, G23, KPI-17, KPI-18 |
  | 4. Especificar o Fruit Ninja | slug próprio `specs/fruit-ninja/` (aprovado), referência cruzada com contratos herdados | spec-loop do slug fruit-ninja |

- [x] Tools — Playwright com **viewport retrato obrigatório** nos casos de geometria
  (tooling.md); G23 roda no runner JS puro (`node --test` dentro do `pytest`), sem
  ferramenta nova; nenhuma dependência supérflua adicionada.

## Problemas encontrados
Nenhum bloqueante nesta iteração.

## Observações (mesmo com SUCCESS)

- **Risco assumido: deriva de `alpha` (KPI-4).** No modelo vertical o eixo horizontal
  deriva de `alpha`, o ângulo que mais escorrega em giroscópio relativo; a meta de 15
  min dentro da zona morta ficou mais exigente que na paisagem (L8 já declara a
  deriva horizontal como modo de falha esperado). Se o hardware de referência
  reprovar consistentemente, a decisão (recalibração mais frequente vs. fonte de
  orientação absoluta) deve voltar para revisão humana — não é defeito de spec.
- Os vetores sintéticos (a, b, g) de M17/M18 ficam documentados no arquivo de teste,
  derivados da convenção W3C do `DeviceOrientationEvent` — o `impl-tester` deve
  derivá-los da spec W3C, nunca da implementação sob teste.
- A exigência de F4 de declarar no README a limitação com jogos de terceiros é
  verificável só por inspeção; o `impl-validator` deve checá-la explicitamente.
- Os testes headless W11–W21 pré-existentes permanecem válidos, mas **devem ser
  reexecutados em viewport retrato** (nota normativa no cabeçalho de
  tests/client-controller.md e em tooling.md) — a suíte anterior media geometria de
  um layout de paisagem que não existe mais.
- Ordem dos procedures no documento (P5 antes de P4) é cosmética; não reprovável.
