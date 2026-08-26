---
name: spec-generator
description: Gera ou atualiza as especificações de software (features, procedures, data-models, KPIs), de testes e de tools/ferramentas de um slug, a partir dos inputs disponíveis (descriptions, references, research report, implementation report). Use dentro do spec-loop, no passo "Generate/Update Specs (AI)".
---

# spec-generator

## Objetivo

Produzir (ou atualizar, se já existirem) três artefatos em `specs/<slug>/`:

1. `software-specs.md` — features, procedimentos, data models e KPIs (ver skill `spec-kpis`
   para a parte de KPIs).
2. `tests/` — specs de teste: para cada feature/critério de aceite, o que deve ser testado
   (não o código do teste em si).
3. `tools/` — specs de tooling: dependências, ferramentas de build/lint/test, integrações
   externas necessárias para implementar as specs.

## Inputs a considerar (nessa ordem de prioridade)

1. `specs/<slug>/implementation-report.md`, se existir — feedback vindo de uma tentativa de
   implementação que falhou por causa da spec (`FAIL SPEC`). Trate como a fonte mais
   importante de correção: a spec anterior tinha um problema real que este relatório aponta.
2. `specs/<slug>/reports/spec-validation-report.md`, se a última rodada foi `FAILED` —
   corrija exatamente os pontos listados.
3. `specs/<slug>/research-report.md`, se existir.
4. `specs/<slug>/descriptions.md` — a fonte primária de intenção do humano (features, KPIs,
   arquitetura).
5. `specs/<slug>/references/` — padrões, links, docs que restringem ou orientam a spec.

Se `specs/<slug>/software-specs.md` já existir, isso é uma **atualização**, não uma reescrita
do zero: preserve o que ainda é válido, só ajuste o que os inputs acima indicam que mudou.

## Estrutura de `software-specs.md`

```markdown
# <Slug> — Software Specs

## Visão geral
(1-2 parágrafos: o que este software/feature faz e por quê)

## Features
### <Nome da feature>
- Descrição
- Critérios de aceite (verificáveis, não ambíguos)

## Procedures
(fluxos/processos que o sistema deve executar — passo a passo, entradas/saídas)

## Data Models
(entidades, campos, relações, invariantes)

## KPIs
(ver skill spec-kpis — métricas mensuráveis de sucesso)
```

## Estrutura de `tests/`

Um arquivo markdown por feature ou área, ex. `tests/<feature>.md`, listando casos de teste
em linguagem natural estruturada (dado/quando/então), cobrindo caminho feliz, bordas e
falhas esperadas. Isso é o que o `impl-tester` vai usar para saber o que testar.

## Estrutura de `tools/`

`tools/dependencies.md` (bibliotecas/frameworks necessários e por quê), `tools/tooling.md`
(lint, formatter, test runner, CI, scripts de build) — só inclua o que é realmente exigido
pelas specs, não uma lista genérica.

## Regras

- Nunca deixe uma feature sem critério de aceite verificável — isso é o que o
  `spec-validator` vai rejeitar primeiro.
- Seja explícito sobre o que está **fora de escopo**, quando relevante — evita ambiguidade
  no impl-loop.
- Não gere código nesta etapa. Specs descrevem O QUE, não COMO implementar.
