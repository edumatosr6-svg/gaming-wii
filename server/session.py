"""Estado explícito da sessão do controle (sem estado global mutável).

``SessionState`` é criado por conexão WebSocket e passado por parâmetro para
os handlers — invariante das coding directives. A invariante da spec (F9):
``connected == False`` ⇒ gamepad virtual zerado.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from server import config, mapping
from server.mapping import ExponentialSmoother
from server.metrics import MetricsWindow
from server.protocol import Button, Calibrate, Motion


class _AxisSink(Protocol):
    """Subconjunto da interface do gamepad usado pela sessão."""

    def set_button(self, button_id: str, pressed: bool) -> None: ...

    def set_axis(self, axis: str, x: float, y: float) -> None: ...

    def reset(self) -> None: ...


class SessionState:
    """Estado de uma sessão de controle: calibração, botões, latência."""

    def __init__(
        self,
        gamepad: _AxisSink,
        metrics: MetricsWindow,
        websocket: object | None = None,
        smoothing_alpha: float = config.SMOOTHING_ALPHA,
        target_axis: str = config.TILT_TARGET_AXIS,
    ) -> None:
        self.session_id: str = uuid.uuid4().hex
        self.websocket = websocket  # canal de saída da sessão (data model da spec)
        # Orientação de calibração (alpha0, beta0, gamma0) — F5: o zero padrão
        # (offset nulo) vale até a primeira calibração; alpha0 pode ser None
        # quando o sensor não reporta yaw (degradação documentada, M8b).
        self.calibration_offset: tuple[float | None, float, float] = (0.0, 0.0, 0.0)
        self.last_motion: tuple[float | None, float, float, float] | None = None
        self.button_state: dict[str, bool] = {}
        self.connected: bool = True
        self.metrics = metrics
        self._gamepad = gamepad
        self._smoother = ExponentialSmoother(smoothing_alpha)
        self._target_axis = target_axis

    def handle_motion(self, msg: Motion) -> None:
        """Caminho crítico: amostra `motion` → posição apontada no gamepad (F4)."""
        self.last_motion = (msg.a, msg.b, msg.g, msg.t)
        axes = mapping.pointing_to_axes(msg.a, msg.b, msg.g, offset=self.calibration_offset)
        smoothed = self._smoother.apply(axes)
        self._gamepad.set_axis(self._target_axis, smoothed[0], smoothed[1])

    def handle_button(self, msg: Button) -> None:
        """Aplica transição de botão no gamepad virtual (F6)."""
        self.button_state[msg.id] = msg.down
        self._gamepad.set_button(msg.id, msg.down)

    def handle_calibrate(self, _msg: Calibrate) -> None:
        """Registra a orientação mais recente como novo zero (F5).

        Sem amostra prévia, o offset é nulo (F5.3). Recalibrar substitui o
        offset anterior — sem acúmulo (F5.2, M15).
        """
        if self.last_motion is not None:
            a0, b0, g0, _t = self.last_motion
            self.calibration_offset = (a0, b0, g0)
        else:
            self.calibration_offset = (0.0, 0.0, 0.0)
        self._smoother.reset()

    def disconnect(self) -> None:
        """Marca a sessão encerrada e zera o gamepad atomicamente (F9.1)."""
        self.connected = False
        self.button_state.clear()
        self._smoother.reset()
        self._gamepad.reset()
