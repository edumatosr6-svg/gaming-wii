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
  paisagem, e impedir scroll, zoom e seleção de texto acidentais durante o jogo.

- **Pareamento por IP**: tela inicial onde o usuário informa o IP do PC. O último IP
  usado é lembrado no dispositivo para que reconexões futuras sejam de um toque só.

- **Controle por inclinação (o "modo Wii")**: leitura contínua do giroscópio /
  orientação do aparelho. A inclinação frente-trás e esquerda-direita é convertida
  em um eixo analógico de dois graus de liberdade (por padrão o analógico direito,
  usado para mira/direção). Deve ter zona morta configurável perto do centro,
  sensibilidade ajustável e saturação suave ao atingir o ângulo máximo.

- **Calibração de centro**: comando explícito que define a posição atual do aparelho
  como o "zero" da inclinação. Necessário porque a posição neutra muda conforme o
  usuário está sentado, deitado ou em pé. Deve poder ser reexecutado a qualquer
  momento sem reiniciar a sessão.

- **Botões touch**: A, B, X, Y, D-pad de 4 direções, botões de ombro L e R, e
  START/BACK. Precisa suportar múltiplos toques simultâneos (ex: segurar L enquanto
  aperta A e inclina o aparelho). Cada botão dá retorno visual imediato ao ser
  pressionado.

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