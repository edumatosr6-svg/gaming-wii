# wii-controller — Software Specs

## Visão geral

O wii-controller transforma um celular Android (referência: Samsung Galaxy A57) em um
gamepad para PC no estilo Wii Remote: a inclinação física do aparelho vira eixo analógico,
a tela vira botões touch, e o PC enxerga tudo como um gamepad XInput padrão (Xbox 360).
A conexão é exclusivamente por Wi-Fi local, via página web servida pelo próprio PC — sem
instalar aplicativo no celular e sem etapa de build.

O sistema tem três componentes: (1) um servidor Python no PC que serve as páginas
estáticas e mantém um canal WebSocket de baixa latência; (2) um cliente web vanilla que
roda no navegador do celular; (3) um jogo de demonstração (Duck Shooting) que roda no
navegador do PC e consome o gamepad virtual pela Gamepad API — exatamente como um jogo
de terceiros faria, servindo de teste de aceitação de toda a cadeia. Latência fim-a-fim
é a métrica que decide se o projeto é usável; toda decisão de design é subordinada a ela.

## Features

### F1 — Servidor local (HTTP estático + WebSocket)

Um único processo Python 3.11+ assíncrono que serve os arquivos estáticos de `web/`
(controle) e `game/` (Duck Shooting) e mantém o canal WebSocket de input em tempo real.

- Descrição:
  - Ao iniciar, o servidor descobre o(s) IP(s) da máquina na rede local e imprime no
    terminal as URLs de acesso: URL do controle (para o celular) e URL do jogo (para o
    PC), com porta.
  - HTTP e WebSocket compartilham a mesma porta (padrão definida em `config.py`,
    sobrescrevível por argumento de linha de comando `--port`).
  - **Estratégia de contexto seguro (decisão):** o servidor serve a página do controle
    por **HTTPS com certificado autoassinado**, gerado automaticamente no primeiro start
    e reutilizado nos seguintes (arquivo local). O usuário aceita o aviso do navegador
    uma única vez por aparelho. O WebSocket do controle usa `wss://` na mesma porta.
    Motivo: Chromium no Android bloqueia DeviceOrientation/DeviceMotion fora de contexto
    seguro, e o giroscópio é o coração do projeto. A página do jogo (aberta no próprio
    PC) pode ser acessada via `https://localhost:<porta>` (localhost já é contexto
    seguro; o certificado cobre o caso de acesso por IP).
  - Toda operação de I/O é `async`; o caminho crítico (mensagem recebida → estado do
    gamepad atualizado) não faz log por mensagem em nível INFO, não faz chamada de rede
    e não bloqueia o loop de eventos.
  - Mensagens corrompidas ou malformadas são descartadas com log em nível DEBUG/WARNING;
    o servidor nunca cai por causa de um pacote ruim ("falhar suave no servidor").
- Critérios de aceite:
  1. `python server/main.py` inicia o processo e imprime no terminal, em até 3 segundos,
     as URLs de controle e de jogo contendo IP de rede local e porta.
  2. Requisição HTTPS a `/` (controle) e à rota do jogo retorna `200` com o HTML
     correspondente; o certificado autoassinado é gerado na primeira execução e
     reutilizado (mesmo fingerprint) nas execuções seguintes.
  3. Um cliente WebSocket conecta em `wss://<ip>:<porta>/ws` e recebe confirmação de
     sessão (mensagem `hello`, ver Data Models).
  4. Enviar JSON inválido, mensagem com `type` desconhecido ou campos ausentes pelo
     WebSocket não derruba o servidor nem a conexão das demais sessões; a mensagem é
     descartada.
  5. Nenhum módulo fora de `server/gamepad/` importa a biblioteca de gamepad virtual
     (verificável por inspeção estática dos imports).

### F2 — Cliente web do controle (celular)

Página estática vanilla (HTML/CSS/JS ES2020, sem framework, sem build, sem CDN) aberta
no navegador Chromium do celular.

