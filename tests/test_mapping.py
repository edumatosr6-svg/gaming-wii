"""Testes de specs/wii-controller/tests/mapping.md (M1-M20).

Modelo sob teste: **apontamento absoluto na pegada vertical** (F4). A amostra
de orientacao (a, b, g) converte na posicao apontada (x, y) em [-1, 1]^2,
funcao pura da amostra atual + calibracao.

VETORES DE TESTE SINTETICOS DA PEGADA VERTICAL (documentados aqui, como pede
mapping.md). Orientacao neutra = aparelho em pe na mao, ponta (topo) apontada
para a tela do PC, ja calibrada. Convencao do DeviceOrientationEvent (ordem
intrinseca Z-X'-Y''), com a ponta sendo o eixo +y do aparelho:

- ``a`` (alpha/yaw, giro em torno da vertical do mundo): cresce no sentido
  anti-horario visto de cima. Apontar a ponta para a DIREITA **diminui** alpha.
- ``b`` (beta/pitch): **levantar** a ponta aumenta beta.
- ``g`` (gamma/roll): torcer o aparelho no proprio eixo longitudinal - a ponta
  continua apontando para o mesmo lugar (nao move a mira).

Dai os vetores usados abaixo, todos relativos ao neutro (0, 0, 0):

| vetor                     | (a, b, g)   | significado      |
|---------------------------|-------------|------------------|
| ponta para a direita 10   | (-10, 0, 0) | yaw a direita    |
| ponta para a esquerda 10  | (+10, 0, 0) | yaw a esquerda   |
| ponta para cima 15        | (0, +15, 0) | pitch para cima  |
| ponta para baixo 15       | (0, -15, 0) | pitch para baixo |
| rolagem 30, ponta fixa    | (0, 0, +30) | so torcao        |
"""

from __future__ import annotations

import pytest

from server import config
from server.mapping import (
    ExponentialSmoother,
    clamp_rumble,
    combine_rumble,
    pointing_to_axes,
)
from server.metrics import MetricsWindow
from server.protocol import Calibrate, Motion
from server.session import SessionState

DZ = config.DEAD_ZONE_DEG
MAX = config.MAX_ANGLE_DEG

# Vetores sinteticos da pegada vertical (tabela do docstring).
PONTA_DIREITA = (-10.0, 0.0, 0.0)
PONTA_ESQUERDA = (10.0, 0.0, 0.0)
PONTA_CIMA = (0.0, 15.0, 0.0)
PONTA_BAIXO = (0.0, -15.0, 0.0)


def _axes(sample, **kwargs):
    """Atalho: converte a tupla (a, b, g) do vetor sintetico."""
    return pointing_to_axes(sample[0], sample[1], sample[2], **kwargs)


# ------------------------------------------------------------ caminho feliz


def test_m1_centro_calibrado():
    """M1: com o offset igual a orientacao atual, a posicao e exatamente (0, 0)."""
    assert _axes((20.0, -7.0, 33.0), offset=(20.0, -7.0, 33.0)) == (0.0, 0.0)


def test_m2_zona_morta():
    """M2: dentro da zona morta, a mira fica no centro (F4.1)."""
    assert _axes((-DZ / 2, 0.0, 0.0)) == (0.0, 0.0)
    assert _axes((0.0, DZ / 2, 0.0)) == (0.0, 0.0)


def test_m3_monotonicidade():
    """M3: da borda da zona morta ao angulo maximo, a saida cresce estritamente."""
    angles = [DZ + i * (MAX - DZ) / 40 for i in range(1, 41)]
    outputs = [_axes((0.0, angle, 0.0))[1] for angle in angles]
    for previous, current in zip(outputs, outputs[1:], strict=False):
        assert current > previous


def test_m4_saturacao():
    """M4: no angulo maximo e alem, a saida satura exatamente em +/-1.0 (F4.2)."""
    for angle in (MAX, MAX + 10, 90.0):
        assert _axes((0.0, angle, 0.0))[1] == 1.0
        assert _axes((0.0, -angle, 0.0))[1] == -1.0
        # mesmo pelo eixo horizontal (ponta para a direita/esquerda)
        assert _axes((-angle, 0.0, 0.0))[0] == 1.0
        assert _axes((angle, 0.0, 0.0))[0] == -1.0


def test_m5_simetria():
    """M5: theta e -theta produzem mesmo modulo e sinais opostos."""
    for theta in (DZ + 2, 12.0, MAX - 1):
        positive = _axes((0.0, theta, 0.0))[1]
        negative = _axes((0.0, -theta, 0.0))[1]
        assert positive == pytest.approx(-negative)
        assert positive > 0


def test_m6_offset_antes_de_tudo():
    """M6: o offset de calibracao e aplicado antes de tudo."""
    assert _axes((0.0, 20.0, 0.0), offset=(0.0, 20.0, 0.0)) == (0.0, 0.0)
    output = _axes((0.0, 20.0 + DZ + 1.0, 0.0), offset=(0.0, 20.0, 0.0))[1]
    assert 0 < output < 0.4


