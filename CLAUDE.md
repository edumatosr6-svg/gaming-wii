# Software Development with AI — Macroprocess

Este projeto implementa o processo de desenvolvimento assistido por IA descrito em
`SWEng AI Process Diagrams`. É um macroprocesso de dois loops encadeados:

```
START --> spec-loop --[SUCCESS]--> SPECS --> impl-loop --[SUCCESS]--> SOFTWARE
                                                  |
                                            [FAILED / FAIL SPEC]
                                                  v
                                          Review (Human) --[Update Spec]--> spec-loop
```

- **spec-loop** (`/spec-loop`): gera/atualiza as especificações (software, testes, tools) e
  as valida em loop até aprovação.
- **impl-loop** (`/impl-loop`): gera/atualiza o código a partir das specs (Coding Loop),
  valida o código, roda os testes (Testing Loop) e produz o software final. Se os testes
  falharem por causa de código, volta pro Coding Loop. Se falharem porque a spec estava
  errada/incompleta, para e devolve para revisão humana.
- **dev-process** (`/dev-process`): orquestra o macroprocesso completo, ligando os dois loops
  e pausando para revisão humana quando o impl-loop reporta `FAIL SPEC`.

## Convenção de pastas

Cada feature/projeto tem um **slug** (ex: `checkout-flow`). Todos os artefatos do processo
ficam em `specs/<slug>/`:

```
specs/<slug>/
  descriptions.md              # input humano: features, KPIs, arquitetura
  references/                  # input humano: padrões, links, docs
  research-report.md           # input: feedback vindo da fase de pesquisa (se houver)
  implementation-report.md     # gerado quando impl-loop falha por causa da spec
  coding-directives.md         # input humano: convenções de código, stack, restrições
  software-specs.md            # output do spec-loop
  tests/                       # output do spec-loop: specs de teste
  tools/                       # output do spec-loop: specs de ferramentas/dependências
  reports/
    spec-validation-report.md
    code-validation-report.md
    testing-report.md
```

O **código-fonte real** gerado pelo impl-loop vai na árvore normal do projeto (ex: `src/`,
`tests/` na raiz), não dentro de `specs/`. Os specs em `specs/<slug>/tests/` descrevem O QUE
testar; os testes de verdade (executáveis) vivem onde o projeto já organiza seus testes.

Use `specs/_template/` como ponto de partida ao criar um novo slug.

## Skills

Cada papel do diagrama é uma skill em `.claude/skills/`:

| Skill | Papel no diagrama |
|---|---|
| `spec-generator` | Generate/Update Specs (AI) |
| `spec-kpis` | apoio ao spec-generator para definir KPIs mensuráveis |
| `spec-validator` | Spec Validator (AI) |
| `impl-generator` | Generate/Update Code (AI) |
| `impl-validator` | Code Validator (AI) |
| `impl-tester` | Local Tester (AI) — usa a ferramenta de testes real do projeto |

## Subagents

`.claude/agents/spec-loop-agent.md` e `.claude/agents/impl-loop-agent.md` implementam a
lógica de loop (gerar → validar → repetir até SUCCESS ou `--max-iterations`), isolando cada
iteração em contexto próprio. Os comandos slash apenas delegam pra eles.

## Modelos

Por enquanto este processo roda 100% com o Claude Code nativo (modelos de nuvem). Integração
com modelos locais (Ollama/Qwen) fica para uma fase futura — os pontos de extensão são as
skills `impl-generator`/`impl-validator`/`impl-tester`, que podem futuramente chamar um
script externo em vez do modelo do Claude Code diretamente.
