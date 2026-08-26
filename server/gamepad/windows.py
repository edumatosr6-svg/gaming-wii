"""Implementação Windows do gamepad virtual via ViGEmBus/`vgamepad`.

Único módulo (junto com o pacote ``server/gamepad/``) autorizado a importar a
biblioteca concreta do driver (F7.4). O import é adiado para dentro do
construtor para que o módulo possa ser importado em qualquer SO.
"""

from __future__ import annotations

from server.gamepad.base import (
    GamepadUnavailableError,
    RumbleCallback,
    VirtualGamepad,
    axis_to_native,
)

_DRIVER_HELP = (
    "Driver ViGEmBus não encontrado. O gamepad virtual XInput exige o ViGEmBus "
    "instalado no Windows. Baixe e instale em: "
    "https://github.com/nefarius/ViGEmBus/releases e rode o servidor de novo."
)

_AXIS_NATIVE_MAX = 32767
_TRIGGER_NATIVE_MAX = 255


class WindowsGamepad(VirtualGamepad):
    """Gamepad Xbox 360 virtual apresentado ao Windows pelo ViGEmBus."""

    def __init__(self) -> None:
        try:
            import vgamepad  # noqa: PLC0415 — import isolado por diretiva
        except Exception as exc:  # ImportError ou erro do driver ausente
            raise GamepadUnavailableError(_DRIVER_HELP) from exc

        try:
            self._vg = vgamepad
            self._pad = vgamepad.VX360Gamepad()
        except Exception as exc:  # driver não instalado lança na criação
            raise GamepadUnavailableError(_DRIVER_HELP) from exc

        button = vgamepad.XUSB_BUTTON
        self._button_map = {
            "a": button.XUSB_GAMEPAD_A,
            "b": button.XUSB_GAMEPAD_B,
            "x": button.XUSB_GAMEPAD_X,
            "y": button.XUSB_GAMEPAD_Y,
            "up": button.XUSB_GAMEPAD_DPAD_UP,
            "down": button.XUSB_GAMEPAD_DPAD_DOWN,
            "left": button.XUSB_GAMEPAD_DPAD_LEFT,
            "right": button.XUSB_GAMEPAD_DPAD_RIGHT,
            "lb": button.XUSB_GAMEPAD_LEFT_SHOULDER,
            "rb": button.XUSB_GAMEPAD_RIGHT_SHOULDER,
            "start": button.XUSB_GAMEPAD_START,
            "back": button.XUSB_GAMEPAD_BACK,
        }
        self._rumble_callback: RumbleCallback | None = None

        # vgamepad valida a assinatura do callback comparando-a com um modelo SEM
        # anotações de tipo; um método anotado é rejeitado com TypeError. O wrapper
        # abaixo precisa permanecer sem anotações.
        def _notification(client, target, large_motor, small_motor, led_number, user_data):
            self._on_notification(large_motor, small_motor)

        self._pad.register_notification(callback_function=_notification)

    def _on_notification(self, large_motor: int, small_motor: int) -> None:
        """Callback do driver (thread do ViGEm) → repassa rumble normalizado."""
        callback = self._rumble_callback
        if callback is not None:
            callback(large_motor / 255.0, small_motor / 255.0)

    def set_button(self, button_id: str, pressed: bool) -> None:
        native = self._button_map.get(button_id)
        if native is None:
            return
        if pressed:
            self._pad.press_button(button=native)
        else:
            self._pad.release_button(button=native)
        self._pad.update()

    def set_axis(self, axis: str, x: float, y: float) -> None:
        native_x = axis_to_native(x, _AXIS_NATIVE_MAX)
        native_y = axis_to_native(y, _AXIS_NATIVE_MAX)
        if axis == "left":
            self._pad.left_joystick(x_value=native_x, y_value=native_y)
        else:
            self._pad.right_joystick(x_value=native_x, y_value=native_y)
        self._pad.update()

    def set_trigger(self, trigger: str, value: float) -> None:
        native = int(round(min(1.0, max(0.0, value)) * _TRIGGER_NATIVE_MAX))
        if trigger == "lt":
            self._pad.left_trigger(value=native)
        else:
            self._pad.right_trigger(value=native)
        self._pad.update()

    def set_rumble_callback(self, callback: RumbleCallback | None) -> None:
        self._rumble_callback = callback

    def reset(self) -> None:
        self._pad.reset()
        self._pad.update()