- Descrição:
  - Em interação inicial do usuário (toque em "Conectar"/"Jogar"), a página entra em
    tela cheia (Fullscreen API) e trava a orientação em paisagem (Screen Orientation
    API); se o travamento por API falhar (restrição do navegador), a interface exibe
    orientação visual para o usuário girar o aparelho e o layout funciona apenas em
    paisagem.
  - Scroll, zoom por pinça, duplo-toque e seleção de texto são impedidos durante o uso
    (via CSS `touch-action`/`user-select` e handlers de evento com `preventDefault`).
  - Se a API de sensores estiver indisponível ou negada (contexto não seguro, permissão
    recusada), a interface exibe um aviso visível e explícito com a causa provável —
    nunca falha silenciosamente ("falhar alto no cliente").
- Critérios de aceite:
  1. A página carrega sem nenhuma requisição a domínio externo (offline da internet,
     apenas rede local) — verificável pela lista de requests do navegador.
  2. Após o toque inicial, a página está em tela cheia e em paisagem no Chromium do
     A57; nenhum gesto de scroll/zoom move ou redimensiona a interface.
  3. Com sensores bloqueados (simulável negando permissão ou servindo por HTTP), a UI
     mostra mensagem de erro visível em até 2 segundos, nomeando o problema.
  4. Não há etapa de build: os arquivos servidos são exatamente os versionados em
     `web/`.

### F3 — Pareamento por IP

- Descrição: tela inicial do cliente onde o usuário informa IP (e porta, pré-preenchida
  com o padrão) do PC. O último IP usado com sucesso é salvo em `localStorage` (único
  uso permitido de `localStorage`) e pré-preenchido na próxima visita; um toque em
  "Conectar" reconecta.
- Critérios de aceite:
  1. Primeira visita: campo de IP vazio (ou com placeholder), porta com valor padrão.
  2. Após uma conexão bem-sucedida, recarregar a página mostra o último IP
     pré-preenchido; um único toque estabelece a conexão.
  3. IP inválido/inalcançável resulta em mensagem de erro visível em até 5 segundos,
     com opção de tentar de novo.
  4. Nada além do último IP/porta é persistido em `localStorage`.

### F4 — Controle por inclinação ("modo Wii")

- Descrição:
  - O cliente lê `DeviceOrientationEvent` (beta = frente-trás, gamma =
    esquerda-direita, ajustados para paisagem) e envia amostras `motion` pelo
    WebSocket com **throttle configurável, padrão 60 Hz** (mínimo aceitável 50 Hz).
  - No servidor, `mapping.py` (módulo **puro, sem I/O**) converte ângulo em valor de
    eixo XInput no intervalo [-1.0, 1.0] (antes da conversão para a faixa nativa do
    driver), aplicando nesta ordem: (a) offset de calibração; (b) zona morta radial
    perto do centro (padrão configurável em `config.py`); (c) curva de sensibilidade
    (ganho configurável); (d) **saturação suave** ao se aproximar do ângulo máximo
    configurável (clamp com curva, não corte abrupto — a derivada do valor de saída é
    contínua dentro do intervalo útil).
  - Por padrão o resultado alimenta o **analógico direito**; o eixo de destino é uma
    constante de `config.py` (preparando os perfis da segunda onda).
  - Suavização opcional (filtro configurável, ex. média exponencial) para reduzir
    tremor de mira; parâmetro em `config.py`, podendo ser 0 (desligada).
- Critérios de aceite:
  1. Com o aparelho na posição calibrada, o eixo reporta (0, 0); dentro da zona morta,
     continua (0, 0).
  2. Inclinação além da zona morta produz valor monotonicamente crescente com o
     ângulo, até saturar em ±1.0 no ângulo máximo configurado; ângulos além do máximo
     continuam reportando exatamente ±1.0.
  3. `mapping.py` não importa nenhum módulo de I/O, rede ou driver, e todas as funções
     de conversão são determinísticas (mesma entrada → mesma saída).
  4. Valores extremos e inválidos (ângulos ±180°, NaN, null vindos do sensor) não
     produzem exceção nem valor fora de [-1.0, 1.0].
  5. A taxa de envio medida no servidor com o cliente ativo é ≥ 50 amostras/s (KPI-2).

### F5 — Calibração de centro

