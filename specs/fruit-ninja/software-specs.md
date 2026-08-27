# fruit-ninja — Software Specs

## Visão geral

Jogo de cortar frutas arremessadas, rodando no navegador do PC e jogado com o celular
como controle, através do gamepad virtual XInput criado pelo projeto `wii-controller`.
A **inclinação atual** do aparelho determina a **posição** da lâmina na tela
(apontamento absoluto); o corte acontece quando o segmento percorrido pela lâmina entre
dois passos de simulação atravessa a fruta acima de uma velocidade mínima.

O jogo existe primeiro como **instrumento de avaliação do controle** e só depois como
entretenimento: o caminho percorrido pela lâmina é a jogada, então atraso, tremor e
descontinuidade aparecem de imediato. Consequências diretas dessa finalidade, que
atravessam toda esta spec:

1. O apontamento é **absoluto** (F1) — a mesma inclinação sempre produz a mesma posição,
   independentemente do caminho percorrido antes. Interpretação por velocidade
   (analógico convencional) é reprovação, não alternativa.
2. O input vem **exclusivamente da Gamepad API** (F14). Ler o WebSocket do controle
   daria menos latência, mas testaria um caminho que nenhum jogo real usa.
3. As specs de teste cobrem três faixas obrigatórias — lógica pura, integração em
   navegador headless e procedimentos manuais com critério **observável** —, porque
   neste repositório já houve suíte verde com produto inutilizável (ver
   `tools/tooling.md`).

Entrega: arquivos estáticos em `game/fruit-ninja/`, servidos pelo servidor existente do
`wii-controller` na rota `/game/fruit-ninja/`. **Nenhuma alteração no servidor é
permitida por esta spec.**

## Features

### F1 — Apontamento absoluto da lâmina (requisito nº 1)

- Descrição:
  - `input.js` é o **único** módulo que chama `navigator.getGamepads()`. Ele lê os
    eixos do analógico direito do gamepad XInput (`axes[2]` = horizontal, `axes[3]` =
    vertical, mapeamento `standard`) e os converte em **posição absoluta** da lâmina.
  - A conversão é uma **função pura e sem memória**
    `axesToTarget(rawX, rawY, calibration, config, playfield) -> {x, y}`: para os mesmos
    argumentos, o mesmo resultado, sempre. Não existe integração, acumulação, nem
    dependência do quadro anterior nessa função.
  - Definição exata da conversão (nesta ordem, sem etapas extras; **uma única
    normalização**, para não haver duas fórmulas concorrentes):
    1. **Recentragem**: `cx = rawX - calibration.x`, `cy = rawY - calibration.y`.
    2. **Magnitude e direção**: `m = hypot(cx, cy)`. Se `m <= deadzone`, o resultado é
       o centro do `playfield` (a lâmina fica no centro) e a conversão termina aqui.
       Caso contrário, a direção é `u = (cx, cy) / m`.
    3. **Normalização única** (zona morta e borda no mesmo passo): remove-se a zona
       morta preservando a direção, `d = u * (m - deadzone)`, e normaliza-se **por
       eixo** pela mesma escala:
       `n.x = clamp(d.x / (maxTilt - deadzone), -1, +1)` e
       `n.y = clamp(d.y / (maxTilt - deadzone), -1, +1)`.
       Consequências exatas, que não podem ser reinterpretadas: `m = deadzone` ⇒
       `n = (0, 0)` (centro, sem salto); `(cx, cy) = (±maxTilt, 0)` ⇒ `n.x = ±1`
       (borda direita/esquerda); `(0, ±maxTilt)` ⇒ `n.y = ±1`; inclinação combinada de
       `maxTilt` nos dois eixos ⇒ canto. Valores além disso ficam **na** borda (clamp).
       **Invariante de configuração:** `0 <= deadzone < maxTilt <= 1`.
    4. **Projeção no playfield**: `x = playfield.x + playfield.width * (n.x + 1) / 2`,
       `y = playfield.y + playfield.height * (n.y + 1) / 2`. Eixo Y do gamepad para
       baixo positivo (convenção XInput/`standard`), igual ao eixo Y do Canvas — sem
       inversão.
  - `n = (0, 0)` (aparelho na posição calibrada) projeta **exatamente** o centro do
    `playfield`; `n = (±1, ±1)` projeta os cantos. Voltar à posição neutra traz a lâmina
    de volta ao centro, não a faz parar onde estava.
  - **Calibração é local ao jogo** (ver F12): o offset é aplicado aqui, em `input.js`.
    O jogo **não envia nada** ao servidor do `wii-controller` (não pode: F14 proíbe
    rede fora do fallback de rumble), então o botão de calibrar do celular e o `A` do
    jogo são mecanismos independentes. Uma recalibração feita no celular apenas muda os
    valores de eixo recebidos; o jogo trata como qualquer outra mudança de entrada, e o
    jogador pode recalibrar em jogo com `A`. Consequência aceita: a zona morta de F1 é a
    **segunda** do caminho (o servidor já aplica a sua), então `deadzone` do jogo deve
    ser pequena — apenas o suficiente para não tremer no centro.
  - **Suavização permitida, com limite explícito.** É permitido um filtro passa-baixa de
    primeira ordem entre a posição exibida e o alvo (`pos += (target - pos) * alpha`,
    com `alpha` calculado a partir de `dt` e da constante de tempo `smoothingTauMs` de
    `config.js`), para atenuar tremor. Restrições que tornam isso compatível com
    apontamento absoluto:
    - o filtro é **convergente**: mantida a inclinação constante, a posição converge
      para `axesToTarget(...)` e permanece nela;
    - `smoothingTauMs <= 60 ms`, e a convergência dentro da tolerância
      `pointingToleranceCss` (ver Data Models) ocorre em no máximo
      `pointingSettleMs = 250 ms`;
    - o filtro **nunca** é a fonte da posição alvo: não há termo dependente de
      velocidade, deflexão-como-velocidade ou acúmulo.
  - Comportamento com o gamepad ausente ou desconectado: ver F11.
