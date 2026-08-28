# wii-controller — Descriptions

> Transformar um Samsung Galaxy A57 em um controle de videogame para PC no estilo
> Wii Remote: a inclinação física do aparelho vira input analógico, a tela vira
> botões, e o PC enxerga tudo como um gamepad padrão. Conexão apenas por Wi-Fi
> local, sem instalar aplicativo no celular.

## Features

### Núcleo (MVP)

- **Servidor local no PC**: um único processo que (a) serve a interface do controle
  como página web na rede local e (b) mantém um canal WebSocket de baixa latência
  com o celular. Ao iniciar, imprime no terminal o IP e a porta de acesso.

- **Cliente web no celular**: página aberta pelo navegador do A57, sem instalação
  de APK e sem etapa de build. Deve funcionar em tela cheia, travar a orientação em
  **retrato (vertical)**, e impedir scroll, zoom e seleção de texto acidentais
  durante o jogo.

  **MUDANÇA DE CONCEITO (revisão humana, decisão que substitui a anterior de
  paisagem):** o celular é segurado **na vertical, como um Wii Remote** — em pé na
  mão, com o polegar sobre a tela e o topo do aparelho apontado para a TV/monitor.
  A decisão anterior de paisagem tratava o celular como um gamepad de duas mãos;
  o teste real mostrou que isso torna o controle confuso de segurar e de entender.
  A pegada vertical de uma mão é a identidade do produto.

- **Pareamento por IP**: tela inicial onde o usuário informa o IP do PC. O último IP
  usado é lembrado no dispositivo para que reconexões futuras sejam de um toque só.

- **QR code de pareamento (revisão humana — atalho para digitar o IP)**: hoje o
  usuário precisa ler o IP no terminal do servidor e digitá-lo no celular, o que é
  atrito e fonte de erro de digitação. O servidor passa a exibir, junto às URLs
  impressas no terminal, um **QR code** (renderizado como ASCII/terminal ou como
  imagem, à escolha do impl-loop) que codifica a URL completa do controle
  (`https://<ip-local>:<porta>/`). O usuário aponta a câmera do celular para o QR
  code e o navegador abre a página do controle direto, sem digitar nada — o campo
  de IP manual continua existindo como alternativa (rede sem câmera disponível,
  celular já pareado antes, etc.), nunca é substituído por completo.
  - Deve ser regerado corretamente se a porta ou o IP mudarem (múltiplas interfaces
    de rede, por exemplo) — o mesmo texto que aparece nas URLs impressas.
  - Sem serviço externo: a geração do QR code é local (biblioteca/algoritmo
    embutido), sem chamada de rede a gerador de QR de terceiros — mesma regra de
    "sem dependência de internet" do resto do projeto.

