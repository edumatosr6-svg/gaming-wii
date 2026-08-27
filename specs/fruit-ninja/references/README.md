# fruit-ninja — Referências

APIs do navegador que o jogo usa. As restrições descritas aqui não são detalhe de
implementação: elas determinam o que é possível.

## Entrada — a única fonte de input permitida

- **Gamepad API** — leitura do gamepad virtual criado pelo `wii-controller`. É o único
  canal de input do jogo; ler o WebSocket do controle é proibido pelas restrições
  arquiteturais.
  https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
- **Mapeamento padrão do Gamepad API** — nomenclatura de botões e eixos. O controle
  emulado é XInput (Xbox 360), então o analógico direito são os eixos de índice 2 e 3.
  https://w3c.github.io/gamepad/#remapping
- **Nota sobre amostragem**: a Gamepad API é *polling*, não eventos — o estado precisa
  ser lido a cada quadro dentro do game loop. Isso limita a resolução temporal do
  rastro da lâmina à taxa de quadros, o que é relevante para o KPI de continuidade do
  rastro.

## Renderização e tempo

- **Canvas 2D** — todo o desenho do jogo.
  https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **requestAnimationFrame** — base do game loop.
  https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- **Fix Your Timestep** — padrão de passo de tempo fixo, exigido pela restrição de
  física independente da taxa de quadros.
  https://gafferongames.com/post/fix_your_timestep/

## Áudio e feedback tátil

- **Web Audio API** — síntese dos sons de corte, bomba e fruta perdida, sem arquivos
  externos.
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **GamepadHapticActuator** — vibração pelo gamepad. O suporte é irregular entre
  navegadores; o fallback já existente no wii-controller é a alternativa documentada.
  https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator

## Geometria do corte

- **Intersecção segmento–círculo** — o corte é a intersecção entre o segmento
  percorrido pela lâmina entre dois quadros e o círculo da fruta. Testar apenas a
  posição do quadro atual falha com movimento rápido, que é justamente o caso de uso
  principal deste jogo (*tunneling*).
  https://en.wikipedia.org/wiki/Line%E2%80%93sphere_intersection

## Referência de design

Fruit Ninja (Halfbrick Studios) é a referência de mecânica. Nenhum asset, arte, som ou
código do jogo original é reutilizado — apenas a ideia de cortar frutas arremessadas
com um traço, que é o que interessa para avaliar o apontamento.
