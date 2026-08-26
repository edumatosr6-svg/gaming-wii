"""Conversão de inclinação/botões → estado do gamepad (módulo puro, sem I/O).

Regras (F4): ordem de aplicação — (a) offset de calibração; (b) zona morta
radial; (c) curva de sensibilidade; (d) saturação suave (derivada contínua no
intervalo útil, saída exatamente ±1.0 a partir do ângulo máximo).

Nenhum import de I/O, rede ou driver. Todas as funções são determinísticas;
o único estado é o filtro de suavização, que é um objeto explícito.
"""

from __future__ import annotations

import math

from server import config


def _sanitize_angle(value: object) -> float | None:
    """Devolve o ângulo como float finito, ou None para entrada inválida."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        result = float(value)
        if math.isnan(result) or math.isinf(result):
            return None
        return result
    return None


def _shape(normalized: float, sensitivity: float) -> float:
    """Curva de sensibilidade + saturação suave sobre magnitude normalizada.

    ``normalized`` em [0, 1] (0 = borda da zona morta, 1 = ângulo máximo).
    Estritamente crescente em [0, 1), exatamente 1.0 em 1.0, derivada
    contínua (seno de quarto de ciclo — aproximação suave do teto).
    """
    clamped = min(1.0, max(0.0, normalized))
    if sensitivity <= 0:
        sensitivity = 1.0
    curved = clamped ** (1.0 / sensitivity)
    return math.sin(curved * math.pi / 2.0)


def tilt_to_axes(
    beta: object,
    gamma: object,
    offset: tuple[float, float] = (0.0, 0.0),
    dead_zone_deg: float = config.DEAD_ZONE_DEG,
    max_angle_deg: float = config.MAX_ANGLE_DEG,
    sensitivity: float = config.SENSITIVITY,
) -> tuple[float, float]:
    """Converte ângulos (graus) em par de eixos XInput em [-1.0, 1.0].

    ``beta`` alimenta o eixo Y e ``gamma`` o eixo X. Entradas inválidas
    (NaN, None, strings) produzem saída neutra (0.0, 0.0) — nunca exceção
    nem valor fora de [-1, 1] (M7, M8, critério F4.4).
    """
    b = _sanitize_angle(beta)
    g = _sanitize_angle(gamma)
    if b is None or g is None:
        return (0.0, 0.0)

    # (a) offset de calibração
    b -= offset[0]
    g -= offset[1]

    # (b) zona morta radial
    magnitude = math.hypot(b, g)
    if magnitude <= dead_zone_deg:
        return (0.0, 0.0)

    # (c)+(d) curva de sensibilidade e saturação suave sobre a magnitude
    usable = max_angle_deg - dead_zone_deg
    if usable <= 0:
        return (0.0, 0.0)
    normalized = (magnitude - dead_zone_deg) / usable
    scaled = _shape(normalized, sensitivity)

    # Projeta de volta na direção original, preservando simetria (M5)
    x = (g / magnitude) * scaled
    y = (b / magnitude) * scaled
    return (min(1.0, max(-1.0, x)), min(1.0, max(-1.0, y)))


class ExponentialSmoother:
    """Filtro de média exponencial com estado explícito (M9–M11).

    ``alpha`` em [0, 1): 0 desliga o filtro (passagem direta). Para um degrau
    de entrada, a saída converge monotonicamente sem overshoot.
    """

    def __init__(self, alpha: float = config.SMOOTHING_ALPHA) -> None:
        self._alpha = min(0.999, max(0.0, float(alpha)))
        self._state: tuple[float, float] | None = None

    def apply(self, axes: tuple[float, float]) -> tuple[float, float]:
        """Aplica o filtro à amostra e devolve o par suavizado."""
        if self._alpha == 0.0:
            return axes
        if self._state is None:
            self._state = axes
            return axes
        prev_x, prev_y = self._state
        x = self._alpha * prev_x + (1.0 - self._alpha) * axes[0]
        y = self._alpha * prev_y + (1.0 - self._alpha) * axes[1]
        self._state = (x, y)
        return (x, y)

    def reset(self) -> None:
        """Descarta o estado (usado na recalibração/reconexão)."""
        self._state = None


def combine_rumble(low: float, high: float) -> float:
    """Combina os dois motores XInput em uma intensidade única [0, 1] (F8).

    Fórmula: máximo dos dois motores, saturados individualmente. Monotônica
    em cada motor; (0,0)→0.0 e (1,1)→1.0 (M13).
    """
    safe_low = min(1.0, max(0.0, _sanitize_angle(low) or 0.0))
    safe_high = min(1.0, max(0.0, _sanitize_angle(high) or 0.0))
    return max(safe_low, safe_high)


def clamp_rumble(intensity: object, duration_ms: object) -> tuple[float, int]:
    """Satura intensidade para [0, 1] e duração para >= 0 sem exceção (M14)."""
    safe_intensity = _sanitize_angle(intensity)
    if safe_intensity is None:
        safe_intensity = 0.0
    safe_duration = _sanitize_angle(duration_ms)
    if safe_duration is None:
        safe_duration = 0.0
    return (min(1.0, max(0.0, safe_intensity)), max(0, int(safe_duration)))