- **Controle por apontamento (o "modo Wii") — a metáfora do infravermelho**:
  leitura contínua do giroscópio / orientação do aparelho, **com o celular na
  vertical**. O modelo mental oferecido ao usuário é este: **finja que existe um
  emissor infravermelho no topo do celular, logo acima da câmera de selfie, como o
  sensor na ponta de um Wii Remote.** Onde o topo do aparelho aponta, a mira está.

  - Apontar o topo do celular para cima/baixo (levantar e abaixar a "ponta") move a
    mira verticalmente; girar o pulso para os lados (apontar a ponta para esquerda/
    direita) move horizontalmente.
  - A metáfora não é decoração: é a **definição do mapeamento de eixos**. Toda
    decisão de conversão ângulo→mira deve responder à pergunta "para onde o
    infravermelho imaginário está apontando?" — se a resposta e a mira divergirem,
    o mapeamento está errado.
  - A interface do celular deve **ensinar** essa metáfora: na tela de entrada/
    calibração, uma ilustração ou animação curta mostra o aparelho em pé apontando
    para a tela, deixando óbvio como segurar e mirar sem ler manual.
  - Continua valendo: zona morta configurável perto do centro, sensibilidade
    ajustável e saturação suave ao atingir o ângulo máximo.

  **Apontar, não pilotar (o ponto central do "modo Wii").** A inclinação define a
  **posição** da mira, não a velocidade dela. Apontar o aparelho para um lugar coloca
  a mira naquele lugar; o centro calibrado corresponde ao centro da tela e o ângulo
  máximo às bordas. Voltar o aparelho à posição neutra traz a mira de volta ao centro
  — não apenas a faz parar onde estava. Essa é a diferença entre o Wii e um gamepad
  comum, e é o que torna a mira intuitiva: tratar a inclinação como analógico de taxa
  faz a mira sair à deriva e é impraticável de usar (verificado em teste real).

  Consequência a assumir conscientemente: em jogos de terceiros, que interpretam o
  analógico como taxa por convenção, a sensação continuará sendo de cursor por
  velocidade. Isso é limitação conhecida, não defeito — jogos próprios consomem o
  eixo como posição. Perfis de mapeamento (segunda onda) são o caminho para
  terceiros.

  **Ergonomia da mira.** Quanto o pulso precisa girar para varrer a tela inteira é
  parâmetro de conforto e precisa de valor justificado; a suavização contra tremor não
  pode custar resposta perceptível; e o sentido dos eixos (**com o aparelho na
  vertical**: apontar a ponta para a direita leva a mira para a direita, levantar a
  ponta leva a mira para cima) precisa estar correto e verificado — um sinal
  invertido é indistinguível de "controle confuso". Atenção especial do mapeamento:
  na pegada vertical, os ângulos do sensor que correspondem a cada eixo da mira são
  **diferentes** dos da pegada em paisagem — reaproveitar o mapeamento antigo sem
  revisão produz exatamente o eixo trocado/invertido que este parágrafo proíbe.

- **Calibração de centro**: comando explícito que define a posição atual do aparelho
  como o "zero" da inclinação. Necessário porque a posição neutra muda conforme o
  usuário está sentado, deitado ou em pé. Deve poder ser reexecutado a qualquer
  momento sem reiniciar a sessão.

  **REVISÃO HUMANA (precisão — substitui a calibração de amostra única):** capturar
  o centro de uma leitura instantânea é frágil: se aquela amostra pegar um pico de
  ruído, o viés contamina a sessão inteira. O centro passa a ser a **média de uma
  janela curta de amostras** com o aparelho parado (ordem de meio a um segundo), e
  a interface precisa dizer "segure parado" durante a captura em vez de fingir que
  é instantânea. Amostra isolada fora do esperado durante a captura invalida a
  janela e pede repetição — calibrar errado é pior que não calibrar.

- **Calibração guiada de alcance (assistente inicial)**: além do centro, o jogo/
  controle conduz uma calibração de **alcance de movimento** na primeira entrada:
  segure na posição neutra, depois aponte confortavelmente para a **esquerda**, para
  a **direita**, para **cima** e para **baixo**. Cada extremo é capturado do mesmo
  jeito que o centro (janela de amostras com o aparelho sustentado na posição, não
  o pico instantâneo — um tremor não pode definir o alcance da sessão).

  **Por que isso importa.** Hoje o ângulo máximo é uma constante única e simétrica
  chutada para "o usuário médio". Na prática o alcance confortável do pulso é
  **diferente entre pessoas e diferente entre direções** — quase ninguém gira tanto
  para a esquerda quanto para a direita, e o alcance vertical costuma ser menor que
  o horizontal. Medir o alcance real de cada jogador faz a curva de sensibilidade se
  ajustar à pessoa: alcançar os cantos deixa de exigir contorção e o meio da tela
  deixa de ser excessivamente sensível.

  Consequência a assumir: o mapeamento ângulo→mira precisa deixar de ser **radial
  simétrico** (um raio único) e passar a ter **limite por direção** (esquerda,
  direita, cima, baixo, independentes). Um alcance medido por direção não serve
  para nada se o mapeamento o comprimir de volta num raio único.

  Requisitos do assistente: rápido (é a primeira coisa entre o usuário e o jogo —
  alvo de menos de meio minuto), pulável com valores padrão para quem só quer
  jogar, refazível a qualquer momento, e com resultado lembrado no dispositivo para
  que a segunda sessão não repita o ritual. Valor medido absurdo (alcance perto de
  zero, ou o usuário não se moveu) deve ser rejeitado com nova tentativa, nunca
  aceito silenciosamente — um alcance degenerado trava a mira.

