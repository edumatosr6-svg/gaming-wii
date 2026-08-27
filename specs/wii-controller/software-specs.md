# wii-controller — Software Specs

## Visão geral

O wii-controller transforma um celular Android (referência: Samsung Galaxy A57) em um
controle para PC no estilo Wii Remote: o aparelho é segurado **na vertical, de uma mão,
como um Wii Remote** — polegar sobre a tela, topo apontado para a TV/monitor. A
inclinação física define **para onde o aparelho aponta** (modelo de apontamento
absoluto, F4), a tela vira o corpo de um controle com botões touch, e o PC enxerga tudo
como um gamepad XInput padrão (Xbox 360). A conexão é exclusivamente por Wi-Fi local,
via página web servida pelo próprio PC — sem instalar aplicativo no celular e sem etapa
de build.

A metáfora normativa do produto: **um emissor infravermelho imaginário no topo do
aparelho, logo acima da câmera de selfie, como a ponta de um Wii Remote. Onde o topo
aponta, a mira está.** Toda decisão de mapeamento ângulo→mira deve responder à pergunta
"para onde o infravermelho imaginário está apontando?" — se a resposta e a mira
divergirem, o mapeamento está errado. A pegada vertical de uma mão é a identidade do
produto e substitui a decisão anterior de paisagem (revisão humana após teste real).

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
  - A página opera em tela cheia (Fullscreen API) e com a orientação travada em
    **retrato (vertical)** (Screen Orientation API) — o aparelho é segurado em pé, de
    uma mão, como um Wii Remote. O **momento** em que isso é solicitado é
    definido em um único lugar — o bullet "Momento do modo imersivo", mais abaixo — e
    não está atrelado a um toque em "Conectar", que o fluxo feliz não tem (a conexão é
    automática, F3.1). Se o travamento por API falhar (restrição do navegador), a
    interface exibe orientação visual para o usuário manter o aparelho em pé e o
    layout funciona apenas em retrato.
  - **Layout "corpo de Wii Remote" (normativo).** A tela, na vertical, é desenhada
    como o corpo de um controle — a interface **parece um controle**, não uma página
    com botões. Layout em coluna, pensado para o polegar de uma mão, com esta ordem
    vertical de cima para baixo:
    1. No topo, acima de tudo, a **"ponta do sensor"**: elemento visual que representa
       o emissor infravermelho imaginário, ancora a metáfora de apontamento e indica o
       estado da conexão/mira (aparência visualmente distinta em cada um dos quatro
       estados de `ClientViewState`).
    2. **D-pad** na parte de cima (onde o polegar alcança com o aparelho em pé).
    3. **Botão A** grande e central: é o botão principal e **domina o corpo do
       controle** — sua área de toque é estritamente maior que a de qualquer outro
       botão, e seu centro fica alinhado ao eixo vertical central da tela.
    4. **B, X, Y** menores, próximos do A (cada um mais próximo do centro do A do que
       de qualquer botão do D-pad, de L e de R).
    5. **START e BACK** discretos, no meio do corpo (como −/+/HOME no Wii Remote),
       abaixo do grupo A/B/X/Y.
    6. **L e R** na parte de baixo da tela.
    O mapeamento para os botões XInput não muda (A, B, X, Y, D-pad, LB, RB, START,
    BACK) — o que muda em relação à decisão anterior é a disposição e a aparência.
  - **Ensinar a pegada.** A tela de entrada/calibração exibe uma ilustração (ou
    animação curta) do aparelho em pé apontando para a tela do PC, deixando óbvio como
    segurar e mirar sem ler manual. O elemento de ilustração é identificável e visível
    nos estados `pareamento` e `conectando`; no estado `conectado` a pegada é
    reforçada junto ao comando de calibrar (texto curto ou miniatura da ilustração).
  - Scroll, zoom por pinça, duplo-toque e seleção de texto são impedidos durante o uso
    (via CSS `touch-action`/`user-select` e handlers de evento com `preventDefault`).
  - Se a API de sensores estiver indisponível ou negada (contexto não seguro, permissão
    recusada), a interface exibe um aviso visível e explícito com a causa provável —
    nunca falha silenciosamente ("falhar alto no cliente").
  - **Máquina de estados visuais.** O cliente tem exatamente quatro estados de tela:
    `pareamento`, `conectando`, `conectado` e `desconectado`. Em qualquer instante
    **exatamente uma** tela está visível. A alternância é responsabilidade do
    JavaScript, e o CSS não pode contradizê-la: nenhuma regra de estilo pode manter
    visível um elemento marcado como oculto pelo mecanismo de alternância.
  - **Semântica de entrada por toque (contrato da interface).** Todo controle
    acionável da interface do controle — botões de gamepad e comandos como calibrar —
    responde a **eventos de toque**. É proibido depender do evento `click` para
    qualquer ação: o tratamento multi-touch suprime a sintetização de `click` pelo
    navegador, então um controle ligado apenas a `click` fica inerte no aparelho de
    referência (podendo funcionar no desktop com mouse, o que mascara o defeito).
    Suporte a `click` é permitido apenas como caminho adicional para mouse/desktop,
    nunca como caminho único.
  - **Nenhum elemento não-interativo intercepta toque.** Faixas de status, avisos,
    rótulos, overlays de diagnóstico e qualquer elemento decorativo posicionado sobre
    a área dos controles não podem receber o toque no lugar do controle sob eles.
  - **Momento do modo imersivo.** O pedido de tela cheia é feito a partir de um gesto
    do usuário já **concluído** (fim do toque), nunca durante um toque em andamento:
    o navegador cancela a sequência de toque ao entrar em tela cheia, e um pedido
    disparado no início do toque engole o acionamento do controle. A tentativa não se
    repete a cada toque.
