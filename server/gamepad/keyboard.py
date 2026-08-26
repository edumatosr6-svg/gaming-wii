"""Fallback teclado/mouse — stub da segunda onda (F7).

A interface está preparada para receber a implementação completa no futuro;
no MVP este módulo existe apenas para o seletor de plataforma ter para onde
apontar (software-specs.md, "Segunda onda").
"""

from __future__ import annotations

from server.gamepad.base import GamepadUnavailableError, RumbleCallback, VirtualGamepad


class KeyboardGamepad(VirtualGamepad):
    """Stub do fallback teclado/mouse (não implementado no MVP)."""

    _MESSAGE = (
        "O fallback teclado/mouse ainda não está implementado (segunda onda). "
        "Use o Windows com o driver ViGEmBus instalado: "
        "https://github.com/nefarius/ViGEmBus/releases"
    )

    def __init__(self) -> None:
        raise GamepadUnavailableError(self._MESSAGE)

    def set_button(self, button_id: str, pressed: bool) -> None:
        raise NotImplementedError

    def set_axis(self, axis: str, x: float, y: float) -> None:
        raise NotImplementedError

    def set_trigger(self, trigger: str, value: float) -> None:
        raise NotImplementedError

    def set_rumble_callback(self, callback: RumbleCallback | None) -> None:
        raise NotImplementedError

    def reset(self) -> None:
        raise NotImplementedError
