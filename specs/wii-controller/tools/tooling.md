# wii-controller — Tooling

## Test runner

- **Comando único da suíte inteira: `pytest -q`** (exigência das coding directives).
- Testes Python: `pytest` + `pytest-asyncio` (servidor é asyncio; os testes de
  integração de WebSocket em loopback precisam de event loop).
- Testes da lógica JS pura do jogo (`entities.js`, `rules.js`) e do cliente
  (throttle, transições de botão): executados **dentro do `pytest`** invocando
  `node --test` (test runner nativo do Node) como subprocesso — um teste pytest que
  roda a suíte JS e falha se ela falhar. Node.js é ferramenta de desenvolvimento
  apenas; nada de npm/pacotes — só o runner embutido. Assim um único `pytest -q`
  cobre servidor e jogo.
- Testes que exigem hardware/driver real são marcados (`@pytest.mark.hardware`) e
  **excluídos da execução padrão** (config no `pyproject.toml`/`pytest.ini`).
- O gamepad virtual é substituído por um fake da interface `server/gamepad/base.py`
  em toda a suíte padrão — roda em qualquer SO, sem driver e sem celular.

## Lint e formatação

- Python: `ruff` (lint) + `black` (formatação, linha 100). Type hints obrigatórios em
  funções públicas.
- JavaScript: `prettier` (aspas simples, ponto e vírgula) rodando localmente sobre os
  arquivos estáticos — não é etapa de build; os arquivos servidos são os versionados.
- Comandos esperados: `ruff check server tests`, `black --check server tests`,
  `prettier --check "web/**/*.js" "game/**/*.js"`.

## Verificações estáticas específicas da spec

Automatizadas como testes (rodam no `pytest -q`):
1. Nenhum import de `vgamepad` fora de `server/gamepad/` (E5).
2. Nenhum uso de `WebSocket` em `game/` fora do módulo isolado de fallback de rumble
   (G13).
3. Nenhum import cruzado entre `game/` e `web/`/servidor (G14).
4. Constantes de tuning referenciadas somente via `config.py` (busca por números
   mágicos nos módulos de mapping/protocolo é revisão de código, não automatizada).

## Scripts utilitários

- `python server/main.py [--port N]` — inicia o servidor (P1).
- Script/flag de diagnóstico `--direct-metrics` (F11, modo secundário explícito) —
  desativado por padrão.
- Geração do certificado autoassinado: automática no primeiro start (F1) — sem passo
  manual obrigatório.

## CI (opcional, não exigido pelo MVP)

Se houver CI, o pipeline é: `ruff check` → `black --check` → `prettier --check` →
`pytest -q`. Nenhum job pode exigir driver, celular ou GPU.