- Critérios de aceite:
  1. A página carrega sem nenhuma requisição a domínio externo (offline da internet,
     apenas rede local) — verificável pela lista de requests do navegador.
  2. Após o toque inicial, a página está em tela cheia e em **retrato** no Chromium do
     A57; nenhum gesto de scroll/zoom move ou redimensiona a interface.
  3. Com sensores bloqueados (simulável negando permissão ou servindo por HTTP), a UI
     mostra mensagem de erro visível em até 2 segundos, nomeando o problema.
  4. Não há etapa de build: os arquivos servidos são exatamente os versionados em
     `web/`.
  5. Em cada um dos quatro estados, exatamente uma tela está visível: verificável em
     navegador headless medindo a caixa de layout de cada tela (a oculta tem área
     zero). Cobre o caso em que uma regra de CSS anula o mecanismo de alternância.
  6. Acionar qualquer controle **apenas com eventos de toque** (sem `click`) produz a
     ação correspondente: cada botão de gamepad envia sua mensagem `button` e o
     comando de calibrar envia `calibrate`. Verificável em navegador headless com
     emulação de toque, inspecionando as mensagens efetivamente enviadas ao socket.
  7. Para cada controle acionável, o elemento que recebe o toque nas coordenadas do
     seu centro é o próprio controle (ou um descendente dele) — nunca uma faixa,
     aviso ou overlay. Verificável em navegador headless.
  8. O pedido de tela cheia não ocorre durante um toque em andamento: uma sequência
     completa de toque sobre um botão sempre produz a mensagem `button` do botão,
     independentemente do estado de tela cheia.
  9. Nenhuma ação da interface do controle depende exclusivamente do evento `click`
     (verificável por inspeção estática dos registros de evento em `web/js/`).
  10. **Geometria do layout Wii Remote** (verificável em navegador headless com
      viewport retrato, medindo as caixas de layout na tela `conectado`): (a) a ordem
      vertical dos centros é ponta do sensor < D-pad < A < START/BACK < L/R (eixo y
      crescendo para baixo); (b) a área de toque do botão A é estritamente maior que
      a de qualquer outro botão; (c) o centro do A dista do eixo vertical central do
      viewport no máximo 5% da largura; (d) cada um de B, X e Y tem centro mais
      próximo do centro do A do que dos centros de qualquer botão do D-pad, de L e
      de R.
  11. O elemento da ponta do sensor está visível na tela `conectado` acima de todos os
      controles acionáveis e tem aparência distinta por estado de conexão (classe/
      atributo distinto por estado de `ClientViewState`, verificável em headless nos
      quatro estados).
  12. A ilustração de pegada é um elemento identificável com área visível maior que
      zero nos estados `pareamento` e `conectando` (verificável em headless).

### F3 — Pareamento por IP

- Descrição:
  - **A página do controle é servida pelo próprio PC de destino**, portanto o endereço
    do servidor já está na URL que o usuário abriu. O cliente deriva IP e porta da
    origem da própria página e **conecta automaticamente** ao carregar, sem exigir
    digitação. Pedir ao usuário que digite um endereço que a página já conhece é
    fricção desnecessária e fonte de erro.
  - A tela de pareamento manual permanece como caminho de exceção — para o caso de a
    página ser aberta fora do servidor (arquivo local) ou de o usuário precisar apontar
    para outro host. Nela, o último endereço usado com sucesso é salvo em
    `localStorage` (único uso permitido de `localStorage`) e pré-preenchido.
