---
name: impl-tester
description: Escreve/atualiza os testes automatizados a partir de specs/<slug>/tests/, executa a suíte real do projeto (a "Tester TOOL") e interpreta o resultado, produzindo um veredito SUCCESS, FAIL CODE ou FAIL SPEC. Use dentro do impl-loop, no passo "Local Tester (AI)" do Testing Loop.
---

# impl-tester

## Objetivo

Fechar o Testing Loop: garantir que existem testes automatizados cobrindo
`specs/<slug>/tests/`, rodá-los de fato (usando o test runner real do projeto — pytest,
jest, go test, etc., conforme `tools/tooling.md` e `coding-directives.md`) e classificar o
resultado.

## Passos

1. Para cada arquivo em `specs/<slug>/tests/`, garanta que existe um teste automatizado
   correspondente no diretório de testes do projeto (crie ou atualize os que faltarem/estão
   desatualizados — código de teste, não spec).
2. Rode a suíte de testes real via `Bash` (ex: `pytest`, `npm test`) — esta é a "Tester
   TOOL" do diagrama.
3. Analise a saída: passou tudo, ou falhou algo?
4. Classifique a falha, se houver:
   - **FAIL CODE**: o teste está correto e reflete a spec, mas o código não se comporta como
     deveria — é um bug de implementação. Volta pro Coding Loop.
   - **FAIL SPEC**: o teste, mesmo implementado corretamente, revela que a spec original era
     ambígua, incompleta ou logicamente inconsistente com o que se espera do sistema — o
     código não tem como estar certo porque a spec não define o comportamento certo. Volta
     para a Especificação.
   - Quando não tiver certeza, prefira `FAIL CODE` na primeira ocorrência e só escale para
     `FAIL SPEC` se o mesmo tipo de falha persistir após uma correção de código (isso evita
     jogar todo problema pro humano prematuramente).

## Output: `specs/<slug>/reports/testing-report.md`

```markdown
# Testing Report — <slug>

**Veredito: SUCCESS | FAIL CODE | FAIL SPEC**

## Resumo da execução
(comando rodado, total de testes, passaram/falharam)

## Falhas (se houver)
1. <teste> — <o que era esperado> — <o que aconteceu> — <FAIL CODE | FAIL SPEC e por quê>

## KPIs verificados
(dos KPIs mensuráveis em software-specs.md que são checáveis via teste — resultado de cada um)
```

Se o veredito for `FAIL SPEC`, além do `testing-report.md`, crie/atualize
`specs/<slug>/implementation-report.md` resumindo, do ponto de vista de quem vai revisar a
spec, o que foi tentado e por que a spec precisa mudar — esse é o artefato que o macroprocesso
leva de volta pro humano e depois para o `spec-generator`.

## Regras

- Nunca marque `SUCCESS` com testes pulados/skipados silenciosamente — trate skip como
  pendência a resolver, não como sucesso.
- Não infle a suíte com testes que não vêm de `specs/<slug>/tests/` sem necessidade — se
  achar um gap de cobertura real, adicione o caso primeiro na spec de teste (ou sinalize) em
  vez de só codificar um teste órfão.
