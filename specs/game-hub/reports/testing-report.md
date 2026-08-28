# Testing Report — game-hub

**Veredito: SUCCESS**

## Resumo da execução

- `node --test tests/js/game-hub-catalog.test.mjs` (lógica pura do catálogo, F4,
  `specs/game-hub/tests/catalog.md`): **5 passed, 0 failed**.
- `pytest -q` (raiz do repo, suíte inteira, inclui `test_suite_js_via_node` que roda
  `node --test tests/js/*.test.mjs`, cobrindo o arquivo acima e o `game.test.mjs` já
  existente com imports corrigidos): **151 passed, 38 deselected** (deselected =
  `@pytest.mark.hardware`, testes manuais já excluídos por padrão antes desta feature).
  - Novo: `tests/test_game_hub_headless.py` (Playwright/Chromium,
    `specs/game-hub/tests/navigation.md`, F1–F3): **11 passed**.
  - Regressão: suíte pré-existente de Duck Shooting (`tests/js/game.test.mjs`,
    `tests/test_js_suite.py`) e Fruit Ninja (`tests/js/fruit-ninja-*.test.mjs`,
    `tests/test_fruit_ninja_static.py`, `tests/test_fruit_ninja_headless.py`) —
    todos continuam passando após a migração de pasta e a introdução do hub.

## Falhas (se houver)

Nenhuma. Uma falha de teste apareceu durante o desenvolvimento e foi corrigida antes
deste veredito (não é uma falha remanescente, registrada aqui só para rastreabilidade):

- `test_x5_sem_imports_externos` (`tests/test_fruit_ninja_static.py`, slug `fruit-ninja`)
  falhou porque assumia que nenhum recurso de `game/fruit-ninja/index.html` aponta para
  fora da pasta do jogo — o link "voltar ao hub" (`../index.html`, exigido pela F3 desta
  spec) quebra essa suposição de propósito. Corrigido no Coding Loop anterior com uma
  exceção explícita só para `../index.html`, mantendo a checagem estrita para qualquer
  outro recurso. Classificação, caso reaparecesse: teria sido `FAIL CODE` do slug
  `fruit-ninja` na forma de um teste desatualizado por uma mudança de contrato prevista e
  documentada em `tools/tooling.md` do game-hub — não uma ambiguidade de spec.

## KPIs verificados

| KPI (software-specs.md) | Resultado |
|---|---|
| Tempo até entrar em um jogo a partir do hub (1 clique) | Verificado: `test_navegar_para_duck_shooting`/`test_navegar_para_fruit_ninja` clicam uma única vez no link e chegam à página do jogo (canvas presente), sem etapa intermediária. |
| Ausência de regressão nos jogos existentes (0 falhas novas) | Verificado: suítes de Duck Shooting e Fruit Ninja, incluindo as novas de integração headless, passam integralmente após a migração/integração do hub. |
| Erros de console ao navegar hub ↔ jogos (0 erros) | Verificado: `test_fluxo_completo_sem_erros_console` percorre hub → Duck Shooting → hub → Fruit Ninja → hub coletando `console` (`error`) e `pageerror`; lista vazia em todas as transições. Também checado individualmente em cada teste de navegação. |
| Extensibilidade do catálogo (0 linhas fora do arquivo de catálogo) | Verificado: `test_hub_extensibilidade_catalogo_sem_editar_render` (Playwright) e o teste homônimo em `game-hub-catalog.test.mjs` injetam uma terceira entrada fictícia e chamam a mesma `renderHub`/`validateCatalog` sem alterar esses módulos — 3 itens renderizados. |

## Cobertura adicional confirmada nesta rodada

- F1: catálogo padrão renderiza exatamente 2 itens com os nomes corretos; catálogo vazio
  renderiza estado vazio sem erro de JS; nenhum script de jogo (`duck-shooting/js`,
  `fruit-ninja/js`) é requisitado pela página do hub.
- F2: a entrada é um `<a href="...">` real (não `div onclick`); navegação por clique real
  chega à página do jogo correspondente.
- F3: o controle de "voltar ao hub" existe e funciona em ambos os jogos; geometricamente
  fica num canto pequeno (< 40px de altura, < 160px de largura, topo da tela), não
  centralizado sobre a área de jogo/mira.