- Critérios de aceite:
  1. **Path-independence da função pura (o critério do requisito nº 1)**: para qualquer
     par de sequências distintas de amostras de eixo que terminem na mesma amostra
     `(rawX, rawY)`, com a mesma calibração e o mesmo `playfield`, `axesToTarget` devolve
     posições **idênticas** (igualdade exata de ponto flutuante). Implementação por
     velocidade falha aqui por construção.
  2. **Path-independence do sistema com suavização**: partindo de duas posições
     iniciais quaisquer da lâmina (ex.: canto superior esquerdo e canto inferior
     direito), aplicando a mesma inclinação constante, a posição exibida converge para
     o mesmo ponto, com diferença `<= pointingToleranceCss` (1 px CSS), em no máximo
     `pointingSettleMs` (250 ms) de tempo simulado.
  3. **Neutro é centro**: com calibração aplicada e eixos iguais ao centro calibrado, a
     posição alvo é o centro do `playfield` (diferença `<= pointingToleranceCss`).
  4. **Cobertura das bordas**: `(cx, cy) = (+maxTilt, 0)` projeta a borda direita do
     `playfield`; `(-maxTilt, 0)`, a esquerda; `(0, ±maxTilt)`, as bordas
     inferior/superior; `(±maxTilt, ±maxTilt)`, os cantos. Valores além de `maxTilt` são
     fixados na borda (a posição nunca sai do `playfield`).
  5. **Continuidade**: `axesToTarget` não apresenta descontinuidade na fronteira da zona
     morta — variando `m` de `deadzone - ε` para `deadzone + ε`, o deslocamento
     resultante tende a zero com `ε`.
  6. **Isolamento do input**: nenhum módulo além de `input.js` referencia
     `navigator.getGamepads`; nenhum módulo do jogo constrói `WebSocket` (exceção única:
     F9 fallback de rumble).
  7. **Detecção por polling**: o jogo identifica o gamepad lendo `navigator.getGamepads()`
     a cada quadro; o evento `gamepadconnected` pode ser usado como atalho, mas o jogo
     funciona mesmo se ele nunca disparar (exigência do dublê de teste, ver
     `tests/integration-browser.md`).

### F2 — Rastro da lâmina

- Descrição:
  - `blade.js` mantém, de forma pura, o histórico recente de posições da lâmina:
    `pushSample(bladeState, {x, y, t}) -> bladeState'`, descartando amostras mais
    antigas que `trailDurationMs` (`config.js`).
  - O rastro é desenhado por `render.js` como uma polilinha ligando as amostras
    retidas, com opacidade/espessura decrescentes da ponta (mais recente) para a cauda.
  - O rastro é o revelador visual da qualidade do apontamento: ele **não** pode ser
    reamostrado nem decimado a uma taxa menor que a de amostragem do input.
- Critérios de aceite:
  1. `pushSample` é puro: não lê relógio, não toca DOM/Canvas; recebe `t` como
     argumento e devolve novo estado (o estado de entrada não é mutado).
  2. Amostras com idade `> trailDurationMs` em relação à mais recente são removidas; a
     mais recente nunca é removida.
  3. `trailDurationMs` está entre 150 ms e 400 ms (valor exato em `config.js`), de modo
     que o rastro desaparece em fração de segundo.
  4. O número de amostras retidas nunca excede `maxTrailSamples` (`config.js`) — limite
     de memória para quadros muito rápidos —, e o descarte por limite remove sempre a
     amostra **mais antiga**.
  5. Continuidade (KPI-3): com a lâmina em movimento contínuo à velocidade de
     referência `trailReferenceSpeedCssPerS` (`config.js`, 800 px CSS/s) amostrada a
     60 Hz, a distância entre amostras consecutivas retidas é
     `<= bladeMaxStepCss`, com `bladeMaxStepCss = 1.5 * trailReferenceSpeedCssPerS / 60`
     (= 20 px CSS para o valor de referência). O fator 1,5 é a folga; uma implementação
     que descarta uma amostra a cada duas produz passos de ~26,7 px e **falha** — é
     exatamente o defeito (decimação/amostragem insuficiente) que o KPI-3 existe para
     pegar.
  6. O rastro desenhado usa exatamente as amostras retidas em `bladeState`, sem
     interpolação inventada que esconda saltos (o rastro tem que ser capaz de **mostrar**
     um engasgo, não de mascará-lo).

### F3 — Arremesso de frutas

- Descrição:
  - `entities.js` (puro) cria e integra frutas: cada arremesso surge abaixo da borda
    inferior do `playfield`, com posição horizontal, ângulo e força sorteados dentro
    das faixas do nível de dificuldade corrente (F7), e sobe em trajetória balística sob
    gravidade constante `gravityCssPerS2` (`config.js`).
  - Integração com passo de tempo fixo `fixedStepS` (F13); a aleatoriedade vem de um
    PRNG **com semente explícita** guardado no estado (determinismo exigido pelos
    testes).
  - Toda fruta tem um raio de colisão `radiusCss` e um raio de desenho igual (círculo);
    frutas são distinguidas por cor/forma, sem imagens.
  - Fruta que cruza a borda inferior **descendo**, sem ter sido cortada, é marcada como
    `missed` e removida (consequência em F7).
  - Fruta cortada (F4) é substituída por **duas metades**, que herdam a velocidade da
    fruta no instante do corte mais um impulso simétrico perpendicular à direção do
    corte, e caem sob a mesma gravidade. Metades não são cortáveis nem colidem com nada.
- Critérios de aceite:
  1. Determinismo: mesma semente + mesma sequência de passos ⇒ mesmas posições de todas
     as entidades (igualdade exata dos estados serializados).
  2. Independência de taxa de quadros: simular 2 segundos com `dt` de 1/60 s e com `dt`
     de 1/144 s, mesma semente, produz posições finais equivalentes dentro de
     `dtToleranceCss` (definida em Data Models). Requisito satisfeito pelo passo fixo de
     F13 — o teste é a evidência.
  3. Variedade: em 50 arremessos com a mesma semente, a posição inicial em X, o ângulo e
     a força de lançamento assumem ao menos 10 valores distintos cada, e todos caem
     dentro das faixas do nível corrente.
  4. Alcançabilidade: todo arremesso gerado no nível N atinge altura de ápice dentro da
     `playfield` (não passa acima do topo do `playfield`) e permanece visível por no
     mínimo `minAirtimeS` (`config.js`).
  5. Fruta não cortada que cruza a borda inferior descendo é marcada `missed` exatamente
     uma vez e removida do estado.
  6. Ao cortar, exatamente duas metades são criadas, com velocidades cuja média vetorial
     é igual à velocidade da fruta no instante do corte (impulso simétrico) e cujas
     componentes perpendiculares têm sinais opostos.
  7. Pureza: nenhuma função de `entities.js` referencia `Math.random`, `Date`,
     `performance`, `document`, `window` ou Canvas.

