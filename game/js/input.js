// Leitura do gamepad virtual EXCLUSIVAMENTE pela Gamepad API (F10.1).
// É proibido abrir WebSocket para input — o jogo se comporta como um jogo
// de terceiros qualquer.

const AXIS_RIGHT_X = 2;
const AXIS_RIGHT_Y = 3;
const BUTTON_A = 0;

let previousAPressed = false;

// Devolve o primeiro gamepad conectado, ou null (tela "aguardando controle").
export function findGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad !== null && pad.connected) {
      return pad;
    }
  }
  return null;
}

// Amostra o input do quadro: eixos do analógico direito e borda de disparo.
// `firePressed` só é true na TRANSIÇÃO de soltar→apertar (sem auto-fire).
export function sampleInput() {
  const pad = findGamepad();
  if (pad === null) {
    previousAPressed = false;
    return { connected: false, axisX: 0, axisY: 0, firePressed: false, gamepad: null };
  }
  const aPressed = pad.buttons.length > BUTTON_A && pad.buttons[BUTTON_A].pressed;
  const firePressed = aPressed && !previousAPressed;
  previousAPressed = aPressed;
  return {
    connected: true,
    axisX: pad.axes.length > AXIS_RIGHT_X ? pad.axes[AXIS_RIGHT_X] : 0,
    axisY: pad.axes.length > AXIS_RIGHT_Y ? pad.axes[AXIS_RIGHT_Y] : 0,
    firePressed,
    gamepad: pad,
  };
}