- Critérios de aceite:
  1. Abrir a URL servida pelo PC conecta sem nenhuma digitação: em até 5 segundos o
     cliente está no estado `conectado` e o servidor registra a sessão.
  2. O endereço usado na conexão automática é o da origem da página (mesmo host e
     mesma porta da URL aberta).
  3. Quando a conexão automática não é possível (página fora do servidor), a tela de
     pareamento é exibida com o último endereço pré-preenchido, e um único toque
     conecta.
  4. Endereço inválido/inalcançável resulta em mensagem de erro visível em até 5
     segundos, nomeando o endereço tentado, com opção de tentar de novo.
  5. Nada além do último IP/porta é persistido em `localStorage`.

### F4 — Controle por apontamento ("modo Wii": posição absoluta, pegada vertical)

- Descrição:
  - **Modelo de apontamento (requisito de primeira classe).** A inclinação do aparelho
    mapeia para a **posição absoluta** da mira, nunca para a velocidade dela. O valor
    de eixo transportado pelo gamepad virtual é uma **posição apontada normalizada**
    (x, y) ∈ [-1.0, 1.0]²: o centro calibrado corresponde a (0, 0) — centro da tela —
    e o ângulo máximo (`MAX_ANGLE_DEG`) às bordas (±1.0). Propriedade definidora:
    **mesma inclinação ⇒ mesma posição da mira, independentemente do histórico de
    movimento**; voltar o aparelho à posição neutra traz a mira de volta ao centro,
    não apenas a faz parar onde estava. Tratar a inclinação como analógico de taxa
    (integração de velocidade) é proibido e foi verificado como impraticável em teste
    real (implementation-report).
  - **Semântica do eixo e jogos de terceiros (tensão resolvida por decisão).** O eixo
    transporta uma posição apontada; **jogos próprios** (Duck Shooting — F10; Fruit
    Ninja — slug `specs/fruit-ninja`) a consomem **como posição**. Jogos de
    **terceiros** interpretam o analógico direito como taxa, por convenção XInput —
    neles a sensação continuará sendo de cursor por velocidade. Isso é **limitação
    conhecida e documentada (não defeito)**; o README do projeto deve declará-la.
    Perfis de mapeamento por jogo (segunda onda) são o caminho futuro para terceiros.
  - **Mapeamento na pegada vertical (normativo — a metáfora do infravermelho).** Com
    o aparelho em pé na mão, topo apontado para a tela do PC, a direção apontada é a
    direção do topo do aparelho (o "emissor infravermelho imaginário"):
    - **Eixo horizontal da mira** ← ângulo horizontal da ponta (girar o pulso para
      apontar a ponta para a esquerda/direita — guinada/yaw em torno do eixo
      vertical do mundo).
    - **Eixo vertical da mira** ← elevação da ponta (levantar/abaixar a ponta —
      arfagem/pitch).
    - **Rolagem** (torcer o aparelho em torno do próprio eixo longitudinal, com a
      ponta fixa) **não move a mira** — a ponta continua apontando para o mesmo
      lugar.
    - **Sentido dos eixos (normativo):** apontar a ponta para a **direita** ⇒ valor x
      **positivo** ⇒ mira para a direita; **levantar** a ponta ⇒ valor y **positivo**
      ⇒ mira para cima. Um sinal invertido é defeito, não questão de gosto: é
      indistinguível de "controle confuso".
    - Atenção herdada da revisão: na pegada vertical os ângulos do sensor que
      alimentam cada eixo são **diferentes** dos da paisagem — reaproveitar o
      mapeamento antigo produz eixo trocado/invertido, o que os critérios 6–7 abaixo
      reprovam.
  - O cliente lê `DeviceOrientationEvent` e envia amostras `motion` com os **três
    ângulos** (`a` = alpha/yaw, `b` = beta, `g` = gamma — os três são necessários para
    derivar a direção da ponta na pegada vertical) pelo WebSocket com **throttle
    configurável, padrão 60 Hz** (mínimo aceitável 50 Hz). `alpha` pode ser relativo
    (zero arbitrário do navegador): a calibração de centro (F5) absorve o zero
    arbitrário; a deriva de `alpha` é coberta pelo KPI-4.
  - No servidor, `mapping.py` (módulo **puro, sem I/O**) converte os ângulos da
    amostra na posição apontada (x, y) ∈ [-1.0, 1.0]², aplicando nesta ordem:
    (a) offset de calibração; (b) derivação da direção da ponta (yaw/pitch relativos
    ao centro calibrado); (c) zona morta radial perto do centro (configurável em
    `config.py`); (d) curva de sensibilidade (ganho configurável); (e) **saturação
    suave** ao se aproximar de `MAX_ANGLE_DEG` (clamp com curva, não corte abrupto —
    a derivada do valor de saída é contínua dentro do intervalo útil).
  - Por padrão o resultado alimenta o **analógico direito**; o eixo de destino é uma
    constante de `config.py` (preparando os perfis da segunda onda).
  - **Ergonomia com critério observável (parâmetros de conforto):**
    - `MAX_ANGLE_DEG` deixa de ser parâmetro de ganho e passa a ser **parâmetro de
      ergonomia**: quanto o pulso precisa girar para varrer a tela inteira. Valor
      padrão: **20°**, com justificativa registrada em `config.py`: a varredura
      completa (borda a borda = 2×`MAX_ANGLE_DEG` = 40°) deve ser executável só com o
      pulso, sem mover o cotovelo. Faixa aceitável configurável: 15°–30°. Critério
      manual observável no teste W22m.
    - Suavização opcional (filtro configurável, ex. média exponencial;
      `SMOOTHING_ALPHA` em `config.py`, 0 = desligada) para reduzir tremor — mas com
      **orçamento de resposta**: com a config padrão e amostras a 60 Hz, um degrau de
      entrada atinge **90% do valor final em ≤ 100 ms** (KPI-17). Tremor (KPI-7) e
      resposta (KPI-1/KPI-17) são metas simultâneas: uma config padrão que sacrifique
      uma pela outra reprova.
