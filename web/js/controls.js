// Botões touch com multi-touch (F6). Lógica pura exportada para testes (W2).

export const BUTTON_IDS = [
  'a',
  'b',
  'x',
  'y',
  'up',
  'down',
  'left',
  'right',
  'lb',
  'rb',
  'start',
  'back',
];

// Constrói a mensagem `button` do protocolo (somente em transições).
export function buildButtonMessage(id, down) {
  return { type: 'button', id, down };
}

// Rastreador puro de toques → transições de botão.
// Garante exatamente um `down` e um `up` por pressão (F6.4), inclusive
// quando o dedo desliza para fora do botão (F6.3) ou o toque é cancelado.
export function createButtonTracker() {
  const touchToButton = new Map(); // touchId -> buttonId
  const pressCount = new Map(); // buttonId -> número de toques segurando

  function press(buttonId) {
    const count = pressCount.get(buttonId) || 0;
    pressCount.set(buttonId, count + 1);
    return count === 0 ? [buildButtonMessage(buttonId, true)] : [];
  }

  function release(buttonId) {
    const count = pressCount.get(buttonId) || 0;
    if (count <= 0) {
      return [];
    }
    pressCount.set(buttonId, count - 1);
    return count === 1 ? [buildButtonMessage(buttonId, false)] : [];
  }

  return {
    // Toque começou sobre um botão.
    touchStart(touchId, buttonId) {
      if (touchToButton.has(touchId) || buttonId === null) {
        return [];
      }
      touchToButton.set(touchId, buttonId);
      return press(buttonId);
    },
    // Toque moveu; buttonId é o botão sob o dedo agora (ou null, fora).
    touchMove(touchId, buttonId) {
      const current = touchToButton.get(touchId);
      if (current === undefined || current === buttonId) {
        return [];
      }
      touchToButton.delete(touchId);
      const events = release(current);
      if (buttonId !== null) {
        touchToButton.set(touchId, buttonId);
        events.push(...press(buttonId));
      }
      return events;
    },
    // Toque terminou (touchend/touchcancel).
    touchEnd(touchId) {
      const current = touchToButton.get(touchId);
      if (current === undefined) {
        return [];
      }
      touchToButton.delete(touchId);
      return release(current);
    },
    // Estado atual (para feedback visual).
    isPressed(buttonId) {
      return (pressCount.get(buttonId) || 0) > 0;
    },
  };
}

// Janela em que um `click` é considerado sintetizado a partir do toque que
// acabou de ser tratado (o "ghost click" do Chromium Android).
const GHOST_CLICK_WINDOW_MS = 700;

// Registro padrão de um comando acionável da interface (calibrar, conectar,
// reconectar). O toque é o caminho PRIMÁRIO: o pipeline multi-touch chama
// preventDefault na área dos controles, o que suprime a sintetização de
// `click` — um comando ligado só a `click` funciona com mouse no desktop e é
// inerte no aparelho de referência (F2.9). `click` fica como caminho
// ADICIONAL para mouse/teclado, com guarda contra disparo duplo.
export function onActivate(element, handler, nowFn = () => Date.now()) {
  let lastTouchMs = Number.NEGATIVE_INFINITY;
  element.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      lastTouchMs = nowFn();
      handler(event);
    },
    { passive: false }
  );
  element.addEventListener('click', (event) => {
    if (nowFn() - lastTouchMs < GHOST_CLICK_WINDOW_MS) {
      return; // já tratado pelo toque
    }
    handler(event);
  });
}

// Liga o tracker aos eventos de toque reais (só no navegador).
export function wireTouchButtons(container, sendFn) {
  const tracker = createButtonTracker();

  function buttonOf(element) {
    const buttonElement =
      element && element.closest ? element.closest('[data-button]') : null;
    return buttonElement ? buttonElement.dataset.button : null;
  }

  function buttonAt(x, y) {
    return buttonOf(document.elementFromPoint(x, y));
  }

  // No início do toque, `touch.target` é a fonte confiável: as faixas fixas de
  // status e diagnóstico ficam sobre os botões e sequestrariam elementFromPoint.
  function buttonForStart(touch) {
    return buttonOf(touch.target) ?? buttonAt(touch.clientX, touch.clientY);
  }

  function refreshVisual() {
    for (const el of container.querySelectorAll('[data-button]')) {
      el.classList.toggle('pressed', tracker.isPressed(el.dataset.button));
    }
  }

  function dispatch(events) {
    for (const event of events) {
      sendFn(event);
    }
    if (events.length > 0) {
      refreshVisual();
    }
  }

  container.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        dispatch(tracker.touchStart(touch.identifier, buttonForStart(touch)));
      }
    },
    { passive: false }
  );
  container.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
      for (const touch of event.changedTouches) {
        dispatch(tracker.touchMove(touch.identifier, buttonAt(touch.clientX, touch.clientY)));
      }
    },
    { passive: false }
  );
  for (const type of ['touchend', 'touchcancel']) {
    container.addEventListener(
      type,
      (event) => {
        event.preventDefault();
        for (const touch of event.changedTouches) {
          dispatch(tracker.touchEnd(touch.identifier));
        }
      },
      { passive: false }
    );
  }
  return tracker;
}