- Descrição: um botão dedicado na interface do controle envia a mensagem `calibrate`;
  o servidor registra a orientação mais recente como novo zero da sessão. Pode ser
  reexecutada a qualquer momento, sem reiniciar sessão nem reconectar. O jogo de
  demonstração guia o usuário pela calibração antes da primeira rodada (ver F9).
- Critérios de aceite:
  1. Após `calibrate`, com o aparelho mantido na mesma posição, o eixo reporta (0, 0)
     imediatamente (na próxima amostra `motion` processada).
  2. Recalibrar N vezes durante uma sessão funciona sem reconexão e sem estado
     residual da calibração anterior.
  3. Se `calibrate` chegar antes de qualquer amostra `motion`, o servidor usa o zero
     padrão (offset nulo) sem erro.

### F6 — Botões touch (multi-touch)

- Descrição: A, B, X, Y, D-pad (4 direções), ombros L (LB) e R (RB), START e BACK,
  mapeados para os botões XInput correspondentes. Multi-touch: pressionar e segurar
  vários botões simultaneamente enquanto o aparelho inclina. Cada botão muda de
  aparência (estado visual "pressionado") no mesmo frame do toque. Cada transição
  gera uma mensagem `button` (pressionar e soltar), sem repetição enquanto segurado.
- Critérios de aceite:
  1. Segurar L + pressionar A + inclinar simultaneamente resulta nos três inputs
     ativos ao mesmo tempo no estado do gamepad virtual.
  2. Cada botão da lista (A, B, X, Y, cima, baixo, esquerda, direita, LB, RB, START,
     BACK) gera evento `down` no toque e `up` ao soltar, com feedback visual imediato.
  3. Arrastar o dedo para fora de um botão sem soltar gera `up` (nenhum botão fica
     "preso" ao perder o toque).
  4. Nenhuma mensagem `button` repetida é enviada enquanto o botão permanece segurado.

### F7 — Emulação de gamepad virtual no PC

- Descrição:
  - O servidor apresenta ao SO um gamepad **XInput/Xbox 360** via driver de gamepad
    virtual (Windows: ViGEmBus através do binding `vgamepad`).
  - A biblioteca concreta fica isolada atrás da interface abstrata
    `server/gamepad/base.py` (métodos para: setar botão, setar eixo, setar gatilho,
    registrar callback de rumble, resetar tudo). A implementação é escolhida em
    runtime pela plataforma; nenhum outro módulo importa a biblioteca do driver.
  - Se o driver não estiver instalado, o servidor falha na inicialização com mensagem
    clara e acionável (nome do driver, link de instalação) — não com traceback cru.
  - Fallback teclado/mouse (`gamepad/keyboard.py`) está previsto na interface, mas a
    implementação completa é **segunda onda**; no MVP basta o stub existir e a seleção
    de plataforma estar preparada para recebê-lo.
- Critérios de aceite:
  1. Com o driver instalado, o SO lista um gamepad Xbox 360 quando o servidor está
     rodando e o cliente conectado; ferramentas padrão do SO (ex. `joy.cpl` no
     Windows) mostram botões e eixos respondendo.
  2. Sem o driver instalado, o servidor termina com código de saída ≠ 0 e mensagem
     no terminal que nomeia o driver ausente e onde obtê-lo.
  3. Testes automatizados rodam com um dublê (fake) da interface `base.py` em
     qualquer SO, sem driver e sem celular (ver tools/tooling.md).
  4. Busca estática por import da biblioteca do driver só encontra ocorrências dentro
     de `server/gamepad/` (implementações concretas).

### F8 — Feedback tátil (rumble) fim-a-fim