- Critérios de aceite:
  1. Com o aparelho na posição calibrada, a posição apontada é (0, 0); dentro da zona
     morta, continua (0, 0).
  2. Deflexão da ponta além da zona morta produz valor monotonicamente crescente com o
     ângulo, até saturar em ±1.0 em `MAX_ANGLE_DEG`; ângulos além do máximo continuam
     reportando exatamente ±1.0.
  3. `mapping.py` não importa nenhum módulo de I/O, rede ou driver; a conversão é
     **função pura da amostra atual + calibração** (sem estado além do filtro de
     suavização explícito): a mesma amostra, com a mesma calibração e suavização
     desligada, produz o mesmo (x, y) **independentemente de quais amostras vieram
     antes** — a propriedade que a implementação por velocidade viola.
  4. Valores extremos e inválidos (ângulos ±180°, NaN, null — incluindo `a` null) não
     produzem exceção nem valor fora de [-1.0, 1.0].
  5. A taxa de envio medida no servidor com o cliente ativo é ≥ 50 amostras/s (KPI-2).
  6. **Sentido dos eixos:** para amostras sintéticas representando a pegada vertical
     calibrada, ponta para a direita ⇒ x > 0; ponta para a esquerda ⇒ x < 0; ponta
     para cima ⇒ y > 0; ponta para baixo ⇒ y < 0 (vetores de teste definidos em
     tests/mapping.md).
  7. **Rolagem não move a mira:** variar apenas a rolagem (eixo longitudinal), com a
     direção da ponta fixa, mantém (x, y) constante dentro de tolerância definida nos
     testes.
  8. Com `SMOOTHING_ALPHA` padrão e amostras a 60 Hz, a resposta a um degrau atinge
     90% do valor final em ≤ 100 ms (KPI-17), verificável em teste puro de
     `mapping.py`.

### F5 — Calibração de centro

- Descrição: um botão dedicado na interface do controle envia a mensagem `calibrate`;
  o servidor registra a orientação mais recente como novo zero da sessão. No modelo de
  apontamento absoluto (F4), calibrar significa: **a direção para onde a ponta aponta
  agora passa a ser o centro da tela** — a calibração absorve inclusive o zero
  arbitrário de `alpha`. Pode ser reexecutada a qualquer momento, sem reiniciar sessão
  nem reconectar. O jogo de demonstração guia o usuário pela calibração antes da
  primeira rodada (ver F10).
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
  **Posse do toque:** cada toque pertence ao controle sobre o qual ele *começou*, e
  essa posse não muda enquanto o toque durar. Arrastar o dedo para fora solta aquele
  controle (gera `up`) e **não** pressiona nenhum outro: um toque em andamento nunca é
  reatribuído ao elemento que estiver sob o dedo no momento.
