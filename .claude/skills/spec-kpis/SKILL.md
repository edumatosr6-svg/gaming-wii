---
name: spec-kpis
description: Define e valida a seção de KPIs (métricas de sucesso mensuráveis) dentro das software specs. Use em conjunto com spec-generator, sempre que a seção "KPIs" de software-specs.md estiver sendo criada ou atualizada.
---

# spec-kpis

## Objetivo

Garantir que cada feature/critério importante das specs tenha ao menos um KPI mensurável
associado — uma forma objetiva de saber se a implementação atingiu o resultado esperado.

## O que é um bom KPI aqui

- **Mensurável**: um número, uma taxa, um tempo, um booleano verificável automaticamente —
  nunca "melhorar a experiência do usuário" sem uma métrica por trás.
- **Verificável pelo impl-loop**: idealmente algo que o `impl-tester` ou um script consiga
  checar (ex: "tempo de resposta do endpoint X < 200ms", "taxa de erro no fluxo Y = 0 nos
  testes de integração", "cobertura de testes da feature Z ≥ 80%").
- **Rastreável até uma feature específica** — não KPIs soltos de negócio que ninguém vai
  medir nesse ciclo.

## Formato em `software-specs.md`

```markdown
## KPIs
| KPI | Feature relacionada | Meta | Como verificar |
|---|---|---|---|
| Tempo de resposta do checkout | Checkout flow | p95 < 300ms | teste de carga em tests/checkout.md |
| Taxa de sucesso no pagamento | Checkout flow | ≥ 99% nos testes de integração | tests/payment.md |
```

## Regras

- Se uma feature não tem KPI possível (ex: puramente estética), diga isso explicitamente em
  vez de inventar uma métrica artificial.
- KPIs vagos ("boa performance", "código limpo") são o tipo de coisa que o
  `spec-validator` deve reprovar — ao gerar, já evite escrever isso.
- Prefira poucos KPIs realmente verificáveis a muitos KPIs decorativos.