- **Precisão do apontamento (revisão humana — o eixo horizontal é o problema)**:
  o teste real mostrou que apontar funciona, mas ainda "dá trabalho". Diagnóstico:
  os dois eixos **não têm a mesma qualidade de sinal**, e tratá-los igual é o erro.
  A elevação da ponta vem essencialmente de acelerômetro + giroscópio, sinal
  estável; a direção horizontal depende do **magnetômetro**, sensível a
  interferência (mesa metálica, PC, monitor, fonte) e a deriva ao longo da sessão.
  Daí o pedido do usuário: **mexer em todos os eixos com a mesma precisão**.

  Quatro frentes, todas exigidas:

  1. **Zona morta e sensibilidade por eixo, não uma zona morta radial única.** Com
     um raio único, ou o eixo horizontal treme, ou o vertical fica grudento perto do
     centro — não existe valor que sirva para os dois. Cada eixo passa a ter seus
     próprios parâmetros, com valores justificados pela diferença de ruído acima.

  2. **Suavização adaptativa no lugar do filtro de fator fixo.** Um fator único
     obriga a escolher entre mira estável parada e resposta rápida em movimento; hoje
     essas duas metas brigam. A suavização deve ser **função da velocidade do
     movimento**: filtra forte quando o aparelho está quase imóvel (mata o tremor) e
     praticamente desliga durante um gesto rápido (preserva a resposta). É o que
     permite atender tremor e resposta ao mesmo tempo em vez de negociar entre eles.
     O corte de um Fruit Ninja é o caso de teste: precisa acompanhar o gesto sem
     borrar, e a mira precisa ficar quieta quando a mão para.

  3. **Fonte de sensor de maior qualidade quando o navegador oferecer.** O evento de
     orientação clássico é limitado e sofre economia de bateria do navegador,
     entregando menos amostras (e mais irregulares) do que o sensor é capaz. Quando a
     API de sensores moderna estiver disponível, usá-la e **pedir a frequência
     explicitamente**, em vez de aceitar o que o navegador der.

  4. **Fusão de sensores própria, para atacar a deriva horizontal na raiz.** Ler
     giroscópio, acelerômetro e magnetômetro **crus** e fazer a fusão no cliente,
     com **rejeição de leitura magnética** quando o campo medido fugir do esperado
     (assinatura de interferência): nesse intervalo a direção horizontal segue só
     pelo giroscópio, em vez de ser puxada por uma bússola mentindo. É a única
     frente que ataca a causa da deriva; as outras três tratam sintoma.

  **Como isso precisa ser desenhado.** As quatro fontes de orientação possíveis
  (fusão própria sobre sensores crus → API de sensores moderna → evento de
  orientação clássico) formam uma **escada de degradação explícita**: o cliente usa a
  melhor disponível, informa na tela qual está em uso, e continua jogável na pior
  delas. Nenhuma delas pode ser condição para o produto funcionar — um aparelho sem
  magnetômetro ainda joga. Cada frente precisa ser **verificável e desligável
  isoladamente**: sem isso, uma regressão de precisão vira caça ao fantasma entre
  quatro mudanças simultâneas, e é justamente a precisão que estamos tentando medir.

  **O que continua proibido:** nada disso justifica app nativo, npm, framework ou
  etapa de build — a fusão e os filtros são JavaScript puro servido como arquivo
  estático, como todo o resto do cliente. E nada disso pode reintroduzir mira por
  velocidade: por mais filtro e fusão que existam no caminho, a mesma orientação
  física continua tendo que produzir a mesma posição de mira.

