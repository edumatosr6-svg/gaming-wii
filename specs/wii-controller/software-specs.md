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

**Precisão do apontamento (frente desta revisão humana).** Apontar funciona, mas "dá
trabalho", e o diagnóstico é que **os dois eixos não têm a mesma qualidade de sinal**: a
elevação da ponta vem de acelerômetro + giroscópio (estável), enquanto a direção
horizontal depende do magnetômetro (sensível a interferência de mesa metálica, PC,
monitor e fonte, e a deriva ao longo da sessão). Tratar os dois eixos igual é o erro.
Quatro frentes atacam isso, todas exigidas e **todas desligáveis e verificáveis
isoladamente** (tabela em F15): (1) zona morta e sensibilidade **por eixo** (F4);
(2) **suavização adaptativa por velocidade** no lugar do filtro de fator fixo (F4);
(3) **escada de degradação de fontes de orientação** detectada em runtime e visível na
tela (F13); (4) **fusão de sensores própria no cliente** com rejeição de leitura
magnética sob interferência (F14). Junto disso, a calibração deixa de ser uma amostra
única (F5 — média de uma janela de amostras) e ganha um **assistente guiado de alcance
por direção** (F12), o que obriga o mapeamento a abandonar o raio radial simétrico. A
divisão do processamento entre cliente e servidor passa a ser explícita (seção
"Divisão do processamento entre cliente e servidor", abaixo das Features).

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
  - **Máquina de estados visuais.** O cliente tem exatamente cinco estados de tela:
    `pareamento`, `conectando`, `conectado`, `calibrando` (assistente de calibração,
    F12) e `desconectado`. Em qualquer instante **exatamente uma** tela está visível. A
    alternância é responsabilidade do JavaScript, e o CSS não pode contradizê-la:
    nenhuma regra de estilo pode manter visível um elemento marcado como oculto pelo
    mecanismo de alternância. O estado de **tela** é independente do estado de
    **conexão** (`link`, ver `ClientViewState` em Data Models): `calibrando` só é
    alcançável com `link == online`, e uma queda durante o assistente leva a
    `desconectado`.
  - **Indicador da fonte de orientação (F13) e de interferência magnética (F14).** A
    tela do controle exibe permanentemente, em elemento próprio, **qual degrau da
    escada de fontes está em uso** (nome curto legível) e sinaliza quando a leitura
    magnética está sendo rejeitada. Quando a precisão variar entre dois aparelhos, a
    primeira pergunta é "qual fonte cada um está usando?", e ela precisa ter resposta
    na tela, sem depurar.
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
  5. Em cada um dos **cinco** estados, exatamente uma tela está visível: verificável em
     navegador headless medindo a caixa de layout de cada tela (a oculta tem área
     zero). Cobre o caso em que uma regra de CSS anula o mecanismo de alternância.
  6. Acionar qualquer controle **apenas com eventos de toque** (sem `click`) produz a
     ação correspondente: cada botão de gamepad envia sua mensagem `button` e o comando
     de calibrar inicia a captura de janela (F5), que envia `calibrate` **ao fim da
     janela** — o toque inicia a captura, não a mensagem. Verificável em navegador
     headless com emulação de toque, inspecionando as mensagens efetivamente enviadas ao
     socket.
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
      cinco estados).
  12. A ilustração de pegada é um elemento identificável com área visível maior que
      zero nos estados `pareamento` e `conectando` (verificável em headless).
  13. **Fonte visível:** nas telas `conectado` e `calibrando`, um elemento identificável
      exibe a fonte de orientação em uso — um dos quatro degraus da escada da F13 ou a
      fonte de diagnóstico `synthetic`, quando forçada; forçar a fonte pelo parâmetro de
      URL muda o rótulo exibido (verificável em headless com a fonte sintética).
  14. **Interferência visível:** com a fonte sintética alimentando leituras magnéticas
      fora do esperado, o indicador de rejeição magnética fica visível enquanto durar a
      rejeição e volta a ocultar quando ela cessa (F14), sem trocar de tela.
  15. No estado `calibrando`, exatamente uma etapa do assistente está visível por vez e
      a instrução de manter o aparelho parado está presente durante cada captura
      (F5, F12).
  16. Durante `calibrando`, o cliente **não envia** mensagens `button` (evita disparo
      acidental no jogo enquanto o usuário calibra) e **continua enviando** `motion` —
      verificável em headless inspecionando as mensagens que saem pelo socket.

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
    `localStorage` e pré-preenchido. **Usos permitidos de `localStorage` (lista
    fechada): o último endereço e o perfil de alcances da calibração guiada (F12).**
    Estado de jogo continua proibido.
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
  5. Nada além do último IP/porta e do perfil de alcances (F12) é persistido em
     `localStorage` — duas chaves, nenhuma delas de estado de jogo.

### F4 — Controle por apontamento ("modo Wii": posição absoluta, pegada vertical)

