---
description: Roda o macroprocesso completo para um slug — spec-loop, depois impl-loop; se impl-loop reportar FAIL SPEC, pausa para revisão humana antes de repetir o spec-loop
argument-hint: <slug> [--max-spec-iterations N] [--max-impl-iterations N] [--max-cycles N]
---

Parse `$ARGUMENTS` como:
- `slug`: primeiro argumento posicional (obrigatório).
- `--max-spec-iterations N`: opcional, padrão `3` (repassado a `/spec-loop`).
- `--max-impl-iterations N`: opcional, padrão `5` (repassado a `/impl-loop`).
- `--max-cycles N`: opcional, padrão `3` — quantas vezes o macroprocesso pode voltar de
  `impl-loop` (FAIL SPEC) para `spec-loop` antes de parar de vez e escalar para o usuário.

Se `slug` não foi passado, pare e peça para o usuário informar o slug.

## Algoritmo

`cycle = 1`

Enquanto `cycle <= max-cycles`:

1. Rode `/spec-loop <slug> --max-iterations <max-spec-iterations>`.
   - Se o resultado for `FAILED_MAX_ITERATIONS`, pare todo o macroprocesso aqui e explique
     ao usuário — não adianta ir para implementação com specs não aprovadas.
2. Rode `/impl-loop <slug> --max-iterations <max-impl-iterations>`.
   - Se `STATUS: SUCCESS`: pare e anuncie sucesso do macroprocesso completo.
   - Se `STATUS: FAILED_MAX_ITERATIONS`: pare e escale para o usuário (não é um caso de
     `FAIL SPEC`, é um caso de o loop de implementação não convergir mesmo com specs boas —
     merece investigação manual).
   - Se `STATUS: FAIL_SPEC`: este é o passo **"Review (Human)"** do diagrama. Mostre ao
     usuário o `specs/<slug>/implementation-report.md` gerado e pergunte explicitamente se
     ele quer:
     (a) revisar/editar `descriptions.md` ou `references/` manualmente com base no relatório
         antes de continuar, ou
     (b) deixar o `spec-loop` já usar o `implementation-report.md` como está na próxima
         rodada.
     **Não prossiga automaticamente para o próximo ciclo sem essa confirmação do usuário** —
     esse humano-no-loop é intencional no processo, não um detalhe a pular.
     Após a confirmação, incremente `cycle` e volte ao passo 1.

Se `cycle > max-cycles` sem sucesso, pare e informe ao usuário que o macroprocesso não
convergiu em `max-cycles` ciclos completos e que provavelmente há algo estrutural a
repensar (arquitetura, escopo, ou as diretivas de código) antes de tentar de novo.