- Descrição:
  - Caminho principal: o jogo (qualquer jogo) envia rumble ao gamepad virtual; o
    driver notifica o servidor (callback do vgamepad); o servidor envia mensagem
    `vibrate` ao celular com intensidade [0.0–1.0] e duração em ms; o cliente aciona
    a Vibration API com padrão proporcional.
  - No navegador, o Duck Shooting tenta `GamepadHapticActuator` primeiro. Como o
    suporte é irregular entre versões de navegador, existe um **fallback documentado e
    isolado**: o jogo pode sinalizar rumble ao servidor por uma requisição HTTP
    (`POST /rumble`), implementada em um único módulo do jogo com comentário
    explicando por que existe. Esse fallback é exceção, não o desenho principal, e é
    usado somente quando a deteção de suporte ao actuator falha.
  - Intensidades dos dois motores XInput (low/high frequency) são combinadas em uma
    intensidade única para o motor do celular (fórmula definida em `mapping.py` ou
    módulo do protocolo — pura e testável).
- Critérios de aceite:
  1. Um rumble emitido no gamepad virtual (por jogo ou por script de teste) resulta em
     mensagem `vibrate` entregue ao cliente em até 100 ms.
  2. Intensidade 0 cancela vibração em andamento; intensidade e duração fora de faixa
     são saturadas para os limites válidos, sem exceção.
  3. O fallback `POST /rumble` só é acionado quando `GamepadHapticActuator` está
     indisponível, e está contido em um único módulo do jogo.
  4. No Duck Shooting: disparar vibra com padrão curto ("coice"); acertar um pato
     vibra com padrão distinto (duração/intensidade diferentes e distinguíveis).

### F9 — Ciclo de vida da conexão

- Descrição:
  - Detecção de queda: ping/pong do WebSocket com intervalo e timeout configuráveis
    (`config.py`), além do evento de fechamento do socket.
  - Ao detectar desconexão do cliente, o servidor **zera imediatamente** todos os
    botões, eixos e gatilhos do gamepad virtual (reset atômico).
  - O cliente detecta a queda, mostra o estado ("desconectado") de forma visível e
    oferece reconexão por um toque; ao reconectar, exige recalibração implícita
    (novo `calibrate` ou reuso do fluxo de entrada).
- Critérios de aceite:
  1. Fechar o socket abruptamente com um eixo deslocado e um botão pressionado
     resulta em estado do gamepad completamente zerado em até 250 ms após a detecção.
  2. O timeout de detecção (ping/pong) é ≤ 3 s com os valores padrão de `config.py`.
  3. A UI do celular muda para o estado "desconectado" visível e um toque reconecta
     (reusando o último IP).
  4. Reconectar restabelece input funcional sem reiniciar o servidor.

### F10 — Jogo de demonstração: Duck Shooting

- Descrição:
  - Jogo em página estática (HTML + Canvas 2D + JS puro, sem engine, sem build),
    aberto no navegador do PC, lendo input **exclusivamente pela Gamepad API** — é
    proibido abrir WebSocket para receber input. Única exceção: canal de rumble
    (ver F8).
  - Mecânica (referência de design: Duck Hunt/NES; nenhum conteúdo original
    reutilizado):
    - Patos surgem da vegetação na base da tela, cada um com trajetória e velocidade
      próprias; escapam pelo topo se não abatidos dentro do tempo.
    - O analógico direito (alimentado pela inclinação) move a mira; um botão (A)
      dispara. Disparo é evento pontual na transição do botão (sem auto-fire ao
      segurar).
    - 3 tiros por leva de patos; recarga automática ao fim da leva/rodada.
    - Rodadas com dificuldade crescente: mais patos simultâneos, mais velocidade,
      trajetórias menos previsíveis; critério mínimo de acertos para avançar; não
      atingir o critério encerra a partida (game over com pontuação final).
    - Pontuação acumulada com bônus por acertos consecutivos; recorde da sessão
      exibido (sem `localStorage` para estado de jogo — o recorde vive em memória da
      página; persistência de recorde está fora de escopo).
    - Áudio sintetizado via Web Audio API para tiro, acerto e pato escapando (sem
      arquivos de áudio externos).
    - Fluxo de entrada: antes da primeira rodada, uma tela guia o usuário a segurar o
      celular na posição neutra e calibrar (instruindo a apertar o botão de calibrar
      no celular), confirmando quando a mira estiver estável no centro.
  - Game loop com passo de tempo desacoplado da taxa de quadros (física por delta
    time, padrão "Fix Your Timestep"); o jogo se comporta igual a 60 e 144 Hz.
  - Lógica pura em `entities.js` (spawn, trajetória, colisão) e `rules.js` (munição,
    rodadas, pontuação): recebem estado, devolvem estado, sem tocar Canvas/input.
  - O jogo não importa nada de `web/` nem do servidor; duplicação intencional.
