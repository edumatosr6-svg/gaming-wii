"""Testes de specs/wii-controller/tests/mapping.md (M1–M16)."""

from __future__ import annotations

import math

import pytest

from server import config
from server.mapping import ExponentialSmoother, clamp_rumble, combine_rumble, tilt_to_axes
from server.metrics import MetricsWindow
from server.protocol import Calibrate, Motion
from server.session import SessionState

DZ = config.DEAD_ZONE_DEG
MAX = config.MAX_ANGLE_DEG


def test_m1_centro_calibrado():
    assert tilt_to_axes(20.0, -7.0, offset=(20.0, -7.0)) == (0.0, 0.0)


def test_m2_zona_morta():
    assert tilt_to_axes(DZ / 2, 0.0) == (0.0, 0.0)
    assert tilt_to_axes(0.0, DZ / 2) == (0.0, 0.0)


def test_m3_monotonicidade():
    angles = [DZ + i * (MAX - DZ) / 40 for i in range(1, 41)]
    outputs = [tilt_to_axes(a, 0.0)[1] for a in angles]
    for previous, current in zip(outputs, outputs[1:]):
        assert current > previous


def test_m4_saturacao():
    for angle in (MAX, MAX + 10, 180.0):
        assert tilt_to_axes(angle, 0.0)[1] == 1.0
        assert tilt_to_axes(-angle, 0.0)[1] == -1.0


def test_m5_simetria():
    for theta in (DZ + 2, 15.0, MAX - 1):
        positive = tilt_to_axes(theta, 0.0)[1]
        negative = tilt_to_axes(-theta, 0.0)[1]
        assert positive == pytest.approx(-negative)
        assert positive > 0


def test_m6_offset_antes_de_tudo():
    assert tilt_to_axes(20.0, 0.0, offset=(20.0, 0.0)) == (0.0, 0.0)
    output = tilt_to_axes(20.0 + DZ + 1.0, 0.0, offset=(20.0, 0.0))[1]
    assert 0 < output < 0.3


def test_m7_valores_extremos():
    for angle in (-180.0, -90.0, 0.0, 90.0, 180.0):
        x, y = tilt_to_axes(angle, angle)
        assert -1.0 <= x <= 1.0
        assert -1.0 <= y <= 1.0


def test_m8_entradas_invalidas():
    for bad in (float("nan"), None, "12.5", float("inf"), True):
        assert tilt_to_axes(bad, 10.0) == (0.0, 0.0)
        assert tilt_to_axes(10.0, bad) == (0.0, 0.0)


def test_m9_determinismo():
    first = tilt_to_axes(17.3, -9.1, offset=(1.0, 2.0))
    second = tilt_to_axes(17.3, -9.1, offset=(1.0, 2.0))
    assert first == second


def test_m10_suavizacao_desligada():
    smoother = ExponentialSmoother(alpha=0.0)
    sample = tilt_to_axes(20.0, 5.0)
    assert smoother.apply(sample) == sample
    assert smoother.apply((0.5, -0.5)) == (0.5, -0.5)


def test_m11_suavizacao_sem_overshoot():
    smoother = ExponentialSmoother(alpha=0.5)
    smoother.apply((0.0, 0.0))
    previous = 0.0
    for _ in range(50):
        value = smoother.apply((1.0, 0.0))[0]
        assert previous <= value <= 1.0
        previous = value
    assert previous == pytest.approx(1.0, abs=1e-6)


def test_m12_continuidade_na_saturacao():
    epsilon = 1e-3
    near = tilt_to_axes(MAX - epsilon, 0.0)[1]
    assert abs(1.0 - near) < 1e-4


def test_m13_combinacao_de_motores():
    assert combine_rumble(0.0, 0.0) == 0.0
    assert combine_rumble(1.0, 1.0) == 1.0
    mid = combine_rumble(0.3, 0.6)
    assert 0.0 <= mid <= 1.0
    # monotônico em cada motor
    assert combine_rumble(0.5, 0.2) >= combine_rumble(0.3, 0.2)
    assert combine_rumble(0.2, 0.5) >= combine_rumble(0.2, 0.3)


def test_m14_saturacao_de_rumble():
    assert clamp_rumble(2.5, 100) == (1.0, 100)
    assert clamp_rumble(-1.0, 100) == (0.0, 100)
    assert clamp_rumble(0.5, -50) == (0.5, 0)
    assert clamp_rumble("x", None) == (0.0, 0)


class _AxisSpy:
    def __init__(self) -> None:
        self.axes: dict[str, tuple[float, float]] = {}
        self.buttons: dict[str, bool] = {}

    def set_axis(self, axis: str, x: float, y: float) -> None:
        self.axes[axis] = (x, y)

    def set_button(self, button_id: str, pressed: bool) -> None:
        self.buttons[button_id] = pressed

    def reset(self) -> None:
        self.axes = {}
        self.buttons = {}


def _session() -> tuple[SessionState, _AxisSpy]:
    spy = _AxisSpy()
    session = SessionState(spy, MetricsWindow(), smoothing_alpha=0.0)
    return session, spy


def test_m15_recalibracao_repetida():
    session, spy = _session()
    session.handle_motion(Motion(b=10.0, g=0.0, t=1.0))
    session.handle_calibrate(Calibrate())  # calibra em A (10, 0)
    session.handle_motion(Motion(b=25.0, g=0.0, t=2.0))
    session.handle_calibrate(Calibrate())  # calibra em B (25, 0) — sem acúmulo
    session.handle_motion(Motion(b=25.0, g=0.0, t=3.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


def test_m16_calibrar_sem_amostra_previa():
    session, spy = _session()
    session.handle_calibrate(Calibrate())  # sem motion prévio: offset nulo
    assert session.calibration_offset == (0.0, 0.0)
    session.handle_motion(Motion(b=0.0, g=0.0, t=1.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)
