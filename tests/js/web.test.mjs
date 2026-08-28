// Testes W1–W3 (specs/wii-controller/tests/client-controller.md) — lógica
// pura de web/js/ rodando no runner nativo do Node (sem npm).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMotionThrottle, buildMotionMessage } from '../../web/js/motion.js';
import { createButtonTracker, buildButtonMessage, BUTTON_IDS } from '../../web/js/controls.js';
import { patternFor } from '../../web/js/haptics.js';
import { wsUrl } from '../../web/js/connection.js';

test('W1: throttle de motion mantém a taxa entre 50 e 70 Hz', () => {
  const throttle = createMotionThrottle(60);
  const emitted = [];
  // eventos a ~200 Hz (5 ms) por 2 s simulados
  for (let now = 0; now <= 2000; now += 5) {
    const out = throttle.push(buildMotionMessage(0, 1, 2, now), now);
    if (out !== null) {
      emitted.push(now);
    }
  }
  const rate = (emitted.length - 1) / ((emitted[emitted.length - 1] - emitted[0]) / 1000);
  assert.ok(rate >= 50 && rate <= 70, `taxa fora da faixa: ${rate.toFixed(1)} Hz`);
  // nenhuma amostra retida por mais de um período (~16.7 ms): o intervalo
  // entre emissões nunca passa de 2 períodos com entrada contínua
  for (let i = 1; i < emitted.length; i += 1) {
    assert.ok(emitted[i] - emitted[i - 1] <= 2 * (1000 / 60));
  }
});

test('W2: exatamente um down e um up por pressão', () => {
  const tracker = createButtonTracker();
  const events = [];
  events.push(...tracker.touchStart(1, 'a'));
  events.push(...tracker.touchMove(1, 'a')); // move dentro do botão: nada
  events.push(...tracker.touchMove(1, 'a'));
  events.push(...tracker.touchEnd(1));
  assert.deepEqual(events, [buildButtonMessage('a', true), buildButtonMessage('a', false)]);
});

test('W2: deslizar para fora do botão gera up (F6.3)', () => {
  const tracker = createButtonTracker();
  const down = tracker.touchStart(1, 'b');
  const out = tracker.touchMove(1, null); // dedo saiu do botão sem soltar
  const end = tracker.touchEnd(1);
  assert.deepEqual(down, [buildButtonMessage('b', true)]);
  assert.deepEqual(out, [buildButtonMessage('b', false)]);
  assert.deepEqual(end, []); // nada repetido — botão não fica preso
});

test('W2: multi-touch mantém botões independentes (F6.1)', () => {
  const tracker = createButtonTracker();
  const first = tracker.touchStart(1, 'lb');
  const second = tracker.touchStart(2, 'a');
  assert.deepEqual(first, [buildButtonMessage('lb', true)]);
  assert.deepEqual(second, [buildButtonMessage('a', true)]);
  assert.ok(tracker.isPressed('lb') && tracker.isPressed('a'));
  assert.deepEqual(tracker.touchEnd(1), [buildButtonMessage('lb', false)]);
  assert.ok(tracker.isPressed('a'));
  assert.deepEqual(tracker.touchEnd(2), [buildButtonMessage('a', false)]);
});

test('W2: dois dedos no mesmo botão geram um down e um up no total', () => {
  const tracker = createButtonTracker();
  assert.deepEqual(tracker.touchStart(1, 'x'), [buildButtonMessage('x', true)]);
  assert.deepEqual(tracker.touchStart(2, 'x'), []); // já pressionado
  assert.deepEqual(tracker.touchEnd(1), []); // ainda há um dedo
  assert.deepEqual(tracker.touchEnd(2), [buildButtonMessage('x', false)]);
});

test('W3: formato das mensagens bate com o protocolo', () => {
  // Pegada vertical (F4): a mensagem carrega os TRES angulos, porque a
  // direcao da ponta so e derivavel com alpha, beta e gamma.
  const motion = buildMotionMessage(137, 12.5, -3, 1000);
  assert.deepEqual(Object.keys(motion).sort(), ['a', 'b', 'g', 't', 'type']);
  assert.equal(motion.type, 'motion');
  assert.equal(motion.a, 137);
  assert.equal(typeof motion.b, 'number');
  assert.equal(typeof motion.g, 'number');
  assert.equal(typeof motion.t, 'number');

  // `a: null` quando o sensor nao reporta yaw (contrato do protocolo, M8b).
  assert.equal(buildMotionMessage(null, 1, 2, 3).a, null);
  assert.equal(buildMotionMessage(undefined, 1, 2, 3).a, null);
  assert.equal(buildMotionMessage(NaN, 1, 2, 3).a, null);

  const button = buildButtonMessage('lb', false);
  assert.deepEqual(Object.keys(button).sort(), ['down', 'id', 'type']);
  assert.equal(button.type, 'button');
  assert.equal(typeof button.down, 'boolean');
  assert.ok(BUTTON_IDS.includes(button.id));
  assert.deepEqual(
    BUTTON_IDS.sort(),
    ['a', 'b', 'x', 'y', 'up', 'down', 'left', 'right', 'lb', 'rb', 'start', 'back'].sort()
  );
});

test('haptics: intensidade 0 cancela; padrão proporcional (F8.2)', () => {
  assert.deepEqual(patternFor(0, 500), []);
  assert.deepEqual(patternFor(1, 0), []);
  const full = patternFor(1, 300);
  assert.deepEqual(full, [300]);
  const half = patternFor(0.5, 120);
  const total = half.reduce((a, b) => a + b, 0);
  assert.ok(total >= 120 && total <= 160);
  // saturação de valores fora de faixa sem exceção
  assert.deepEqual(patternFor(5, 100), [100]);
  assert.deepEqual(patternFor(-1, 100), []);
});

test('conexão: URL wss derivada do endereço', () => {
  assert.equal(wsUrl('192.168.0.10', '8443'), 'wss://192.168.0.10:8443/ws');
});

// Pegada vertical (F4): o cliente envia a amostra CRUA e o servidor deriva a
// direcao da ponta. Um ajuste de eixo no cliente reintroduziria o mapeamento
// de paisagem — trocado/invertido na pegada vertical.
test('motion: cliente não reorienta os ângulos (mapeamento vive no servidor)', () => {
  const motion = buildMotionMessage(30, 40, 50, 1);
  assert.equal(motion.a, 30);
  assert.equal(motion.b, 40);
  assert.equal(motion.g, 50);
});