- Critérios de aceite:
  1. Inspeção estática do código do jogo não encontra `WebSocket` fora do módulo de
     fallback de rumble, e o input vem apenas de `navigator.getGamepads()`.
  2. Disparar com 0 munição não abate pato e produz feedback distinto (som/visual de
     "sem munição").
  3. Um tiro que intersecta a hitbox de um pato o abate e incrementa a pontuação; um
     tiro fora não; dois patos sobrepostos: um tiro abate apenas um (o de cima/mais
     recente na ordem de desenho — determinístico).
  4. A rodada N+1 tem parâmetros de dificuldade estritamente ≥ rodada N em pelo menos
     velocidade e quantidade de patos (tabela de dificuldade em módulo de regras).
  5. Bônus de sequência: o multiplicador cresce com acertos consecutivos e reseta no
     primeiro erro (valores definidos em `rules.js`, testáveis).
  6. Física idêntica sob taxas de quadro diferentes: simular o mesmo cenário com
     dt=1/60 e dt=1/144 resulta em trajetórias equivalentes (tolerância numérica
     definida nos testes).

### F11 — Instrumentação de latência

- Descrição:
  - Overlay opcional (atalho/toggle) no Duck Shooting exibindo em tempo real:
    latência fim-a-fim estimada (p50/p95 de janela móvel), taxa de amostras de
    inclinação recebidas (Hz) e FPS do jogo.
  - Medição fim-a-fim — **composição definida da métrica**: a latência reportada
    (`latency_ms_*`) é a soma de dois trechos medidos separadamente no servidor:
    (a) **rede** = RTT/2 do ping/pong do WebSocket (echo de timestamp), e
    (b) **processamento** = tempo medido, por amostra, entre a chegada da mensagem
    `motion` no servidor e o retorno da chamada de atualização do gamepad virtual.
    Ambos os componentes também são expostos separadamente (`net_ms`, `proc_ms`) para
    diagnóstico. A latência do driver→jogo (dentro do SO) não é medida pelo overlay;
    é exatamente o que o modo `--direct-metrics` permite estimar por diferença
    (medindo sem a camada de emulação) — por isso ele existe. As métricas correntes
    ficam em um endpoint HTTP de leitura (`GET /metrics`, JSON); o overlay do jogo lê
    esse endpoint em intervalo baixo (ex. 1 Hz) — leitura de métricas não é input e
    não viola a restrição da Gamepad API.
  - Modo secundário e explícito de diagnóstico (`--direct-metrics` ou similar) pode
    medir a latência sem a camada de emulação, apenas para decompor quanto da
    latência total vem do driver; desativado por padrão e claramente rotulado.
- Critérios de aceite:
  1. Com o overlay ativo, latência (p95), taxa de amostras e FPS são atualizados pelo
     menos 1 vez por segundo.
  2. Com o overlay desativado, nenhuma requisição a `/metrics` é feita e o custo de
     medição no caminho crítico é zero mensagens adicionais por amostra de input.
  3. `GET /metrics` responde JSON com pelo menos: `latency_ms_p50`, `latency_ms_p95`,
     `motion_rate_hz`, `jitter_ms` (desvio da latência na janela), `net_ms` e
     `proc_ms` (componentes da composição definida acima), com
     `latency_ms_* ≈ net + proc` na mesma janela.

### Segunda onda (fora do MVP — o desenho deve comportar, não implementar)

Analógico esquerdo virtual touch; gatilhos analógicos LT/RT contínuos; perfis de
mapeamento por jogo; múltiplos celulares → múltiplos gamepads; fallback teclado/mouse
completo; Duck Shooting multiplayer; segundo jogo (corrida/labirinto por inclinação).
Pontos de extensão exigidos já no MVP: eixo de destino do tilt configurável (F4), a
interface `gamepad/base.py` com stub de `keyboard.py` (F7), e o protocolo com campo de
identificação de sessão (Data Models) para suportar múltiplos clientes futuramente.

