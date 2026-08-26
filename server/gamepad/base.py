"""Interface abstrata do gamepad virtual (F7).

Nenhum módulo fora de ``server/gamepad/`` importa a biblioteca concreta do
driver — todo o resto do servidor fala apenas com esta interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

# Callback de rumble: (motor_baixa_frequencia, motor_alta_frequencia) em [0, 1]
RumbleCallback = Callable[[float, float], None]

# Botões do protocolo — a implementação concreta traduz para o driver
BUTTON_ORDER: tuple[str, ...] = (
    "a",
    "b",
    "x",
    "y",
    "up",
    "down",
    "left",
    "right",
    "lb",
    "rb",
    "start",
    "back",
)


def axis_to_native(value: float, native_max: int) -> int:
    """Converte eixo [-1.0, 1.0] para a faixa nativa do driver (E4).

    Satura fora da faixa e preserva o sinal. ``native_max`` é o maior valor
    positivo do driver (ex.: 32767 para XInput).
    """
    clamped = min(1.0, max(-1.0, float(value)))
    return int(round(clamped * native_max))


class VirtualGamepad(ABC):
    """Contrato do gamepad virtual XInput exposto ao SO."""

    @abstractmethod
    def set_button(self, button_id: str, pressed: bool) -> None:
        """Liga/desliga um botão do protocolo (`a`, `b`, ..., `back`)."""

    @abstractmethod
    def set_axis(self, axis: str, x: float, y: float) -> None:
        """Define um analógico (`left` ou `right`) com valores em [-1, 1]."""

    @abstractmethod
    def set_trigger(self, trigger: str, value: float) -> None:
        """Define um gatilho (`lt` ou `rt`) com valor em [0, 1]."""

    @abstractmethod
    def set_rumble_callback(self, callback: RumbleCallback | None) -> None:
        """Registra o callback chamado quando o jogo emite rumble (F8)."""

    @abstractmethod
    def reset(self) -> None:
        """Zera atomicamente todos os botões, eixos e gatilhos (F9.1)."""


class GamepadUnavailableError(RuntimeError):
    """Driver de gamepad virtual ausente ou plataforma sem implementação.

    A mensagem é acionável: nomeia o driver e onde obtê-lo (F7.2).
    """