### F4 — Corte por movimento (segmento × círculo)

- Descrição:
  - `slicing.js` (puro) decide o corte por **intersecção segmento × círculo**, não por
    teste de posição no quadro atual. Testar só a posição falha com movimento rápido
    (*tunneling*), que é o caso de uso principal deste jogo (ver `references/`).
  - Entrada de cada passo de simulação: posição anterior e atual da lâmina
    (`bladePrev`, `bladeCurr`), posição anterior e atual da entidade (`entPrev`,
    `entCurr`), raio da entidade, `dt`.
  - **Movimento relativo**: o segmento testado é o deslocamento da lâmina **no
    referencial da entidade**: `A = bladePrev - entPrev`, `B = bladeCurr - entCurr`; há
    intersecção se a distância mínima do segmento `A→B` à origem é `<= radiusCss`. Isso
    impede tunneling tanto por lâmina rápida quanto por fruta rápida.
  - **Velocidade mínima do gesto**: o corte só é válido se
    `|bladeCurr - bladePrev| / dt >= minSliceSpeedCssPerS` (`config.js`). A velocidade é
    medida no referencial da **tela** (é o gesto do jogador que qualifica), não no
    relativo. Encostar a lâmina parada sobre a fruta não corta.
  - **Onde a velocidade é medida (sem ambiguidade)**: `bladePrev`, `bladeCurr` e `dt`
    são sempre os do **passo fixo** (`dt = fixedStepS`), sobre o segmento interpolado
    de F13. Como a interpolação dentro do quadro é linear, essa velocidade é
    numericamente igual à velocidade média do quadro — mas a regra é avaliada por
    passo, e é essa a medida usada também pela regra de traço/combo de F6 e pelo
    `speedCssPerS` do `BladeState`. Nenhuma outra medida de velocidade existe no jogo.
  - Regra de borda explícita: a comparação de distância é **inclusiva** (`<=`), ou seja,
    tangência conta como corte; a comparação de velocidade também é inclusiva (`>=`).
  - Uma entidade é cortada **no máximo uma vez**; entidades já cortadas são ignoradas
    nos passos seguintes.
  - Dentro de um mesmo passo, todas as entidades ativas são testadas contra o mesmo
    segmento; múltiplos cortes no mesmo passo são possíveis (base do combo, F6) e são
    reportados em ordem determinística (ordem de criação da entidade, crescente).
- Critérios de aceite:
  1. **Anti-tunneling**: com a fruta de raio `r` parada no centro do segmento e a lâmina
     saltando de um lado ao outro em um único passo (deslocamento `> 4r`, nenhum dos
     extremos dentro do círculo), o corte é detectado.
  2. **Posição sem gesto não corta**: lâmina exatamente sobre o centro da fruta em
     `bladePrev == bladeCurr` (velocidade 0) não produz corte.
  3. **Limiar de velocidade**: com trajetória que atravessa a fruta, velocidade
     `minSliceSpeedCssPerS - δ` não corta; `minSliceSpeedCssPerS` (exatamente no limiar)
     corta.
  4. **Passar perto não corta**: segmento cuja distância mínima ao centro é `r + δ` não
     corta; `r` exatamente (tangente) corta.
  5. **Fruta rápida, lâmina parada em relação à tela**: se a lâmina não atinge a
     velocidade mínima, não há corte mesmo que a fruta passe por cima dela (o gesto é
     do jogador).
  6. **Fruta rápida com gesto válido**: fruta cujo deslocamento no passo é maior que seu
     diâmetro, cruzando a lâmina em movimento, é cortada (validação do referencial
     relativo).
  7. **Idempotência**: a mesma entidade não é reportada como cortada em dois passos
     consecutivos, mesmo que o segmento continue a intersectá-la.
  8. **Determinismo de múltiplos cortes**: dois cortes no mesmo passo saem sempre na
     mesma ordem (ordem de criação crescente).
  9. Pureza: `slicing.js` não lê input, não toca Canvas, não usa relógio nem
     aleatoriedade.

### F5 — Bombas

- Descrição:
  - Bombas são arremessadas junto com as frutas, com a mesma física (F3), e são
    **visualmente inconfundíveis**: cor escura sólida, contorno de cor de alerta e pavio
    desenhado, além de raio `bombRadiusCss` distinto do raio das frutas.
  - **Penalidade (decisão da spec)**: cortar uma bomba **encerra a partida
    imediatamente** — vai direto para game over, independentemente das vidas restantes,
    e zera o combo corrente. É a penalidade severa exigida pelo `descriptions.md`.
  - Bomba **não cortada** que cai pela borda inferior **não** custa vida nem pontos: o
    jogador é obrigado a controlar onde a lâmina passa, não a agitar o aparelho.
  - A probabilidade de uma entidade arremessada ser bomba é `bombChance` do nível
    corrente (F7), sempre `> 0` a partir do nível 1.
- Critérios de aceite:
  1. Cortar uma bomba faz a partida transitar para `gameOver` no mesmo passo, com o
     motivo registrado (`reason = 'bomb'`).
  2. Bomba que cruza a borda inferior sem ser cortada é removida sem alterar vidas,
     pontuação ou combo.
  3. Bombas usam a mesma integração de trajetória das frutas (mesma função, mesmos
     parâmetros de nível), diferindo apenas em tipo, raio e aparência.
  4. `bombChance` é `> 0` em todos os níveis e não decresce com o nível.
  5. Uma partida em que a lâmina varre a tela indiscriminadamente em velocidade alta
     termina em bomba antes de acumular pontuação alta — verificado por simulação
     determinística em `tests/rules.md` (KPI-5).

### F6 — Combos

