# Testing Report — fruit-ninja

**Veredito: SUCCESS**

Iteração 2 do Testing Loop. O defeito B13 apontado na iteração 1 foi corrigido e verificado;
a suíte inteira passa. **Este SUCCESS cobre as faixas automatizadas e não cobre os
procedimentos manuais** — a lista do que ficou por verificar está na seção própria, e é
parte do veredito, não uma nota de rodapé.

## Resumo da execução

Comando: `pytest -q` na raiz.

```
95 passed, 32 deselected in 60.66s
```

| Faixa | Onde | Resultado |
|---|---|---|
| Lógica pura (`node --test`, via `tests/test_js_suite.py`) | `tests/js/fruit-ninja-*.test.mjs` | **70 testes, todos passam** |
| Estática X1–X12 | `tests/test_fruit_ninja_static.py` | **15 testes, todos passam** |
| Navegador headless (Playwright + Chromium) | `tests/test_fruit_ninja_headless.py` | **17 testes, todos passam** |
| Manual (hardware) | `tests/test_fruit_ninja_manual.py` | **8 procedimentos, NÃO executados** |

Os 32 deselecionados são os `@pytest.mark.hardware` (24 pré-existentes do `wii-controller`
+ 8 novos de `manual.md`), excluídos da execução padrão pelo `addopts` do projeto.

**Sem regressão:** os **63 testes pré-existentes continuam passando**
(`pytest -q` ignorando os três arquivos novos: `63 passed`), exatamente o baseline. Fora de
`game/fruit-ninja/` e `tests/`, nada foi tocado: `git diff -- server/` é **vazio**, o que é
a verificação X6/X12 exigida.

A única alteração em arquivo pré-existente foi restringir `_game_js_files()` em
`tests/test_js_suite.py` a `game/js`: as checagens G13/G14/G6 são regras do slug
`wii-controller` e, varrendo `game/**`, passaram a alcançar `game/fruit-ninja/js/rumble.js`,
cujo `fetch` é a exceção que F9/X3 autorizam. Correção de escopo do teste antigo, dentro de
`tests/` e portanto permitida por X6.

Cobertura por arquivo de spec: `pointing.md` P1–P12, `slicing.md` S1–S16, `entities.md`
E1–E12, `rules.md` R1–R15, `blade-and-trail.md` T1–T8, `loop.md` L1–L7,
`static-constraints.md` X1–X12, `integration-browser.md` B1–B17, `manual.md` M1–M8.
(S11 e E11 são checagens de pureza, cobertas por `test_x7_pureza_dos_modulos_de_regra`.)

## Defeito corrigido nesta iteração

**B13 — o jogo era mudo no seu próprio fluxo principal de uso.** `unlock()` (único ponto
que instancia o `AudioContext`) só era alcançável pelo listener de `pointerdown` em
`main.js`. Como F12.5 proíbe mouse e teclado como jogabilidade, quem joga só com o celular
nunca gerava esse evento: `unlocked` ficava falso para sempre e os três sons de F10 nunca
tocavam.

Causa raiz: `loop.js` já emitia `onCalibrate`/`onStart` nas bordas de subida de `A` e
`Start`, mas `main.js` não implementava esses hooks — caíam no `noop`. A correção liga os
dois hooks a `destravarAudio()`, mantendo o listener de `pointerdown`.

Verificação direta de que F10 saiu do papel, com a página real e só o gamepad:

```
estado do audio apos calibrar: running
score: 10  fruitsSliced: 1
osciladores criados no corte: 1
```

Antes da correção o mesmo caminho dava `none` e **zero** osciladores.

## Validação por mutação dos próprios testes

Cada teste foi validado reintroduzindo o defeito que ele existe para pegar. **23 mutações
aplicadas e revertidas, todas reprovadas por pelo menos um teste**, incluindo a desta
iteração:

| Mutação | Reprovada por |
|---|---|
| **hooks `onCalibrate`/`onStart` removidos (o defeito B13 desta iteração)** | **B13** |
| `axesToTarget` reescrita por velocidade (`pos += axis*gain*dt`) | **P1**, P2, P3, P4, P5, P8, P9, P11 |
| corte no referencial absoluto (usa `pos` no lugar de `prevPos`) | S6 |
| corte só pela posição final da lâmina | S1, S4, S6, S7, S8, S10, S12, S13 |
| limiar de velocidade exclusivo (`<=`) | S3 |
| raio exclusivo (tangência não corta) | S4 |
| resultados sem ordenação por `entityId` | S8 |
| integração de Euler (sem `g·t²/2`) | E2, E4 |
| teto de simultâneas removido | E10 |
| metades assimétricas | E8 |
| `missed` sem a guarda `vel.y > 0` | E7 |
| combo sem progressão (`n` fixo) | R1, R3 |
| traço nunca quebra | R2, R3, R4 |
| nível sem saturação | R10, R11 |
| `lives` sem piso em zero | R7 |
| bomba caída custando vida | R8 |
| recorde rebaixado por partida pior | R13 |
| rastro decimado (1 amostra a cada 2) | T3, T5, T6, T8 |
| rastro sem expiração por idade | T2 |
| rastro sem teto de amostras | T3 |
| `clearTrail` que não limpa | T7, L7 |
| segmentos degenerados no quadro | L2 |
| acumulador descartado entre quadros | L1, L5 |
| `delta` sem clamp | L4 |
| pausa que não congela | L7 |
| `navigator.getGamepads` recebido por parâmetro (**o defeito da tentativa 1 do Coding Loop**) | **X1** |

**Três testes decorativos foram encontrados e corrigidos pela campanha** — passavam com e
sem o defeito, exatamente o modo de falha do ciclo anterior deste repositório:

1. **E7** posicionava a fruta "subindo" a `BOTTOM + 40` com raio 38, de modo que
   `pos.y - raio > bottom` já era falso após um passo: o teste passava por causa do raio e
   nunca exercitava a guarda `vel.y > 0`. Agora a fruta nasce fundo o bastante e o teste
   afirma as duas pré-condições antes de julgar.
2. **R7** só decrementava `lives` a partir de 1; como `registerMissed` retorna em `endGame`
   ao chegar a zero, a ausência do piso `Math.max(..., 0)` nunca aparecia. Agora o caso
   parte de `lives` **já em zero**.
3. **X1** ingênuo (`"navigator.getGamepads" in texto`) **passaria no código defeituoso da
   tentativa 1**, porque a string sobrevive no comentário do módulo. O teste passou a exigir
   também a *chamada real* por regex, e foi confirmado reprovando aquele código.

## KPIs verificados

| KPI | Como | Resultado |
|---|---|---|
| KPI-1 apontamento absoluto | P1 (igualdade exata entre caminhos) + B3 (fim a fim no navegador) | **passa** — a implementação por velocidade é reprovada nas duas faixas |
| KPI-3 continuidade do rastro | T5, com verificação negativa por decimação | **passa** — maior salto ≤ 20 px; o rastro decimado (~26,7 px) reprova |
| KPI-5 agitar não compensa | R15, 10 sementes, 60 s simulados cada | **passa** — agitar 0–150 pts vs apontar 430–480 pts; vantagem em 10/10 sementes |
| KPI-6 falsos positivos de corte | S12 | **passa** — 0 falsos positivos em 100 segmentos a `r+δ`; 100/100 travessias cortam |
| KPI-7 independência da taxa de quadros | E2, L1, R10 | **passa** (ver ressalva de L1 nas Observações) |
| KPI-8 restrições arquiteturais | X1–X12 | **passa** — 15 testes |
| KPI-9 carrega limpo | B1 | **passa** — 200, console sem erros, 0 recursos do jogo com status ≥ 400 |
| KPI-2 cortabilidade | M5 | **NÃO VERIFICADO** — manual |
| KPI-4 taxa de quadros (≥ 55 fps) | M6 | **NÃO VERIFICADO** — manual |
| KPI-10 produto jogável fim a fim | M7 | **NÃO VERIFICADO** — manual |