- Critérios de aceite:
  1. Segurar L + pressionar A + inclinar simultaneamente resulta nos três inputs
     ativos ao mesmo tempo no estado do gamepad virtual.
  2. Cada botão da lista (A, B, X, Y, cima, baixo, esquerda, direita, LB, RB, START,
     BACK) gera evento `down` no toque e `up` ao soltar, com feedback visual imediato.
  3. Arrastar o dedo para fora de um botão sem soltar gera `up` (nenhum botão fica
     "preso" ao perder o toque) e não gera `down` em nenhum outro botão, mesmo que o
     dedo passe por cima dele — a posse do toque é do botão de origem.
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
  - **Contrato de integração com o driver.** A implementação concreta precisa
    satisfazer as exigências da biblioteca do driver, incluindo as que ela valida em
    tempo de execução — notadamente o **registro do callback de rumble**, cuja
    assinatura é inspecionada pela biblioteca e pode ser rejeitada por detalhes que
    nenhum dublê de teste reproduz. O dublê usado na suíte padrão não é evidência de
    integração correta: a inicialização com o driver real é um critério próprio.
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
  5. Com o driver real instalado, `python server/main.py` conclui a inicialização e
     passa a aceitar conexões — incluindo o registro do callback de rumble, que não
     pode lançar exceção. Verificação com hardware real, com critério observável: o
     terminal imprime as URLs e nenhuma exceção aparece.

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
    **reconecta automaticamente**, repetindo a tentativa em intervalo curto enquanto
    a tela do controle estiver aberta. A reconexão por toque permanece disponível,
    mas não pode ser o único caminho: exigir ação do usuário para uma queda que ele
    não tem como perceber deixa o controle inerte sem explicação.
  - **Proibição de falha silenciosa.** Enviar input com a conexão fechada não pode ser
    descartado sem sinal: o estado da conexão fica permanentemente visível na tela do
    controle, e uma queda exibe o motivo (código de fechamento). O sintoma "a
    interface responde ao toque mas nada chega ao PC" é considerado defeito, não
    comportamento aceitável.
  - Ao reconectar, exige recalibração implícita (novo `calibrate` ou reuso do fluxo de
    entrada).
- Critérios de aceite:
  1. Fechar o socket abruptamente com um eixo deslocado e um botão pressionado
     resulta em estado do gamepad completamente zerado em até 250 ms após a detecção.
  2. O timeout de detecção (ping/pong) é ≤ 3 s com os valores padrão de `config.py`.
  3. A UI do celular muda para o estado "desconectado" visível e um toque reconecta
     (reusando o último IP).
  4. Reconectar restabelece input funcional sem reiniciar o servidor.
  5. Derrubar a conexão com a tela do controle aberta faz o cliente reconectar
     **sozinho**, sem toque, e voltar ao estado `conectado` em até 5 segundos após o
     servidor voltar a aceitar conexões.
  6. O estado da conexão está visível na tela do controle em 100% do tempo em que ela
     está aberta; após uma queda, o motivo (código de fechamento) é exibido.
  7. Acionar controles com a conexão fechada nunca é silencioso: a tela indica o
     estado desconectado enquanto durar a queda.

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
    - **A mira é posição, não taxa (contrato com F4).** A posição da mira na tela é
      **função direta do valor atual do analógico direito (normalizado)**: eixo
      (0, 0) ⇒ mira no centro da área de jogo; eixo ±1.0 ⇒ bordas correspondentes;
      eixo x > 0 ⇒ mira à direita do centro; eixo y > 0 ⇒ mira **acima** do centro
      (atenção à inversão da coordenada de tela do Canvas, que cresce para baixo). É
      **proibido integrar o eixo como velocidade** (`pos += eixo × ganho × dt`): a
      posição da mira em cada quadro depende só da leitura atual do eixo (e da
      geometria da tela), nunca da posição anterior da mira. Um botão (A) dispara.
      Disparo é evento pontual na transição do botão (sem auto-fire ao segurar).
    - **Normalização da convenção de sinal da Gamepad API (contrato da camada de
      input).** O *standard mapping* da Gamepad API do navegador usa, no eixo Y do
      analógico, a convenção **oposta** à interna/XInput: `axes[3] = -1` significa
      stick **para cima**, enquanto o valor interno da F4 usa y positivo = cima. A
      camada de input do jogo (`input.js`) é o **único** lugar que converte: ela
      normaliza a leitura crua da Gamepad API para a convenção interna (x positivo =
      direita, **y positivo = cima**) antes de entregá-la ao resto do jogo. Todo o
      restante do jogo (incluindo a função de posição da mira e os critérios 7–9
      abaixo) opera sobre o **valor já normalizado**. A normalização é uma função
      pura e testável (amostra crua da API → eixo normalizado).
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
  7. **Mira absoluta:** alimentando a lógica do jogo com eixo constante (ex.
     (0.5, 0)) por N quadros, a mira permanece em posição fixa (não se desloca);
     eixo (0, 0) posiciona a mira no centro da área de jogo; eixo (±1, ±1) a
     posiciona nas bordas correspondentes (tolerância de 1 px).
  8. **Independência de histórico:** duas sequências diferentes de leituras de eixo
     que terminam no mesmo valor deixam a mira exatamente na mesma posição.
  9. **Sentido na tela (sobre o valor normalizado):** eixo normalizado x > 0 ⇒ mira à
     direita do centro; eixo normalizado y > 0 ⇒ mira acima do centro (em coordenadas
     de tela, y menor).
  10. **Normalização da Gamepad API:** dada uma amostra sintética crua da Gamepad API
      no *standard mapping* com `axes[3]` **negativo** (stick para cima), a função de
      normalização de `input.js` produz eixo interno com **y positivo**, e a mira
      resultante fica **acima** do centro — fechando o fio ponta a ponta sem depender
      de teste manual. Simetricamente para `axes[3]` positivo (baixo) e `axes[2]`
      (esquerda/direita, sem inversão).

