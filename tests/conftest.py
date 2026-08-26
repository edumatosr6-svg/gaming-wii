"""Fixtures da suíte: gamepad fake e servidor em loopback (sem driver)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.gamepad.base import RumbleCallback, VirtualGamepad  # noqa: E402
from server.main import App, run_server  # noqa: E402


class FakeGamepad(VirtualGamepad):
    """Dublê da interface `server/gamepad/base.py` (tools/tooling.md).

    Registra todo o estado para inspeção nos testes e permite injetar rumble
    como se viesse do driver.
    """

    def __init__(self) -> None:
        self.buttons: dict[str, bool] = {}
        self.axes: dict[str, tuple[float, float]] = {"left": (0.0, 0.0), "right": (0.0, 0.0)}
        self.triggers: dict[str, float] = {"lt": 0.0, "rt": 0.0}
        self.reset_calls: int = 0
        self.call_log: list[tuple[str, object]] = []
        self._rumble_callback: RumbleCallback | None = None

    def set_button(self, button_id: str, pressed: bool) -> None:
        self.buttons[button_id] = pressed
        self.call_log.append(("button", (button_id, pressed)))

    def set_axis(self, axis: str, x: float, y: float) -> None:
        self.axes[axis] = (x, y)
        self.call_log.append(("axis", (axis, x, y)))

    def set_trigger(self, trigger: str, value: float) -> None:
        self.triggers[trigger] = value
        self.call_log.append(("trigger", (trigger, value)))

    def set_rumble_callback(self, callback: RumbleCallback | None) -> None:
        self._rumble_callback = callback

    def reset(self) -> None:
        self.buttons = {}
        self.axes = {"left": (0.0, 0.0), "right": (0.0, 0.0)}
        self.triggers = {"lt": 0.0, "rt": 0.0}
        self.reset_calls += 1
        self.call_log.append(("reset", None))

    # Auxiliares de teste
    def trigger_rumble(self, low: float, high: float) -> None:
        """Injeta um rumble como se o driver tivesse notificado."""
        assert self._rumble_callback is not None, "callback de rumble não registrado"
        self._rumble_callback(low, high)

    def is_zeroed(self) -> bool:
        return (
            all(not pressed for pressed in self.buttons.values())
            and self.axes["left"] == (0.0, 0.0)
            and self.axes["right"] == (0.0, 0.0)
            and self.triggers["lt"] == 0.0
            and self.triggers["rt"] == 0.0
        )


@pytest.fixture
def fake_gamepad() -> FakeGamepad:
    return FakeGamepad()


def _free_port() -> int:
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


@pytest.fixture
async def live_server(fake_gamepad: FakeGamepad):
    """Servidor real em loopback, sem TLS (ws://) e com gamepad fake."""
    app = App(fake_gamepad)
    port = _free_port()
    server = await run_server(app, port, use_tls=False)
    try:
        yield app, port, fake_gamepad
    finally:
        server.close()
        await server.wait_closed()
        await asyncio.sleep(0)