### Explicitamente fora de escopo

Streaming de vídeo para o celular; arte original/trilha/campanha no jogo; funcionamento
fora da rede local; app nativo Android; suporte a consoles reais; persistência de
recorde entre sessões; autenticação além de estar na mesma rede (um código de pareamento
simples é opcional e não exigido no MVP).

## Procedures

### P1 — Inicialização do servidor
1. Carregar `config.py` e argumentos de linha de comando (porta).
2. Selecionar implementação de gamepad pela plataforma; se o driver estiver ausente,
   abortar com mensagem acionável (F7.2).
3. Gerar/carregar certificado autoassinado.
4. Subir HTTP(S) estático + WebSocket na mesma porta; imprimir URLs (F1.1).

### P2 — Sessão do controle (fluxo feliz)
1. Usuário abre a URL no celular, aceita o certificado (primeira vez), informa/confirma
   o IP e toca em Conectar.
2. Cliente abre `wss://…/ws`; servidor responde `hello`; cliente entra em fullscreen +
   paisagem e pede permissão de sensores.
3. Cliente envia `motion` a ~60 Hz e `button` por transição; servidor aplica
   `mapping.py` e atualiza o gamepad virtual a cada mensagem.
4. Usuário calibra quando quiser (`calibrate`).
5. Jogo (qualquer um) lê o gamepad; rumble volta pelo caminho da F8.

### P3 — Queda e reconexão
1. Ping/pong expira ou socket fecha → servidor zera o gamepad (F9.1) e marca a sessão
   como encerrada.
2. Cliente exibe "desconectado" e botão de reconectar; um toque refaz P2 a partir do
   passo 2, reusando o último IP.

### P4 — Partida de Duck Shooting
1. PC abre a URL do jogo; jogo detecta o gamepad virtual via Gamepad API (se ausente,
   tela "aguardando controle").
2. Tela de entrada guia a calibração (F10, fluxo de entrada) e confirma mira estável.
3. Loop de rodadas: spawn de patos → mira por tilt → disparo (A) → resolução
   (acerto/escape) → fim de leva → recarga → checagem de critério de avanço.
4. Game over ao falhar o critério; mostra pontuação e recorde da sessão; permite
   recomeçar.

## Data Models

### Protocolo WebSocket (JSON, campo `type` em snake_case — documentado em `protocol.py`)

| type | direção | campos | notas |
|---|---|---|---|
| `hello` | servidor→cliente | `session_id: str`, `server_version: str` | resposta imediata à conexão |
| `motion` | cliente→servidor | `b: float` (beta, graus), `g: float` (gamma, graus), `t: float` (timestamp ms do cliente) | mensagem mais frequente; nomes curtos de propósito |
| `button` | cliente→servidor | `id: str` (um de: `a,b,x,y,up,down,left,right,lb,rb,start,back`), `down: bool` | somente em transições |
| `calibrate` | cliente→servidor | — | zera no valor de `motion` mais recente |
| `vibrate` | servidor→cliente | `intensity: float [0..1]`, `duration_ms: int` | intensidade 0 cancela |
| `ping`/`pong` | ambos | `t: float` | base do RTT e da detecção de queda |

Invariantes do protocolo: mensagens desconhecidas/inválidas são descartadas sem derrubar
a conexão (F1.4); todos os floats de eixo internos ficam em [-1.0, 1.0]; se os KPIs de
latência não forem atingidos com JSON, um formato binário compacto para `motion` é a
alternativa prevista (mesmos campos, layout fixo) — decisão adiada até haver medição.

### SessionState (servidor — objeto explícito, sem estado global mutável)
- `session_id`, `websocket`, `calibration_offset: (beta0, gamma0)`,
  `last_motion: (b, g, t)`, `button_state: dict[str, bool]`, `connected: bool`,
  `latency_window: deque[float]`.
- Invariante: `connected == False` ⇒ gamepad virtual zerado (F9).