## O que ficou por verificar

`tools/tooling.md` proíbe declarar `SUCCESS` apoiado em faixa cuja verificação foi adiada
para manual não executado, e exige que o veredito liste explicitamente o que ficou de fora.
Este `SUCCESS` vale para as faixas automatizadas. **Não** cobre:

- **Os 8 procedimentos M1–M8**, que exigem celular pareado, driver ViGEmBus e gamepad
  virtual real — indisponíveis neste ambiente. Ficam sem verificação **KPI-2**
  (cortabilidade), **KPI-4** (≥ 55 fps sem engasgo) e **KPI-10** (M7, partida completa só
  com o celular — o *critério de pronto* declarado pela própria spec de teste, que diz que
  nenhuma entrega é completa sem ele).
- **Qualidade percebida**, por construção fora do alcance automatizado: distinguibilidade
  visual da bomba (M2), continuidade percebida do rastro (M3) e distinguibilidade de
  vibração e som (M4). A faixa automatizada prova a *geometria* do rastro (T5) e que o som é
  *produzido* (sonda de F10 acima), não que sejam agradáveis ou distinguíveis a olho e
  ouvido.
- **Comportamento do áudio em navegador com autoplay estrito** — ver Observação 2.

Em resumo: a suíte prova que o jogo **liga as peças e obedece às regras**; ela não prova que
**é bom de jogar com o aparelho na mão**. Essa parte continua dependendo de M1–M8.

## Observações — lacunas de spec (não bloqueiam este veredito)

1. **L1 (`tests/loop.md`) é aritmeticamente insatisfazível como está escrito.** Exige ao
   mesmo tempo que o número de passos fixos a 60 Hz e 144 Hz difira em **até 1** e que os
   estados finais fiquem dentro de `dtToleranceCss` (1 px). Medido: 240 vs 239 passos — o
   passo extra desloca a entidade em `vel × fixedStepS`, ~2,3 px na medição e até ~9 px nas
   velocidades de arremesso do jogo. Nenhuma implementação satisfaz as duas cláusulas
   juntas. O teste preserva a intenção do KPI-7 separando-as, com a razão documentada no
   código: (a) agendamento — passos diferem em ≤ 1 no mesmo orçamento de tempo real;
   (b) equivalência de estado — comparada no **mesmo tempo simulado**, onde bate exatamente.
   Recomendação para a próxima revisão da spec: escrever L1 assim.
2. **F10.2 não define como o áudio destrava num produto controlado só por gamepad.** A
   correção desta iteração resolve o defeito e é verificável no Chromium headless (onde o
   `AudioContext` nasce `running`), mas num navegador *headed* com autoplay estrito a
   entrada de gamepad **não** conta como ativação do usuário e o contexto pode ficar
   `suspended`. Se o áudio precisa ser garantido no produto real, a spec deve prever uma
   afordância explícita (ex.: "clique uma vez para habilitar o som" na tela de aguardando),
   o que não conflita com F12.5 — ela proíbe mouse/teclado como **jogabilidade**, não como
   consentimento único. **Isto é o principal candidato a virar item de spec na próxima
   rodada.**
3. **`levels[].launchSpeedRange` interpretada como fração**, não px/s: `tests/entities.md`
   E6 não fixa a unidade e os testes seguem a leitura do código (fração da velocidade que
   mantém o ápice na tela). E5 e E6 passam nessa leitura nos 6 níveis.
4. **B7** afirma `fruitsSliced >= antes + 1` em vez de exatamente 1, porque durante a
   partida o jogo também arremessa frutas próprias que podem cruzar a varredura. A
   identidade do corte é verificada de forma exata: a entidade de `spawnForTest` sai dos
   ativos e gera exatamente 2 metades com o `parentId` dela.