### Segundo jogo: Fruit Ninja (referência cruzada — especificado em slug próprio)

O segundo banco de prova do modelo de apontamento (corte por gesto contínuo, que
estressa o apontamento de forma diferente do tiro pontual) é especificado, testado e
validado no slug **`specs/fruit-ninja/`** — fora do escopo deste documento. Contratos
que ele herda daqui e que não podem ser quebrados: consome o **gamepad virtual** pela
Gamepad API (nunca o WebSocket), interpreta o eixo como **posição absoluta** (F4) e
segue as mesmas restrições arquiteturais da F10 (sem engine, sem build, lógica pura
separada do desenho).

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
3. **Inicializar o gamepad virtual por completo, incluindo o registro do callback de
   rumble** (F7 — contrato de integração com o driver). Esta etapa é executada *antes*
   de o servidor se declarar pronto: qualquer rejeição da biblioteca do driver aborta a
   inicialização com mensagem acionável, em vez de aparecer depois como servidor que
   não sobe. O dublê de teste não é evidência de que este passo funciona (F7.5).
4. Gerar/carregar certificado autoassinado.
5. Subir HTTP(S) estático + WebSocket na mesma porta; imprimir URLs (F1.1).

### P2 — Sessão do controle (fluxo feliz)
1. Usuário abre a URL servida pelo PC no celular e aceita o certificado (primeira vez).
   No fluxo feliz o cliente entra direto no estado **`conectando`** (tela de conexão
   visível, tela de pareamento oculta — F2.5 e tabela de transições de
   `ClientViewState`), pois o endereço da origem da própria página já é utilizável e o
   cliente conecta automaticamente (F3.1). Não há digitação de IP nem toque em
   "Conectar" no fluxo feliz. O estado inicial só é `pareamento` no caminho de exceção
   da F3.3 (página aberta fora do servidor, sem origem utilizável).
2. Cliente passa ao estado `conectando`, abre `wss://…/ws`; servidor responde `hello`;
   cliente passa ao estado `conectado` (e apenas essa tela fica visível — F2.5) e pede
   permissão de sensores.
3. No **fim** do primeiro toque do usuário sobre a interface já conectada (evento de
   término do toque, uma única vez na sessão), o cliente pede tela cheia e trava a
   orientação em **retrato** (F2 — momento do modo imersivo). Nunca durante um toque
   em andamento, porque o navegador cancela a sequência e engole o acionamento.
4. Cliente envia `motion` (ângulos `a`, `b`, `g`) a ~60 Hz e `button` por transição;
   servidor aplica `mapping.py` (posição apontada absoluta, F4) e atualiza o gamepad
   virtual a cada mensagem. Todo acionamento vem de eventos de toque; nenhuma ação
   depende de `click` (F2.6, F2.9).
5. Usuário calibra quando quiser tocando no comando de calibrar (`calibrate`).
6. Jogo (qualquer um) lê o gamepad; rumble volta pelo caminho da F8.

### P3 — Queda e reconexão
1. Ping/pong expira ou socket fecha → servidor zera o gamepad (F9.1) e marca a sessão
   como encerrada.
2. Cliente detecta a queda, passa ao estado `desconectado` (tela visível, exibindo o
   código de fechamento — F9.6) e **inicia reconexão automática**, repetindo a tentativa
   em intervalo curto enquanto a tela do controle estiver aberta (F9.5). Nenhum input é
   descartado em silêncio nesse intervalo: o estado desconectado fica visível enquanto
   durar a queda (F9.7).
3. Quando o servidor volta a aceitar conexões, a reconexão sucede sem ação do usuário e
   o cliente retorna ao estado `conectado`, retomando P2 a partir do passo 4. A
   reconexão por toque continua disponível como atalho, nunca como caminho único.
4. Após reconectar, a calibração da sessão anterior não é reaproveitada: vale o zero
   padrão até que o usuário calibre de novo (F9 — recalibração implícita).

### P5 — Transição de estado visual do cliente
Executada pelo cliente a cada mudança de situação da conexão (ver `ClientViewState` em
Data Models). Entrada: estado atual + evento. Saída: exatamente uma tela visível.
1. Determinar o novo estado a partir do evento (carregar página, socket aberto, `hello`
   recebido, socket fechado, tentativa de reconexão em curso).
