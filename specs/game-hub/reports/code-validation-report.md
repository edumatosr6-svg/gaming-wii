# Code Validation Report — game-hub

**Veredito: SUCCESS**

## Cobertura de specs

- **F1 — Menu principal (hub)**: implementado. `game/index.html` agora renderiza o hub
  (`renderHub` de `game/hub.js`) a partir de `game/games.js`, sem carregar nenhum jogo
  diretamente. Estado vazio tratado sem lançar erro (`renderHub` cedo-retorna com
  `.hub-empty` quando `catalog.length === 0`).
- **F2 — Navegação para o jogo escolhido**: implementado. Cada entrada vira um `<a
  href="entry.url">` real (sem `preventDefault`), apontando para
  `duck-shooting/index.html` e `fruit-ninja/index.html`. Nenhum arquivo de lógica
  (`game/duck-shooting/js/**`, `game/fruit-ninja/js/**`) foi modificado — Duck Shooting foi
  só movido (`git mv`), conteúdo idêntico.
- **F3 — Voltar ao hub**: implementado. Link `#back-to-hub` adicionado em
  `game/duck-shooting/index.html` e `game/fruit-ninja/index.html`, apontando para
  `../index.html`. Posicionado fixo no canto superior esquerdo, fora da área do canvas e
  sem sobrepor HUD/telas do jogo.
- **F4 — Catálogo extensível**: implementado. Catálogo (`game/games.js`) é módulo
  separado de `game/hub.js` (renderização); `validateCatalog` faz a checagem de `id`
  único fora do runtime do navegador (chamada antes de `renderHub` no `index.html`, mas é
  pura e testável isoladamente). Adicionar entrada ao catálogo não exige tocar
  `hub.js`.

## Decisão arquitetural (migração de pasta)

- `game/index.html` (Duck Shooting antigo) → `game/duck-shooting/index.html`, `game/js/` →
  `game/duck-shooting/js/`, `game/assets/` → `game/duck-shooting/assets/`, todos via `git
  mv` (histórico preservado, sem reescrita de conteúdo).
- Caminhos relativos internos (`./js/loop.js` etc.) continuam corretos porque a estrutura
  interna da subpasta não mudou, só o prefixo.

## Contratos com outros slugs

- `wii-controller` — `coding-directives.md` seção "Estrutura de pastas" atualizada para
  `game/duck-shooting/index.html` e `game/duck-shooting/js/...`, mantendo o restante do
  documento (regras de pureza de `mapping.py`, proibição de import cruzado, etc.)
  inalterado — honrado, conforme exigido pela spec do game-hub.
  Documentos históricos (`wii-controller/implementation-report.md`,
  `wii-controller/reports/code-validation-report.md`) não foram tocados, como instruído.
- `wii-controller` (servidor) — `server/main.py` serve `/game/` genericamente via
  `_serve_static(GAME_DIR, relative)`; não hardcoda `index.html` do Duck Shooting nem
  precisou de alteração — honrado sem mudança de código do servidor.
- `fruit-ninja` — nenhum módulo de lógica (`js/**`) alterado; só `index.html` (link de
  volta) e `css/style.css` (estilo do link) tocados, dentro do previsto pela spec F3 —
  honrado. O teste estático `test_x5_sem_imports_externos` (`tests/test_fruit_ninja_static.py`,
  slug `fruit-ninja`) assumia que nenhum recurso de `game/fruit-ninja/index.html`
  aponta para fora da pasta do jogo; isso deixou de ser verdade pelo link de volta ao hub,
  que é comportamento exigido por esta spec (F3). Ajustei o teste para abrir uma exceção
  explícita e comentada apenas para `../index.html`, mantendo a checagem estrita para
  qualquer outro recurso — registrado aqui porque altera um teste de outro slug.
- Não há outros slugs com specs em `specs/` além de `wii-controller`, `fruit-ninja` e
  `game-hub`.

## Ajustes na suíte de testes existente (consequência da migração, previstos em tooling.md)

- `tests/test_js_suite.py`: `_game_js_files()` e os 3 usos diretos de `ROOT / "game" /
  "js" / ...` atualizados para `ROOT / "game" / "duck-shooting" / "js" / ...`
  (`test_g13_sem_websocket_de_input_no_jogo`, `test_g20_static_mira_nao_integra_velocidade_no_consumidor`).
  Nenhuma asserção de comportamento foi alterada, só o caminho.
- `tests/js/game.test.mjs`: imports de `../../game/js/*` atualizados para
  `../../game/duck-shooting/js/*`.
- `tests/test_client_headless.py` e `tests/test_gamepad_emulation.py`: auditados (grep) —
  não referenciam `game/js` ou `game/index.html` por caminho literal, nenhuma mudança
  necessária.
- Suíte completa (`pytest -q`) rodada após todas as mudanças: **140 passed, 38 deselected**
  (deselected = testes marcados `hardware`, já excluídos por padrão antes desta feature).

## Observações

- `coding-directives.md` de `game-hub` (o slug atual) está com o template em branco — o
  slug não tinha diretiva própria; segui a diretiva herdada de `wii-controller` (HTML/CSS/JS
  puro, `const`/`let`, módulos ES nativos, sem build), conforme `tools/tooling.md` do
  próprio game-hub instrui explicitamente ("herdado por game-hub na ausência de diretrizes
  próprias mais específicas"). Não é uma lacuna a resolver — é a decisão já registrada na
  spec.
- Testes automatizados novos (catálogo, renderização, navegação, browser-automation) ainda
  não foram escritos — por design, isso é responsabilidade do `impl-tester` no Testing
  Loop, a partir de `specs/game-hub/tests/catalog.md` e `navigation.md`.
