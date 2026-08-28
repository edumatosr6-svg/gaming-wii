// Leitura do gamepad virtual EXCLUSIVAMENTE pela Gamepad API (F10.1).
// É proibido abrir WebSocket para input — o jogo se comporta como um jogo
// de terceiros qualquer.

const AXIS_RIGHT_X = 2;
const AXIS_RIGHT_Y = 3;
const BUTTON_A = 0;

let previousAPressed = false;

// Normalização da convenção de sinal da Gamepad API (F10.10) — o ÚNICO lugar
// que converte. O standard mapping usa, no eixo Y, a convenção OPOSTA à
// interna/XInput: `axes[3] = -1` significa stick para CIMA, enquanto a
// convenção interna (F4) usa y positivo = cima. Função pura e testável:
// amostra crua da API → eixo interno (x positivo = direita, y positivo = cima).
// Todo o resto do jogo opera sobre o valor já normalizado.
export function normalizeGamepadAxes(rawX, rawY) {
  return { x: rawX, y: -rawY };
}

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

// Amostra o input do quadro: eixos do analógico direito JÁ NORMALIZADOS para
// a convenção interna (x positivo = direita, y positivo = cima — F10.10) e
// borda de disparo. `firePressed` só é true na TRANSIÇÃO de soltar→apertar
// (sem auto-fire).
export function sampleInput() {
  const pad = findGamepad();
  if (pad === null) {
    previousAPressed = false;
    return { connected: false, axisX: 0, axisY: 0, firePressed: false, gamepad: null };
  }
  const aPressed = pad.buttons.length > BUTTON_A && pad.buttons[BUTTON_A].pressed;
  const firePressed = aPressed && !previousAPressed;
  previousAPressed = aPressed;
  const rawX = pad.axes.length > AXIS_RIGHT_X ? pad.axes[AXIS_RIGHT_X] : 0;
  const rawY = pad.axes.length > AXIS_RIGHT_Y ? pad.axes[AXIS_RIGHT_Y] : 0;
  const normalized = normalizeGamepadAxes(rawX, rawY);
  return {
    connected: true,
    axisX: normalized.x,
    axisY: normalized.y,
    firePressed,
    gamepad: pad,
  };
}
