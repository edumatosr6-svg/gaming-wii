# Testing Report — wii-controller

**Veredito: SUCCESS**

Revisão de precisão do apontamento (F4, F5, F12, F13, F14, F15). Escopo: fechar o
Testing Loop após o Coding Loop, atualizando os testes para os contratos novos e
implementando a cobertura JS exigida por `tests/pointing-client.md`.

## Resumo da execução

Comando: `python -m pytest -q` na raiz do projeto.

```
140 passed, 38 deselected in 111.03s (0:01:51)
```

- **140 testes passando, 0 falhando.**
- **38 deselecionados** — todos `@pytest.mark.hardware`, excluídos da execução padrão
  por `tooling.md`. Ver "O que ficou por verificar".
- A suíte JS (`node --test`, dentro do `pytest`) roda **125 casos**, dos quais **30 são
  os novos PC1–PC27** de `tests/pointing-client.md`.
- Navegador headless: **25 casos** (W11–W29), incluindo os 11 novos da revisão.
- Lint/formatação limpos: `ruff check server tests` e `black --check` passam.

### Ponto de partida

A suíte **não coletava**: `tests/test_mapping.py` importava `config.DEAD_ZONE_DEG`, que a
revisão substituiu por constantes por eixo. Um erro de coleção aborta tudo, então não
havia evidência nenhuma — nem sobre o código novo, nem sobre o que já funcionava.
Destravar a coleção foi o primeiro passo.

## Testes atualizados e criados

| Arquivo | O que mudou |
|---|---|
| `tests/test_mapping.py` | Reescrito para M1–M28. Zona morta por eixo, limites por direção, suavização adaptativa com fator e velocidade observáveis, perfil parcial/degenerado, `dt` hostil. **34 casos.** |
| `tests/test_protocol.py` | P4 (`a` ausente ≠ `a: null`), P4b (schema fechado), P13–P18 (perfil com payload, rejeição com motivo, caminho degradado, só `ranges`, `status`, ordem hostil). **21 casos.** |
| `tests/test_client_headless.py` | Cinco telas; primeira entrada em `calibrando`; W25 (fonte visível, 5 degraus), W26/W26b/W26c (assistente, pular/refazer, rejeição), W27 (botões suspensos), W28 (interferência), W29 (persistência). **25 casos.** |
| `tests/js/pointing-client.test.mjs` | **Novo.** PC1–PC27: captura de janela, média circular, fonte lenta, assistente, fusão, rejeição magnética, escada de fontes, contrato de saída. **30 casos.** |
| `tests/test_js_suite.py` | `g6` virou a regra da lista fechada de duas chaves; novas checagens estáticas de `tooling.md` 7 (sem normalização radial), 8/PC22 (sem user agent) e 9 (dono único das constantes). |
| `tests/test_metrics.py` | L13–L17 adicionados como manuais marcados, cada um com critério **observável**. |
| `tests/test_fruit_ninja_static.py` | `x6` reescrito (ver abaixo). |
| `tests/test_connection_lifecycle.py` | `MAX_ANGLE_DEG` → `DEFAULT_RANGE_DEG`. |

## Correções de CÓDIGO exigidas pelos testes

Três defeitos reais apareceram ao escrever os testes contra a spec. Foram corrigidos no
código (não nos testes):

1. **`server/protocol.py` — `ranges` com valor inválido era aceito em silêncio.**
   `_parse_ranges` descartava a chave que não convertia para número, então
   `{"left": "x", ...}` virava "direção ausente" ⇒ *usa o padrão*, e o servidor respondia
   `accepted: true`. Isso é exatamente o "aceito em silêncio" que a KPI-14 proíbe. Agora o
   valor cru é preservado e a validação rejeita com motivo. A distinção que importa:
   **ausente** = "use o padrão desta direção" (legítimo, é o caminho da F12 quando o
   usuário esgota as tentativas); **presente e inválido** = perfil ruim. (P14)

2. **`server/protocol.py` — schema do `motion` não era fechado.** Campos extras de sensor
   cru (`acc`, `mag`, `gyro`) passavam ignorados, e `motion` sem o campo `a` era aceito
   como se fosse `a: null`. F14.8 exige schema fechado nos cinco campos, e P4 distingue
   `a` ausente (malformado) de `a: null` (fonte sem yaw). (P4, P4b)

3. **`web/js/main.js` — a troca de tela ficava presa na seleção de fonte.** `onOpen`
   aguardava `startOrientation()` antes de trocar de tela; percorrer a escada leva até
   quatro sondagens de `SOURCE_PROBE_MS` (6 s), deixando o jogador em "conectando…" com a
   conexão já aberta. Pela tabela de transições da `ClientViewState`, a tela é função do
   `hello`, não da fonte. A seleção agora corre em paralelo e só atualiza o indicador.

## `x6` do fruit-ninja: teste inválido por construção

`test_x6_servidor_intocado` rodava `git status --porcelain` sobre a árvore inteira e
reprovava se houvesse qualquer arquivo modificado fora de `game/fruit-ninja/`, `tests/` e
`specs/`. Isso mede o estado da working tree, não o código:

- quebrava sempre que **qualquer outro slug** era tocado — o `wii-controller`, dono
  legítimo de `server/` e `web/`, derrubava o caso só por existir;
- o resultado dependia de ter havido commit ou não, então o mesmo código passava ou
  falhava conforme o momento da execução.

Reescrito como **propriedade do código**, preservando a intenção original (o jogo não
pode depender do servidor): todo import do fruit-ninja é relativo e resolve dentro de
`game/fruit-ninja/`, nenhum módulo referencia `server/`/`web/js/`, e o input continua vindo
só da Gamepad API. O motivo da forma antiga ser inválida está registrado no docstring,
para ninguém "consertar de volta".

## Verificação por mutação

Os casos centrais desta revisão foram checados por mutação — um teste que não reprova a
implementação errada não é cobertura:

| Mutação aplicada | Quem reprovou |
|---|---|
| Velocidade estimada por **diferença entre amostras consecutivas** (o modo ingênuo que a spec proíbe) | `M21` e `M22b` |
| **Zona morta radial única** no lugar da por eixo | `M3`, `M6`, `M24` |
| **Rejeição magnética desligada** (aceita a bússola mentindo) | `PC12` e `PC25` |

A mutação da velocidade é a mais importante: ela passa despercebida pela saída sozinha, e
só `M22b` — que lê o fator efetivo e a velocidade estimada devolvidos pela conversão — a
denuncia. É a regressão que a F4 antecipa nominalmente.

## KPIs verificados automaticamente

| KPI | Critério | Resultado |
|---|---|---|
| KPI-7 (tremor) | σ da saída ≤ 40% da σ sem suavização | **0.34** — `M21` |
| KPI-9 (0 crashes) | corpus de fuzzing + ordem hostil não derrubam o servidor | passa — `P9`, `P18` |
| KPI-14 (nunca aceito em silêncio) | perfil degenerado ⇒ `accepted: false` com motivo, perfil anterior mantido | passa — `P14`, `W26c` |
| KPI-16 (mira absoluta) | mesma amostra final ⇒ mesmo (x, y), qualquer histórico | passa — `M19`, `M22` |
| KPI-17 (resposta) | degrau a 90% em ≤ 100 ms a 60 Hz | **1 amostra** — `M20` |
| KPI-18 (sentido dos eixos) | 4/4 direções corretas; rolagem não move a mira | passa — `M17`, `M18` |
| KPI-19 (simetria do processamento) | 0.67 ≤ σ(x)/σ(y) ≤ 1.5 | passa — `M23` (a assimetria do sensor é L13, manual) |
| KPI-21 (custo do assistente, parte configurada) | soma das durações ≤ `WIZARD_BUDGET_MS` | 10 500 ms (pior caso 12 500) ≤ 20 000 — `PC11b`/L18 |
| KPI-24 (rejeição magnética) | erro de yaw estritamente menor com rejeição, ≤ 5° | 179.99° → **0.00°** — `PC12` |

Critérios de F14 verificados em sintético: estabilidade estática < 0.5°/60 s (`PC13`),
viés de giroscópio converge a **0.83°** contra os 60° que acumularia sem correção
(`PC14`), operação sem magnetômetro (`PC15`), histerese do indicador (`PC18`).

## O que ficou por verificar (não conta como cobertura)

38 casos `@pytest.mark.hardware` seguem fora da execução padrão. **Nenhuma afirmação
deste relatório se apoia neles.** Os que pertencem a esta revisão:

- **L13 (KPI-19)** — simetria de precisão real **do sensor**. `M23` cobre só o
  processamento.
- **L14 (KPI-20)** e **L15 (KPI-21)** — ganho e custo de entrada do assistente com pessoas
  reais.
- **L16 (KPI-22)** — deriva de `fusion_mag` menor que a de `deviceorientation` no
  aparelho. **É o critério de aceite da frente 4**, e é medido, não intuído: hoje a frente
  está verificada apenas em fluxo sintético (`PC12`, `PC25`).
- **L17 (KPI-24)** — interferência real (gabinete, monitor) acende o indicador.
- **W22m**, **W28m**, **W20** — sentido do apontamento, jogabilidade no piso da escada e
  partida completa só com o celular.
- **KPI-1/2/3/4/5/10/11/13** — latência, taxa, jitter, deriva, reconexão, bateria e
  "o produto funciona" continuam dependendo do aparelho e do driver.

Em particular: **a precisão fim-a-fim no hardware não foi medida.** O que esta rodada
estabelece é que a lógica está correta e que as regressões conhecidas são detectadas.

## Nota de ambiente

Node.js e o Chromium do Playwright não estavam instalados na máquina e foram instalados
para que a faixa JS e a headless — ambas obrigatórias por `tooling.md` — pudessem rodar.
Sem eles a suíte falha por instrução, que é o comportamento correto e desejado.

`tests/test_fruit_ninja_headless.py` aparece modificado apenas por reformatação do `black`
(a execução do formatador do projeto sobre `tests/`), sem mudança de comportamento.