# --------------------------------------------------------- bordas e falhas


def test_m7_valores_extremos():
    """M7: +/-180, +/-90 e 0 nao lancam excecao e ficam em [-1, 1]."""
    for angle in (-180.0, -90.0, 0.0, 90.0, 180.0):
        x, y = _axes((angle, angle, angle))
        assert -1.0 <= x <= 1.0
        assert -1.0 <= y <= 1.0


def test_m8_entradas_invalidas():
    """M8: NaN, strings e infinitos produzem saida neutra, nunca excecao (F4.4)."""
    for bad in (float("nan"), "12.5", float("inf"), True, [], {}):
        # beta invalido: saida neutra
        assert _axes((0.0, bad, 0.0)) == (0.0, 0.0)
        # alpha invalido: degrada o eixo horizontal, mantem o vertical (M8b)
        x, y = pointing_to_axes(bad, 15.0, 0.0)
        assert x == 0.0
        assert -1.0 <= y <= 1.0
        # gamma invalido nao impede a conversao
        x, y = pointing_to_axes(0.0, 15.0, bad)
        assert -1.0 <= x <= 1.0
        assert -1.0 <= y <= 1.0


def test_m8b_alpha_nulo():
    """M8b: a = None (sensor sem yaw) nao lanca e mantem a saida em [-1, 1].

    Comportamento degradado documentado (F4.4): sem yaw o eixo horizontal
    fica em 0.0 e o vertical continua funcional.
    """
    x, y = pointing_to_axes(None, 15.0, 0.0)
    assert x == 0.0
    assert 0.0 < y <= 1.0
    # tambem quando a propria calibracao capturou alpha nulo
    x2, y2 = pointing_to_axes(None, 15.0, 0.0, offset=(None, 0.0, 0.0))
    assert x2 == 0.0
    assert -1.0 <= y2 <= 1.0
    # e com os dois nulos, sem excecao
    assert pointing_to_axes(None, 0.0, None) == (0.0, 0.0)


def test_m9_determinismo():
    """M9: a mesma amostra converte no mesmo resultado, sem estado escondido."""
    first = _axes((17.3, -9.1, 5.0), offset=(1.0, 2.0, 3.0))
    second = _axes((17.3, -9.1, 5.0), offset=(1.0, 2.0, 3.0))
    assert first == second


def test_m10_suavizacao_desligada():
    """M10: com SMOOTHING_ALPHA = 0 a saida e a conversao direta, sem atraso."""
    smoother = ExponentialSmoother(alpha=0.0)
    sample = _axes((-10.0, 5.0, 0.0))
    assert smoother.apply(sample) == sample
    assert smoother.apply((0.5, -0.5)) == (0.5, -0.5)


def test_m11_suavizacao_sem_overshoot():
    """M11: um degrau converge monotonicamente e nunca ultrapassa o valor final."""
    smoother = ExponentialSmoother(alpha=0.5)
    smoother.apply((0.0, 0.0))
    previous = 0.0
    for _ in range(50):
        value = smoother.apply((1.0, 0.0))[0]
        assert previous <= value <= 1.0
        previous = value
    assert previous == pytest.approx(1.0, abs=1e-6)


def test_m12_continuidade_na_saturacao():
    """M12: a saturacao suave nao tem salto perto do angulo maximo."""
    epsilon = 1e-3
    near = _axes((0.0, MAX - epsilon, 0.0))[1]
    assert abs(1.0 - near) < 1e-4


# ------------------- modelo de apontamento na pegada vertical (M17-M20)


def test_m17_sentido_dos_eixos():
    """M17 (KPI-18, F4.6): 4/4 direcoes corretas nos vetores da pegada vertical.

    Reprova exatamente o eixo trocado/invertido que reaproveitar o mapeamento
    de paisagem produziria - validado por mutacao (ver testing-report).
    """
    x_direita, y_direita = _axes(PONTA_DIREITA)
    assert x_direita > 0, "ponta para a DIREITA deve dar x > 0 (F4.6)"
    assert abs(y_direita) < 1e-9, "yaw puro nao pode mexer no eixo vertical"

    x_esquerda, y_esquerda = _axes(PONTA_ESQUERDA)
    assert x_esquerda < 0, "ponta para a ESQUERDA deve dar x < 0 (F4.6)"
    assert abs(y_esquerda) < 1e-9

    x_cima, y_cima = _axes(PONTA_CIMA)
    assert y_cima > 0, "LEVANTAR a ponta deve dar y > 0 (F4.6)"
    assert abs(x_cima) < 1e-9, "pitch puro nao pode mexer no eixo horizontal"

    x_baixo, y_baixo = _axes(PONTA_BAIXO)
    assert y_baixo < 0, "ABAIXAR a ponta deve dar y < 0 (F4.6)"
    assert abs(x_baixo) < 1e-9


