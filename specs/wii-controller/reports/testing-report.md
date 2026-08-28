# Testing Report — wii-controller

**Veredito: SUCCESS** (com uma exceção externa declarada em destaque — ver
"Conflito de contrato entre slugs")

Data: 2026-08-27 — Testing Loop da iteração 1 da rodada "pegada vertical +
apontamento absoluto" (specs reaprovadas no commit 6d41125).

## Resumo da execução

Comando: `pytest -q` (comando único da suíte, tools/tooling.md — cobre
servidor Python, lógica JS via `node --test` e integração em navegador
headless via Playwright/Chromium).

| Métrica | Antes | Depois |
|---|---|---|
| Coleta | **quebrada** (`ImportError: tilt_to_axes`) | ok |
| Testes passando | 95 (antes da mudança de conceito) | **104** |
| Falhando | — (nem coletava) | 1 (externa, `fruit-ninja` X6) |
| Hardware deselecionados | 33 | 33 |

- `pytest -q` → **104 passed, 1 failed, 33 deselected** (63 s).
- `pytest -q --deselect ...::test_x6_servidor_intocado` → **104 passed,
  34 deselected** — verde completo excluindo apenas a falha externa.
- Dos 104, **32 são do slug `fruit-ninja`** e continuam passando;
  `game/fruit-ninja/` **não foi editado** (blob idêntico ao HEAD, conferido
  com `git hash-object` vs `git rev-parse HEAD:<arquivo>`).
- Lint: `ruff check server tests` e `black --check` limpos nos arquivos desta
  rodada. Resta 1 E501 **pré-existente** em `tests/test_fruit_ninja_static.py`
  (arquivo de outro slug, não tocado).

## Testes atualizados/criados

| Arquivo | O que mudou |
|---|---|
| `tests/test_mapping.py` | Reescrito para `pointing_to_axes` (API da pegada vertical). Documenta no topo os **vetores sintéticos** exigidos por mapping.md. Novos: **M8b** (alpha nulo), **M17** (sentido dos eixos), **M18** (rolagem não move a mira), **M19** (independência de histórico), **M20** (orçamento de resposta, KPI-17). 22 casos. |
| `tests/test_protocol.py` | `Motion` com `a`; **P4** (motion sem `a` é descartado), **P5** (`a` com tipo errado degrada para `None`, não descarta a amostra), **W3** (`a: null` é válido), **P10** reescrito como fio ponta a ponta do apontamento absoluto (yaw→x, pitch→y, rolagem sem efeito). |
| `tests/test_connection_lifecycle.py`, `tests/test_metrics.py` | Amostras `motion` passam a carregar `a`; C1 usa deflexão de yaw. |
| `tests/js/web.test.mjs` | Removido o teste do extinto `adjustForLandscape`; **W3** agora exige os **três** ângulos e `a: null` quando o sensor não reporta yaw; novo caso "cliente não reorienta os ângulos" (o mapeamento vive no servidor). |
| `tests/js/game.test.mjs` | Novos **G20** (eixo constante ⇒ mira parada), **G21** (independência de histórico), **G22** (centro/bordas/sentido na tela), **G23** (normalização da convenção da Gamepad API). |
| `tests/test_client_headless.py` | **Viewport agora é RETRATO 412×915** (era paisagem 900×420). Novos **W22** (geometria do corpo de Wii Remote), **W23** (ponta do sensor ancorada e com estado), **W24** (ilustração de pegada). |
| `tests/test_js_suite.py` | **W5** revisto para retrato; **W20** revisto com o critério observável da pegada vertical; novo **W22m** (ergonomia e sentido, manual); nova guarda estática G20 (ver abaixo). |

## Validação por mutação

Cada mutação foi aplicada, executada e **revertida por edição pontual**
(nunca `git checkout`), com a reversão conferida por conteúdo. Busca final por
resíduo (`MUTAC|mutant`) em `server/`, `web/`, `game/`: **nenhuma ocorrência**.

