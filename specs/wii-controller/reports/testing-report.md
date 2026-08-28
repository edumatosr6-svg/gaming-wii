# Testing Report — wii-controller

**Veredito: SUCCESS**

## Resumo da execução

- Comando: `pytest -q` (default `addopts = -m 'not hardware'` em `pyproject.toml`, exclui
  procedimentos manuais/hardware da execução padrão, conforme `tools/tooling.md`).
- Resultado: **154 passed, 39 deselected** (0:01:56). Nenhuma falha, nenhum erro.
- Suíte completa executada (não só os testes novos) para checar regressão: inclui
  `test_mapping.py`, `test_protocol.py`, `test_gamepad_emulation.py`, `test_metrics.py`,
  `test_client_headless.py` (Playwright), `test_game_hub_headless.py`,
  `test_fruit_ninja_*`, `test_js_suite.py` (`node --test`), além de
  `test_connection_lifecycle.py`.
- Testes novos da feature F1 (QR de pareamento), todos passando:
  - `test_c6b_qr_decodifica_para_url_impressa` — gera QR (formato imagem) para uma URL,
    decodifica com `pyzbar`/`Pillow` e confirma igualdade exata; repete com IP:porta
    diferente e confirma que o novo QR reflete o novo valor, nunca o anterior
    (F1.6/F1.7).
  - `test_c6c_sem_chamada_de_rede_para_gerar_qr` — bloqueia `socket.socket.connect`
    globalmente e confirma que a geração do QR ainda conclui com sucesso (F1.8).
  - `test_c6d_falha_no_qr_nao_derruba_o_servidor` — força `server.qr._build_qr` a lançar
    exceção; confirma retorno `False`, aviso impresso nomeando a causa, e que
    `server.main.print_urls` (o caminho real de startup) não propaga exceção mesmo com o
    QR quebrado (F1.9).
  - `test_c11_pareamento_qr_vs_manual_kpi25_manual` — marcado `@pytest.mark.hardware`,
    **skip** documentado (procedimento manual comparativo com pessoa real, cronômetro):
    excluído da execução padrão pela mesma política já aplicada a C8/C9/C10 neste slug,
    não é uma pendência nova introduzida por esta feature.
- Verificações estáticas relacionadas (lint/format), executadas à parte por serem exigidas
  pelo `tools/tooling.md`:
  - `ruff check server/qr.py server/main.py server/config.py tests/test_connection_lifecycle.py`
    → sem apontamentos.
  - `black --check` nos mesmos arquivos → sem apontamentos.

## Falhas

Nenhuma.

## KPIs verificados

- **KPI-25 (pareamento por QR mais rápido/menos erro que digitação manual)**: parte
  automatizada coberta indiretamente pelos critérios F1.6/F1.7 (C6b — o QR sempre
  codifica a URL correta e atual) e F1.8/F1.9 (C6c/C6d — geração local e falha suave, sem
  o que o atalho nem existiria de forma confiável). A comparação de tempo
  humano-cronometrado (QR < 10s e mais rápido que digitação) permanece **procedimento
  manual não executado** (C11) — não contabilizado como coberto neste veredito, listado
  explicitamente aqui em vez de assumido.
- **F1.6 (QR presente e correto)**: verificado (C6b).
- **F1.7 (regeneração por IP/porta)**: verificado (C6b, segunda chamada com IP:porta
  diferente).
- **F1.8 (sem chamada de rede na geração)**: verificado (C6c).
- **F1.9 (falha suave, sem exceção)**: verificado (C6d).
- Demais KPIs/critérios das features pré-existentes (F1–F14, exceto os manuais já
  marcados) seguem cobertos pela suíte já existente, sem regressão detectada nesta
  rodada (154 testes verdes incluindo mapping, protocolo, ciclo de vida, gamepad,
  headless e JS puro).

## Observações

- Testes manuais/hardware pendentes nesta rodada (C8, C9, C10, C11) são os mesmos já
  aceitos como fora da execução automatizada padrão pelo projeto — nenhum é regressão
  introduzida por esta feature; C11 é o único item novo nessa categoria.