- Descrição:
  - **Modelo de apontamento (requisito de primeira classe).** A inclinação do aparelho
    mapeia para a **posição absoluta** da mira, nunca para a velocidade dela. O valor
    de eixo transportado pelo gamepad virtual é uma **posição apontada normalizada**
    (x, y) ∈ [-1.0, 1.0]²: o centro calibrado corresponde a (0, 0) — centro da tela — e
    o **limite da direção correspondente** (do perfil medido em F12, ou
    `DEFAULT_RANGE_DEG` sem perfil) às bordas (±1.0). Propriedade definidora:
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
  - **Origem da amostra `motion` (contrato que muda nesta revisão).** O cliente obtém a
    orientação da melhor fonte disponível na escada da F13 — que pode ser a **fusão
    própria sobre sensores crus** (F14) — e envia amostras `motion` com os **três
    ângulos** (`a` = alpha/yaw, `b` = beta, `g` = gamma) pelo WebSocket com **throttle
    configurável, padrão 60 Hz** (mínimo aceitável 50 Hz). **Invariante do contrato:
    qualquer que seja o degrau da escada em uso, os três ângulos são expressos na mesma
    convenção do `DeviceOrientationEvent`** (ordem intrínseca Z-X'-Y'', `a` ∈ [0, 360),
    `b` ∈ [-180, 180), `g` ∈ [-90, 90)). O que muda com a fusão é a **procedência e a
    qualidade** da orientação, nunca a semântica do campo — é isso que permite trocar de
    fonte sem tocar no mapeamento nem nos vetores de teste de sentido dos eixos.
    É **proibido** enviar os três sensores crus (giroscópio, acelerômetro e
    magnetômetro) a 60 Hz: multiplicaria o tráfego da mensagem mais frequente do
    protocolo, e a fusão no cliente existe justamente para caber em três números.
  - `alpha` pode ser relativo (zero arbitrário do navegador, ou fusão sem magnetômetro):
    a calibração de centro (F5) absorve o zero arbitrário; a deriva de `alpha` é coberta
    pelo KPI-4 e é o alvo declarado da frente 4 (F14, KPI-22).
  - **Pipeline de conversão (normativo — muda nesta revisão).** No servidor,
    `mapping.py` (módulo **puro, sem I/O**) converte os ângulos da amostra na posição
    apontada (x, y) ∈ [-1.0, 1.0]², aplicando nesta ordem:
    1. **Offset de calibração** (centro do perfil ativo, F5).
    2. **Derivação da direção da ponta**: `yaw_right` e `pitch_up` em graus, relativos
       ao centro calibrado (regra de sinal em "Mapeamento na pegada vertical").
    3. **Zona morta por eixo** (não mais radial): `DEAD_ZONE_YAW_DEG` aplicada a
       `yaw_right` e `DEAD_ZONE_PITCH_DEG` a `pitch_up`, independentemente. Justificativa
       da assimetria: o yaw carrega o ruído do magnetômetro e o pitch vem de
       acelerômetro + giroscópio — com um raio único, ou o horizontal treme, ou o
       vertical fica grudento perto do centro; não existe valor que sirva para os dois.
       Invariante: `DEAD_ZONE_YAW_DEG >= DEAD_ZONE_PITCH_DEG`.
    4. **Normalização por limite de direção** (não mais um raio único): cada eixo é
       dividido pelo alcance **da direção em que está deslocado**, tirado do perfil
       ativo (F12): `yaw_right > 0` usa `range.right`, `yaw_right < 0` usa `range.left`,
       `pitch_up > 0` usa `range.up`, `pitch_up < 0` usa `range.down`. Um alcance medido
       por direção não serve para nada se o mapeamento o comprimir de volta num raio
       único — por isso a normalização radial (`hypot` + ângulo máximo único) é
       **proibida** a partir desta revisão.
    5. **Curva de sensibilidade por eixo** (`SENSITIVITY_YAW`, `SENSITIVITY_PITCH`).
    6. **Saturação suave** por eixo ao se aproximar do limite da direção (clamp com
       curva, não corte abrupto — a derivada da saída é contínua no intervalo útil;
       saída exatamente ±1.0 no limite e além dele).
    7. **Suavização adaptativa por velocidade** (abaixo), aplicada por eixo sobre o
       valor normalizado.
  - **Suavização adaptativa (substitui o filtro de fator fixo).** Um fator único obriga
    a escolher entre mira estável parada e resposta rápida em movimento; as duas metas
    (KPI-7 e KPI-17) brigavam por construção. O fator de suavização passa a ser
    **função da velocidade do movimento, por eixo**:
    - A velocidade é estimada como **deslocamento líquido do sinal de entrada ao longo
      de uma janela** (`SMOOTH_SPEED_WINDOW_MS`, padrão 100 ms) dividido pela duração da
      janela — **não** pela diferença entre amostras consecutivas. Motivo normativo:
      ruído de média zero produz diferenças instantâneas grandes e deslocamento líquido
      pequeno; estimar por amostra consecutiva faria o tremor ser lido como movimento
      rápido e **desligaria o filtro exatamente quando ele é necessário**, invertendo o
      efeito pretendido.
    - Abaixo de `SMOOTH_SPEED_LOW_DPS` (padrão 10 °/s) o filtro usa
      `SMOOTH_ALPHA_STILL` (padrão 0.85 de retenção — filtra forte, mata o tremor);
      acima de `SMOOTH_SPEED_HIGH_DPS` (padrão 80 °/s) usa `SMOOTH_ALPHA_FAST`
      (padrão 0.0 — praticamente desligado, preserva a resposta do gesto); entre os dois
      limiares, interpolação linear.
    - `ADAPTIVE_SMOOTHING_ENABLED = False` volta ao filtro de fator fixo
      (`SMOOTHING_ALPHA`), que permanece em `config.py` como caminho de comparação e
      desligamento isolado da frente 2 (F15).
    - O `dt` entre amostras vem do campo `t` da mensagem `motion`; se `t` estiver
      ausente, não for monotônico ou saltar mais que 1 s, o servidor usa o tempo de
      chegada como base — sem exceção e sem congelar o filtro.
    - **A suavização é transiente, não altera o modelo absoluto:** com a entrada
      constante, a saída converge para o valor não suavizado (estado estacionário), de
      modo que "mesma orientação ⇒ mesma posição" (KPI-16) continua valendo em regime.
    - **Observabilidade obrigatória:** o filtro devolve, junto do par suavizado, o
      **fator efetivo aplicado e a velocidade estimada, por eixo**. Sem isso, "o filtro
      está adaptando?" só teria resposta lendo estado interno da implementação — e a
      regressão mais provável desta frente (estimar velocidade de um jeito que o ruído
      aciona) seria invisível para a suíte. Esses valores são de diagnóstico: **não
      trafegam no protocolo** e podem ser expostos no overlay/métricas.
  - Por padrão o resultado alimenta o **analógico direito**; o eixo de destino é uma
    constante de `config.py` (preparando os perfis da segunda onda).
  - **Ergonomia com critério observável (parâmetros de conforto):**
    - `DEFAULT_RANGE_DEG` (que substitui `MAX_ANGLE_DEG`) é o alcance **padrão de cada
      uma das quatro direções**, usado enquanto não houver calibração guiada (F12) ou
      quando ela for pulada. Continua sendo **parâmetro de ergonomia**, não de ganho:
      quanto o pulso precisa girar para varrer a tela. Valor padrão: **20°**, com
      justificativa registrada em `config.py` — a varredura completa (borda a borda =
      `range.left + range.right` = 40°) deve ser executável só com o pulso, sem mover o
      cotovelo. Faixa aceitável: 15°–30°. Critério manual observável no teste W22m.
    - Com a calibração guiada concluída, os quatro limites vêm do perfil medido e podem
      ser **assimétricos entre direções** — é o ponto da F12. Cada limite medido é
      aceito apenas dentro de `RANGE_MIN_DEG`–`RANGE_MAX_DEG` (padrão 10°–45°): abaixo
      do mínimo o usuário não se moveu e a mira ficaria hipersensível; acima do máximo a
      varredura deixa de caber no giro do pulso (contradiz a ergonomia acima) e o valor
      provavelmente veio de um salto de ângulo.
    - **Orçamento de resposta:** com a config padrão e amostras a 60 Hz, um degrau de
      entrada atinge **90% do valor final em ≤ 100 ms** (KPI-17). Tremor (KPI-7) e
      resposta (KPI-1/KPI-17) continuam sendo metas **simultâneas** — a suavização
      adaptativa é o que torna as duas atingíveis ao mesmo tempo, em vez de negociadas
      entre si.
- Critérios de aceite:
  1. Com o aparelho na posição calibrada, a posição apontada é (0, 0); dentro da zona
     morta **do eixo correspondente**, o eixo continua 0.0.
  2. Deflexão da ponta além da zona morta produz valor monotonicamente crescente com o
     ângulo, até saturar em ±1.0 **no limite da direção** (do perfil ativo, ou
     `DEFAULT_RANGE_DEG` sem perfil); ângulos além do limite continuam reportando
     exatamente ±1.0.
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
  8. Com a suavização **adaptativa** padrão e amostras a 60 Hz, a resposta a um degrau
     atinge 90% do valor final em ≤ 100 ms (KPI-17), verificável em teste puro de
     `mapping.py`.
  9. **Zona morta por eixo:** um deslocamento de magnitude θ com
     `DEAD_ZONE_PITCH_DEG < θ < DEAD_ZONE_YAW_DEG` aplicado só ao yaw produz x = 0.0, e
     o mesmo θ aplicado só ao pitch produz y ≠ 0.0. *Reprova a volta da zona morta
     radial única.*
 10. **Limites por direção:** com um perfil de alcances assimétricos (ex.: `right` = 25°,
     `left` = 15°), a saturação em +1.0 ocorre em +25° e em -1.0 em -15°; e um mesmo
     ângulo absoluto em lados opostos produz **módulos diferentes** de saída. *Reprova
     a normalização radial, que comprimiria os quatro limites de volta a um raio.*
 11. **Atenuação de tremor (KPI-7, caminho automatizado):** com a suavização adaptativa
     padrão e uma entrada composta por orientação fixa fora da zona morta + ruído
     sintético de média zero a 60 Hz, o desvio-padrão da saída é **≤ 40%** do
     desvio-padrão da mesma sequência com suavização desligada.
 12. **Estado estacionário do filtro (compatibilidade com KPI-16):** após um degrau,
     mantendo a entrada constante por 300 ms, a saída fica a menos de 1% do valor não
     suavizado — e esse valor final é o mesmo qualquer que tenha sido a sequência de
     amostras anterior.
 13. **Desligamento isolado (F15):** com `ADAPTIVE_SMOOTHING_ENABLED = False`, zonas
     mortas dos dois eixos iguais e os quatro alcances iguais a `DEFAULT_RANGE_DEG`, o
     mapeamento reproduz o comportamento anterior a esta revisão dentro da tolerância
     dos testes (permite atribuir uma regressão a uma frente específica em vez de
     caçar fantasma entre quatro mudanças simultâneas).
 14. **Fator efetivo observável:** a conversão expõe, por eixo, o fator de suavização
     aplicado e a velocidade estimada na amostra; com a entrada ruidosa de F4.11 o fator
     permanece na faixa "parado" (≥ 80% de `SMOOTH_ALPHA_STILL`) e com um degrau ele cai
     para a faixa "rápido" (≤ 20% de `SMOOTH_ALPHA_STILL`) já na amostra do degrau.

### F5 — Calibração de centro (por média de janela de amostras)