### Config (constantes em `config.py`)
`PORT`, `DEAD_ZONE_DEG`, `SENSITIVITY`, `MAX_ANGLE_DEG`, `SMOOTHING_ALPHA`,
`MOTION_SEND_HZ`, `PING_INTERVAL_S`, `PING_TIMEOUT_S`, `TILT_TARGET_AXIS`.
Invariante: nenhum desses valores aparece como número mágico fora de `config.py`.

### GameState (jogo — dados puros manipulados por `entities.js`/`rules.js`)
- `ducks: [{pos, vel, alive, spawnedAt, pattern}]`, `crosshair: {x, y}`,
  `ammo: int (0..3)`, `round: int`, `hitsInRound: int`, `requiredHits: int`,
  `score: int`, `streak: int`, `highScore: int (memória da página)`,
  `phase: enum(calibration, playing, reload, roundEnd, gameOver)`.
- Invariantes: `ammo` nunca negativo; disparo com `ammo == 0` não muda `ducks` nem
  `score`; `round N+1` tem dificuldade ≥ `round N`; `streak` reseta a 0 no erro.

## KPIs

(Ver skill `spec-kpis`; medidos com a instrumentação da F11 e com o Duck Shooting como
banco de testes. KPIs de hardware real são verificados manualmente com o overlay — o
`impl-tester` verifica os que têm caminho automatizável.)

| KPI | Feature relacionada | Meta | Como verificar |
|---|---|---|---|
| KPI-1 Latência fim-a-fim (input no celular → gamepad virtual; composição rede RTT/2 + processamento no servidor, definida em F11) | F1, F4, F7 | p95 < 30 ms na mesma rede Wi-Fi | overlay F11 / `GET /metrics` (`latency_ms_p95` = `net` + `proc`); procedimento manual em tests/latency-and-kpis.md |
| KPI-2 Taxa de amostras de inclinação no servidor | F4 | ≥ 50 Hz sustentado | `GET /metrics` (`motion_rate_hz`); teste automatizado com cliente simulado em tests/latency-and-kpis.md |
| KPI-3 Jitter de latência | F1, F11 | `jitter_ms` (desvio na janela) < 10 ms | `GET /metrics`; procedimento em tests/latency-and-kpis.md |
| KPI-4 Deriva do centro em 15 min | F4, F5 | mira permanece dentro da zona morta com aparelho imóvel após 15 min sem recalibrar | procedimento manual instrumentado em tests/latency-and-kpis.md |
| KPI-5 Tempo de reconexão até jogar | F3, F9 | < 15 s do servidor iniciado até input ativo (reconexão) | cronometrado no procedimento manual de tests/connection-lifecycle.md |
| KPI-6 Zeragem do gamepad na desconexão | F9 | 100% das desconexões zeram tudo em ≤ 250 ms | teste automatizado com gamepad fake em tests/connection-lifecycle.md |
| KPI-7 Estabilidade da mira parada | F4 (suavização) | tremor da mira, aparelho imóvel, menor que o raio da hitbox do pato | verificação visual guiada + medição do overlay; tests/latency-and-kpis.md |
| KPI-8 Taxa de quadros do jogo | F10 | 60 fps estáveis (sem quedas perceptíveis no overlay) | overlay F11 (FPS); verificação visual em tests/duck-shooting.md |
| KPI-9 Robustez do protocolo | F1 | 0 crashes do servidor no corpus de mensagens malformadas | suíte automatizada tests/protocol.md |
| KPI-10 Consumo de bateria do celular | F2 | medição registrada (%/hora) em sessão de 1 h; alvo informativo ≤ 20%/h | procedimento manual em tests/latency-and-kpis.md — métrica de acompanhamento, não bloqueia aceite |
| KPI-11 Estabilidade de sessão | F1, F9 | sessão contínua de 30 min jogando sem queda de conexão e sem input travado (0 ocorrências) | procedimento manual C10 em tests/connection-lifecycle.md |

Sem KPI artificial: taxa de acerto no Duck Shooting é usada como **métrica comparativa
entre versões** (regressão de qualidade de controle), não como meta absoluta — o
procedimento de comparação está em tests/latency-and-kpis.md.