- **Botões touch com visual de Wii Remote**: a tela do celular, na vertical, é
  desenhada como o corpo de um controle — a interface **parece um controle**, não
  uma página com botões. Layout em coluna, inspirado no Wii Remote e pensado para o
  polegar de uma mão:

  - **D-pad** na parte de cima (onde o polegar alcança com o aparelho em pé);
  - **botão A** grande e central, o botão principal — no Wii Remote ele domina o
    corpo do controle, e aqui também deve dominar;
  - **B, X, Y** menores, próximos do A;
  - **START/BACK** discretos no meio do corpo (como −/+/HOME no Wii Remote);
  - **L e R** na parte de baixo da tela;
  - no **topo da tela, acima de tudo, a representação visual do "sensor
    infravermelho"** — um elemento decorativo (a "ponta" do controle) que ancora a
    metáfora de apontamento e indica o estado da mira/conexão.

  O mapeamento para os botões XInput não muda: continuam sendo A, B, X, Y, D-pad,
  LB, RB, START e BACK — o que muda é a disposição e a aparência. Continua exigido:
  múltiplos toques simultâneos (ex.: segurar L enquanto aperta A e aponta) e retorno
  visual imediato em cada botão.

- **Emulação de gamepad no PC**: os inputs recebidos são traduzidos em um controle
  virtual reconhecido pelo sistema operacional como um gamepad padrão, de modo que
  qualquer jogo funcione sem configuração adicional nem mapeamento manual.

- **Feedback tátil (rumble)**: quando o jogo envia vibração para o controle virtual,
  o servidor repassa o comando ao celular, que aciona o motor de vibração com
  intensidade/duração proporcionais. É o retorno que fecha o ciclo e faz o aparelho
  "parecer" um controle de verdade.

- **Ciclo de vida da conexão**: ao perder conexão, todos os botões e eixos são
  liberados imediatamente no controle virtual (para o personagem não ficar
  "correndo sozinho"). A interface do celular avisa o estado e permite reconectar.

- **Jogo de demonstração: Duck Shooting**: um jogo de caça aos patos incluído no
  projeto, rodando na tela do PC. Existe por três motivos, nesta ordem de
  importância:

  1. **Prova que a cadeia inteira funciona.** Sem um jogo próprio, testar o controle
     depende de instalar um jogo de terceiros e torcer para ele reconhecer o gamepad.
  2. **É o pior caso de latência.** Mira por apontamento expõe atraso de forma
     imediata e óbvia — se o Duck Shooting parece bom, qualquer outro jogo parece bom.
  3. **É a demonstração.** Alguém pega o celular, aponta para a tela, atira e entende
     o projeto em cinco segundos.

  Regras do jogo (referência clara: o Duck Hunt do NES, que era exatamente um jogo de
  apontar):
  - Patos surgem da vegetação na base da tela, cada um com trajetória e velocidade
    próprias, e escapam pelo topo se não forem abatidos a tempo.
  - A inclinação do celular move uma mira na tela. Um botão dispara. O disparo é um
    evento pontual — não existe "segurar para atirar".
  - Munição limitada por rodada (três tiros, como no original), forçando pontaria em
    vez de metralhar a tela. Recarga automática ao fim da rodada.
  - Rodadas de dificuldade crescente: mais patos simultâneos, mais rápidos, trajetórias
    menos previsíveis. Critério mínimo de acertos para avançar de rodada.
  - Pontuação acumulada, com bônus por acertos consecutivos, e recorde salvo localmente.
  - **Vibração como parte da mecânica**: o celular vibra ao disparar (coice) e com
    padrão distinto ao acertar um pato. Isso valida o caminho de rumble de ponta a
    ponta, que é a feature mais fácil de quebrar sem ninguém perceber.
  - Feedback sonoro para tiro, acerto e pato escapando.
  - Fluxo de entrada que guia o usuário pela calibração antes da primeira rodada —
    jogar com o centro descalibrado é a primeira frustração previsível.

  **Restrição arquitetural importante**: o jogo deve consumir o **gamepad virtual**,
  como qualquer jogo de terceiros faria — e não escutar o WebSocket diretamente. Ler
  o input direto do socket daria menos latência, mas testaria um caminho que nenhum
  jogo real usa, escondendo justamente os problemas que o projeto precisa descobrir.
  Se a spec quiser um modo de leitura direta, que seja um modo secundário e explícito,
  usado só para medir quanto da latência total vem da camada de emulação.

