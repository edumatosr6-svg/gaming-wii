# game-hub — Tooling

## Test runner

O projeto já tem um único comando de suíte: `pytest -q` (raiz do repo), que inclui uma ponte
para a suíte JS nativa do Node (`node --test tests/js/*.test.mjs`), conforme
`tests/test_js_suite.py`. O game-hub **reusa esse mesmo runner** — não introduz um segundo
comando de teste.

- Novos testes de lógica pura do hub (catálogo, renderização a partir de dados) devem ir em
  `tests/js/game-hub-*.test.mjs`, seguindo o padrão dos arquivos já existentes
  (`tests/js/fruit-ninja-*.test.mjs`).
- Nenhuma dependência nova de tooling (test runner, bundler) é necessária: `node --test` já
  roda módulos ES nativos, que é a stack do hub.

## Impacto na suíte existente (atenção obrigatória do impl-loop)

A migração do Duck Shooting de `game/` para `game/duck-shooting/` (ver "Decisão
arquitetural" em `software-specs.md`) afeta arquivos de teste **já existentes**, que hoje
hardcodam o caminho antigo:

- `tests/test_js_suite.py`: `_game_js_files()` lê `ROOT / "game" / "js"` diretamente, e os
  testes `test_g13_sem_websocket_de_input_no_jogo`, `test_g14_sem_imports_cruzados`,
  `test_g6_localstorage_com_lista_fechada_de_duas_chaves` e
  `test_g20_static_mira_nao_integra_velocidade_no_consumidor` dependem desse caminho.
- Qualquer outro teste Python que abra `game/index.html` ou `game/js/**` por caminho literal
  (ex. `tests/test_client_headless.py`, `tests/test_gamepad_emulation.py`) precisa ser
  auditado e atualizado para `game/duck-shooting/`.

**Regra para o impl-loop:** atualizar esses caminhos faz parte da implementação de F2/F3 do
game-hub — não é uma mudança de escopo do slug `wii-controller`, é a consequência direta e
esperada de mover os arquivos que o game-hub exige. A suíte inteira (`pytest -q`) deve
continuar passando após a migração, sem editar o **comportamento** verificado por esses
testes — só os caminhos de arquivo que eles apontam.

## CI / lint

Nenhuma ferramenta nova. HTML/CSS/JS do hub seguem as mesmas convenções já em vigor no
projeto (JS: `const`/`let`, sem `var`, módulos ES nativos — ver
`specs/wii-controller/coding-directives.md`, herdado por `game-hub` na ausência de
diretrizes próprias mais específicas).
