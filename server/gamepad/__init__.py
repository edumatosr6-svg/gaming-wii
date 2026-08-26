"""Seleção da implementação de gamepad virtual por plataforma (F7, E6)."""

from __future__ import annotations

import sys
from typing import Callable

from server.gamepad.base import GamepadUnavailableError, VirtualGamepad


class NullGamepad(VirtualGamepad):
    """Gamepad nulo usado apenas pelo modo de diagnóstico `--direct-metrics`.

    Mede a latência sem a camada de emulação (F11) — não apresenta nada ao SO.
    """

    def set_button(self, button_id: str, pressed: bool) -> None:
        """Sem efeito (modo diagnóstico)."""

    def set_axis(self, axis: str, x: float, y: float) -> None:
        """Sem efeito (modo diagnóstico)."""

    def set_trigger(self, trigger: str, value: float) -> None:
        """Sem efeito (modo diagnóstico)."""

    def set_rumble_callback(self, callback: object) -> None:
        """Sem efeito (modo diagnóstico)."""

    def reset(self) -> None:
        """Sem efeito (modo diagnóstico)."""


def select_gamepad(
    platform: str | None = None,
    windows_factory: Callable[[], VirtualGamepad] | None = None,
) -> VirtualGamepad:
    """Escolhe a implementação de gamepad para a plataforma em runtime.

    ``platform`` e ``windows_factory`` são injetáveis para teste (C7, E6).
    Levanta ``GamepadUnavailableError`` com mensagem acionável quando não há
    driver ou implementação para a plataforma.
    """
    resolved = platform if platform is not None else sys.platform
    if resolved.startswith("win"):
        if windows_factory is not None:
            return windows_factory()
        from server.gamepad.windows import WindowsGamepad  # noqa: PLC0415

        return WindowsGamepad()
    raise GamepadUnavailableError(
        f"Plataforma '{resolved}' sem implementação de gamepad virtual no MVP. "
        "O fallback teclado/mouse (server/gamepad/keyboard.py) está previsto "
        "para a segunda onda; hoje o suporte é Windows + driver ViGEmBus "
        "(https://github.com/nefarius/ViGEmBus/releases)."
    )
