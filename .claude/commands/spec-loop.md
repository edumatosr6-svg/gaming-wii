---
description: Roda o Specification AI Loop para um slug (gera e valida specs até SUCCESS ou --max-iterations)
argument-hint: <slug> [--max-iterations N]
---

Parse `$ARGUMENTS` como:
- `slug`: primeiro argumento posicional (obrigatório).
- `--max-iterations N`: opcional, padrão `3`.

Se `slug` não foi passado, pare e peça para o usuário informar o slug do projeto/feature.

Invoque o subagent `spec-loop-agent` (via Task) passando `slug` e `max_iterations`
extraídos acima.

Ao receber a resposta do subagent, repasse para o usuário de forma clara:
- Se `STATUS: SUCCESS`: confirme e liste os arquivos gerados/atualizados.
- Se `STATUS: FAILED_MAX_ITERATIONS`: explique o que continua falhando (resumo do subagent)
  e pergunte se o usuário quer ajustar `descriptions.md`/`references/` manualmente e rodar
  `/spec-loop` de novo, ou aumentar `--max-iterations`.
