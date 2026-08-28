"""Conversão de apontamento/botões → estado do gamepad (módulo puro, sem I/O).

Modelo de apontamento absoluto na pegada VERTICAL (F4): o aparelho é segurado
em pé como um Wii Remote, com um "emissor infravermelho imaginário" no topo.
Onde o topo (a ponta) aponta, a mira está — a amostra de orientação converte
em POSIÇÃO apontada (x, y) ∈ [-1, 1]², função pura da amostra atual +
calibração (mesma inclinação ⇒ mesma posição, independentemente do histórico).

Derivação da direção da ponta (convenção do ``DeviceOrientationEvent``, ordem
intrínseca Z-X'-Y'' com ``alpha`` em torno de Z, ``beta`` de X', ``gamma`` de
Y''; a ponta é o eixo +y do aparelho):

- **Guinada (yaw)** — ângulo horizontal da ponta: girar o pulso para apontar a
  ponta para a direita DIMINUI ``alpha`` (alpha cresce no sentido
  anti-horário visto de cima), logo ``yaw_direita = -(alpha - alpha0)``.
- **Arfagem (pitch)** — elevação da ponta: levantar a ponta AUMENTA ``beta``,
  logo ``pitch_cima = beta - beta0``.
- **Rolagem** — torcer o aparelho no próprio eixo longitudinal é exatamente a
  rotação ``gamma`` (último eixo intrínseco, o próprio eixo da ponta): ela NÃO
  muda a direção da ponta, e por construção não entra no mapeamento (F4.7).

ATENÇÃO: este mapeamento é o da pegada vertical e é DIFERENTE do antigo de
paisagem (que usava gamma→x / beta→y e ignorava alpha) — reaproveitar aquele
produz eixo trocado/invertido (reprovado por M17/M18).

Ordem de aplicação (F4): (a) offset de calibração; (b) derivação yaw/pitch da
ponta; (c) zona morta radial; (d) curva de sensibilidade; (e) saturação suave
(derivada contínua no intervalo útil, saída exatamente ±1.0 no ângulo máximo).

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


def _wrap_180(angle_deg: float) -> float:
    """Normaliza um delta angular para o intervalo (-180, 180].

    Nota de borda: +180° e -180° são o mesmo ponto físico; ambos normalizam
    para +180 (saturando em +1.0 no eixo correspondente — M4/M7).
    """
    wrapped = math.fmod(angle_deg, 360.0)
    if wrapped > 180.0:
        wrapped -= 360.0
    elif wrapped <= -180.0:
        wrapped += 360.0
    return wrapped


def pointing_to_axes(
    alpha: object,
    beta: object,
    gamma: object,
    offset: tuple[float | None, float, float] = (0.0, 0.0, 0.0),
    dead_zone_deg: float = config.DEAD_ZONE_DEG,
    max_angle_deg: float = config.MAX_ANGLE_DEG,
    sensitivity: float = config.SENSITIVITY,
) -> tuple[float, float]:
    """Converte a orientação (graus) na posição apontada (x, y) ∈ [-1, 1]².

    Sentido normativo (F4.6): ponta para a DIREITA ⇒ x > 0; LEVANTAR a ponta
    ⇒ y > 0. ``gamma`` (rolagem) é aceito pelo contrato do protocolo, mas não
    altera a direção da ponta (F4.7) — ver docstring do módulo.

    ``offset`` é a orientação de calibração ``(alpha0, beta0, gamma0)``; o
    centro calibrado vira (0, 0) e absorve o zero arbitrário de alpha (F5).

    Degradação documentada (M8b/F4.4): com ``alpha`` nulo/inválido (sensor sem
    yaw) — na amostra ou na calibração — o eixo horizontal fica em 0.0 e o
    vertical continua funcional. ``beta`` inválido produz saída neutra (0, 0).
    Nunca exceção nem valor fora de [-1, 1].
    """
    a = _sanitize_angle(alpha)
    b = _sanitize_angle(beta)
    _sanitize_angle(gamma)  # aceito pelo contrato; não entra na direção da ponta
    if b is None:
        return (0.0, 0.0)

    alpha0 = _sanitize_angle(offset[0])
    beta0 = _sanitize_angle(offset[1]) or 0.0

    # (a)+(b) offset de calibração e derivação yaw/pitch da ponta
    if a is None or alpha0 is None:
        yaw_right = 0.0  # sem yaw do sensor: eixo horizontal degrada para 0
    else:
        yaw_right = _wrap_180(-(a - alpha0))
    pitch_up = _wrap_180(b - beta0)

    # (c) zona morta radial
    magnitude = math.hypot(yaw_right, pitch_up)
    if magnitude <= dead_zone_deg:
        return (0.0, 0.0)

    # (d)+(e) curva de sensibilidade e saturação suave sobre a magnitude
    usable = max_angle_deg - dead_zone_deg
    if usable <= 0:
        return (0.0, 0.0)
    normalized = (magnitude - dead_zone_deg) / usable
    scaled = _shape(normalized, sensitivity)

    # Projeta de volta na direção apontada, preservando simetria (M5)
    x = (yaw_right / magnitude) * scaled
    y = (pitch_up / magnitude) * scaled
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