| # | Mutação | Resultado | Reprovado por |
|---|---|---|---|
| 1 | Mira por **velocidade** em `aim.js` (`pos += eixo × ganho × dt`, com estado) | **reprovou** ✔ | G20, G21, G22, G23 |
| 2 | Mira por **velocidade no consumidor** (`loop.js` realimentando `crosshair`) | **passou** ✗ → gap fechado | ver abaixo |
| 3 | **Sinal de X invertido** (`yaw_right = +(a - alpha0)`) | **reprovou** ✔ | M17, M4, M15b |
| 4 | **Sinal de Y invertido** (`pitch_up = -(b - beta0)`) | **reprovou** ✔ | M17 + 7 outros |
| 5 | **Eixos trocados** (x recebe pitch, y recebe yaw) — o defeito exato do reaproveitamento do mapeamento de paisagem | **reprovou** ✔ | M17 + 8 outros |
| 6 | **Y da Gamepad API sem inverter** (`y: rawY`) — o sinal que reprovou a iteração 1 do spec-loop | **reprovou** ✔ | G23 (e só ele) |
| 7 | Botão **A sem dominância** (tamanho do layout de paisagem) | **reprovou** ✔ | W22(b) |
| 8 | **Ordem vertical invertida** (`column-reverse`, L/R no topo) | **reprovou** ✔ | W22(a) |

Os dois alvos críticos exigidos estão cobertos: o apontamento absoluto reprova
a implementação por velocidade (1, 2) e o sentido dos eixos reprova sinal
invertido em cada eixo e eixos trocados (3, 4, 5, 6).

### Gap real encontrado e fechado (mutação 2)

