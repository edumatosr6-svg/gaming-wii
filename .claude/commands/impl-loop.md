---
description: Roda o Implementation AI Loop para um slug (Coding Loop + Testing Loop até SUCCESS, FAIL SPEC ou --max-iterations)
argument-hint: <slug> [--max-iterations N]
---

Parse `$ARGUMENTS` como:
- `slug`: primeiro argumento posicional (obrigatório).
- `--max-iterations N`: opcional, padrão `5`.

Se `slug` não foi passado, pare e peça para o usuário informar o slug do projeto/feature.

Antes de invocar o subagent, confirme que `specs/<slug>/software-specs.md` existe. Se não
existir, avise o usuário para rodar `/spec-loop <slug>` primeiro e pare.

Invoque o subagent `impl-loop-agent` (via Task) passando `slug` e `max_iterations`.

Ao receber a resposta do subagent, repasse para o usuário de forma clara:
- Se `STATUS: SUCCESS`: confirme e resuma o que foi implementado.
- Se `STATUS: FAIL_SPEC`: explique que a especificação precisa de revisão humana, mostre o
  caminho de `specs/<slug>/implementation-report.md` e pergunte se o usuário quer revisá-lo
  agora (isso corresponde ao passo "Review (Human)" do macroprocesso) antes de rodar
  `/spec-loop <slug>` novamente.
- Se `STATUS: FAILED_MAX_ITERATIONS`: explique o que continua falhando e pergunte se o
  usuário quer aumentar `--max-iterations` ou investigar manualmente.
