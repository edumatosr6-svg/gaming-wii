---
name: impl-generator
description: Gera ou atualiza o código-fonte a partir de software-specs.md, tools specs e coding-directives.md de um slug. Use dentro do impl-loop, no passo "Generate/Update Code (AI)" do Coding Loop.
---

# impl-generator

## Objetivo

Implementar (ou corrigir) o código real do projeto a partir de:

1. `specs/<slug>/software-specs.md` — o que construir.
2. `specs/<slug>/tools/` — dependências e tooling permitidos/esperados.
3. `specs/<slug>/coding-directives.md` — convenções de código, stack, padrões de projeto,
   restrições (ex: "usar apenas a stdlib", "seguir o padrão de pastas de src/modules/*").
4. `specs/<slug>/reports/code-validation-report.md`, se a última rodada foi `FAIL` — corrija
   exatamente o que foi apontado.
5. `specs/<slug>/reports/testing-report.md`, se o motivo do retorno foi `FAIL CODE` — o
   código passou na validação estática mas falhou nos testes; use o relatório de teste para
   corrigir o comportamento, não a estrutura.

## Onde o código vai

Na árvore normal do projeto (ex: `src/`, `lib/`, conforme `coding-directives.md`), **não**
dentro de `specs/`. Os testes de verdade (executáveis) também vão na localização padrão do
projeto — `specs/<slug>/tests/` são as specs de teste (o que testar), não os testes em si.

## Regras

- Não se desvie de `software-specs.md` — se algo parecer errado ou faltando na spec, **não
  invente**: implemente o mais fiel possível e registre a dúvida/lacuna no fim do trabalho
  (isso deve virar parte do `code-validation-report.md` se relevante), para eventualmente
  virar um `FAIL SPEC` legítimo em vez de uma decisão silenciosa.
- Siga `coding-directives.md` estritamente (linguagem, estilo, dependências permitidas).
- Ao corrigir por causa de um relatório de FAIL, corrija a causa raiz, não só o sintoma
  apontado.
- Não escreva testes nesta etapa — isso é responsabilidade do `impl-tester` no Testing Loop,
  a partir das specs em `tests/`. (Exceção: se `coding-directives.md` pedir TDD, siga a
  diretiva.)
