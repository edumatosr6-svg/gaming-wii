# Spec Validation Report — fruit-ninja

**Iteração:** 2 (de no máximo 3)
**Veredito: SUCCESS**

## Pontos verificados

- [x] **Completude** — todas as features do `descriptions.md` estão em
  `software-specs.md` (F1 apontamento absoluto, F2 rastro, F3 arremesso, F4 corte por
  movimento, F5 bombas, F6 combos, F7 vidas/dificuldade, F8 pontuação, F9 rumble,
  F10 áudio, F11 aguardando controle, F12 calibração, F13 loop de passo fixo, F14
  entrega/restrições), cada uma com critérios de aceite numerados e verificáveis.
  Segunda onda e fora de escopo declarados.
- [x] **KPIs** — 10 KPIs, todos com meta numérica ou critério observável e com o arquivo
  de teste que os verifica. As pendências da iteração 1 foram fechadas:
  `dtToleranceCss = 1 px CSS`, `bladeMaxStepCss = 1.5 × trailReferenceSpeedCssPerS / 60`
  (= 20 px) e contadores `fruitsSpawned`/`fruitsSliced` no `GameState` dando base
  objetiva ao KPI-2. Ausência de KPI para a parte estética está justificada
  explicitamente, sem métrica artificial.
- [x] **Testabilidade** — as três faixas exigidas estão especificadas e amarradas:
  lógica pura (`pointing`, `slicing`, `entities`, `rules`, `blade-and-trail`, `loop`),
  integração em navegador headless **obrigatória** com Playwright + Chromium
  (`integration-browser.md`, B1–B17, com contrato de dublê de gamepad definido) e
  manuais com **critério observável** (`manual.md`, M1–M8). As verificações estáticas
  (`static-constraints.md`, X1–X12) cobrem as restrições arquiteturais.
  Vários casos trazem verificação **negativa** declarada (P1, P5, T5, S1, S6, L2),
  o que impede critério vacuoso.
- [x] **Consistência interna** — as contradições da iteração 1 foram removidas:
  1. F1 tem agora **uma única** fórmula de conversão (remoção da zona morta preservando
     a direção + normalização por eixo por `maxTilt − deadzone`), coerente com F1.4 e
     com P4/P5; invariante `0 <= deadzone < maxTilt <= 1` registrada em Config e
     checada por X12.
  2. Contagem de passos fixos: regra única de "no máximo 1 passo de diferença" em
     F13.1, L1 e L5.
  3. Velocidade da lâmina: medida única, por **passo fixo** sobre o segmento
     interpolado, usada por F4, F6, `BladeState.speedCssPerS`, S3 e R3.
  4. `playfield` é o termo único para a área de jogo (definido em Data Models) e
     substituiu "viewport"/"área jogável" em F1, F3, F12 e nos testes.
- [n/a] **Consistência com `implementation-report.md`** — não existe (primeira geração
  deste slug; nenhuma implementação foi tentada ainda).
- [x] **Consistência com `references/`** — corte como intersecção **segmento × círculo
  entre quadros** e em referencial relativo (F4, S1/S5/S6), passo de tempo fixo estilo
  *Fix Your Timestep* (F13), Gamepad API por polling como única fonte de input (F1, F14,
  X1/X2), eixos 2/3 do mapeamento `standard` (XInput), Web Audio sintetizado sem assets
  (F10, B12), `GamepadHapticActuator` com fallback isolado e documentado (F9, X3).
- [x] **Tools** — `tools/dependencies.md` declara zero dependências novas (runtime e
  desenvolvimento); `tools/tooling.md` fixa `pytest -q` como comando único, torna a faixa
  headless não-pulável (falha com instrução de instalação) e repete a regra de que teste
  marcado não conta como cobertura. Nada especulativo.
- [x] **Ambiguidade** — os pontos de dupla leitura apontados na iteração 1 foram
  fechados (fórmula de apontamento, onde se mede velocidade, contagem de passos, escopo
  da calibração local vs. calibração do celular, hooks de teste necessários para B7/B14,
  `playfield` vs viewport, tolerâncias sem valor).

## Problemas encontrados

Nenhum bloqueante. Todos os 9 itens da iteração 1 foram endereçados nos arquivos
citados; nenhum problema recorrente (`recorrente: não`).

## Observações

- **Riscos aceitos conscientemente:**
  - KPI-2 (cortabilidade) não tem caminho automatizado: é comparativo entre versões,
    apoiado nos contadores do `GameState` lidos no procedimento manual M5. Está
    declarado como acompanhamento, não como limiar de aceite.
  - KPI-4 (60 fps) e KPI-10 (jogável fim-a-fim) só têm caminho manual (M6, M7). Pela
    regra de `tools/tooling.md`, o `impl-tester` **não pode** declarar `SUCCESS` como se
    essa faixa estivesse coberta — o veredito precisa listar o que ficou por verificar.
    M7 é o critério de pronto da entrega.
  - `spawnForTest`/`setSeed` são superfície extra exposta em `window` só para teste.
    Débito aceito: sem eles, B7/B14 dependeriam de sorteio e a faixa headless perderia
    a capacidade de reprovar as regras de corte e de bomba. X11 garante que estão
    concentrados em um único módulo e F14 exige que não sejam acionados por nenhum
    caminho de jogo.
  - Duas zonas mortas em série (a do servidor do `wii-controller` e a de F1) — está
    registrado em F1 com a orientação de manter `deadzone` do jogo pequena. Se o
    apontamento ficar "morto" perto do centro na prática, é ponto de tuning, não de
    spec.
  - Exceção declarada em F14.2/B1: `/favicon.ico` fica fora da contagem de requisições
    falhas, porque corrigi-lo exigiria alterar o servidor, o que este slug proíbe.
- **Decisão de produto registrada**: cortar bomba encerra a partida imediatamente (F5) —
  uma das alternativas permitidas pelo `descriptions.md`, escolhida por ser severa e
  simples, e amarrada ao KPI-5 (teste R15), que verifica que sacudir o aparelho ao acaso
  pontua menos que apontar deliberadamente.
- **Atenção para o impl-loop**: F1 (path-independence), F4 (segmento × círculo com
  anti-tunneling) e a faixa headless obrigatória são os três pontos que já falharam
  historicamente neste repositório. Se algum deles for "simplificado" durante a
  implementação, o veredito correto é `FAIL`, não ajuste de tolerância.