- **Segundo jogo: Fruit Ninja**: um jogo de cortar frutas arremessadas, rodando na
  tela do PC como o Duck Shooting e sujeito às mesmas restrições arquiteturais (lê o
  gamepad virtual, nunca o WebSocket; lógica pura separada do desenho; sem engine e
  sem build).

  **Por que este jogo, e não outro.** Ele existe para ser o segundo banco de prova do
  apontamento, estressando-o de um jeito que o Duck Shooting não alcança:

  1. **Corte é gesto contínuo, tiro é evento pontual.** No Duck Shooting a mira só
     precisa estar no lugar certo no instante do disparo. Aqui o caminho percorrido
     pela mira *é* a jogada — o rastro do corte. Isso expõe atraso, tremor e
     descontinuidade de forma muito mais implacável.
  2. **É o teste honesto do modelo de apontamento.** Se apontar funciona de verdade,
     cortar uma fruta atravessando a tela é natural. Se a mira for por velocidade,
     cortar é impossível — e a diferença é óbvia em segundos, sem instrumentação.
  3. **Valida o controle sob movimento rápido**, enquanto o Duck Shooting valida sob
     posicionamento fino. Juntos cobrem os dois regimes de uso.

  Mecânica pretendida:
  - Frutas são arremessadas de baixo para cima com trajetórias variadas; caem se não
    cortadas.
  - O corte acontece quando a mira atravessa a fruta **em movimento** — a velocidade
    da mira faz parte do critério, não só a posição. Encostar parado não corta.
  - Um rastro visível acompanha a mira, mostrando o traço do corte; é também o
    feedback que revela a qualidade do apontamento.
  - Bombas entre as frutas: cortar uma penalisa (perda de vida ou fim de partida).
  - Cortar várias frutas num mesmo traço vale bônus — recompensa o gesto contínuo,
    que é exatamente o que se quer testar.
  - Vidas perdidas ao deixar frutas caírem; dificuldade crescente em quantidade e
    velocidade de arremesso.
  - Vibração ao cortar e ao errar, distinguíveis entre si.
  - Áudio sintetizado, sem arquivos externos, como no Duck Shooting.

  Sem persistência de recorde entre sessões (mesma regra do Duck Shooting) e sem arte
  original — formas geométricas e cores bastam para o propósito.

- **Instrumentação de latência**: um indicador opcional, ativável durante o jogo, que
  mostra a latência medida e a taxa de atualização em tempo real. Sem isso, os KPIs
  abaixo são chute — e "parece meio travado" não é um relatório de bug útil.

### Segunda onda (fora do MVP, mas o desenho deve comportar)

- **Analógico esquerdo virtual**: joystick touch na tela para movimentação, coexistindo
  com a inclinação no analógico direito.

- **Gatilhos analógicos (LT/RT)**: controle contínuo de 0 a 100%, não apenas
  ligado/desligado — importante para jogos de corrida.

- **Perfis de mapeamento**: conjuntos salvos de mapeamento botão→ação e de parâmetros
  de inclinação (sensibilidade, zona morta, qual analógico recebe o tilt), trocáveis
  por jogo.

- **Múltiplos controles**: mais de um celular conectado ao mesmo PC, cada um virando
  um gamepad virtual independente, para jogos locais de 2+ jogadores.

- **Modo fallback teclado/mouse**: para sistemas onde a emulação de gamepad virtual
  não está disponível, traduzir os inputs em teclas e movimento de mouse.

- **Duck Shooting cooperativo/competitivo**: dois celulares, duas miras na mesma tela,
  disputando os mesmos patos. Depende da feature de múltiplos controles.

- **Segundo jogo de demonstração**: um jogo de corrida ou de labirinto por inclinação,
  que exercita a inclinação como eixo *contínuo* (direção), enquanto o Duck Shooting
  a exercita como *apontamento*. São regimes de uso diferentes e revelam problemas
  diferentes (deriva do centro incomoda muito mais em corrida).

### Explicitamente fora de escopo

- Streaming de vídeo do jogo para o celular (isso é Steam Link / Moonlight, não este
  projeto — o celular é só o controle, a tela continua sendo o monitor do PC).
- Jogo de demonstração com arte original, trilha sonora, campanha ou progressão
  persistente. O Duck Shooting é um veículo de teste e demonstração, não um produto —
  arte placeholder e formas simples são suficientes.
