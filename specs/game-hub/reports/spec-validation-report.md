# Spec Validation Report — game-hub

**Veredito: SUCCESS**

## Pontos verificados
- [x] Completude
- [x] KPIs
- [x] Testabilidade
- [x] Consistência interna
- [x] Consistência entre slugs (contratos externos)
- [x] Consistência com implementation-report (n/a, não existe para este slug)
- [x] Tools

## Contratos entre slugs

- `wii-controller` — estrutura de pastas de `game/` (Duck Shooting) — **compatível**: a
  divergência apontada na iteração anterior (estrutura documentada em
  `wii-controller/coding-directives.md` vs. a migração para `game/duck-shooting/` exigida
  aqui) agora está registrada explicitamente em `game-hub/software-specs.md` ("Decisão
  arquitetural"), com instrução acionável para o `impl-generator` atualizar a seção
  "Estrutura de pastas" de `wii-controller/coding-directives.md` como parte desta
  implementação, e uma nota clara de que relatórios históricos do wii-controller não devem
  ser reescritos. Resolve o problema 1 e 2 da rodada anterior.
- `wii-controller` — testes existentes que hardcodam `game/js/`
  (`tests/test_js_suite.py`, possivelmente `tests/test_client_headless.py`,
  `tests/test_gamepad_emulation.py`) — **compatível**: `tools/tooling.md` documenta o
  impacto e atribui a responsabilidade de atualização ao impl-loop deste slug, de forma
  consistente com o software-specs.md.
- `fruit-ninja` — nenhum contrato quebrado; a única mudança que o toca (controle de "voltar
  ao hub") está coberta por F3 e por `tests/navigation.md`.

## Problemas encontrados

Nenhum.

## Observações (mesmo se SUCCESS)

- A responsabilidade de atualizar `wii-controller/coding-directives.md` (seção "Estrutura de
  pastas") foi delegada ao `impl-generator` do game-hub em vez de ser feita nesta rodada de
  spec — isso é aceitável porque a spec deixa a instrução explícita e verificável, mas vale
  conferir no `code-validation-report.md` do impl-loop que essa atualização de fato aconteceu
  antes de considerar a migração completa.
- Nenhum KPI de latência/rede é definido para este slug, com justificativa explícita — a
  tela é estática e o hub não introduz I/O em tempo real; correto não inventar uma métrica
  aqui.
- Débito aceito conscientemente: o hub não terá miniaturas/thumbnails dos jogos (fora de
  escopo), o que é razoável para o tamanho do catálogo atual (2 jogos).