- Descrição:
  - Um **traço** (stroke) é o intervalo contínuo em que a velocidade da lâmina se
    mantém `>= minSliceSpeedCssPerS`, **medida por passo fixo, exatamente como em F4**
    (nenhuma segunda medida de velocidade existe). O traço se encerra quando a
    velocidade fica abaixo do limiar por mais de `comboBreakMs` (`config.js`) contínuos,
    contados em tempo simulado (`belowThresholdMs` acumula `fixedStepS` por passo abaixo
    do limiar e zera em qualquer passo acima).
  - A n-ésima fruta cortada dentro do mesmo traço vale `basePoints * n` pontos (n
    começa em 1). Ao encerrar o traço, `n` volta a 1.
  - Cortar bomba encerra a partida (F5); o combo corrente é descartado.
- Critérios de aceite:
  1. Três frutas cortadas no mesmo traço somam `basePoints * (1 + 2 + 3)`.
  2. Três frutas cortadas em traços distintos (com pausa `> comboBreakMs` entre elas)
     somam `basePoints * 3`.
  3. Uma queda de velocidade abaixo do limiar por `comboBreakMs - δ` **não** quebra o
     traço; por `comboBreakMs + δ` quebra.
  4. O contador de combo exibido é o `n` do próximo corte menos 1 (frutas já cortadas no
     traço) e nunca fica negativo.
  5. A quebra do traço é decidida por `rules.js` de forma pura, a partir do histórico de
     velocidade recebido como argumento — sem consultar relógio.

### F7 — Vidas, dificuldade e progressão

- Descrição:
  - A partida começa com `startingLives = 3`. Cada fruta marcada `missed` (F3) custa
    uma vida. Bomba não cortada não custa vida. Vidas em 0 ⇒ `gameOver`
    (`reason = 'no-lives'`).
  - O nível de dificuldade é função determinística do tempo decorrido de partida:
    `level = min(floor(elapsedS / levelDurationS), maxLevel)`, com `levelDurationS = 30`
    e `maxLevel = 5`. Cada nível define: intervalo entre arremessos, número máximo de
    entidades simultâneas, faixa de força de lançamento e `bombChance`.
  - Ao subir de nível, cada um desses parâmetros é **monotônico** na direção de mais
    difícil (intervalo não aumenta; máximo simultâneo, força e `bombChance` não
    diminuem), com aumento estrito em pelo menos dois deles por nível.
- Critérios de aceite:
  1. Fruta `missed` decrementa vidas em exatamente 1; o mesmo evento nunca decrementa
     duas vezes.
  2. Vidas nunca ficam negativas; ao chegar a 0 o estado é `gameOver` no mesmo passo.
  3. Bomba não cortada não altera vidas.
  4. Para todo `N` em `0..maxLevel-1`: parâmetros do nível `N+1` são não-menos-difíceis
     que os de `N` em todos os eixos e estritamente mais difíceis em ao menos dois.
  5. `level` depende apenas de `elapsedS` — mesma duração simulada, mesmo nível,
     independentemente de `dt`.
  6. Acima de `maxLevel` os parâmetros permanecem constantes (a dificuldade satura, não
     diverge).

### F8 — Pontuação e recorde de sessão

- Descrição:
  - Pontos por fruta cortada, multiplicados pelo combo (F6). A pontuação e o recorde da
    sessão são exibidos durante a partida e na tela de game over.
  - O recorde vive **apenas em memória da página** (variável de módulo). Nenhuma
    persistência: nada de `localStorage`, `sessionStorage`, cookies ou rede.
- Critérios de aceite:
  1. `score` é monotonicamente não-decrescente durante uma partida.
  2. Ao terminar a partida, se `score > highScore`, `highScore` recebe `score`; caso
     contrário permanece.
  3. Recarregar a página zera o recorde (consequência de não haver persistência).
  4. Verificação estática: nenhum arquivo de `game/fruit-ninja/` usa `localStorage`,
     `sessionStorage`, `document.cookie` ou `fetch` (exceto o módulo de fallback de
     rumble, F9).

### F9 — Feedback tátil (rumble)

- Descrição:
  - Ao cortar fruta: pulso curto (`sliceRumbleMs`, ~60 ms, intensidade baixa). Ao cortar
    bomba ou perder vida: pulso **distinto e distinguível** (`penaltyRumbleMs`, ≥ 3× mais
    longo e de maior intensidade).
  - Caminho preferencial: `GamepadHapticActuator` (`playEffect('dual-rumble', ...)`) do
    gamepad lido em F1.
  - **Exceção arquitetural única**: se o atuador não existir, é permitido o fallback já
    existente no `wii-controller` (`POST /rumble`), isolado em um único módulo
    (`rumble.js`) e com comentário explicando por que ele existe. Nenhum outro módulo do
    jogo faz rede.
  - Falha do rumble **nunca** interrompe a jogabilidade: erro no atuador ou no fallback
    é engolido (log em console em nível de aviso) e o jogo segue.
- Critérios de aceite:
  1. Existem exatamente dois padrões de rumble, com durações/intensidades distintas
     conforme acima, definidos em `config.js`.
  2. O módulo de rumble expõe uma função que, sem atuador disponível, tenta o fallback;
     sem fallback disponível, retorna sem lançar exceção.
  3. Uma exceção lançada pelo caminho de rumble não impede a continuação do quadro (o
     game loop segue rodando) — verificável em navegador headless injetando um atuador
     que lança.
  4. Verificação estática: `WebSocket`/`fetch` aparecem no máximo em `rumble.js`, com o
     comentário de justificativa presente.

### F10 — Áudio sintetizado

- Descrição:
  - `audio.js` gera por síntese (Web Audio API) três sons distintos: corte de fruta,
    explosão de bomba, fruta perdida. Sem arquivos externos, sem CDN.
  - O `AudioContext` só é criado/retomado após o primeiro gesto do usuário na página
    (exigência de autoplay dos navegadores); antes disso, chamadas de som não fazem nada
    e não lançam.
  - Áudio indisponível (contexto negado) não interrompe a jogabilidade.