- Funcionamento pela internet / fora da rede local.
- Aplicativo nativo Android publicado em loja.
- Suporte a consoles reais (Switch, PlayStation, Xbox).

## KPIs

Latência é a métrica que decide se o projeto é usável ou um brinquedo. As demais
são secundárias.

- **Latência fim-a-fim** (toque ou inclinação no celular → estado atualizado no gamepad
  virtual): alvo p95 abaixo de 30 ms na mesma rede Wi-Fi. Acima de ~50 ms o controle
  já "parece atrasado" em jogos de ação.
- **Taxa de atualização da inclinação**: no mínimo 50 amostras por segundo entregues ao
  servidor, sem engasgos perceptíveis.
- **Jitter**: variação da latência deve ser baixa — uma latência estável de 40 ms
  incomoda menos que uma oscilando entre 10 e 60 ms.
- **Deriva do giroscópio**: quanto o centro "escorrega" ao longo de uma sessão de 15
  minutos sem recalibrar. Quanto menor, menos o usuário precisa apertar "calibrar".
  Com a fusão própria e a rejeição de leitura magnética, este número tem que
  **melhorar em relação à versão anterior** — é o critério de aceite da frente 4, e
  a comparação entre as duas fontes de orientação precisa ser medida, não intuída.
- **Simetria de precisão entre os eixos**: o eixo horizontal e o vertical devem ter
  qualidade de mira comparável — tremor parado e erro de acerto na mesma ordem de
  grandeza. Hoje o horizontal é visivelmente pior, e essa diferença é o alvo
  principal desta revisão; um número bom "na média dos dois eixos" que esconda um
  eixo ruim não conta como sucesso.
- **Ganho da calibração guiada**: alcançar as bordas e os cantos da tela deve ser
  confortável para jogadores com alcances de pulso diferentes, sem que ninguém
  precise mexer em constante de configuração. Verificado com pelo menos duas
  pessoas de alcance diferente, e comparado contra os valores padrão.
- **Custo de entrada da calibração**: o assistente inicial completo (centro + quatro
  direções) tem que caber em menos de meio minuto. Calibração boa que ninguém tem
  paciência de completar não melhora precisão nenhuma.
- **Tempo de setup**: do servidor iniciado até estar jogando, em uma reconexão. Alvo:
  abaixo de 15 segundos.
- **Estabilidade de sessão**: minutos de uso contínuo sem queda de conexão ou input
  travado.
- **Consumo de bateria do celular**: percentual gasto por hora de uso (tela ligada +
  giroscópio + Wi-Fi + vibração é uma combinação cara).

Medidos através do jogo de demonstração, que serve como banco de testes:

- **Taxa de acerto no Duck Shooting**: com alvos de tamanho e velocidade fixos, a
  precisão do jogador é um indicador indireto e honesto da qualidade do controle.
  Serve para comparar versões: se uma mudança de suavização derrubar a taxa de acerto,
  a mudança foi ruim, independentemente do que os números de latência disserem.
- **Estabilidade da mira parada**: quanto a mira treme com o celular imóvel. Mede o
  ruído do sensor e a eficácia da suavização. Alvo: tremor imperceptível a olho nu no
  tamanho de alvo do jogo.
- **Taxa de quadros do jogo**: 60 fps estáveis. Um jogo engasgando mascara e é
  confundido com latência de input, contaminando toda a medição.

## Arquitetura / restrições

### Topologia

```
Celular (navegador, HTML/JS)
      │  WebSocket sobre Wi-Fi local
      ▼
Servidor no PC (Python)
      │
      ▼
Driver de gamepad virtual
      │
      ├──────────────► Jogo de terceiros (enxerga um controle comum)
      │
      └──────────────► Duck Shooting (navegador do PC, via Gamepad API)
                              │
                              └── rumble ──► servidor ──► celular vibra
```

O servidor acumula dois papéis: servidor HTTP estático (entrega a página do controle
para o celular e a página do jogo para o PC) e servidor WebSocket (canal de input em
tempo real).

Os dois consumidores do gamepad virtual são simétricos: o Duck Shooting não tem
nenhum privilégio de acesso que um jogo de terceiros não teria. Essa simetria é o que
faz o jogo servir como teste de aceitação do projeto.