- Descrição:
  - Um comando dedicado na interface do controle inicia a **captura do centro**. No
    modelo de apontamento absoluto (F4), calibrar significa: **a direção para onde a
    ponta aponta agora passa a ser o centro da tela** — a calibração absorve inclusive o
    zero arbitrário de `alpha`. Pode ser reexecutada a qualquer momento, sem reiniciar
    sessão nem reconectar. O jogo de demonstração guia o usuário pela calibração antes
    da primeira rodada (ver F10).
  - **A captura é a média de uma janela curta de amostras com o aparelho parado, nunca
    uma amostra instantânea** (revisão humana). Motivo: se a amostra única pegar um pico
    de ruído, o viés contamina a sessão inteira — calibrar errado é pior que não
    calibrar. Janela padrão `CALIB_WINDOW_MS` = 600 ms.
  - **Critério de suficiência sob fonte lenta (normativo).** A exigência é de **janela
    estável**, não de uma contagem fixa de amostras: exigir contagem fixa tornaria a
    calibração impossível justamente no piso da escada (F13 declara que o evento clássico
    entrega menos amostras e mais irregulares), e F13.5/KPI-23 exigem o produto **jogável
    no piso**. A regra é:
    1. A captura acumula amostras por `CALIB_WINDOW_MS`.
    2. Se ao fim da janela houver menos que `CALIB_MIN_SAMPLES_FLOOR` = 8 amostras
       válidas, a janela é **estendida automaticamente** até `CALIB_WINDOW_MAX_MS` =
       1000 ms, ainda buscando as 8. Justificativa do piso 8: a média de 8 amostras
       reduz o ruído de média zero a ~35% do de uma amostra isolada — muito melhor que a
       captura instantânea que esta revisão remove — e mantém a captura dentro do
       orçamento de entrada (KPI-21).
    3. Se nem assim houver 8 amostras válidas, a fonte está abaixo de
       `CALIB_MIN_SOURCE_HZ` = 8 Hz e a calibração é declarada **impossível nesta fonte**:
       a interface exibe mensagem visível nomeando a causa ("fonte de orientação lenta
       demais") e oferece trocar/forçar outra fonte (F13). **Nunca** entra em laço de
       repetição infinita e **nunca** aceita um centro com base insuficiente. A 8 Hz a
       mira já seria inutilizável de qualquer forma; recusar é honesto, travar não é.
  - **Média circular obrigatória para o yaw.** `a` é um ângulo cíclico: a média
    aritmética de 359° e 1° é 180°, que é o oposto do centro real. A média do centro é
    calculada pela média dos vetores unitários (atan2 da soma de senos e cossenos) para
    o yaw; o mesmo tratamento vale para os demais ângulos quando a janela cruzar a
    descontinuidade.
  - **Rejeição de janela instável.** Se qualquer amostra da janela se afastar da média
    da janela mais que `CALIB_STABILITY_PP_DEG` (padrão 3.0°) em qualquer eixo, a janela
    é **invalidada** e a interface pede repetição ("segure parado"), sem aplicar nada.
    Janela instável e fonte lenta são casos **distintos**: a primeira pede repetir, a
    segunda diz que a fonte não serve (regra acima) — confundi-los produziria o laço de
    repetição que a regra proíbe.
  - **A interface diz o que está acontecendo:** durante a captura a tela exibe a
    instrução de manter o aparelho parado e um indicador de progresso da janela — não
    pode fingir que a calibração é instantânea.
  - **Onde roda:** a captura e a média são do **cliente** (é onde estão as amostras na
    taxa cheia e onde vive a UI de repetição); o resultado é enviado ao servidor no
    perfil de calibração (`calibrate` com payload, ver Data Models) e é o servidor que
    aplica o offset no mapeamento. O caminho degradado `calibrate` **sem payload**
    permanece válido: o servidor zera na última amostra `motion` recebida.
- Critérios de aceite:
  1. Concluída a captura da janela e aplicado o perfil, com o aparelho mantido na mesma
     posição, o eixo reporta (0, 0) na próxima amostra `motion` processada.
  2. Recalibrar N vezes durante uma sessão funciona sem reconexão e sem estado residual
     da calibração anterior.
  3. Se `calibrate` (sem payload) chegar antes de qualquer amostra `motion`, o servidor
     usa o zero padrão (offset nulo) sem erro.
  4. **Média, não amostra:** dada uma janela sintética de amostras em torno de um centro
     conhecido, contendo ruído de média zero, o centro calculado fica a menos de 0.2° do
     centro conhecido — e difere do valor da última amostra da janela (prova que não é
     captura instantânea).
  5. **Média circular:** uma janela de yaw oscilando em torno de 0° com amostras em 359°
     e 1° produz centro ≈ 0° (não ≈ 180°).
  6. **Janela instável rejeitada:** uma janela contendo uma amostra isolada afastada mais
     que `CALIB_STABILITY_PP_DEG` da média é rejeitada, nenhum perfil é aplicado, e o
     cliente sinaliza a necessidade de repetir.
  7. `CALIB_WINDOW_MS` ≤ `CALIB_WINDOW_MAX_MS` ≤ 1000 ms (checagem estática sobre a
     configuração **do cliente**, que é a dona destas constantes — ver Config do
     cliente), para que o custo de entrada da F12 caiba no orçamento do KPI-21.
  8. **Fonte lenta não trava a calibração:** com uma fonte sintética a 12 Hz, a janela se
     estende e a captura **conclui** (≥ 8 amostras); com uma fonte a 5 Hz, a captura
     termina com erro visível nomeando a fonte lenta e oferecendo troca de fonte — em
     nenhum dos dois casos há repetição infinita ou centro aceito com base insuficiente.

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
  - Ao reconectar, o **centro** exige recalibração implícita (nova captura da F5 ou reuso
    do fluxo de entrada); os **quatro alcances** persistidos são reenviados
    automaticamente pelo cliente (P3.4) — o assistente da F12 não é repetido por uma
    queda de Wi-Fi.
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
  4. **Métricas de precisão (novas nesta revisão):** `GET /metrics` inclui também
     `tremor_x` e `tremor_y` — desvio-padrão de cada eixo da posição apontada na janela
     móvel, **por eixo e nunca só na média dos dois** — além de `source` (degrau da F13
     em uso, reportado pelo cliente via `status`) e `mag_reject_ratio` (fração da janela
     em que a leitura magnética esteve rejeitada, F14). Sem separar os eixos, um número
     bom "na média" esconderia justamente o eixo ruim que esta revisão existe para
     corrigir (KPI-19).
  5. O overlay do jogo exibe `tremor_x`/`tremor_y` e o degrau de fonte em uso junto das
     métricas de latência, para que a comparação entre aparelhos e entre fontes seja
     leitura de tela, não depuração.

### F12 — Assistente de calibração guiada de alcance

- Descrição:
  - Além do centro (F5), o cliente conduz, na primeira entrada, uma calibração do
    **alcance de movimento**: segure na posição **neutra**, depois aponte
    confortavelmente para a **esquerda**, para a **direita**, para **cima** e para
    **baixo**. São cinco capturas, cada uma com o mesmo mecanismo da F5 (janela de
    amostras com o aparelho **sustentado** na posição, média circular, rejeição de
    janela instável) — **um tremor não pode definir o alcance da sessão**, e por isso o
    pico instantâneo é proibido como fonte do alcance.
  - **Por que existe:** o alcance confortável do pulso é diferente entre pessoas e
    **diferente entre direções** (quase ninguém gira tanto para a esquerda quanto para a
    direita, e o alcance vertical costuma ser menor que o horizontal). Medir o alcance
    real faz a curva de sensibilidade se ajustar à pessoa: alcançar os cantos deixa de
    exigir contorção e o meio da tela deixa de ser excessivamente sensível. A
    consequência arquitetural (limite por direção no mapeamento) está normatizada no
    pipeline da F4, passo 4.
  - Cada alcance é a diferença angular entre o extremo capturado e o centro capturado,
    em módulo: `range.right = |yaw(extremo direito) − yaw(centro)|`, e assim por diante
    para as outras três direções.
  - **Rejeição de valor absurdo:** alcance fora de `RANGE_MIN_DEG`–`RANGE_MAX_DEG`
    (padrão 10°–45°) é rejeitado com nova tentativa daquela direção, **nunca aceito em
    silêncio** — um alcance degenerado trava a mira. Após
    `CALIB_MAX_RETRIES` (padrão 2) rejeições seguidas na mesma direção, o assistente
    oferece usar o padrão daquela direção e seguir adiante, em vez de prender o usuário.
  - **Rápido, pulável, refazível, lembrado:**
    - *Rápido:* é a primeira coisa entre o usuário e o jogo. O somatório das durações
      configuradas (capturas + transições entre etapas) tem orçamento de
      `WIZARD_BUDGET_MS` = 20 000 ms, e o alvo com pessoa real é **menos de meio
      minuto** (KPI-21).
    - *Pulável:* um comando visível pula o assistente e aplica `DEFAULT_RANGE_DEG` nas
      quatro direções — quem só quer jogar, joga.
    - *Refazível:* pode ser reexecutado a qualquer momento a partir da tela `conectado`,
      sem reconectar e sem reiniciar o servidor.
    - *Lembrado:* os **quatro alcances** são persistidos no aparelho (`localStorage`,
      ver Data Models) e reaplicados automaticamente nas sessões seguintes, para que a
      segunda sessão não repita o ritual. O **centro não é persistido entre sessões**:
      ele depende da postura do usuário naquele momento (sentado, deitado, em pé) e um
      centro velho é pior que nenhum; a captura de centro (rápida, F5) acontece na
      entrada de toda sessão.
  - **Decisão explícita sobre `localStorage`:** a regra anterior ("nada além do último
    IP/porta é persistido", F3.5) é ampliada para exatamente **duas** chaves: o último
    endereço e o perfil de alcances. Continua proibido persistir estado de jogo. A
    ampliação é exigência direta do `descriptions.md` ("resultado lembrado no
    dispositivo"), e não conflita com a diretiva de código, que proíbe `localStorage`
    para **estado de jogo** — alcance de pulso é configuração do usuário.
- Critérios de aceite:
  1. O assistente executa exatamente cinco etapas na ordem neutro → esquerda → direita →
     cima → baixo, com uma etapa visível por vez (F2.15).
  2. Ao concluir, o perfil resultante tem quatro alcances independentes, todos dentro de
     `RANGE_MIN_DEG`–`RANGE_MAX_DEG`, e é aplicado ao mapeamento (a mesma orientação
     produz saída diferente antes e depois, quando os alcances medidos diferem do
     padrão).
  3. **Alcance degenerado rejeitado:** uma etapa em que o extremo capturado fica a menos
     de `RANGE_MIN_DEG` do centro (o usuário não se moveu) não é aceita; o assistente
     pede repetição daquela direção e o perfil final não contém o valor degenerado.
  4. **Assimetria preservada de ponta a ponta:** um perfil com `right` ≠ `left`
     (ex.: 25° e 15°) chega ao servidor e é aplicado como dois limites distintos —
     nenhuma etapa do caminho o comprime para um valor único.
  5. **Pular funciona:** o comando de pular encerra o assistente e o mapeamento passa a
     usar `DEFAULT_RANGE_DEG` nas quatro direções.
  6. **Persistência:** concluído o assistente, recarregar a página reaplica os quatro
     alcances sem repetir as quatro etapas de extremo; e o centro **não** é reaplicado —
     a entrada pede a captura de centro de novo.
  7. **Orçamento de tempo:** a soma das durações configuradas do assistente (capturas +
     transições) é ≤ `WIZARD_BUDGET_MS` (verificação automatizada sobre a config), e o
     assistente completo é executável em menos de 30 s com pessoa real (KPI-21, manual).
  8. Somente duas chaves são gravadas em `localStorage` (endereço e perfil de alcances);
     nenhuma chave de estado de jogo é gravada.

### F13 — Fonte de orientação: escada de degradação explícita

- Descrição:
  - As fontes possíveis de orientação formam uma **escada de degradação**, da melhor
    para a pior. O cliente usa a melhor disponível, **informa na tela qual está em uso**
    (F2.13) e continua jogável na pior delas. Nenhuma delas pode ser condição para o
    produto funcionar — **um aparelho sem magnetômetro ainda joga**.

    | # | Degrau (`source`) | O que é | Consequência conhecida |
    |---|---|---|---|
    | 1 | `fusion_mag` | Fusão própria (F14) sobre giroscópio + acelerômetro + **magnetômetro** crus | melhor caso; yaw com referência absoluta e rejeição magnética |
    | 2 | `fusion_nomag` | Fusão própria sobre giroscópio + acelerômetro (sem magnetômetro ou permissão negada) | yaw relativo, deriva maior; absorvida pela calibração e pela recalibração |
    | 3 | `sensor_api` | API de sensores moderna de orientação, **com frequência pedida explicitamente** (`SENSOR_HZ`, padrão 60) | sem controle sobre a fusão interna do aparelho |
    | 4 | `deviceorientation` | Evento de orientação clássico | menos amostras e mais irregulares (economia de bateria do navegador); pior precisão — é o piso, não o alvo |

  - **Detecção em tempo de execução, nunca por nome de navegador:** um degrau só é
    considerado disponível se (a) a API existir, (b) a permissão for concedida e
    (c) amostras **realmente chegarem** dentro de `SOURCE_PROBE_MS` (padrão 1500 ms).
    Falhando qualquer condição, o cliente desce um degrau e repete o teste. Se as
    amostras cessarem durante o uso por mais que `SOURCE_STALL_MS` (padrão 2000 ms), o
    cliente desce um degrau em runtime e atualiza o indicador da tela.
  - **`synthetic` é fonte de diagnóstico, fora da escada (definição normativa).** A
    escada tem **quatro** degraus — os da tabela — e `synthetic` **não é um deles**:
    é uma fonte de amostras roteirizadas, usada por testes headless e por diagnóstico,
    **nunca elegível pela detecção automática** e alcançável somente por forçamento
    explícito. Onde a spec fala em "degrau em uso", `synthetic` aparece como valor
    possível de exibição e de `status` justamente porque está sendo forçada.
  - **Forçamento para diagnóstico (desligamento isolado, F15):** o parâmetro de URL
    `?src=<fonte>` aceita os quatro degraus da escada **e** `synthetic`, e desliga a
    detecção automática. Sem o parâmetro, vale a detecção automática, que só considera os
    quatro degraus. Forçar uma fonte indisponível exibe o erro visível da F2.3 em vez de
    cair calado para outra.
  - Independentemente do degrau, a saída da camada de fonte é sempre a **orientação na
    convenção do `DeviceOrientationEvent`** (contrato da F4) — o resto do cliente e todo
    o servidor não sabem qual degrau produziu a amostra.
- Critérios de aceite:
  1. A **detecção automática** considera exatamente os quatro degraus da tabela, na ordem
     dada, e nada além deles: `synthetic` nunca é selecionada automaticamente, em nenhuma
     condição (verificável com todos os quatro degraus indisponíveis, cenário em que o
     resultado é o erro do critério 3, não a fonte sintética). A seleção é por detecção em
     runtime, sem nenhuma decisão baseada em user agent (inspeção estática).
  2. Com o degrau preferido indisponível (API ausente, permissão negada ou nenhuma
     amostra em `SOURCE_PROBE_MS`), o cliente passa ao degrau seguinte e o indicador da
     tela mostra o degrau efetivamente em uso.
  3. Com todas as fontes indisponíveis, a interface exibe o aviso visível da F2.3
     nomeando a causa provável — não fica silenciosamente sem mira.
  4. `?src=<fonte>` força a fonte indicada — um dos quatro degraus **ou** `synthetic` — e
     o rótulo exibido corresponde à fonte forçada; com `synthetic`, o rótulo a identifica
     como fonte de diagnóstico, para que ninguém confunda uma sessão de teste com uma
     medição real.
  5. **Jogável no piso:** com `?src=deviceorientation`, uma partida completa é jogável
     (KPI-23, manual W28m).
  6. Quando o degrau em uso muda (queda ou promoção), o cliente informa o servidor por
     mensagem `status` (Data Models) e o valor aparece em `GET /metrics` — sem o degrau
     em uso registrado, comparar precisão entre dois aparelhos vira depuração.

### F14 — Fusão de sensores no cliente com rejeição de leitura magnética

- Descrição:
  - Nos degraus `fusion_mag` e `fusion_nomag`, o cliente lê os sensores **crus**
    (giroscópio, acelerômetro e — quando existir — magnetômetro) e faz a **fusão de
    orientação em JavaScript puro** (sem npm, sem framework, sem build — mesma restrição
    de todo o cliente), produzindo a orientação na convenção do contrato da F4.
  - Modelo de fusão exigido (filtro complementar, suficiente e testável):
    - O giroscópio integra a orientação a cada amostra (resposta rápida, deriva lenta).
    - O acelerômetro corrige **pitch e roll** pela direção da gravidade, com peso
      `FUSION_ACC_GAIN` (padrão 0.02 por amostra), e a correção é **suspensa** quando o
      módulo da aceleração medida se afasta de 1 g mais que `FUSION_ACC_TOL_G`
      (padrão 0.2 g) — sob agitação o vetor medido não é a gravidade.
    - O magnetômetro corrige **apenas o yaw**, com peso `FUSION_MAG_GAIN` (padrão 0.01
      por amostra), e somente quando a leitura passar na validação abaixo.
  - **Rejeição de leitura magnética sob interferência (o ponto da frente 4).** A leitura
    magnética é descartada quando:
    - o módulo do campo medido sai da faixa `FUSION_MAG_MIN_UT`–`FUSION_MAG_MAX_UT`
      (padrão 25–65 µT, faixa do campo terrestre); **ou**
    - o módulo se afasta mais que `FUSION_MAG_DEV_PCT` (padrão 20%) da linha de base da
      sessão (média móvel das leituras aceitas); **ou**
    - a inclinação magnética (ângulo entre o campo medido e a gravidade) se afasta mais
      que `FUSION_MAG_DIP_TOL_DEG` (padrão 15°) da linha de base da sessão.
    Enquanto a leitura estiver rejeitada, **o yaw segue só pelo giroscópio** — melhor
    derivar devagar que ser puxado por uma bússola mentindo (mesa metálica, PC, monitor,
    fonte). A saída/entrada do estado de rejeição tem histerese
    (`FUSION_MAG_HYSTERESIS_MS`, padrão 500 ms) para não piscar, e o estado é exibido na
    tela (F2.14) e informado ao servidor por `status` (baixa frequência, nunca no
    caminho quente de `motion`).
  - **Desligamento isolado (F15):** `?mag=off` desliga a correção magnética (equivale a
    operar em `fusion_nomag`) e `?magreject=off` mantém a correção magnética **sem** a
    rejeição — as duas chaves existem para separar "a fusão ajuda?" de "a rejeição
    ajuda?", que é exatamente a comparação exigida pelo KPI-22.
  - **Cobertura de teste equivalente do lado JS.** O que saiu do alcance da suíte Python
    (fusão e rejeição) ganha testes JS puros no runner do projeto (`node --test` dentro
    do `pytest`), alimentados por fluxos sintéticos de sensores — a fusão é função pura
    de (estado anterior, amostras, dt).
- Critérios de aceite:
  1. A fusão é um módulo JS puro, sem dependência externa e sem etapa de build, testável
     com fluxos sintéticos de sensores.
  2. **Estabilidade estática:** com giroscópio em repouso e acelerômetro/magnetômetro
     constantes, a orientação fundida permanece constante dentro de 0.5° por 60 s
     simulados.
  3. **Correção de deriva:** com um giroscópio sintético com viés constante conhecido
     (ex.: 1 °/s em pitch) e acelerômetro coerente, o erro de pitch converge e permanece
     abaixo de 2°, em vez de crescer sem limite.
  4. **Rejeição magnética eficaz (KPI-24):** num fluxo sintético com um trecho de campo
     magnético corrompido (módulo fora da faixa e/ou inclinação alterada), o erro de yaw
     ao fim do trecho é **estritamente menor** com a rejeição ligada do que com ela
     desligada, e a fusão não acompanha a bússola falsa.
  5. **Sem magnetômetro ainda joga:** com o magnetômetro ausente, a fusão opera em
     `fusion_nomag` sem exceção, produzindo pitch correto e yaw relativo.
  6. Entradas inválidas de sensor (NaN, ausência de amostra, `dt` zero ou negativo) não
     produzem exceção nem `NaN` na orientação de saída.
  7. O estado de rejeição magnética tem histerese: uma interferência que oscile mais
     rápido que `FUSION_MAG_HYSTERESIS_MS` não faz o indicador piscar a cada amostra.
  8. Nenhuma mensagem `motion` carrega leitura crua de sensor (verificável no schema e
     por inspeção do que sai pelo socket).

### F15 — Frentes de precisão: cada uma verificável e desligável isoladamente

- Descrição: sem isolamento, uma regressão de precisão vira caça ao fantasma entre
  quatro mudanças simultâneas — e é justamente a precisão que se está tentando medir.
  Cada frente tem um interruptor único e documentado, e um teste que prova que o
  interruptor funciona.

  | Frente | Interruptor | Padrão | Onde | Prova |
  |---|---|---|---|---|
  | 1. Parâmetros por eixo (F4) | `DEAD_ZONE_YAW_DEG`/`DEAD_ZONE_PITCH_DEG` e `SENSITIVITY_YAW`/`SENSITIVITY_PITCH` iguais entre si | assimétricos (yaw ≥ pitch) | `config.py` (servidor) | F4.9, F4.13 |
  | 2. Suavização adaptativa (F4) | `ADAPTIVE_SMOOTHING_ENABLED` | `True` | `config.py` (servidor) | F4.8, F4.11, F4.13 |
  | 3. Escada de fontes (F13) | `?src=<degrau>` | detecção automática | URL (cliente) | F13.4, F13.5 |
  | 4. Fusão e rejeição magnética (F14) | `?mag=off`, `?magreject=off` | ligados | URL (cliente) | F14.4, KPI-22 |
  | (calibração guiada, F12) | comando "pular" e limpeza do perfil salvo | assistente na primeira entrada | UI (cliente) | F12.5, KPI-20 |

- Critérios de aceite:
  1. Todos os interruptores da tabela existem, com os nomes e locais indicados, e estão
     documentados no README.
  2. Com todos os interruptores na posição "desligado" (parâmetros por eixo iguais,
     suavização fixa, `?src=deviceorientation&mag=off`, perfil padrão), o produto
     continua jogável — a linha de base de comparação é operável, não hipotética.
  3. Cada interruptor muda comportamento observável em pelo menos um teste automatizado
     nomeado na coluna "Prova".

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

## Divisão do processamento entre cliente e servidor

Decisão explícita exigida pelo `descriptions.md` ("onde mora o processamento de
orientação"). O critério é: **fica no cliente o que só existe no cliente** (sensores
crus, UI de captura, persistência no aparelho); **fica no servidor o que se beneficia da
suíte de testes Python e não depende de hardware** (mapeamento, filtros, aplicação do
perfil).

| Etapa | Onde roda | Por quê |
|---|---|---|
| Leitura dos sensores crus e seleção do degrau de fonte (F13) | **Cliente** | os sensores só existem lá |
| Fusão de orientação e rejeição magnética (F14) | **Cliente** | é onde estão os sensores crus, e enviar três sensores a 60 Hz multiplicaria o tráfego da mensagem mais frequente |
| Captura de janela do centro e dos extremos, média circular, rejeição de janela instável (F5, F12) | **Cliente** | precisa da taxa cheia de amostras e da UI de "segure parado"/repetição |
| Persistência do perfil de alcances (F12) | **Cliente** (`localStorage`) | "lembrado no dispositivo"; o servidor não guarda estado entre sessões |
| Aplicação do offset de centro, zonas mortas por eixo, limites por direção, sensibilidade, saturação e suavização adaptativa (F4) | **Servidor** (`mapping.py`, puro) | é a lógica com maior risco de bug silencioso e a mais barata de testar sem hardware |
| Atualização do gamepad virtual, métricas, ciclo de vida (F7, F9, F11) | **Servidor** | inalterado |

**Consequência assumida (e obrigatória):** o que foi para o cliente **sai do alcance da
suíte Python** e passa a exigir **cobertura equivalente do lado JS** — fusão, rejeição
magnética, captura de janela, média circular e lógica do assistente têm testes puros no
runner JS do projeto (`node --test` executado dentro do `pytest`, ver tools/tooling.md),
mais os casos headless que exercitam a UI do assistente com a fonte `synthetic`. Uma
entrega que mova lógica para o cliente sem essa cobertura reprova.

**O que NÃO muda de lado:** o mapeamento continua no servidor, e por isso o contrato do
`motion` continua sendo "três ângulos na convenção do `DeviceOrientationEvent`" (F4) —
a fusão troca a procedência dos ângulos, não o contrato.

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
   permissão de sensores. Em seguida, **seleciona o degrau de fonte de orientação**
   (P7/F13), exibe o degrau em uso e envia `status` ao servidor.
2b. Se houver perfil de alcances salvo (F12), o cliente o reenvia imediatamente e vai
   direto para a captura de centro (rápida, F5). Se não houver, entra no estado
   `calibrando` e roda o assistente completo (P6), que pode ser pulado.
3. No **fim** do primeiro toque do usuário sobre a interface já conectada (evento de
   término do toque, uma única vez na sessão), o cliente pede tela cheia e trava a
   orientação em **retrato** (F2 — momento do modo imersivo). Nunca durante um toque
   em andamento, porque o navegador cancela a sequência e engole o acionamento.
4. Cliente envia `motion` (ângulos `a`, `b`, `g`) a ~60 Hz e `button` por transição;
   servidor aplica `mapping.py` (posição apontada absoluta, F4) e atualiza o gamepad
   virtual a cada mensagem. Todo acionamento vem de eventos de toque; nenhuma ação
   depende de `click` (F2.6, F2.9).
5. Usuário recalibra o centro quando quiser tocando no comando de calibrar (captura de
   janela da F5) e pode refazer o assistente de alcance (P6) a qualquer momento.
6. Jogo (qualquer um) lê o gamepad; rumble volta pelo caminho da F8.
7. Sempre que o degrau de fonte ou o estado de rejeição magnética mudar, o cliente
   atualiza o indicador na tela e envia `status` (baixa frequência, nunca no caminho
   quente do `motion`).

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
4. Após reconectar, o **centro** da sessão anterior não é reaproveitado: vale o zero
   padrão até que o usuário calibre de novo (F9 — recalibração implícita). Os **quatro
   alcances**, ao contrário, são reenviados automaticamente pelo cliente logo após o
   `hello`, porque descrevem o pulso da pessoa e não a postura do momento — obrigar a
   refazer o assistente a cada queda de Wi-Fi contraria o orçamento de entrada (KPI-21).
5. O cliente reenvia também o `status` (degrau de fonte, rejeição magnética) na
   reconexão, para que as métricas do servidor não fiquem com o valor da sessão morta.

### P4 — Partida de Duck Shooting
1. PC abre a URL do jogo; jogo detecta o gamepad virtual via Gamepad API (se ausente,
   tela "aguardando controle").
2. Tela de entrada guia a calibração (F10, fluxo de entrada): instrui a segurar o
   aparelho **em pé, apontando para a tela** (pegada vertical, F2), calibrar, e
   confirma mira estável no centro. Na primeira entrada do celular, isso inclui o
   assistente de alcance (P6); nas seguintes, apenas a captura de centro (F5).
3. Loop de rodadas: spawn de patos → mira posicionada pelo apontamento absoluto
   (posição = f(eixo atual), F10) → disparo (A) → resolução (acerto/escape) → fim de
   leva → recarga → checagem de critério de avanço.
4. Game over ao falhar o critério; mostra pontuação e recorde da sessão; permite
   recomeçar.

### P5 — Transição de estado visual do cliente
Executada pelo cliente a cada mudança de situação da conexão (ver `ClientViewState` em
Data Models). Entrada: estado atual + evento. Saída: exatamente uma tela visível.
1. Determinar o novo estado a partir do evento (carregar página, socket aberto, `hello`
   recebido, socket fechado, tentativa de reconexão em curso, início/fim do assistente
   de calibração).
2. Ocultar todas as telas pelo mecanismo único de alternância e revelar apenas a do
   novo estado. Nenhuma regra de estilo pode manter visível uma tela ocultada por esse
   mecanismo (F2.5) — a alternância é a única autoridade sobre visibilidade de tela.
3. Atualizar o indicador permanente de estado da conexão, que é visível em todos os
   **cinco** estados (F9.6), incluindo o motivo/código quando houver queda, e o
   indicador de fonte de orientação (F2.13).

### P6 — Assistente de calibração guiada (cliente, F12)
Entrada: sessão conectada, fonte de orientação selecionada. Saída: perfil de calibração
aplicado no servidor e alcances persistidos no aparelho.
1. Entrar no estado `calibrando` (uma tela visível; `button` suspenso — F2.16).
2. Para cada etapa, na ordem **neutro → esquerda → direita → cima → baixo**: exibir a
   instrução da direção, aguardar o toque de "capturar", exibir "segure parado" e
   coletar a janela de amostras (F5).
3. Validar a janela: instável ⇒ pedir repetição da mesma etapa. Extremo válido ⇒
   calcular o alcance daquela direção como o módulo da diferença para o centro.
4. Alcance fora de `RANGE_MIN_DEG`–`RANGE_MAX_DEG` ⇒ repetir a etapa; após
   `CALIB_MAX_RETRIES` repetições, oferecer o valor padrão daquela direção e seguir.
5. Concluídas as cinco etapas (ou ao pular), montar o perfil, **persistir os quatro
   alcances** no aparelho, enviar `calibrate` com payload ao servidor e aguardar
   `calibration_applied`.
6. `accepted: false` ⇒ exibir o motivo e oferecer refazer; `accepted: true` ⇒ voltar ao
   estado `conectado`.

### P7 — Seleção do degrau de fonte de orientação (cliente, F13)
1. Se houver `?src=<fonte>` (um dos quatro degraus ou `synthetic`), usar a fonte forçada
   e pular a detecção (falha ⇒ erro visível da F2.3, sem cair calado para outra fonte).
2. Caso contrário, percorrer **apenas a escada**, do degrau 1 ao 4 (`synthetic` está fora
   dela): verificar existência da API, pedir permissão e **aguardar amostras reais** por
   `SOURCE_PROBE_MS`.
3. Primeiro degrau que entregar amostras vence; exibir o rótulo na tela e enviar
   `status` ao servidor.
4. Nenhum degrau disponível ⇒ aviso visível nomeando a causa provável (F13.3).
5. Em runtime, se as amostras cessarem por mais que `SOURCE_STALL_MS`, descer um degrau,
   atualizar o rótulo e enviar `status` de novo.

## Data Models

### Protocolo WebSocket (JSON, campo `type` em snake_case — documentado em `protocol.py`)

| type | direção | campos | notas |
|---|---|---|---|
| `hello` | servidor→cliente | `session_id: str`, `server_version: str` | resposta imediata à conexão |
| `motion` | cliente→servidor | `a: float \| null` (alpha/yaw, graus — null se a fonte não reportar), `b: float` (beta, graus), `g: float` (gamma, graus), `t: float` (timestamp ms do cliente) | mensagem mais frequente; nomes curtos de propósito; os três ângulos são necessários para derivar a direção da ponta na pegada vertical (F4). **Podem vir da fusão do cliente (F14)** — a convenção do `DeviceOrientationEvent` vale para todos os degraus da F13. **Nenhuma leitura crua de sensor trafega aqui** |
| `button` | cliente→servidor | `id: str` (um de: `a,b,x,y,up,down,left,right,lb,rb,start,back`), `down: bool` | somente em transições; suspenso durante `calibrando` (F2.16) |
| `calibrate` | cliente→servidor | **sem payload** (degradado): — ; **com payload**: `center: {a: float\|null, b: float, g: float} \| null`, `ranges: {left: float, right: float, up: float, down: float} \| null` (graus, sempre positivos) | sem payload zera no valor de `motion` mais recente e usa `DEFAULT_RANGE_DEG` (F5.3). Com payload aplica o perfil da F5/F12; `center` e `ranges` são independentes (reenviar só `ranges` na reconexão é válido — P3.4) |
| `calibration_applied` | servidor→cliente | `accepted: bool`, `reason: str \| null`, `effective: {ranges: {...}, has_center: bool}` | resposta ao `calibrate`. Perfil inválido/degenerado é rejeitado com motivo e o perfil anterior é mantido — **nunca aceito em silêncio** (F12, KPI-14) |
| `status` | cliente→servidor | `source: str` — enum fechado: os **quatro degraus** da escada (`fusion_mag`, `fusion_nomag`, `sensor_api`, `deviceorientation`) mais a fonte de diagnóstico `synthetic` (F13), que só aparece quando forçada; `mag_rejected: bool` | baixa frequência: no `hello`, a cada mudança e no máximo 1×/s. **Proibido embutir esses campos no `motion`** — são constantes na maior parte do tempo e engordariam a mensagem mais frequente |
| `vibrate` | servidor→cliente | `intensity: float [0..1]`, `duration_ms: int` | intensidade 0 cancela |
| `ping`/`pong` | ambos | `t: float` | base do RTT e da detecção de queda |

Invariantes do protocolo: mensagens desconhecidas/inválidas são descartadas sem derrubar
a conexão (F1.4); todos os floats de eixo internos ficam em [-1.0, 1.0]; se os KPIs de
latência não forem atingidos com JSON, um formato binário compacto para `motion` é a
alternativa prevista (mesmos campos, layout fixo) — decisão adiada até haver medição.
O `motion` **não cresce** nesta revisão: precisão nova não pode ser paga com tráfego na
mensagem mais frequente.

### CalibrationProfile (cliente monta, servidor aplica — F5/F12)

- Campos: `center: {a: float | null, b: float, g: float} | null` (orientação média da
  janela de captura), `ranges: {left, right, up, down}` (graus, > 0), `createdAt`,
  `schemaVersion`.
- Persistência: **apenas `ranges`** vai para `localStorage` (chave dedicada, com
  `schemaVersion`); `center` é de sessão e vive em memória — postura muda entre sessões.
- Invariantes:
  1. Cada valor de `ranges` está em `RANGE_MIN_DEG`–`RANGE_MAX_DEG`; fora disso o perfil
     é rejeitado (cliente no assistente, servidor na validação do `calibrate`).
  2. Os quatro alcances são **independentes**: nenhum passo do caminho pode substituí-los
     por um valor único (proibição da normalização radial, F4).
  3. Perfil ausente ⇒ `DEFAULT_RANGE_DEG` nas quatro direções (equivale a pular, F12.5).
  4. Um `schemaVersion` desconhecido no armazenamento é descartado e tratado como perfil
     ausente — nunca aplicado parcialmente.

### SessionState (servidor — objeto explícito, sem estado global mutável)
- `session_id`, `websocket`, `calibration_offset: (alpha0, beta0, gamma0)`,
  `ranges: {left, right, up, down}` (do perfil recebido, ou `DEFAULT_RANGE_DEG`),
  `last_motion: (a, b, g, t)`, `button_state: dict[str, bool]`, `connected: bool`,
  `latency_window: deque[float]`, `axis_window: deque[(x, y)]` (base de
  `tremor_x`/`tremor_y`), `smoother` (estado explícito do filtro adaptativo),
  `source: str | null`, `mag_rejected: bool` (últimos valores recebidos por `status`).
- Invariantes: `connected == False` ⇒ gamepad virtual zerado (F9); um perfil rejeitado
  não altera `calibration_offset` nem `ranges`; ao recalibrar, o estado do filtro é
  descartado (sem arrasto da posição anterior).

### ClientViewState (cliente — máquina de estados visuais, F2/F9)

Estado explícito no JS do controle; a tela exibida é função dele e de mais nada.

- Estados: `pareamento`, `conectando`, `conectado`, `calibrando`, `desconectado`.
- Campos: `state: enum(acima)`, `link: enum(offline, connecting, online)` (situação da
  conexão, **independente da tela**: `calibrando` acontece com `link == online`),
  `endpoint: str` (origem da página ou endereço manual), `lastCloseCode: int | null`,
  `lastCloseReason: str | null`, `reconnectAttempts: int`,
  `source: str` (degrau da F13 em uso), `magRejected: bool`,
  `wizardStep: enum(neutro, esquerda, direita, cima, baixo) | null`.
- Transições:

| de | evento | para |
|---|---|---|
| (carga da página) | origem utilizável | `conectando` |
| (carga da página) | sem origem utilizável (arquivo local) | `pareamento` |
| `pareamento` | toque em conectar com endereço válido | `conectando` |
| `conectando` | `hello` recebido, com perfil de alcances salvo | `conectado` |
| `conectando` | `hello` recebido, sem perfil salvo (primeira entrada) | `calibrando` |
| `conectando` | erro/timeout de abertura | `desconectado` |
| `conectado` | toque em "calibrar alcance" (refazer assistente) | `calibrando` |
| `calibrando` | assistente concluído, pulado ou cancelado | `conectado` |
| `conectado` \| `calibrando` | socket fechado ou timeout de ping/pong | `desconectado` |
| `desconectado` | tentativa automática de reconexão iniciada | `conectando` |
| `desconectado` | toque em reconectar | `conectando` |

- Invariantes:
  1. **Exatamente uma** tela visível por estado (F2.5) — nunca zero, nunca duas; em
     `calibrando`, exatamente uma etapa do assistente visível (F2.15).
  2. O indicador de estado da conexão é visível nos cinco estados (F9.6); o indicador de
     fonte de orientação é visível em `conectado` e `calibrando` (F2.13).
  3. `link != online` ⇒ nenhum input é enviado, **e** a tela indica isso; enviar com
     socket fechado nunca é descartado em silêncio (F9.7).
  4. Em `desconectado` por queda, `lastCloseCode` está preenchido e é exibido.
  5. `reconnectAttempts` é zerado ao atingir `link == online`.
  6. `state == calibrando` ⇒ `button` suspenso e `motion` mantido (F2.16);
     `wizardStep != null` exatamente nesse estado.

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

### Config (constantes em `config.py` — servidor)

Rede e ciclo de vida: `PORT`, `MOTION_SEND_HZ`, `PING_INTERVAL_S`, `PING_TIMEOUT_S`,
`TILT_TARGET_AXIS`, `MAX_MESSAGE_BYTES`, `METRICS_WINDOW_SIZE`.

Mapeamento **por eixo** (F4 — substitui `DEAD_ZONE_DEG`/`SENSITIVITY` únicos):

| Constante | Padrão | Faixa | Justificativa |
|---|---|---|---|
| `DEAD_ZONE_YAW_DEG` | 3.0° | 2–5° | yaw carrega o ruído/deriva da referência magnética |
| `DEAD_ZONE_PITCH_DEG` | 1.5° | 1–3° | pitch vem de acelerômetro + giroscópio, sinal estável; com o valor do yaw ficaria grudento |
| `SENSITIVITY_YAW` / `SENSITIVITY_PITCH` | 1.0 / 1.0 | > 0 | existem para permitir tuning por eixo sem mexer no código |
| `DEFAULT_RANGE_DEG` (substitui `MAX_ANGLE_DEG`) | 20° | 15–30° | ergonomia: varredura borda a borda (40°) só com o pulso, sem mover o cotovelo |
| `RANGE_MIN_DEG` / `RANGE_MAX_DEG` | 10° / 45° | — | limites de aceitação do alcance medido (F12): abaixo, o usuário não se moveu; acima, sai do giro de pulso |

Suavização adaptativa (F4): `ADAPTIVE_SMOOTHING_ENABLED` (True),
`SMOOTH_SPEED_WINDOW_MS` (100), `SMOOTH_SPEED_LOW_DPS` (10), `SMOOTH_SPEED_HIGH_DPS`
(80), `SMOOTH_ALPHA_STILL` (0.85), `SMOOTH_ALPHA_FAST` (0.0), e `SMOOTHING_ALPHA` (0.2)
preservado apenas como fator fixo do modo desligado (F15).

Validação do perfil de calibração (o servidor é a **autoridade**, F12):
`RANGE_MIN_DEG`, `RANGE_MAX_DEG` (acima) — nenhuma outra constante de calibração mora
aqui: a captura de janela e o assistente são inteiramente do cliente (F5 "Onde roda").

Invariantes:
1. Nenhum desses valores aparece como número mágico fora de `config.py`.
2. `DEAD_ZONE_YAW_DEG >= DEAD_ZONE_PITCH_DEG` (a assimetria tem sinal definido).
3. `RANGE_MIN_DEG < DEFAULT_RANGE_DEG < RANGE_MAX_DEG`.
4. `SMOOTH_SPEED_LOW_DPS < SMOOTH_SPEED_HIGH_DPS` e
   `SMOOTH_ALPHA_FAST <= SMOOTH_ALPHA_STILL`.

### Config do cliente (módulo único de configuração JS)

**Dono das constantes de captura e do assistente** — a captura de janela, a validação de
estabilidade e o assistente rodam no cliente, então as constantes correspondentes moram
aqui e **não** têm cópia no servidor:

`CALIB_WINDOW_MS` (600), `CALIB_WINDOW_MAX_MS` (1000), `CALIB_MIN_SAMPLES_FLOOR` (8),
`CALIB_MIN_SOURCE_HZ` (8), `CALIB_STABILITY_PP_DEG` (3.0), `CALIB_MAX_RETRIES` (2),
`WIZARD_BUDGET_MS` (20000).

Fonte de orientação e fusão: `SENSOR_HZ` (60 — frequência **pedida explicitamente** à API
de sensores, F13), `SOURCE_PROBE_MS` (1500), `SOURCE_STALL_MS` (2000), `FUSION_ACC_GAIN`
(0.02), `FUSION_ACC_TOL_G` (0.2), `FUSION_MAG_GAIN` (0.01), `FUSION_MAG_MIN_UT` (25),
`FUSION_MAG_MAX_UT` (65), `FUSION_MAG_DEV_PCT` (20), `FUSION_MAG_DIP_TOL_DEG` (15),
`FUSION_MAG_HYSTERESIS_MS` (500).

**Regra de duplicação (uma só):** `RANGE_MIN_DEG` e `RANGE_MAX_DEG` existem nos dois lados
— no cliente apenas para **pré-validar** cada direção durante o assistente e evitar uma
ida ao servidor para receber um "não". Em caso de divergência entre os dois valores,
**vale a decisão do servidor**: um perfil que passe no cliente e seja rejeitado pelo
servidor produz `calibration_applied {accepted: false}` e o assistente exibe o motivo
(F12, P6.6). Nenhuma outra constante é espelhada.

Invariantes: ficam em um único módulo de configuração do cliente, nunca espalhadas como
números mágicos (mesma regra do servidor); `CALIB_WINDOW_MS <= CALIB_WINDOW_MAX_MS <=`
1000 ms (F5.7).

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
| KPI-2 Taxa de amostras de inclinação no servidor | F4, F13 | ≥ 50 Hz sustentado **no degrau selecionado automaticamente** no aparelho de referência. No piso da escada (`deviceorientation` forçado) a taxa menor e irregular é consequência conhecida da fonte (F13), registrada junto do degrau em uso — não reprova o produto, mas reprova a escolha do degrau se o aparelho tinha fonte melhor disponível | `GET /metrics` (`motion_rate_hz` + `source`); teste automatizado com cliente simulado em tests/latency-and-kpis.md |
| KPI-3 Jitter de latência | F1, F11 | `jitter_ms` (desvio na janela) < 10 ms | `GET /metrics`; procedimento em tests/latency-and-kpis.md |
| KPI-4 Deriva do centro em 15 min | F4, F5, F14 | mira permanece dentro da zona morta do eixo com aparelho imóvel após 15 min sem recalibrar; o desvio é **registrado em graus por eixo**, não só aprovado/reprovado (é a linha de base do KPI-22) | procedimento manual instrumentado L8 em tests/latency-and-kpis.md |
| KPI-5 Tempo de reconexão até jogar | F3, F9 | < 15 s do servidor iniciado até input ativo (reconexão) | cronometrado no procedimento manual de tests/connection-lifecycle.md |
| KPI-6 Zeragem do gamepad na desconexão | F9 | 100% das desconexões zeram tudo em ≤ 250 ms | teste automatizado com gamepad fake em tests/connection-lifecycle.md |
| KPI-7 Estabilidade da mira parada | F4 (suavização adaptativa) | **automatizado:** com ruído sintético de média zero a 60 Hz fora da zona morta, desvio-padrão da saída ≤ 40% do valor sem suavização; **manual:** tremor da mira, aparelho imóvel, menor que o raio da hitbox do pato | teste automatizado M21 (tests/mapping.md) + verificação guiada L9 com `tremor_x`/`tremor_y` do overlay (tests/latency-and-kpis.md) |
| KPI-8 Taxa de quadros do jogo | F10 | 60 fps estáveis (sem quedas perceptíveis no overlay) | overlay F11 (FPS); verificação visual em tests/duck-shooting.md |
| KPI-9 Robustez do protocolo | F1 | 0 crashes do servidor no corpus de mensagens malformadas | suíte automatizada tests/protocol.md |
| KPI-10 Consumo de bateria do celular | F2 | medição registrada (%/hora) em sessão de 1 h; alvo informativo ≤ 20%/h | procedimento manual em tests/latency-and-kpis.md — métrica de acompanhamento, não bloqueia aceite |
| KPI-11 Estabilidade de sessão | F1, F9 | sessão contínua de 30 min jogando sem queda de conexão e sem input travado (0 ocorrências) | procedimento manual C10 em tests/connection-lifecycle.md |
| KPI-12 Controles efetivamente acionáveis | F2, F6 | 100% dos controles acionáveis (12 botões + calibrar) produzem sua mensagem quando acionados **apenas por toque** | testes automatizados W12–W14 em navegador headless (tests/client-controller.md) |
| KPI-13 Produto jogável fim-a-fim | F2, F4, F5, F6, F10 | uma partida completa jogada só com o celular, sem nenhum controle inerte (0 ocorrências) | procedimento manual W20 em tests/client-controller.md — **critério de pronto: nenhuma entrega é declarada completa sem ele** |
| KPI-14 Ausência de falha silenciosa | F2, F9 | 0 intervalos em que a interface aceita toque sem que o estado real da conexão esteja visível na tela; estado visível em 100% do tempo, com código de fechamento após queda | testes automatizados W11 e W19 em navegador headless (tests/client-controller.md) |
| KPI-15 Inicialização com o driver real | F7 | `python server/main.py` sobe e aceita conexões com o ViGEmBus instalado, incluindo registro do callback de rumble, em 100% das tentativas (0 exceções) | procedimento manual E10 em tests/gamepad-emulation.md — o dublê da suíte padrão não substitui esta verificação |
| KPI-16 Fidelidade do apontamento absoluto | F4, F10 | mesma inclinação ⇒ mesma posição da mira, independentemente do histórico: 0 desvios nos testes determinísticos (mapping estateless + mira função do eixo atual) | testes automatizados M19 (tests/mapping.md) e G20–G22 (tests/duck-shooting.md) |
| KPI-17 Resposta da suavização | F4 | com a suavização **adaptativa** padrão e amostras a 60 Hz, degrau de entrada atinge 90% do valor final em ≤ 100 ms — **na mesma configuração** que aprova o KPI-7 (os dois deixam de ser negociáveis entre si) | testes automatizados M20 e M21 na mesma config (tests/mapping.md) |
| KPI-18 Sentido correto dos eixos na pegada vertical | F4, F10 | 4/4 direções corretas (direita, esquerda, cima, baixo) nos vetores de teste sintéticos — incluindo a fronteira da Gamepad API — e na verificação manual com o aparelho | testes automatizados M17–M18 (tests/mapping.md), G22–G23 (tests/duck-shooting.md); manual W22m em tests/client-controller.md |
| KPI-19 Simetria de precisão entre os eixos | F4 (parâmetros por eixo), F11, F14 | **automatizado:** com ruído sintético de mesma amplitude nos dois eixos, `std(x)/std(y)` entre 0.67 e 1.5 (o processamento não introduz assimetria); **manual, no aparelho:** `tremor_x`/`tremor_y` medidos com o aparelho apoiado ficam na razão ≤ 2.0, e o erro de apontamento em alvos horizontais e verticais fica na mesma ordem de grandeza. Um número bom "na média dos dois eixos" **não** conta como aprovação | teste automatizado M23 (tests/mapping.md) + procedimento manual L13 (tests/latency-and-kpis.md) |
| KPI-20 Ganho da calibração guiada | F12 | com **pelo menos duas pessoas de alcance de pulso diferente**: 4/4 bordas e 4/4 cantos alcançáveis sem contorção após o assistente, e cada pessoa relata igual ou melhor que com os valores padrão (comparação explícita contra `DEFAULT_RANGE_DEG`); 0 casos em que alguém precisou editar constante de configuração | procedimento manual L14 (tests/latency-and-kpis.md) |
| KPI-21 Custo de entrada da calibração | F12 | **automatizado:** soma das durações configuradas (5 capturas + transições) ≤ `WIZARD_BUDGET_MS` (20 s); **manual:** assistente completo (centro + 4 direções) concluído em **< 30 s** cronometrados, por pessoa que nunca o usou | teste automatizado L18 (tests/latency-and-kpis.md) + cronometragem manual L15 |
| KPI-22 Melhoria medida da deriva com fusão + rejeição magnética | F13, F14 | deriva horizontal de 15 min medida em **duas condições na mesma sessão de teste** (`?src=deviceorientation` e `?src=fusion_mag`): a deriva com fusão é **estritamente menor** em graus. A comparação é medida, não intuída; se não melhorar, a frente 4 reprova | procedimento manual comparativo L16 (tests/latency-and-kpis.md), usando os graus registrados no KPI-4 |
| KPI-23 Escada de degradação utilizável e visível | F13 | degrau em uso exibido na tela em 100% do tempo conectado (0 casos de fonte desconhecida) e **partida completa jogável no pior degrau** (`?src=deviceorientation`), inclusive em aparelho sem magnetômetro | teste automatizado W25 (tests/client-controller.md) + procedimento manual W28m |
| KPI-24 Eficácia da rejeição magnética | F14 | em fluxo sintético com trecho de interferência, o erro de yaw ao fim do trecho é **estritamente menor** com rejeição ligada do que desligada, e ≤ 5° em valor absoluto | teste automatizado JS PC12 (tests/pointing-client.md) |

Sem KPI artificial: taxa de acerto no Duck Shooting é usada como **métrica comparativa
entre versões** (regressão de qualidade de controle), não como meta absoluta — o
procedimento de comparação está em tests/latency-and-kpis.md. Do mesmo modo, não há KPI
para a aparência do indicador de fonte ou do assistente: o que é estético é verificado
por inspeção (F2.13–F2.15), não por métrica inventada.