A mutação 2 revelou que **G20/G21 só enxergam a função pura** `aim.js`:
reintroduzir `crosshair.x + eixo × ganho × dt` no **consumidor** (`loop.js`)
mantinha os quatro testes de mira passando. É exatamente a classe de defeito
que F10.7/KPI-16 proíbem, e a invariante do GameState ("`crosshair` é função
pura da leitura atual do eixo — nunca do valor anterior") vale para o
consumidor também.

Fechado com uma verificação estática em `tests/test_js_suite.py`
(`test_g20_static_mira_nao_integra_velocidade_no_consumidor`), da mesma
família das checagens estáticas já previstas em tools/tooling.md ("Verificações
estáticas específicas da spec"). Ela exige que `loop.js` derive a mira de
`crosshairFromAxes(...)` e não se realimente da posição anterior. Confirmada
por mutação: reprova a mutação 2 e passa no código correto.

**Sugestão para a spec de teste** (não aplicada por mim): acrescentar esse caso
explicitamente a `specs/wii-controller/tests/duck-shooting.md`, como
complemento estático de G20 — hoje ele existe no código de teste sem um item
correspondente na spec.

## Conflito de contrato entre slugs (falha externa, não é defeito do wii-controller)

`tests/test_fruit_ninja_static.py::test_x6_servidor_intocado` **falha**,
acusando `game/js/aim.js`, `game/js/input.js`, `game/js/loop.js`,
`server/mapping.py` e `web/css/style.css` — precisamente as mudanças legítimas
desta rodada (F4/F10).

**Por que o teste é malformado.** Ele roda `git status --porcelain` e reprova
se houver qualquer alteração não commitada fora de `game/fruit-ninja/`,
`tests/` e `specs/`. Isso mede o **estado transitório da árvore de trabalho**,
não uma propriedade do código do fruit-ninja:

- passaria se estas mesmas mudanças estivessem commitadas;
- volta a falhar sempre que **qualquer outro slug** tiver trabalho em
  andamento no repositório.

A spec do caso (`specs/fruit-ninja/tests/static-constraints.md`, X6) diz "o
diff **da entrega**... contra a base da entrega" — ou seja, o critério é sobre
o diff **daquela entrega**, não sobre o estado global do repo. A implementação
aproximou isso pelo working tree inteiro, e é essa aproximação que quebra com
múltiplos slugs coexistindo. A intenção arquitetural real (o jogo não se
acoplar ao servidor/cliente) já é coberta pelas outras estáticas do slug — X5
(imports), X2 (WebSocket), X3 (rede) e X11 (recursos externos).

**Encaminhamento**: material para a próxima rodada do slug **`fruit-ninja`** —
provavelmente um `FAIL SPEC` dele, já que o X6 foi redigido de um jeito que não
funciona com mais de um slug no repositório. Nada a corrigir no
`wii-controller`.

**O que eu NÃO fiz**, por decisão explícita: não editei `game/fruit-ninja/`
nem os testes do fruit-ninja (aquele slug tem ciclo próprio), e não enfraqueci
nem reverti o trabalho do wii-controller para fazer o X6 passar. Verificado ao
final: `tests/test_fruit_ninja_static.py` e `game/fruit-ninja/js/rumble.js`
estão com blob **idêntico ao HEAD**.

## KPIs verificados automaticamente

| KPI | Meta | Resultado |
|---|---|---|
| KPI-16 Fidelidade do apontamento absoluto | 0 desvios nos testes determinísticos | **OK** — M19 (mapping sem estado) e G20–G21 (mira função do eixo atual); mutações 1 e 2 reprovam |
| KPI-17 Resposta da suavização | degrau a 90% em ≤ 100 ms a 60 Hz | **OK** — M20: com `SMOOTHING_ALPHA=0.2` o degrau atinge ~99,99% em 6 amostras |
| KPI-18 Sentido dos eixos na pegada vertical | 4/4 direções corretas, incl. fronteira da Gamepad API | **OK (parte automatizável)** — M17, M18, G22, G23; falta a confirmação manual W22m |
| KPI-6 Zeragem na desconexão | 100% em ≤ 250 ms | **OK** — C1/C2 |
| KPI-9 Robustez do protocolo | 0 crashes no corpus malformado | **OK** — P9 (100 mensagens) |
| KPI-12 Controles acionáveis | 100% por toque puro | **OK** — W12/W13/W14 em viewport retrato |
| KPI-14 Ausência de falha silenciosa | estado visível 100% do tempo | **OK** — W11/W19 |
| KPI-2 Taxa de amostras | ≥ 50 Hz | **parcial** — verificado com cliente simulado (`/metrics`); a taxa real do aparelho é o manual L6 |

## O que ficou POR VERIFICAR (nenhum destes conta como cobertura)

**33 testes marcados `@pytest.mark.hardware` foram deselecionados** e nada
neste veredito se apoia neles. Exigem aparelho, sensor, driver ou observação
humana:

- **Pegada vertical e apontamento com sensor real** — os mais críticos desta
  rodada, porque o mapeamento novo (yaw/pitch da ponta) só foi exercitado com
  **vetores sintéticos**: `W22m` (4/4 direções corretas com o aparelho em pé;
  varredura borda a borda só com o pulso a 20°; torção não desloca a mira;
  ausência de atraso perceptível), `W10` (calibração recentra), `W5`
  (fullscreen + **retrato** travado no A57), `W8` (multi-touch), `W4`, `W6`,
  `W7`, `W9`.
- **Produto jogável fim a fim**: `W20` (KPI-13 — critério de "o produto
  funciona"; a mira segue a ponta e voltar ao neutro **recentra**) e
  `G15`–`G19` (fluxo de entrada, rumble, áudio, FPS, aguardando controle).
- **Driver real**: `E10` (KPI-15 — subir com ViGEmBus, incluindo o registro do
  callback de rumble, que o dublê não reproduz), `E7`, `E8`, `E9`.
- **KPIs de hardware**: `L5` (KPI-1 latência), `L6` (KPI-2 taxa real),
  `L7` (KPI-3 jitter), `L8` (KPI-4 deriva em 15 min), `L9` (KPI-7 tremor),
  `L11` (KPI-10 bateria), `L12`, `L10`; `C8`, `C9` (KPI-5), `C10` (KPI-11).
- **Fruit Ninja manuais** (`M1`–`M8`), do slug próprio.

**Consequência honesta**: a suíte prova que o *mapeamento e a mira estão
corretos segundo os vetores sintéticos e a geometria do DOM*, e que os
defeitos-alvo (velocidade, sinal invertido, eixos trocados, layout de
paisagem) são reprovados. Ela **não** prova que a convenção de sinais do
`DeviceOrientationEvent` do Galaxy A57 real corresponde à assumida em
`mapping.py` — se o aparelho reportar `alpha` com sentido oposto ao
documentado, M17 continua verde e o usuário sente a mira invertida. **W22m é o
teste que fecha esse fio e continua pendente.**

## Observação sobre o fruit-ninja (registro, não ação)

`game/fruit-ninja/js/input.js::axesToTarget` consome o eixo como **posição
absoluta** com calibração própria e assume a convenção crua do standard
mapping (`axes[3]` positivo = baixo). Esta rodada **preserva** essa convenção
na fronteira do driver (`server/gamepad/windows.py` passa o valor direto, e a
inversão do Duck Shooting vive só em `game/js/input.js`), então a semântica que
o fruit-ninja assume continua válida — o que os 32 testes dele, verdes,
confirmam. Nenhuma edição foi feita naquele slug.
