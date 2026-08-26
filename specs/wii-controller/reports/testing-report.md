# Testing Report — wii-controller

**Veredito: SUCCESS**

Data: 2026-08-26 — iteração 1 do Testing Loop.

## Resumo da execução

- Comando: `pytest -q` (comando único da suíte inteira, conforme tools/tooling.md —
  inclui a suíte JS do jogo/cliente via `node --test`, invocada por
  `tests/test_js_suite.py`).
- Resultado: **52 passed, 22 deselected, 0 failed, 0 skipped** (2 execuções consecutivas,
  ~7 s cada).
- Os 22 deselecionados são exclusivamente os procedimentos **[manual/hardware]** das specs
  de teste (C8–C10, E7–E9, W4–W10, G15–G19, L5–L12), marcados com `@pytest.mark.hardware`
  e excluídos da execução padrão por `pyproject.toml` — exatamente como tools/tooling.md
  exige. Não são skips silenciosos: cada um nomeia o procedimento manual correspondente.

Cobertura teste-spec (todos os casos automatizáveis das 7 specs de teste têm teste
correspondente):

| Spec de teste | Testes executáveis | Arquivo |
|---|---|---|
| mapping.md (M1–M16) | 16 | `tests/test_mapping.py` |
| protocol.md (P1–P12) | 12 (7 unitários + 5 integração loopback) | `tests/test_protocol.py` |
| connection-lifecycle.md (C1–C7) | 7 | `tests/test_connection_lifecycle.py` |
| gamepad-emulation.md (E1–E6) | 7 (inclui NullGamepad do modo diagnóstico) | `tests/test_gamepad_emulation.py` |
| latency-and-kpis.md (L1–L4) | 5 | `tests/test_metrics.py` |
| client-controller.md (W1–W3) | 8 testes JS + W3 espelhado em pytest | `tests/js/web.test.mjs`, `tests/test_protocol.py` |
| duck-shooting.md (G1–G14) | 12 testes JS + 3 checks estáticos | `tests/js/game.test.mjs`, `tests/test_js_suite.py` |

Toda a suíte roda com o dublê `FakeGamepad` (`tests/conftest.py`) — sem driver, sem
celular, em qualquer SO.

## Falhas

Nenhuma. (Na primeira rodada houve 3 falhas causadas por defeitos no próprio código de
teste — automatch do scan de import E5, invocação de `node --test` por diretório no
Windows e falso positivo de `localStorage` em comentário — corrigidas nos testes; nenhuma
era bug de implementação nem lacuna de spec.)

## KPIs verificados

| KPI | Caminho automatizado | Resultado |
|---|---|---|
| KPI-2 Taxa de amostras ≥ 50 Hz | `test_l2_taxa_de_amostras_kpi2` (cliente simulado a 60 Hz por 2 s em loopback) | PASS (~60 Hz reportado em `motion_rate_hz`) |
| KPI-6 Zeragem na desconexão ≤ 250 ms | `test_c1`/`test_c2` (fechamento abrupto e limpo com eixo deslocado + botão pressionado) | PASS (zeragem medida bem abaixo de 250 ms) |
| KPI-9 Robustez do protocolo (0 crashes) | `test_p9_corpus_de_fuzzing` (100+ mensagens malformadas intercaladas com válidas) + P2–P7 | PASS (servidor processa as válidas e aceita novas conexões) |
| F9.2 Timeout de detecção ≤ 3 s | `test_c3_timeout_de_ping_pong` | PASS |
| F8.1 `vibrate` ≤ 100 ms | `test_p12_vibrate_saindo` | PASS |
| F11.3 Composição `latency = net + proc` | `test_l4_janela_de_latencia` | PASS |
| KPI-1, KPI-3, KPI-4, KPI-5, KPI-7, KPI-8, KPI-10, KPI-11 | Sem caminho automatizável (hardware real) — procedimentos manuais registrados como testes `hardware` com roteiro nas specs | PENDENTE DE VERIFICAÇÃO MANUAL (não bloqueia o aceite automatizado, conforme software-specs.md, seção KPIs) |

## Observações

- Nota da validação estática mantida: `POST /rumble` usa query string (decisão documentada
  no código; a spec não define o payload do fallback). Os testes exercitam o caminho
  principal (callback do driver → `vibrate`) e o isolamento do módulo de fallback (G13).
