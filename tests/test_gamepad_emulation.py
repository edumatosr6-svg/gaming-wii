"""Testes de specs/wii-controller/tests/gamepad-emulation.md (E1–E9)."""

from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from server.gamepad import NullGamepad, select_gamepad
from server.gamepad.base import BUTTON_ORDER, GamepadUnavailableError, VirtualGamepad, axis_to_native

ROOT = Path(__file__).resolve().parent.parent


def test_e1_contrato_da_interface(fake_gamepad):
    abstract = {
        name
        for name, member in inspect.getmembers(VirtualGamepad)
        if getattr(member, "__isabstractmethod__", False)
    }
    assert abstract == {
        "set_button",
        "set_axis",
        "set_trigger",
        "set_rumble_callback",
        "reset",
    }
    # o fake implementa o contrato completo
    for name in abstract:
        assert callable(getattr(fake_gamepad, name))
    # a implementação Windows expõe a mesma interface (inspeção estática,
    # sem instanciar — não exige driver)
    from server.gamepad.windows import WindowsGamepad

    for name in abstract:
        assert callable(inspect.getattr_static(WindowsGamepad, name))


def test_e2_reset_atomico(fake_gamepad):
    fake_gamepad.set_button("a", True)
    fake_gamepad.set_button("lb", True)
    fake_gamepad.set_axis("right", 0.7, -0.3)
    fake_gamepad.set_trigger("rt", 1.0)
    calls_before = len(fake_gamepad.call_log)
    fake_gamepad.reset()
    # uma única operação observável zera tudo
    assert len(fake_gamepad.call_log) == calls_before + 1
    assert fake_gamepad.is_zeroed()


def test_e3_mapa_de_botoes_xinput():
    """Tabela de referência id do protocolo → botão XInput, distinta e completa."""
    from server.gamepad.windows import WindowsGamepad

    source = inspect.getsource(WindowsGamepad.__init__)
    expected = {
        "a": "XUSB_GAMEPAD_A",
        "b": "XUSB_GAMEPAD_B",
        "x": "XUSB_GAMEPAD_X",
        "y": "XUSB_GAMEPAD_Y",
        "up": "XUSB_GAMEPAD_DPAD_UP",
        "down": "XUSB_GAMEPAD_DPAD_DOWN",
        "left": "XUSB_GAMEPAD_DPAD_LEFT",
        "right": "XUSB_GAMEPAD_DPAD_RIGHT",
        "lb": "XUSB_GAMEPAD_LEFT_SHOULDER",
        "rb": "XUSB_GAMEPAD_RIGHT_SHOULDER",
        "start": "XUSB_GAMEPAD_START",
        "back": "XUSB_GAMEPAD_BACK",
    }
    assert set(expected) == set(BUTTON_ORDER)
    for proto_id, xinput_name in expected.items():
        assert f'"{proto_id}": button.{xinput_name}' in source
    # distintos entre si
    assert len(set(expected.values())) == len(expected)


def test_e4_faixa_de_eixos():
    assert axis_to_native(1.0, 32767) == 32767
    assert axis_to_native(-1.0, 32767) == -32767
    assert axis_to_native(0.0, 32767) == 0
    assert axis_to_native(0.5, 32767) == 16384
    assert axis_to_native(-0.5, 32767) == -16384
    # clipping correto, sem inversão de sinal
    assert axis_to_native(2.0, 32767) == 32767
    assert axis_to_native(-2.0, 32767) == -32767


def test_e5_isolamento_de_import():
    """`vgamepad` só aparece em server/gamepad/ (F1.5, F7.4)."""
    offenders: list[str] = []
    for path in ROOT.glob("server/**/*.py"):
        if "gamepad" in path.parts:
            continue
        if "vgamepad" in path.read_text(encoding="utf-8"):
            offenders.append(str(path))
    import re

    for path in ROOT.glob("tests/**/*.py"):
        text = path.read_text(encoding="utf-8")
        if re.search(r"^\s*(import|from)\s+vgamepad", text, re.MULTILINE):
            offenders.append(str(path))
    assert offenders == [], f"vgamepad importado fora de server/gamepad/: {offenders}"


def test_e6_selecao_por_plataforma(fake_gamepad):
    # Windows com driver presente → implementação Windows (via factory injetada)
    result = select_gamepad("win32", windows_factory=lambda: fake_gamepad)
    assert result is fake_gamepad

    # Driver ausente → erro acionável
    def missing():
        raise GamepadUnavailableError("Driver ViGEmBus não encontrado: https://exemplo")

    with pytest.raises(GamepadUnavailableError, match="ViGEmBus"):
        select_gamepad("win32", windows_factory=missing)

    # Plataforma não suportada → mensagem clara citando o fallback futuro
    with pytest.raises(GamepadUnavailableError, match="teclado/mouse"):
        select_gamepad("linux")


def test_null_gamepad_do_modo_diagnostico():
    """O modo --direct-metrics usa um gamepad nulo que honra a interface."""
    pad = NullGamepad()
    pad.set_button("a", True)
    pad.set_axis("right", 1.0, 1.0)
    pad.set_trigger("lt", 1.0)
    pad.reset()  # sem exceção


# ------------------------------------------------------ manuais / hardware


@pytest.mark.hardware
def test_e7_reconhecimento_pelo_so_manual():
    pytest.skip("Procedimento manual E7: joy.cpl lista o controle Xbox 360")


@pytest.mark.hardware
def test_e8_jogo_de_terceiros_manual():
    pytest.skip("Procedimento manual E8: jogo XInput reconhece o controle")


@pytest.mark.hardware
def test_e9_rumble_do_driver_manual():
    pytest.skip("Procedimento manual E9: rumble de jogo real vibra o celular")