def test_m18_rolagem_nao_move_a_mira():
    """M18 (KPI-18, F4.7): variar so a rolagem mantem (x, y) constante."""
    referencia = _axes((-8.0, 6.0, 0.0))
    for roll in (-90.0, -30.0, 15.0, 45.0, 90.0, 180.0):
        atual = _axes((-8.0, 6.0, roll))
        assert atual[0] == pytest.approx(referencia[0], abs=1e-9)
        assert atual[1] == pytest.approx(referencia[1], abs=1e-9)
    # inclusive no centro calibrado: torcer nao tira a mira do centro
    assert _axes((0.0, 0.0, 75.0)) == (0.0, 0.0)


def test_m19_apontamento_absoluto_independe_do_historico():
    """M19 (KPI-16, F4.3): mesma amostra final => mesmo (x, y), qualquer que
    tenha sido o caminho.

    E a propriedade que a implementacao por velocidade viola: com integracao,
    o resultado dependeria das amostras anteriores.
    """
    final = (-7.5, 9.25, 12.0)
    caminho_a = [(0.0, 0.0, 0.0), (-20.0, 18.0, 0.0), (5.0, -14.0, 40.0), final]
    caminho_b = [(30.0, -25.0, -60.0), (-2.0, 1.0, 5.0), (18.0, 17.0, 0.0), final]

    # suavizacao desligada: a conversao e funcao pura da amostra atual
    resultados = []
    for caminho in (caminho_a, caminho_b):
        smoother = ExponentialSmoother(alpha=0.0)
        saida = None
        for sample in caminho:
            saida = smoother.apply(_axes(sample))
        resultados.append(saida)

    assert resultados[0] == resultados[1], "a posicao apontada dependeu do historico"
    # e e igual a conversao direta da amostra final, sem historico algum
    assert resultados[0] == _axes(final)


def test_m20_orcamento_de_resposta_da_suavizacao():
    """M20 (KPI-17, F4.8): degrau atinge 90% do valor final em <= 100 ms a 60 Hz."""
    amostras_em_100ms = 6  # 60 Hz => 16,7 ms por amostra
    smoother = ExponentialSmoother()  # SMOOTHING_ALPHA padrao de config.py
    alvo = _axes((0.0, MAX, 0.0))
    smoother.apply((0.0, 0.0))  # estado inicial: centro

    valores = [smoother.apply(alvo)[1] for _ in range(amostras_em_100ms)]
    assert valores[-1] >= 0.9 * alvo[1], (
        f"resposta lenta demais: {valores[-1]:.4f} apos {amostras_em_100ms} amostras "
        f"(90% de {alvo[1]:.4f} = {0.9 * alvo[1]:.4f}) - KPI-17"
    )


# ------------------------------------------------------------------ rumble


def test_m13_combinacao_de_motores():
    assert combine_rumble(0.0, 0.0) == 0.0
    assert combine_rumble(1.0, 1.0) == 1.0
    mid = combine_rumble(0.3, 0.6)
    assert 0.0 <= mid <= 1.0
    # monotonico em cada motor
    assert combine_rumble(0.5, 0.2) >= combine_rumble(0.3, 0.2)
    assert combine_rumble(0.2, 0.5) >= combine_rumble(0.2, 0.3)


def test_m14_saturacao_de_rumble():
    assert clamp_rumble(2.5, 100) == (1.0, 100)
    assert clamp_rumble(-1.0, 100) == (0.0, 100)
    assert clamp_rumble(0.5, -50) == (0.5, 0)
    assert clamp_rumble("x", None) == (0.0, 0)


# -------------------------------------------------------------- calibracao


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
    """M15 (F5.2): calibrar em A e depois em B aplica so o offset B."""
    session, spy = _session()
    session.handle_motion(Motion(a=5.0, b=10.0, g=0.0, t=1.0))
    session.handle_calibrate(Calibrate())  # calibra em A
    session.handle_motion(Motion(a=-12.0, b=25.0, g=30.0, t=2.0))
    session.handle_calibrate(Calibrate())  # calibra em B - sem acumulo
    session.handle_motion(Motion(a=-12.0, b=25.0, g=30.0, t=3.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


def test_m16_calibrar_sem_amostra_previa():
    """M16 (F5.3): calibrar sem motion previo usa o zero padrao, sem erro."""
    session, spy = _session()
    session.handle_calibrate(Calibrate())
    assert session.calibration_offset == (0.0, 0.0, 0.0)
    session.handle_motion(Motion(a=0.0, b=0.0, g=0.0, t=1.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


def test_m15b_calibracao_absorve_o_zero_arbitrario_de_alpha():
    """F4/F5: a calibracao absorve o zero arbitrario de alpha do navegador.

    Calibrado num alpha qualquer, apontar a ponta 10 graus a direita daquele
    ponto da x > 0 - o valor absoluto de alpha nao importa.
    """
    session, spy = _session()
    session.handle_motion(Motion(a=237.0, b=3.0, g=-15.0, t=1.0))
    session.handle_calibrate(Calibrate())
    session.handle_motion(Motion(a=237.0, b=3.0, g=-15.0, t=2.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)
    session.handle_motion(Motion(a=227.0, b=3.0, g=-15.0, t=3.0))
    assert spy.axes[config.TILT_TARGET_AXIS][0] > 0