2. Ocultar todas as telas pelo mecanismo único de alternância e revelar apenas a do
   novo estado. Nenhuma regra de estilo pode manter visível uma tela ocultada por esse
   mecanismo (F2.5) — a alternância é a única autoridade sobre visibilidade de tela.
3. Atualizar o indicador permanente de estado da conexão, que é visível em todos os
   quatro estados (F9.6), incluindo o motivo/código quando houver queda.

### P4 — Partida de Duck Shooting
1. PC abre a URL do jogo; jogo detecta o gamepad virtual via Gamepad API (se ausente,
   tela "aguardando controle").
2. Tela de entrada guia a calibração (F10, fluxo de entrada): instrui a segurar o
   aparelho **em pé, apontando para a tela** (pegada vertical, F2), calibrar, e
   confirma mira estável no centro.
3. Loop de rodadas: spawn de patos → mira posicionada pelo apontamento absoluto
   (posição = f(eixo atual), F10) → disparo (A) → resolução (acerto/escape) → fim de
   leva → recarga → checagem de critério de avanço.
4. Game over ao falhar o critério; mostra pontuação e recorde da sessão; permite
   recomeçar.

## Data Models

### Protocolo WebSocket (JSON, campo `type` em snake_case — documentado em `protocol.py`)

| type | direção | campos | notas |
|---|---|---|---|
| `hello` | servidor→cliente | `session_id: str`, `server_version: str` | resposta imediata à conexão |
| `motion` | cliente→servidor | `a: float \| null` (alpha/yaw, graus — null se o sensor não reportar), `b: float` (beta, graus), `g: float` (gamma, graus), `t: float` (timestamp ms do cliente) | mensagem mais frequente; nomes curtos de propósito; os três ângulos são necessários para derivar a direção da ponta na pegada vertical (F4) |
| `button` | cliente→servidor | `id: str` (um de: `a,b,x,y,up,down,left,right,lb,rb,start,back`), `down: bool` | somente em transições |
| `calibrate` | cliente→servidor | — | zera no valor de `motion` mais recente |
| `vibrate` | servidor→cliente | `intensity: float [0..1]`, `duration_ms: int` | intensidade 0 cancela |
| `ping`/`pong` | ambos | `t: float` | base do RTT e da detecção de queda |

Invariantes do protocolo: mensagens desconhecidas/inválidas são descartadas sem derrubar
a conexão (F1.4); todos os floats de eixo internos ficam em [-1.0, 1.0]; se os KPIs de
latência não forem atingidos com JSON, um formato binário compacto para `motion` é a
alternativa prevista (mesmos campos, layout fixo) — decisão adiada até haver medição.

### SessionState (servidor — objeto explícito, sem estado global mutável)
- `session_id`, `websocket`, `calibration_offset: (alpha0, beta0, gamma0)`,
  `last_motion: (a, b, g, t)`, `button_state: dict[str, bool]`, `connected: bool`,
  `latency_window: deque[float]`.
- Invariante: `connected == False` ⇒ gamepad virtual zerado (F9).

### ClientViewState (cliente — máquina de estados visuais, F2/F9)

Estado explícito no JS do controle; a tela exibida é função dele e de mais nada.

- Estados: `pareamento`, `conectando`, `conectado`, `desconectado`.
- Campos: `state: enum(acima)`, `endpoint: str` (origem da página ou endereço manual),
  `lastCloseCode: int | null`, `lastCloseReason: str | null`,
  `reconnectAttempts: int`.
- Transições:

| de | evento | para |
|---|---|---|
| (carga da página) | origem utilizável | `conectando` |
| (carga da página) | sem origem utilizável (arquivo local) | `pareamento` |
| `pareamento` | toque em conectar com endereço válido | `conectando` |
| `conectando` | `hello` recebido | `conectado` |
| `conectando` | erro/timeout de abertura | `desconectado` |
| `conectado` | socket fechado ou timeout de ping/pong | `desconectado` |
| `desconectado` | tentativa automática de reconexão iniciada | `conectando` |
| `desconectado` | toque em reconectar | `conectando` |

- Invariantes:
  1. **Exatamente uma** tela visível por estado (F2.5) — nunca zero, nunca duas.
  2. O indicador de estado da conexão é visível nos quatro estados (F9.6).
  3. `state != conectado` ⇒ nenhum input é enviado, **e** a tela indica isso; enviar com
     socket fechado nunca é descartado em silêncio (F9.7).
  4. Em `desconectado` por queda, `lastCloseCode` está preenchido e é exibido.
  5. `reconnectAttempts` é zerado ao atingir `conectado`.

### Contrato do gamepad virtual (`server/gamepad/base.py`, F7)

Interface abstrata; a implementação concreta é escolhida em runtime pela plataforma.