- Critérios de aceite:
  1. Nenhuma requisição de rede para assets de áudio (verificável no headless: lista de
     requests não contém `.mp3`/`.wav`/`.ogg`).
  2. Chamar as funções de som antes de qualquer gesto do usuário não lança exceção e não
     cria `AudioContext` em estado bloqueado repetidamente.
  3. Os três sons têm parâmetros de síntese distintos (frequência/envelope/tipo de
     onda), declarados em `config.js` — distinguíveis à escuta é critério do
     procedimento manual (`tests/manual.md`).

### F11 — Tela de aguardando controle

- Descrição:
  - Enquanto nenhum gamepad estiver conectado, o jogo mostra a tela **"aguardando
    controle"**, com instrução em português explicando que é preciso conectar o celular
    pelo `wii-controller` — nunca uma tela morta.
  - Assim que um gamepad aparece no polling, o jogo transita para a calibração (F12).
  - Se o gamepad desaparecer durante a partida, a partida é **pausada** (entidades
    congelam, tempo de nível para de correr) e a tela de aguardando controle reaparece;
    ao reconectar, o jogo volta ao ponto em que estava (sem perder vidas nem pontuação).
- Critérios de aceite:
  1. Abrir a página sem gamepad mostra a tela "aguardando controle" com texto de
     instrução visível, e nenhum erro no console.
  2. Aparecendo um gamepad no polling, a tela sai e a de calibração entra em até 2
     quadros de simulação.
  3. Desconectar durante a partida pausa o estado (nenhuma entidade se move, `elapsedS`
     não avança, vidas e pontuação inalteradas) e mostra a tela de aguardando.
  4. Reconectar retoma a partida com o mesmo `score`, `lives` e conjunto de entidades.
  5. Em qualquer instante exatamente **uma** tela está visível
     (`aguardando | calibracao | jogando | gameOver`).

### F12 — Calibração antes de jogar

- Descrição:
  - Tela de entrada que orienta o jogador a segurar o aparelho na posição em que vai
    jogar e calibrar. Calibrar grava `calibration = (rawX, rawY)` do instante (F1) e a
    lâmina passa a apontar o centro nessa inclinação.
  - Confirmação exigida: o jogador só entra na partida depois que a lâmina está
    **estável no centro** — o botão de iniciar só é aceito quando a posição da lâmina
    permaneceu dentro de `calibrationStableRadiusCss` do centro por
    `calibrationStableMs` contínuos. A tela mostra esse estado ("estável"/"instável").
  - Comandos: um botão do gamepad calibra (`A`) e outro inicia (`Start`); os rótulos
    aparecem na tela. O jogo **não** oferece mouse ou teclado como forma de jogar; a
    interação da tela de calibração também é pelo gamepad.
  - Recalibrar durante a partida é permitido pelo mesmo botão `A`; o efeito é imediato
    e não altera pontuação nem vidas.
  - **Escopo da calibração**: é local ao jogo (offset em `input.js`, ver F1). O jogo
    nunca envia mensagem de calibração ao servidor do `wii-controller` — não tem canal
    para isso (F14) e não precisa. O botão de calibrar do celular continua existindo e é
    independente: se o jogador o usar, os eixos recebidos mudam e ele pode (ou não)
    recalibrar em jogo com `A`. Nenhuma sincronização entre os dois é exigida.
- Critérios de aceite:
  1. Calibrar com o aparelho em uma inclinação qualquer faz `axesToTarget` devolver o
     centro para aquela inclinação (diferença `<= pointingToleranceCss`).
  2. A calibração desloca **toda** a área alcançável de forma consistente: após
     calibrar em `(a, b)`, a amostra `(a + d, b)` produz a mesma posição que
     `(d, 0)` produziria com calibração zero (mesma tolerância).
  3. O início da partida é bloqueado enquanto o critério de estabilidade
     (`calibrationStableRadiusCss` por `calibrationStableMs`) não for satisfeito, e
     liberado assim que for; a tela reflete o estado corrente.
  4. Recalibrar durante a partida recentra a lâmina sem alterar `score` nem `lives`.
  5. Nenhum caminho de jogo aceita mouse ou teclado como entrada de jogabilidade
     (verificação estática: nenhum listener de `mousemove`/`keydown` controla a lâmina).
  6. Nenhuma saída de rede é gerada ao calibrar (verificável no headless: 0 requisições
     durante a calibração) — a calibração é local por construção.

### F13 — Game loop com passo de tempo fixo

- Descrição:
  - `loop.js` usa `requestAnimationFrame` com acumulador de passo fixo
    (`fixedStepS = 1/120`), no padrão *Fix Your Timestep* (ver `references/`). Toda a
    lógica (F3–F8) avança apenas em passos fixos; o desenho ocorre uma vez por quadro.
  - O input é amostrado **uma vez por quadro renderizado** (a Gamepad API é polling).
    Para os passos fixos dentro do quadro, a posição da lâmina é **interpolada
    linearmente** entre a amostra anterior e a atual, de modo que os segmentos de corte
    de passos consecutivos sejam **contíguos** (o fim de um é o início do seguinte) e
    cubram todo o deslocamento do quadro, sem lacunas — condição necessária para o
    anti-tunneling de F4.
  - `dt` acumulado é limitado a `maxFrameDeltaS` (`config.js`, ~0,25 s) para evitar
    espiral da morte após uma aba em segundo plano.
- Critérios de aceite:
  1. Simular a mesma partida (mesma semente, mesmas amostras de input) com quadros de
     1/60 s e de 1/144 s executa, para a mesma duração simulada, um número de passos
     fixos que difere em **no máximo 1** (o resto do acumulador é a única diferença
     admitida), e produz estados finais equivalentes dentro de `dtToleranceCss`. Esta é
     a única regra sobre contagem de passos — vale também para `tests/loop.md` L1 e L5.
  2. Os segmentos de lâmina dos passos fixos de um quadro são contíguos: para todo par
     consecutivo, `segmento[i].fim == segmento[i+1].inicio` (igualdade exata), e
     `segmento[0].inicio` é a amostra do quadro anterior, `segmento[último].fim` é a
     amostra atual.
  3. Um quadro com `delta` maior que `maxFrameDeltaS` é tratado como `maxFrameDeltaS`
     (número de passos limitado), e a simulação continua sem travar.
  4. Nenhuma lógica de jogo é executada fora dos passos fixos (verificável por inspeção:
     `render.js` não altera estado de jogo).
  5. KPI-4 (60 fps): overlay de FPS opcional; o procedimento manual mede quadros
     estáveis com o máximo de entidades simultâneas.

