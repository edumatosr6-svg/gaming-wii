# specs/

Cada subpasta aqui (exceto `_template/`) é um **slug** de projeto/feature — um ciclo
completo do macroprocesso `spec-loop -> impl-loop`.

## Como começar um novo slug

```bash
cp -r specs/_template specs/<slug>
```

Preencha `specs/<slug>/descriptions.md` (obrigatório) e, se aplicável,
`specs/<slug>/references/` e `specs/<slug>/coding-directives.md` (este último pode ser
preenchido antes do `/impl-loop`, não precisa estar pronto para rodar o `/spec-loop`).

## Rodando o processo

```
/spec-loop <slug> --max-iterations 5
/impl-loop <slug> --max-iterations 5
```

ou o macroprocesso completo, que já lida com a volta para revisão humana quando necessário:

```
/dev-process <slug>
```

Veja `CLAUDE.md` na raiz do projeto para o desenho completo do processo.