- Operações: `set_button(id, down)`, `set_axis(axis, value ∈ [-1.0, 1.0])`,
  `set_trigger(trigger, value ∈ [0.0, 1.0])`, `register_rumble_callback(cb)`,
  `reset()`.
- `cb` recebe intensidade dos dois motores XInput (low/high) e a repassa ao caminho da
  F8. **A biblioteca do driver pode inspecionar e rejeitar a assinatura do callback em
  tempo de execução**; satisfazer essa validação faz parte do contrato da implementação
  concreta, e não é reproduzível pelo dublê usado na suíte padrão.
- Invariantes: `register_rumble_callback` ocorre durante P1 e não pode lançar exceção
  com o driver real (F7.5); após `reset()`, todos os botões, eixos e gatilhos leem zero.

### Config (constantes em `config.py`)
`PORT`, `DEAD_ZONE_DEG`, `SENSITIVITY`, `MAX_ANGLE_DEG` (padrão 20°, faixa 15°–30° —
parâmetro de **ergonomia**: define quanto o pulso gira para varrer a tela, F4),
`SMOOTHING_ALPHA` (padrão sujeito ao orçamento de resposta de F4.8/KPI-17),
`MOTION_SEND_HZ`, `PING_INTERVAL_S`, `PING_TIMEOUT_S`, `TILT_TARGET_AXIS`.
Invariante: nenhum desses valores aparece como número mágico fora de `config.py`.

### GameState (jogo — dados puros manipulados por `entities.js`/`rules.js`)
- `ducks: [{pos, vel, alive, spawnedAt, pattern}]`, `crosshair: {x, y}`,
  `ammo: int (0..3)`, `round: int`, `hitsInRound: int`, `requiredHits: int`,
  `score: int`, `streak: int`, `highScore: int (memória da página)`,
  `phase: enum(calibration, playing, reload, roundEnd, gameOver)`.
- Invariantes: `ammo` nunca negativo; disparo com `ammo == 0` não muda `ducks` nem
  `score`; `round N+1` tem dificuldade ≥ `round N`; `streak` reseta a 0 no erro;
  **`crosshair` é função pura da leitura atual do eixo e da geometria da tela** —
  nunca do valor anterior de `crosshair` (mira absoluta, F10.7–F10.9).

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
| KPI-12 Controles efetivamente acionáveis | F2, F6 | 100% dos controles acionáveis (12 botões + calibrar) produzem sua mensagem quando acionados **apenas por toque** | testes automatizados W12–W14 em navegador headless (tests/client-controller.md) |
| KPI-13 Produto jogável fim-a-fim | F2, F4, F5, F6, F10 | uma partida completa jogada só com o celular, sem nenhum controle inerte (0 ocorrências) | procedimento manual W20 em tests/client-controller.md — **critério de pronto: nenhuma entrega é declarada completa sem ele** |
| KPI-14 Ausência de falha silenciosa | F2, F9 | 0 intervalos em que a interface aceita toque sem que o estado real da conexão esteja visível na tela; estado visível em 100% do tempo, com código de fechamento após queda | testes automatizados W11 e W19 em navegador headless (tests/client-controller.md) |
| KPI-15 Inicialização com o driver real | F7 | `python server/main.py` sobe e aceita conexões com o ViGEmBus instalado, incluindo registro do callback de rumble, em 100% das tentativas (0 exceções) | procedimento manual E10 em tests/gamepad-emulation.md — o dublê da suíte padrão não substitui esta verificação |
| KPI-16 Fidelidade do apontamento absoluto | F4, F10 | mesma inclinação ⇒ mesma posição da mira, independentemente do histórico: 0 desvios nos testes determinísticos (mapping estateless + mira função do eixo atual) | testes automatizados M19 (tests/mapping.md) e G20–G22 (tests/duck-shooting.md) |
| KPI-17 Resposta da suavização | F4 | com config padrão e amostras a 60 Hz, degrau de entrada atinge 90% do valor final em ≤ 100 ms (sem sacrificar KPI-7) | teste automatizado M20 em tests/mapping.md |
| KPI-18 Sentido correto dos eixos na pegada vertical | F4, F10 | 4/4 direções corretas (direita, esquerda, cima, baixo) nos vetores de teste sintéticos — incluindo a fronteira da Gamepad API — e na verificação manual com o aparelho | testes automatizados M17–M18 (tests/mapping.md), G22–G23 (tests/duck-shooting.md); manual W22m em tests/client-controller.md |

Sem KPI artificial: taxa de acerto no Duck Shooting é usada como **métrica comparativa
entre versões** (regressão de qualidade de controle), não como meta absoluta — o
procedimento de comparação está em tests/latency-and-kpis.md.