### F14 — Entrega estática e restrições arquiteturais

- Descrição:
  - O jogo vive em `game/fruit-ninja/` (estrutura de pastas fixada em
    `coding-directives.md`) e é servido pela rota **já existente** `/game/fruit-ninja/`
    do servidor do `wii-controller`. Nada no servidor muda.
  - HTML/CSS/JS ES2020 puros, módulos ES nativos, sem build, sem npm, sem CDN, sem
    engine de jogo (Canvas 2D direto).
  - Sem nenhum import de fora de `game/fruit-ninja/` — nem de `web/`, nem do servidor,
    nem do Duck Shooting em `game/js/`. Duplicar é preferível a acoplar.
  - Constantes de tuning ficam todas em `js/config.js`; nenhum número mágico espalhado
    pela lógica.
  - **Contrato de diagnóstico para testes** (exigido, não opcional): o jogo expõe
    `window.__fruitNinja` com
    `{ getState(), getConfig(), setGamepadIndex(i), setSeed(seed), spawnForTest(kind, params) }`:
    - `getState()` devolve uma **cópia** somente-leitura do estado corrente (`screen`,
      `score`, `highScore`, `lives`, `comboCount`, `elapsedS`, `level`, `blade`,
      `entities`, `halves`, `fruitsSpawned`, `fruitsSliced`, `gameOverReason`);
    - `getConfig()` devolve uma cópia das constantes;
    - `setGamepadIndex(i)` escolhe qual índice da Gamepad API o jogo lê;
    - `setSeed(seed)` fixa a semente do PRNG da próxima partida (determinismo exigido
      por B7);
    - `spawnForTest(kind, params)` arremessa uma entidade de tipo `'fruit'` ou
      `'bomb'` com parâmetros dados (posição, velocidade), sem alterar contadores de
      dificuldade — é o que torna B14 (game over por bomba) verificável sem esperar o
      sorteio.
    Esse contrato existe para a faixa de integração em navegador headless (a
    alternativa — inspecionar pixels do Canvas — não é capaz de reprovar as regras),
    não altera a jogabilidade e não é acionado por nenhum caminho do jogo.
- Critérios de aceite:
  1. `GET /game/fruit-ninja/` responde `200` com o HTML do jogo, servido pelo servidor
     do `wii-controller` **sem nenhuma alteração** no código do servidor (verificável
     por `git diff` vazio em `server/`).
  2. Carregar a página em navegador headless não produz nenhum erro de console nem
     requisição de rede falha (respostas `>= 400`) para **recursos do jogo**. Exceção
     declarada: `/favicon.ico`, pedido automaticamente pelo navegador e respondido pelo
     servidor — está fora do controle deste slug e corrigi-lo exigiria alterar o
     servidor, o que F14 proíbe; portanto é ignorado na contagem.
  3. Nenhum arquivo de `game/fruit-ninja/` importa caminho que não comece por `./` ou
     `../` dentro da própria pasta; nenhuma referência a `web/`, `game/js/` ou CDN.
  4. Nenhum `<script>` ou `<link>` aponta para domínio externo.
  5. `window.__fruitNinja` está disponível após o carregamento com as cinco funções
     acima; mutar o objeto devolvido por `getState()` não afeta o estado interno do
     jogo.
  6. Todas as constantes citadas nesta spec existem em `js/config.js` com os nomes aqui
     usados.
  7. `setSeed` seguido de duas partidas com a mesma semente e a mesma sequência de input
     produz a mesma sequência de arremessos; `spawnForTest('bomb', ...)` coloca uma
     bomba ativa no estado no passo seguinte, sem alterar `level` nem `elapsedS`.

### Segunda onda (fora do MVP — o desenho deve comportar, não implementar)

- Modos alternativos (tempo limitado, sobrevivência sem bombas): o estado de partida já
  separa condições de fim (`reason`) das regras de pontuação.
- Frutas especiais com efeitos (câmera lenta, bônus múltiplo): o tipo da entidade é
  campo do modelo, não classe fixa.
- Dois jogadores / duas lâminas: a lâmina é um objeto de estado indexado, não singleton;
  `slicing.js` recebe o segmento como argumento.
- Ajuste de sensibilidade em jogo: `maxTilt` é constante de `config.js` lida em runtime,
  não valor embutido na fórmula.

### Explicitamente fora de escopo

Arte original, trilha sonora, campanha ou progressão entre partidas; persistência de
recorde entre sessões; rede ou multiplayer online; mouse/teclado como forma de jogar;
alteração de qualquer arquivo fora de `game/fruit-ninja/` e `tests/`; qualquer mudança
no servidor do `wii-controller`; reorganização da pasta `game/` (pertence ao slug
`wii-controller`).

## Procedures

### P1 — Abertura do jogo

1. Jogador abre `https://<host>:<porta>/game/fruit-ninja/` no PC.
2. O jogo cria o Canvas, dimensiona para o viewport e inicia o loop (F13).
3. `input.js` faz polling de `navigator.getGamepads()`.
   - Sem gamepad: tela **aguardando controle** (F11).
   - Com gamepad: vai para P2.
   - Saída: `screen ∈ {aguardando, calibracao}`.

### P2 — Calibração (entrada)

1. Tela mostra instrução: segurar o aparelho na posição de jogo e pressionar `A` para
   calibrar.
2. Ao pressionar `A`, grava `calibration` (F12) e a lâmina passa a marcar o centro.
3. A tela indica "estável" quando a lâmina fica dentro de `calibrationStableRadiusCss`
   por `calibrationStableMs`.
4. `Start` só é aceito no estado "estável" ⇒ `screen = jogando`, `score = 0`,
   `lives = startingLives`, `elapsedS = 0`, semente do PRNG inicializada.

### P3 — Partida

Por quadro renderizado:
1. Amostra o gamepad (uma leitura, F1) → posição alvo; aplica a suavização; empilha no
   rastro (F2).