### Restrições técnicas conhecidas

- **Cliente sem build step**: HTML, CSS e JavaScript puros, servidos como arquivos
  estáticos. Sem framework de frontend, sem npm, sem transpilação. O objetivo é que
  abrir a URL no navegador do celular seja tudo.

- **Contexto seguro para os sensores**: navegadores baseados em Chromium no Android só
  liberam as APIs de orientação/movimento em contexto seguro (HTTPS ou localhost).
  Servir a página por HTTP simples em IP de rede local tende a **bloquear a leitura do
  giroscópio** — que é o coração do projeto. A spec precisa decidir e documentar a
  estratégia (certificado autoassinado com aceite manual, túnel local, ou outra), e
  a interface precisa detectar e comunicar claramente quando o sensor estiver
  indisponível, em vez de falhar silenciosamente.

- **Emulação de gamepad é dependente de plataforma**: a biblioteca escolhida deve ser
  isolada atrás de uma camada de abstração, porque a solução disponível varia entre
  Windows (driver de gamepad virtual instalado à parte) e Linux (subsistema de input
  do kernel). O restante do código não deve saber qual está em uso.

- **Protocolo de mensagens**: JSON sobre WebSocket é aceitável para o MVP pela clareza,
  mas o formato deve ser enxuto (mensagens de inclinação são as mais frequentes). Se
  os KPIs de latência não forem atingidos, a spec deve prever um formato binário
  compacto como alternativa.

- **Amostragem do giroscópio**: o evento de orientação do navegador dispara mais rápido
  do que é útil transmitir. Definir uma taxa de envio (throttle) e, se necessário,
  suavização, equilibrando responsividade contra tráfego de rede.

- **Disponibilidade das fontes de sensor é irregular**: a API de sensores moderna e o
  acesso aos sensores crus (giroscópio/acelerômetro/magnetômetro separados) dependem
  de contexto seguro, de permissão e de o aparelho ter o sensor — um celular sem
  magnetômetro é caso real, não hipótese. A escada de degradação precisa ser
  **detectada em tempo de execução**, não presumida pelo nome do navegador, e a fonte
  em uso precisa estar visível na tela: quando a precisão variar entre dois aparelhos,
  a primeira pergunta será "qual fonte cada um está usando?" e ela tem que ter
  resposta sem depurar.

- **Onde mora o processamento de orientação**: a fusão de sensores acontece
  necessariamente no cliente (é lá que estão os sensores crus, e enviar três sensores
  crus a 60 Hz multiplicaria o tráfego da mensagem mais frequente do protocolo). Já a
  calibração, os filtros e a conversão para posição apontada moram no servidor hoje —
  a spec precisa decidir explicitamente o que muda de lado, e assumir a consequência:
  o que for para o cliente sai do alcance da suíte de testes do servidor e precisa de
  cobertura equivalente do lado JS.

- **Rede local apenas**: o servidor escuta na rede local, sem autenticação além do
  fato de estar na mesma rede. Isso é uma decisão consciente de escopo doméstico —
  se a spec quiser, pode prever um código de pareamento simples.

- **Dispositivo alvo de referência**: Samsung Galaxy A57 (Android, navegador Chromium),
  com giroscópio, acelerômetro e motor de vibração. Outros aparelhos Android devem
  funcionar, mas o A57 é o que define o baseline de testes.

- **Jogo de demonstração sem engine e sem build**: mesma regra do cliente do controle —
  HTML, Canvas 2D e JavaScript puros. Sem Unity, Godot, Phaser ou qualquer engine.
  O jogo tem que ser leve o bastante para não competir por recursos com a medição de
  latência que ele mesmo existe para fazer.

- **Rumble a partir do jogo em navegador**: o suporte a vibração de gamepad pela API do
  navegador é irregular entre versões. Se o caminho padrão não funcionar de forma
  confiável, o jogo pode sinalizar o rumble ao servidor por um canal próprio — mas isso
  precisa ser uma exceção documentada e isolada, não o desenho principal, sob pena de
  o jogo deixar de representar um jogo real.

- **Servidor**: Python 3.11 ou superior.