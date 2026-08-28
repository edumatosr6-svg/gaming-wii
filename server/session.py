"""Estado explícito da sessão do controle (sem estado global mutável).

``SessionState`` é criado por conexão WebSocket e passado por parâmetro para
os handlers — invariante das coding directives. A invariante da spec (F9):
``connected == False`` ⇒ gamepad virtual zerado.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from server import config, mapping
from server.mapping import AdaptiveSmoother
from server.metrics import MetricsWindow
from server.protocol import Button, Calibrate, Motion, Status


class _AxisSink(Protocol):
    """Subconjunto da interface do gamepad usado pela sessão."""

    def set_button(self, button_id: str, pressed: bool) -> None: ...

    def set_axis(self, axis: str, x: float, y: float) -> None: ...

    def reset(self) -> None: ...


@dataclass(frozen=True)
class CalibrationOutcome:
    """Resultado da aplicação de um perfil de calibração (F12/KPI-14)."""

    accepted: bool
    reason: str | None
    ranges: dict[str, float]
    has_center: bool


class SessionState:
    """Estado de uma sessão de controle: calibração, botões, latência."""

    def __init__(
        self,
        gamepad: _AxisSink,
        metrics: MetricsWindow,
        websocket: object | None = None,
        smoothing_alpha: float = config.SMOOTHING_ALPHA,
        target_axis: str = config.TILT_TARGET_AXIS,
        adaptive_smoothing: bool = config.ADAPTIVE_SMOOTHING_ENABLED,
    ) -> None:
        self.session_id: str = uuid.uuid4().hex
        self.websocket = websocket  # canal de saída da sessão (data model da spec)
        # Orientação de calibração (alpha0, beta0, gamma0) — F5: o zero padrão
        # (offset nulo) vale até a primeira calibração; alpha0 pode ser None
        # quando o sensor não reporta yaw (degradação documentada, M8b).
        self.calibration_offset: tuple[float | None, float, float] = (0.0, 0.0, 0.0)
        # Alcances por direção (F12). Sem perfil recebido, as quatro direções
        # valem DEFAULT_RANGE_DEG — equivale a pular o assistente (F12.5).
        self.ranges: dict[str, float] = mapping.resolve_ranges(None)
        self.last_motion: tuple[float | None, float, float, float] | None = None
        self.button_state: dict[str, bool] = {}
        self.connected: bool = True
        self.metrics = metrics
        # Últimos valores recebidos por `status` (F13.6): o degrau em uso e a
        # rejeição magnética aparecem em GET /metrics — sem eles, comparar
        # precisão entre dois aparelhos vira depuração.
        self.source: str | None = None
        self.mag_rejected: bool = False
        # Diagnóstico observável do filtro (F4): fator efetivo e velocidade
        # estimada da última amostra. Não trafegam no protocolo.
        self.last_smoothing: mapping.SmoothingResult | None = None
        self._gamepad = gamepad
        self._smoother = AdaptiveSmoother(smoothing_alpha, adaptive=adaptive_smoothing)
        self._target_axis = target_axis

    def handle_motion(self, msg: Motion, arrival_ms: float | None = None) -> None:
        """Caminho crítico: amostra `motion` → posição apontada no gamepad (F4)."""
        self.last_motion = (msg.a, msg.b, msg.g, msg.t)
        angles = mapping.pointing_angles(msg.a, msg.b, msg.g, offset=self.calibration_offset)
        axes = mapping.pointing_to_axes(
            msg.a,
            msg.b,
            msg.g,
            offset=self.calibration_offset,
            ranges=self.ranges,
        )
        # A velocidade do filtro adaptativo é estimada sobre o sinal ANGULAR
        # (os limiares são em °/s), não sobre o valor já normalizado.
        result = self._smoother.apply(axes, angles_deg=angles, t_ms=msg.t, arrival_ms=arrival_ms)
        self.last_smoothing = result
        self._gamepad.set_axis(self._target_axis, result.axes[0], result.axes[1])

    def handle_button(self, msg: Button) -> None:
        """Aplica transição de botão no gamepad virtual (F6)."""
        self.button_state[msg.id] = msg.down
        self._gamepad.set_button(msg.id, msg.down)

    def handle_status(self, msg: Status) -> None:
        """Registra o degrau de fonte em uso e a rejeição magnética (F13/F14)."""
        self.source = msg.source
        self.mag_rejected = msg.mag_rejected
        self.metrics.record_source(msg.source, msg.mag_rejected)

    def handle_calibrate(self, msg: Calibrate) -> CalibrationOutcome:
        """Aplica o perfil de calibração e devolve o resultado (F5/F12).

        Regras:

        - ``center`` presente ⇒ vira o novo zero (média da janela capturada no
          cliente). ``center`` ausente e ``ranges`` ausente ⇒ caminho degradado
          da F5.3: zera na última amostra `motion` recebida, ou no zero padrão
          se nenhuma tiver chegado.
        - ``ranges`` presente ⇒ o servidor é a AUTORIDADE da validação: perfil
          fora de ``RANGE_MIN_DEG``–``RANGE_MAX_DEG`` (ou incompleto) é
          rejeitado com motivo e o perfil ANTERIOR é mantido — nunca aceito em
          silêncio (KPI-14).
        - Os dois campos são independentes: reenviar só ``ranges`` numa
          reconexão é válido (P3.4).
        - Perfil recebido SUBSTITUI o anterior por inteiro, sem mistura (M16b).

        Em qualquer caminho aceito o estado do filtro é descartado, para que a
        primeira amostra na nova posição neutra não arraste a posição anterior
        (invariante de ``SessionState``, M16c).
        """
        reason: str | None = None
        accepted = True

        if msg.ranges is not None:
            if mapping.is_valid_range_profile(msg.ranges):
                self.ranges = mapping.resolve_ranges(msg.ranges)
            else:
                accepted = False
                reason = (
                    "perfil de alcances inválido: as quatro direções precisam estar "
                    f"entre {config.RANGE_MIN_DEG:g}° e {config.RANGE_MAX_DEG:g}°"
                )

        if accepted:
            if msg.center is not None:
                self.calibration_offset = msg.center
            elif msg.ranges is None:
                # Caminho degradado (F5.3): sem payload nenhum.
                if self.last_motion is not None:
                    a0, b0, g0, _t = self.last_motion
                    self.calibration_offset = (a0, b0, g0)
                else:
                    self.calibration_offset = (0.0, 0.0, 0.0)
            self._smoother.reset()

        return CalibrationOutcome(
            accepted=accepted,
            reason=reason,
            ranges=dict(self.ranges),
            has_center=self.calibration_offset != (0.0, 0.0, 0.0),
        )

    def disconnect(self) -> None:
        """Marca a sessão encerrada e zera o gamepad atomicamente (F9.1)."""
        self.connected = False
        self.button_state.clear()
        self._smoother.reset()
        self._gamepad.reset()