2. Acumula `delta` (limitado a `maxFrameDeltaS`) e executa `n` passos fixos. Em cada
   passo:
   a. Interpola a posição da lâmina (F13) → segmento contíguo.
   b. Integra entidades (F3) e atualiza `elapsedS`/`level` (F7).
   c. Testa cortes (F4) para todas as entidades ativas, em ordem de criação.
   d. Aplica consequências: fruta ⇒ metades + pontos com combo (F6/F8) + rumble curto +
      som de corte; bomba ⇒ `gameOver(reason='bomb')` + rumble longo + som de explosão.
   e. Marca frutas `missed` (F3) ⇒ vida (F7) + rumble longo + som de perda; vidas 0 ⇒
      `gameOver(reason='no-lives')`.
   f. Faz arremessos conforme o nível corrente.
3. Desenha (F2, `render.js`): fundo, entidades, metades, rastro, HUD (score, recorde,
   vidas, combo).
4. `A` recalibra a qualquer momento (F12); perda do gamepad pausa (F11).

### P4 — Fim de partida

1. `screen = gameOver`, com o motivo (`bomb` ou `no-lives`) exibido em português.
2. `highScore = max(highScore, score)` (F8, memória apenas).
3. `Start` reinicia: volta a P3 com estado zerado, mantendo a calibração corrente.
4. `A` volta para a calibração (P2).

### P5 — Perda e retorno do controle durante a partida

1. Polling deixa de encontrar o gamepad ⇒ `screen = aguardando`, simulação pausada
   (nenhum passo fixo executado, `elapsedS` congelado).
2. Gamepad reaparece ⇒ `screen = jogando` com o mesmo estado; o rastro é limpo (as
   amostras antigas não representam movimento real) e o próximo segmento começa na
   posição atual, sem corte espúrio no quadro do retorno.

## Data Models

### Config (`js/config.js`) — única fonte de constantes de tuning

| Constante | Unidade | Papel |
|---|---|---|
| `deadzone` | fração de eixo (0–1) | zona morta radial de F1; invariante `0 <= deadzone < maxTilt <= 1` |
| `maxTilt` | fração de eixo (0–1) | deflexão que corresponde à borda do `playfield` |
| `smoothingTauMs` | ms (`<= 60`) | constante de tempo do filtro de F1 |
| `pointingSettleMs` | ms (`= 250`) | teto de convergência do filtro (F1.2) |
| `pointingToleranceCss` | px CSS (`= 1`) | tolerância de apontamento |
| `trailDurationMs` | ms (150–400) | vida das amostras do rastro (F2) |
| `maxTrailSamples` | contagem | teto de amostras do rastro (F2) |
| `trailReferenceSpeedCssPerS` | px CSS/s (`= 800`) | velocidade de referência do KPI-3 |
| `bladeMaxStepCss` | px CSS (**derivado**: `1.5 * trailReferenceSpeedCssPerS / 60` = 20) | passo máximo entre amostras consecutivas a 60 Hz (F2.5, KPI-3) |
| `gravityCssPerS2` | px CSS/s² | gravidade (F3) |
| `minAirtimeS` | s | tempo mínimo visível de um arremesso (F3) |
| `fruitRadiusCss` / `bombRadiusCss` | px CSS | raios de colisão e desenho |
| `minSliceSpeedCssPerS` | px CSS/s | limiar de gesto para cortar (F4) |
| `comboBreakMs` | ms | tolerância de pausa dentro de um traço (F6) |
| `basePoints` | pontos | pontos da 1ª fruta do traço (F6/F8) |
| `startingLives` | contagem (`= 3`) | vidas iniciais (F7) |
| `levelDurationS` / `maxLevel` | s (`= 30`) / (`= 5`) | progressão (F7) |
| `levels[]` | tabela | por nível: `spawnIntervalS`, `maxSimultaneous`, `launchSpeedRange`, `bombChance` |
| `sliceRumbleMs` / `penaltyRumbleMs` | ms | padrões de rumble (F9) |
| `fixedStepS` (`= 1/120`) / `maxFrameDeltaS` (`= 0.25`) | s | passo fixo do loop (F13) |
| `calibrationStableRadiusCss` / `calibrationStableMs` | px CSS / ms | critério de estabilidade (F12) |
| `dtToleranceCss` | px CSS (`= 1`, sobre 2 s de simulação) | tolerância de equivalência entre `dt` distintos (F3.2, F13.1, KPI-7) |
| `hudHeightCss` | px CSS | faixa do HUD descontada do `playfield` (pode ser 0 se o HUD for sobreposto) |

### Playfield (retângulo de jogo — termo único)

`playfield = { x, y, width, height }` em px CSS, recalculado a cada redimensionamento:
`x = 0`, `y = hudHeightCss`, `width = canvas.clientWidth`,
`height = canvas.clientHeight - hudHeightCss`.

É **o mesmo retângulo** para: a projeção do apontamento (F1), o spawn e a borda
inferior das frutas (F3), o critério de centro/estabilidade da calibração (F12) e todos
os testes. "Viewport" e "área jogável" nesta spec significam sempre `playfield`.
Invariantes: a lâmina nunca sai do `playfield`; entidades só são marcadas `missed` ao
cruzar `playfield.y + playfield.height` descendo.

### InputSample (`input.js`)

`{ rawX: number, rawY: number, buttons: { a: boolean, start: boolean }, connected: boolean, timestampMs: number }`

Invariante: `rawX`/`rawY` ∈ [-1, 1] (valores fora são fixados no limite ao entrar).

### Calibration

`{ x: number, y: number }` — amostra de eixo gravada em F12. Invariante: aplicada
sempre por subtração, nunca por multiplicação; padrão `(0, 0)`.

### BladeState (`blade.js`, puro)

`{ pos: {x, y}, target: {x, y}, samples: [{x, y, t}], speedCssPerS: number, strokeActive: boolean, belowThresholdMs: number, comboCount: number }`

Invariantes: `samples` em ordem crescente de `t`; `samples.length <= maxTrailSamples`;
`t(mais recente) - t(mais antiga) <= trailDurationMs`.

### Entity (`entities.js`, puro)

`{ id: number, kind: 'fruit' | 'bomb', pos: {x, y}, vel: {x, y}, radiusCss: number, createdAtS: number, state: 'active' | 'sliced' | 'missed', colorIndex: number }`

