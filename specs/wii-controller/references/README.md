# wii-controller — Referências

Documentos e padrões externos que as specs precisam respeitar. O `spec-generator`
lê o que estiver nesta pasta.

## APIs de sensor do navegador (cliente)

Governam toda a feature de inclinação. As restrições de contexto seguro estão aqui,
não são detalhe de implementação — elas determinam se o projeto funciona.

- **DeviceOrientation Event** — leitura de inclinação (`alpha`, `beta`, `gamma`).
  https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent
- **DeviceMotion Event** — aceleração e taxa de rotação, alternativa/complemento.
  https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent
- **Contexto seguro (secure context)** — por que a página precisa ser HTTPS para os
  sensores funcionarem em Chromium no Android.
  https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- **Vibration API** — feedback tátil no celular.
  https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- **Touch Events** — multi-touch para botões simultâneos.
  https://developer.mozilla.org/en-US/docs/Web/API/Touch_events
- **Screen Orientation API** — travar em paisagem.
  https://developer.mozilla.org/en-US/docs/Web/API/Screen_Orientation_API
- **Fullscreen API** — esconder a barra do navegador durante o jogo.
  https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API

## Transporte

- **WebSocket API (cliente)**
  https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **RFC 6455 — The WebSocket Protocol** (referência do comportamento de ping/pong,
  fechamento e fragmentação, relevante para detecção de queda de conexão)
  https://datatracker.ietf.org/doc/html/rfc6455
- **`websockets` (Python)** — biblioteca do servidor.
  https://websockets.readthedocs.io/

## Gamepad virtual (servidor)

- **ViGEmBus** — driver de gamepad virtual no Windows. Pré-requisito de instalação
  para o usuário final; a spec precisa cobrir a detecção da ausência dele.
  https://github.com/nefarius/ViGEmBus
- **vgamepad** — binding Python para o ViGEmBus.
  https://github.com/yannbouteiller/vgamepad
- **uinput / evdev** — caminho equivalente no Linux, caso o fallback de plataforma
  entre em escopo.
  https://www.kernel.org/doc/html/latest/input/uinput.html

## Layout e semântica do controle alvo

O gamepad virtual emulado é do tipo Xbox 360 / XInput, porque é o que os jogos de PC
reconhecem sem configuração. O mapeamento de botões e a faixa de valores dos eixos e
gatilhos devem seguir este padrão.

- **XInput — getting started / estrutura de estado do gamepad**
  https://learn.microsoft.com/en-us/windows/win32/xinput/getting-started-with-xinput
- **Gamepad API — mapeamento padrão** (útil como referência de nomenclatura de
  botões e eixos, mesmo não sendo usada no cliente)
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API

## Jogo de demonstração (Duck Shooting)

- **Gamepad API — uso** (como o jogo lê o controle virtual; é a mesma API que qualquer
  jogo web usaria, o que é exatamente o ponto)
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- **GamepadHapticActuator** — rumble a partir do jogo. Verificar suporte real no
  navegador alvo antes de assumir que funciona.
  https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator
- **Canvas 2D API**
  https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial
- **requestAnimationFrame** — base do game loop.
  https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- **Web Audio API** — sons de tiro e acerto sintetizados, sem arquivos externos.
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **Fix Your Timestep!** — referência clássica sobre game loop com passo de tempo
  desacoplado da taxa de quadros.
  https://gafferongames.com/post/fix_your_timestep/

### Referência de mecânica

**Duck Hunt (Nintendo, NES, 1984)** é a referência de *mecânica* do jogo: patos que
sobem em trajetórias variadas, munição limitada por rodada, critério mínimo de acertos
para avançar. É referência de design, **não de conteúdo** — nenhum sprite, som ou nome
do jogo original deve ser reutilizado.

Vale notar a diferença técnica: o Duck Hunt original usava a Zapper, que detectava
para onde a pistola apontava lendo o brilho da tela CRT. Aqui o apontamento vem de
inclinação relativa a um centro calibrado, o que é um problema diferente — não existe
referência absoluta da posição da tela, e por isso a calibração é obrigatória e a
deriva do sensor importa.

## Prior art

Projetos que resolvem problema parecido — úteis para comparar decisões de protocolo,
latência e experiência de pareamento. **Não são para copiar código**, e sim para
justificar ou contrastar escolhas na spec.

- **Steam Link** — pareamento e latência em rede local (mas faz streaming de vídeo,
  que está fora do nosso escopo).
- **Moonlight** — cliente aberto de streaming com input remoto; referência de como
  tratam latência de input.
- **DS4Windows** — referência de como um controle não-nativo é apresentado ao jogo
  como XInput.

## Contexto de hardware

- Aparelho de referência: Samsung Galaxy A57 — Android, navegador Chromium,
  giroscópio, acelerômetro, motor de vibração, Wi-Fi.
- Rede: Wi-Fi doméstica, celular e PC no mesmo segmento de rede local.

---

> Se algum destes links tiver uma versão em PDF ou trecho específico que a spec deva
> seguir à risca, coloque o arquivo nesta pasta em vez de só linkar.