---
name: spec-validator
description: Valida software-specs.md, tests/ e tools/ de um slug quanto a completude, consistência e verificabilidade, produzindo um veredito SUCCESS ou FAILED com razões acionáveis. Use dentro do spec-loop, no passo "Spec Validator (AI)".
---

# spec-validator

## Objetivo

Revisar os specs gerados/atualizados pelo `spec-generator` e decidir se estão prontos para
seguir para implementação (`SUCCESS`) ou se precisam de outra iteração (`FAILED`).

Este passo é um gate de qualidade, não uma reescrita — não edite os specs, apenas avalie e
reporte.

## Checklist

- **Completude**: toda feature em `descriptions.md` está coberta em `software-specs.md`?
  Toda feature tem critérios de aceite verificáveis?
- **KPIs**: existem KPIs mensuráveis (ver skill `spec-kpis`) para as features relevantes, ou
  uma justificativa explícita de por que não se aplica?
- **Testabilidade**: `tests/` cobre caminho feliz, bordas e falhas para cada feature? Dá pra
  transformar cada caso em um teste automatizável?
- **Consistência interna**: data models, procedures e features não se contradizem?
- **Consistência entre slugs (contratos externos)**: existem outros slugs em `specs/`?
  Se sim, verifique os **contratos que atravessam a fronteira** entre eles antes de
  aprovar. Um slug pode produzir o que outro consome — um protocolo, um formato de
  dados, a semântica de um valor, uma rota, um arquivo compartilhado. Mudar um lado sem
  o outro é uma inconsistência real, e é invisível para quem só olha um slug por vez.
  - Leia o `software-specs.md` dos slugs relacionados e identifique o que este slug
    **produz para eles** e o que **consome deles**.
  - Para cada contrato, confirme que as duas pontas descrevem a mesma coisa: mesmos
    campos, mesma unidade, mesmo intervalo, mesmo sentido, mesmo significado.
  - Atenção especial a mudanças de **semântica sem mudança de forma** — um valor que
    continua sendo "um número entre -1 e 1" mas passou a significar outra coisa não
    quebra nada visivelmente e é o caso mais perigoso.
  - Se a mudança for deliberada, exija que a spec do outro lado seja atualizada na mesma
    rodada **ou** que a incompatibilidade esteja registrada explicitamente (em
    Observações e na spec), com o slug afetado nomeado. Contrato quebrado em silêncio é
    motivo de `FAILED`.
- **Consistência com `implementation-report.md`** (se existir): os problemas relatados na
  última tentativa de implementação foram de fato endereçados?
- **Consistência com `references/`**: specs respeitam os padrões/restrições citados?
- **Tools**: `tools/` lista o necessário e nada supérfluo/especulativo?
- **Ambiguidade**: existe alguma frase que um implementador razoável poderia interpretar de
  duas formas diferentes? Se sim, é motivo de reprovação.

## Output: `specs/<slug>/reports/spec-validation-report.md`

```markdown
# Spec Validation Report — <slug>

**Veredito: SUCCESS | FAILED**

## Pontos verificados
- [x/•] Completude
- [x/•] KPIs
- [x/•] Testabilidade
- [x/•] Consistência interna
- [x/•] Consistência entre slugs (contratos externos)
- [x/•] Consistência com implementation-report
- [x/•] Tools

## Contratos entre slugs
(um por linha: `<slug> — <o que atravessa a fronteira> — compatível | quebrado | n/a`.
Se não houver outros slugs, diga isso explicitamente em vez de omitir a seção.)

## Problemas encontrados (se FAILED)
1. <onde> — <o que está errado> — <o que precisa mudar>
2. ...

## Observações (mesmo se SUCCESS)
(riscos, suposições assumidas, débitos aceitos conscientemente)
```

## Regras

- Seja específico o suficiente para que o `spec-generator` consiga corrigir sem re-perguntar
  nada — aponte arquivo e trecho, não só "melhorar clareza".
- Não reprove por preferências estilísticas; reprove por ambiguidade, incompletude ou
  inconsistência real.
- Se o mesmo problema aparecer em duas rodadas seguidas, sinalize isso explicitamente no
  relatório (`recorrente: sim`) — ajuda o loop a perceber que precisa escalar para revisão
  humana em vez de insistir.