Invariantes: `id` crescente e único (ordem determinística de F4.8); entidade em
`sliced`/`missed` nunca volta a `active`; entidade `sliced` não é testada para corte.

### Half (metade de fruta, `entities.js`)

`{ id, parentId, pos, vel, radiusCss, angleRad, angularVelRadPerS }` — não colide, não
pontua, removida ao sair do `playfield`.

### GameState (`rules.js` + `entities.js`, dados puros)

`{ screen: 'aguardando' | 'calibracao' | 'jogando' | 'gameOver', score, highScore, lives, elapsedS, level, entities: Entity[], halves: Half[], blade: BladeState, rng: {seed}, fruitsSpawned: number, fruitsSliced: number, gameOverReason: null | 'bomb' | 'no-lives' }`

Invariantes: `lives >= 0`; `score` não-decrescente durante a partida;
`screen === 'gameOver' ⟺ gameOverReason !== null`; exatamente uma tela visível;
`level === min(floor(elapsedS / levelDurationS), maxLevel)`;
`fruitsSpawned` e `fruitsSliced` não-decrescentes durante a partida e
`fruitsSliced <= fruitsSpawned` (contam **apenas frutas**, não bombas — são o dado
objetivo da cortabilidade, KPI-2/M5, e são zerados no início de cada partida).

### SliceResult (`slicing.js`)

`{ entityId: number, point: {x, y}, dirRad: number }[]` — lista ordenada por `entityId`
crescente; vazia quando não há corte.

### Contrato de diagnóstico (`window.__fruitNinja`, F14)

`{ getState(): GameState (cópia), getConfig(): Config (cópia), setGamepadIndex(i): void, setSeed(seed: number): void, spawnForTest(kind: 'fruit' | 'bomb', params: { pos, vel }): number }`

- `getState`/`getConfig` são somente leitura sobre o estado real; mutação da cópia não
  afeta o jogo.
- `setSeed` só tem efeito na próxima partida iniciada; `spawnForTest` devolve o `id` da
  entidade criada e **não** altera `level`, `elapsedS` nem os contadores de dificuldade
  (mas conta em `fruitsSpawned` quando `kind === 'fruit'`).
- Existem para a faixa headless (B7, B14) e não são acionados por nenhum caminho do
  jogo.

## KPIs

(Ver skill `spec-kpis`. Cada KPI aponta o arquivo de teste que o verifica. KPIs cuja
verificação depende de aparelho real são procedimentos manuais **com critério
observável** e estão marcados como tal — e, conforme `tools/tooling.md`, um relatório de
testes não pode declarar `SUCCESS` apoiado apenas neles.)

| KPI | Feature relacionada | Meta | Como verificar |
|---|---|---|---|
| KPI-1 Fidelidade do apontamento (path-independence) | F1 | 100% dos pares de caminhos distintos que terminam na mesma inclinação produzem posição alvo **idêntica**; com suavização, convergência `<= 1 px CSS` em `<= 250 ms` | testes automatizados P1–P7 em `tests/pointing.md` (lógica pura) + B3 em `tests/integration-browser.md` |
| KPI-2 Cortabilidade | F1, F4 | métrica **comparativa** entre versões: `fruitsSliced / fruitsSpawned` de um jogador calibrado, em 3 partidas de ~2 min; registrada, não usada como limiar absoluto | procedimento manual M5 em `tests/manual.md`, lendo os contadores do `GameState` via `window.__fruitNinja.getState()` (critério observável: taxa registrada e comparada com a versão anterior) |
| KPI-3 Continuidade do rastro | F2, F13 | com lâmina a `trailReferenceSpeedCssPerS` (800 px CSS/s), 0 passos maiores que `bladeMaxStepCss` (= 20 px CSS) entre amostras consecutivas a 60 Hz | teste automatizado T5 em `tests/blade-and-trail.md` + observação M3 em `tests/manual.md` |
| KPI-4 Taxa de quadros | F13 | 60 fps estáveis com `maxSimultaneous` do nível 5 na tela (0 quedas perceptíveis; overlay de FPS) | procedimento manual M6 em `tests/manual.md` (observável: contador de FPS não desce abaixo de 55 durante 60 s) |
| KPI-5 Ausência de estratégia degenerada | F4, F5, F6 | numa simulação determinística de 60 s, a pontuação da política "varredura aleatória em alta velocidade" é `< 50%` da pontuação da política "apontar deliberadamente para cada fruta, evitando bombas", em 10 sementes distintas | teste automatizado R15 em `tests/rules.md` |
| KPI-6 Anti-tunneling do corte | F4 | 100% de detecção em 100 casos gerados de travessia com deslocamento por passo `> 4r` (0 falsos negativos) e 0 falsos positivos em 100 casos de passagem a `r + δ` | testes automatizados S1–S12 em `tests/slicing.md` |
| KPI-7 Independência da taxa de quadros | F3, F13 | divergência `<= dtToleranceCss` entre simulações a 60 e 144 Hz por 2 s, mesma semente | testes automatizados E2 e L1 em `tests/entities.md` / `tests/loop.md` |
| KPI-8 Isolamento arquitetural | F1, F9, F14 | 0 ocorrências de `WebSocket`/`fetch` fora de `rumble.js`; 0 imports fora de `game/fruit-ninja/`; `git diff` de `server/` vazio | testes estáticos X1–X6 em `tests/static-constraints.md` |
| KPI-9 Jogo carrega limpo | F11, F14 | 0 erros de console e 0 requisições falhas ao carregar `/game/fruit-ninja/` em Chromium headless | teste automatizado B1 em `tests/integration-browser.md` |
| KPI-10 Produto jogável fim-a-fim | F1, F4, F11, F12 | uma partida completa jogada só com o celular, sem nenhum comando inerte e sem recalibrar por deriva (0 ocorrências) | procedimento manual M7 em `tests/manual.md` — **critério de pronto: nenhuma entrega é declarada completa sem ele** |

Sem KPI para a qualidade estética (cores, formas, desenho das metades): é
explicitamente decorativa e não recebe métrica artificial — apenas o critério observável
de distinguibilidade de bombas (M2, `tests/manual.md`), que é funcional.
