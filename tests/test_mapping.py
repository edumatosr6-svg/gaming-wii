"""Testes de specs/wii-controller/tests/mapping.md (M1-M28).

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

REVISAO DE PRECISAO: a zona morta e **por eixo** e o limite e **por direcao**
(perfil de calibracao), no lugar do par hipotenusa + angulo maximo unico; a
suavizacao e **adaptativa por velocidade**.
"""

from __future__ import annotations

import random
import statistics

import pytest

from server import config
from server.mapping import (
    AdaptiveSmoother,
    clamp_rumble,
    combine_rumble,
    is_valid_range_profile,
    pointing_angles,
    pointing_to_axes,
    resolve_ranges,
)
from server.metrics import MetricsWindow
from server.protocol import Calibrate, Motion
from server.session import SessionState

DZ_YAW = config.DEAD_ZONE_YAW_DEG
DZ_PITCH = config.DEAD_ZONE_PITCH_DEG
RANGE = config.DEFAULT_RANGE_DEG

# Vetores sinteticos da pegada vertical (tabela do docstring).
PONTA_DIREITA = (-10.0, 0.0, 0.0)
PONTA_ESQUERDA = (10.0, 0.0, 0.0)
PONTA_CIMA = (0.0, 15.0, 0.0)
PONTA_BAIXO = (0.0, -15.0, 0.0)

# 60 Hz => 16,7 ms por amostra; 100 ms = 6 amostras (orcamento do KPI-17).
PERIODO_60HZ_MS = 1000.0 / 60.0
AMOSTRAS_EM_100MS = 6


def _axes(sample, **kwargs):
    """Atalho: converte a tupla (a, b, g) do vetor sintetico."""
    return pointing_to_axes(sample[0], sample[1], sample[2], **kwargs)


def _smoother_fixo(alpha: float) -> AdaptiveSmoother:
    """Filtro de fator FIXO (frente 2 desligada, F15) - usado por M10/M11/M27."""
    return AdaptiveSmoother(alpha=alpha, adaptive=False)


def _sequencia_yaw(angulos, adaptive=True, ranges=None):
    """Converte uma sequencia de angulos de yaw a 60 Hz, com suavizacao.

    Devolve a lista de ``SmoothingResult`` - inclui o fator efetivo e a
    velocidade estimada, que a F4 exige como observaveis.
    """
    smoother = AdaptiveSmoother(adaptive=adaptive)
    resultados = []
    t = 0.0
    for yaw in angulos:
        axes = pointing_to_axes(-yaw, 0.0, 0.0, ranges=ranges)
        angles = pointing_angles(-yaw, 0.0, 0.0)
        resultados.append(smoother.apply(axes, angles_deg=angles, t_ms=t))
        t += PERIODO_60HZ_MS
    return resultados


# ------------------------------------------------------------ caminho feliz


def test_m1_centro_calibrado():
    """M1: com o offset igual a orientacao atual, a posicao e exatamente (0, 0)."""
    assert _axes((20.0, -7.0, 33.0), offset=(20.0, -7.0, 33.0)) == (0.0, 0.0)


def test_m2_zona_morta_por_eixo():
    """M2: dentro da zona morta DO EIXO correspondente, o eixo fica em 0.0."""
    assert _axes((-DZ_YAW / 2, 0.0, 0.0)) == (0.0, 0.0)
    assert _axes((0.0, DZ_PITCH / 2, 0.0)) == (0.0, 0.0)


def test_m3_monotonicidade():
    """M3: da borda da zona morta ao limite da direcao, a saida cresce."""
    angles = [DZ_PITCH + i * (RANGE - DZ_PITCH) / 40 for i in range(1, 41)]
    outputs = [_axes((0.0, angle, 0.0))[1] for angle in angles]
    for previous, current in zip(outputs, outputs[1:], strict=False):
        assert current > previous


def test_m4_saturacao():
    """M4: no limite da direcao e alem, a saida satura exatamente em +/-1.0."""
    for angle in (RANGE, RANGE + 10, 90.0):
        assert _axes((0.0, angle, 0.0))[1] == 1.0
        assert _axes((0.0, -angle, 0.0))[1] == -1.0
        # mesmo pelo eixo horizontal (ponta para a direita/esquerda)
        assert _axes((-angle, 0.0, 0.0))[0] == 1.0
        assert _axes((angle, 0.0, 0.0))[0] == -1.0


def test_m5_simetria_com_perfil_simetrico():
    """M5: com alcances iguais nas quatro direcoes, theta e -theta espelham.

    Com perfil ASSIMETRICO a simetria em graus deixa de valer por construcao -
    esse e o caso M25, e e o comportamento desejado, nao uma regressao daqui.
    """
    for theta in (DZ_PITCH + 2, 12.0, RANGE - 1):
        positive = _axes((0.0, theta, 0.0))[1]
        negative = _axes((0.0, -theta, 0.0))[1]
        assert positive == pytest.approx(-negative)
        assert positive > 0


def test_m6_offset_antes_de_tudo():
    """M6: o offset de calibracao e aplicado antes de tudo."""
    assert _axes((0.0, 20.0, 0.0), offset=(0.0, 20.0, 0.0)) == (0.0, 0.0)
    output = _axes((0.0, 20.0 + DZ_PITCH + 1.0, 0.0), offset=(0.0, 20.0, 0.0))[1]
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
    """M8b: a = None (sensor sem yaw) nao lanca e mantem a saida em [-1, 1]."""
    x, y = pointing_to_axes(None, 15.0, 0.0)
    assert x == 0.0
    assert 0.0 < y <= 1.0
    x2, y2 = pointing_to_axes(None, 15.0, 0.0, offset=(None, 0.0, 0.0))
    assert x2 == 0.0
    assert -1.0 <= y2 <= 1.0
    assert pointing_to_axes(None, 0.0, None) == (0.0, 0.0)


def test_m9_determinismo():
    """M9: a mesma amostra converte no mesmo resultado, sem estado escondido."""
    first = _axes((17.3, -9.1, 5.0), offset=(1.0, 2.0, 3.0))
    second = _axes((17.3, -9.1, 5.0), offset=(1.0, 2.0, 3.0))
    assert first == second


def test_m10_suavizacao_desligada():
    """M10: com o filtro desligado a saida e a conversao direta, sem atraso."""
    smoother = _smoother_fixo(0.0)
    sample = _axes((-10.0, 5.0, 0.0))
    assert smoother.apply(sample).axes == sample
    assert smoother.apply((0.5, -0.5)).axes == (0.5, -0.5)


def test_m11_suavizacao_sem_overshoot():
    """M11: um degrau converge monotonicamente e nunca ultrapassa o valor final."""
    smoother = _smoother_fixo(0.5)
    smoother.apply((0.0, 0.0))
    previous = 0.0
    for _ in range(50):
        value = smoother.apply((1.0, 0.0)).axes[0]
        assert previous <= value <= 1.0
        previous = value
    assert previous == pytest.approx(1.0, abs=1e-6)


def test_m12_continuidade_na_saturacao():
    """M12: a saturacao suave nao tem salto perto do limite da direcao."""
    epsilon = 1e-3
    near = _axes((0.0, RANGE - epsilon, 0.0))[1]
    assert abs(1.0 - near) < 1e-4


# ------------------- modelo de apontamento na pegada vertical (M17-M20)


def test_m17_sentido_dos_eixos():
    """M17 (KPI-18, F4.6): 4/4 direcoes corretas nos vetores da pegada vertical.

    Reprova exatamente o eixo trocado/invertido que reaproveitar o mapeamento
    de paisagem produziria.
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
    assert _axes((0.0, 0.0, 75.0)) == (0.0, 0.0)


def test_m19_apontamento_absoluto_independe_do_historico():
    """M19 (KPI-16, F4.3): mesma amostra final => mesmo (x, y), qualquer caminho."""
    final = (-7.5, 9.25, 12.0)
    caminho_a = [(0.0, 0.0, 0.0), (-20.0, 18.0, 0.0), (5.0, -14.0, 40.0), final]
    caminho_b = [(30.0, -25.0, -60.0), (-2.0, 1.0, 5.0), (18.0, 17.0, 0.0), final]

    resultados = []
    for caminho in (caminho_a, caminho_b):
        smoother = _smoother_fixo(0.0)
        saida = None
        for sample in caminho:
            saida = smoother.apply(_axes(sample)).axes
        resultados.append(saida)

    assert resultados[0] == resultados[1], "a posicao apontada dependeu do historico"
    assert resultados[0] == _axes(final)


def test_m20_orcamento_de_resposta_da_suavizacao_adaptativa():
    """M20 (KPI-17, F4.8): degrau atinge 90% do valor final em <= 100 ms a 60 Hz.

    Passa porque o degrau e lido como movimento RAPIDO e o filtro praticamente
    desliga. Se a velocidade for estimada de forma que o degrau nao a acione,
    este caso reprova.
    """
    repouso = [0.0] * 30
    degrau = [RANGE] * AMOSTRAS_EM_100MS
    resultados = _sequencia_yaw(repouso + degrau)
    alvo = pointing_to_axes(-RANGE, 0.0, 0.0)[0]
    valor = resultados[-1].axes[0]
    assert valor >= 0.9 * alvo, (
        f"resposta lenta demais: {valor:.4f} apos {AMOSTRAS_EM_100MS} amostras "
        f"(90% de {alvo:.4f} = {0.9 * alvo:.4f}) - KPI-17"
    )


# ---------- precisao: por eixo, por direcao e suavizacao adaptativa (M21-M28)


def _ruido_em_torno_de(centro_deg, amplitude_deg, n, seed=20260828):
    """Ruido sintetico de MEDIA ZERO em torno de um deslocamento fixo."""
    rng = random.Random(seed)
    return [centro_deg + rng.uniform(-amplitude_deg, amplitude_deg) for _ in range(n)]


def test_m21_atenuacao_de_tremor():
    """M21 (KPI-7, F4.11): desvio-padrao da saida <= 40% do da suavizacao off.

    Roda na mesma configuracao de M20: os dois juntos sao a prova de que tremor
    e resposta deixaram de ser negociaveis entre si.
    """
    # Deslocamento fixo FORA da zona morta do yaw, mais ruido de media zero.
    angulos = _ruido_em_torno_de(10.0, 1.0, 600)
    com_filtro = [r.axes[0] for r in _sequencia_yaw(angulos, adaptive=True)][100:]
    sem_filtro = [pointing_to_axes(-a, 0.0, 0.0)[0] for a in angulos][100:]

    desvio_com = statistics.pstdev(com_filtro)
    desvio_sem = statistics.pstdev(sem_filtro)
    assert desvio_sem > 0
    razao = desvio_com / desvio_sem
    assert razao <= 0.40, f"tremor mal atenuado: std relativo {razao:.3f} > 0.40 (KPI-7)"


def test_m22_estado_estacionario_do_filtro():
    """M22 (F4.12, KPI-16): apos 300 ms de entrada constante, as saidas coincidem.

    Impede que a suavizacao adaptativa reintroduza dependencia de historico
    permanente, que e exatamente o defeito do modelo por velocidade.
    """
    final = 8.0
    amostras_300ms = 18  # 300 ms a 60 Hz
    caminho_a = [0.0] * 30 + [final] * amostras_300ms
    caminho_b = [RANGE] * 30 + [final] * amostras_300ms

    saida_a = _sequencia_yaw(caminho_a)[-1].axes[0]
    saida_b = _sequencia_yaw(caminho_b)[-1].axes[0]
    nao_suavizado = pointing_to_axes(-final, 0.0, 0.0)[0]

    assert abs(saida_a - nao_suavizado) <= 0.01 * abs(nao_suavizado)
    assert abs(saida_b - nao_suavizado) <= 0.01 * abs(nao_suavizado)
    assert saida_a == pytest.approx(saida_b, abs=1e-9)


def test_m22b_ruido_nao_e_lido_como_movimento():
    """M22b (F4.14): o fator efetivo fica na faixa "parado" sob ruido.

    Reprova a estimativa de velocidade por diferenca entre amostras
    CONSECUTIVAS, que interpretaria o tremor como gesto rapido e desligaria o
    filtro justamente quando ele e necessario - a regressao mais provavel desta
    frente, e invisivel pela saida sozinha.
    """
    angulos = _ruido_em_torno_de(10.0, 1.0, 600)
    fatores = [r.alpha_x for r in _sequencia_yaw(angulos)][100:]
    piso = 0.8 * config.SMOOTH_ALPHA_STILL
    assert min(fatores) >= piso, (
        f"o ruido acionou o modo rapido: fator minimo {min(fatores):.4f} < {piso:.4f} "
        "- velocidade provavelmente estimada por amostra consecutiva"
    )

    # E, num degrau, o fator cai para a faixa "rapido" JA na amostra do degrau.
    resultados = _sequencia_yaw([0.0] * 30 + [RANGE] * 5)
    teto = 0.2 * config.SMOOTH_ALPHA_STILL
    assert resultados[30].alpha_x <= teto
    assert resultados[30].speed_x_dps > config.SMOOTH_SPEED_HIGH_DPS


def test_m23_simetria_de_precisao_do_processamento():
    """M23 (KPI-19): std(x)/std(y) entre 0.67 e 1.5 para o mesmo ruido.

    Verifica que o PROCESSAMENTO nao introduz assimetria; a assimetria real do
    sensor e medida no aparelho (L13).
    """
    amplitude = 1.0
    normalizado = 0.5
    # Mesmo deslocamento NORMALIZADO nos dois eixos (as zonas mortas diferem).
    yaw_centro = DZ_YAW + normalizado * (RANGE - DZ_YAW)
    pitch_centro = DZ_PITCH + normalizado * (RANGE - DZ_PITCH)

    ruido_yaw = _ruido_em_torno_de(yaw_centro, amplitude, 400, seed=11)
    ruido_pitch = _ruido_em_torno_de(pitch_centro, amplitude, 400, seed=11)

    saida_x = [pointing_to_axes(-a, 0.0, 0.0)[0] for a in ruido_yaw]
    saida_y = [pointing_to_axes(0.0, b, 0.0)[1] for b in ruido_pitch]

    razao = statistics.pstdev(saida_x) / statistics.pstdev(saida_y)
    assert 0.67 <= razao <= 1.5, f"processamento assimetrico: std(x)/std(y) = {razao:.3f}"


def test_m24_zonas_mortas_diferentes_por_eixo():
    """M24 (F4.9): theta entre as duas zonas mortas zera o yaw e nao o pitch.

    Reprova a volta da zona morta radial unica - com um raio so, os dois casos
    dariam o mesmo resultado.
    """
    assert DZ_PITCH < DZ_YAW, "a assimetria das zonas mortas tem sinal definido"
    theta = (DZ_PITCH + DZ_YAW) / 2

    x_yaw, y_yaw = _axes((-theta, 0.0, 0.0))
    assert x_yaw == 0.0, "theta dentro da zona morta do YAW deveria zerar x"

    x_pitch, y_pitch = _axes((0.0, theta, 0.0))
    assert y_pitch != 0.0, "theta fora da zona morta do PITCH nao deveria zerar y"


def test_m25_limites_assimetricos_por_direcao():
    """M25 (F4.10, F12.4): +25 satura em +1.0 e -15 em -1.0, com perfil torto.

    Reprova qualquer normalizacao que comprima os quatro limites de volta a um
    raio unico.
    """
    perfil = {"right": 25.0, "left": 15.0, "up": 20.0, "down": 20.0}
    assert _axes((-25.0, 0.0, 0.0), ranges=perfil)[0] == 1.0
    assert _axes((15.0, 0.0, 0.0), ranges=perfil)[0] == -1.0

    # Um mesmo angulo absoluto em lados opostos produz MODULOS DIFERENTES.
    direita = _axes((-15.0, 0.0, 0.0), ranges=perfil)[0]
    esquerda = _axes((15.0, 0.0, 0.0), ranges=perfil)[0]
    assert abs(direita) != pytest.approx(abs(esquerda))
    assert abs(direita) < abs(esquerda)


def test_m26_perfil_ausente_degenerado_ou_parcial():
    """M26: perfil ausente/invalido/parcial cai para o padrao DAQUELA direcao."""
    assert resolve_ranges(None) == dict.fromkeys(("left", "right", "up", "down"), RANGE)

    # Degenerado: zero, negativo e fora dos limites de aceitacao.
    degenerado = {"left": 0.0, "right": -5.0, "up": 500.0, "down": 1.0}
    resolvido = resolve_ranges(degenerado)
    assert resolvido == dict.fromkeys(("left", "right", "up", "down"), RANGE)
    # E a conversao nao lanca nem divide por zero.
    x, y = _axes((-10.0, 10.0, 0.0), ranges=degenerado)
    assert -1.0 <= x <= 1.0
    assert -1.0 <= y <= 1.0

    # Parcial: as duas presentes valem, as outras duas usam o padrao.
    parcial = {"right": 30.0, "up": 12.0}
    assert resolve_ranges(parcial) == {
        "left": RANGE,
        "right": 30.0,
        "up": 12.0,
        "down": RANGE,
    }


def test_m27_desligamento_isolado_reproduz_o_comportamento_anterior():
    """M27 (F4.13, F15): frentes 1 e 2 desligadas reproduzem o modelo anterior.

    CONJUNTO DE AMOSTRAS DE REFERENCIA (documentado aqui, como pede M27):
    deflexoes de EIXO UNICO. Com zonas mortas iguais, alcances iguais e
    sensibilidades iguais, o modelo anterior (normalizacao radial sobre a
    hipotenusa dos dois eixos) e o atual (por eixo) coincidem exatamente para
    qualquer amostra de eixo unico, porque ali o raio E o proprio eixo.

    Amostras DIAGONAIS ficam fora do conjunto de referencia de proposito: a
    remocao da normalizacao radial e incondicional (nao tem interruptor - e a
    checagem estatica 7 de tooling.md), entao exigir coincidencia na diagonal
    seria exigir a volta do defeito que esta revisao remove.
    """
    dz = 2.0
    limite = 20.0
    perfil = dict.fromkeys(("left", "right", "up", "down"), limite)

    def modelo_anterior(yaw, pitch):
        """Reimplementacao do mapeamento pre-revisao (radial, fator fixo)."""
        import math

        magnitude = math.hypot(yaw, pitch)
        if magnitude <= dz:
            return (0.0, 0.0)
        normalizado = (magnitude - dz) / (limite - dz)
        escalado = math.sin(min(1.0, max(0.0, normalizado)) * math.pi / 2.0)
        return (
            min(1.0, max(-1.0, (yaw / magnitude) * escalado)),
            min(1.0, max(-1.0, (pitch / magnitude) * escalado)),
        )

    referencia = [(5.0, 0.0), (-5.0, 0.0), (12.5, 0.0), (0.0, 8.0), (0.0, -19.0)]
    for yaw, pitch in referencia:
        atual = pointing_to_axes(
            -yaw,
            pitch,
            0.0,
            ranges=perfil,
            dead_zone_yaw_deg=dz,
            dead_zone_pitch_deg=dz,
        )
        esperado = modelo_anterior(yaw, pitch)
        assert atual[0] == pytest.approx(esperado[0], abs=1e-9)
        assert atual[1] == pytest.approx(esperado[1], abs=1e-9)

    # Frente 2 desligada: o fator volta a ser o fixo de config.py.
    fixo = AdaptiveSmoother(adaptive=False)
    resultado = fixo.apply((1.0, 0.0), angles_deg=(50.0, 0.0), t_ms=0.0)
    assert resultado.alpha_x == config.SMOOTHING_ALPHA
    assert resultado.alpha_y == config.SMOOTHING_ALPHA


def test_m28_dt_hostil_no_filtro_adaptativo():
    """M28: t ausente, repetido, regredindo ou com salto nao quebra o filtro."""
    smoother = AdaptiveSmoother()
    hostis = [None, 0.0, 0.0, -500.0, 1e9, float("nan"), 16.7]
    for t in hostis:
        resultado = smoother.apply((0.5, -0.25), angles_deg=(10.0, -5.0), t_ms=t, arrival_ms=1234.0)
        assert resultado.axes[0] == resultado.axes[0], "NaN na saida do filtro"
        assert -1.0 <= resultado.axes[0] <= 1.0
        assert -1.0 <= resultado.axes[1] <= 1.0
        assert resultado.speed_x_dps >= 0.0

    # E o filtro nao CONGELA: com t hostil, uma entrada nova ainda move a saida.
    congelado = AdaptiveSmoother()
    congelado.apply((0.0, 0.0), angles_deg=(0.0, 0.0), t_ms=None, arrival_ms=0.0)
    movido = congelado.apply((1.0, 0.0), angles_deg=(20.0, 0.0), t_ms=None, arrival_ms=50.0)
    assert movido.axes[0] > 0.0


# ------------------------------------------------------------------ rumble


def test_m13_combinacao_de_motores():
    assert combine_rumble(0.0, 0.0) == 0.0
    assert combine_rumble(1.0, 1.0) == 1.0
    mid = combine_rumble(0.3, 0.6)
    assert 0.0 <= mid <= 1.0
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
    session = SessionState(spy, MetricsWindow(), smoothing_alpha=0.0, adaptive_smoothing=False)
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
    resultado = session.handle_calibrate(Calibrate())
    assert resultado.accepted
    assert session.calibration_offset == (0.0, 0.0, 0.0)
    session.handle_motion(Motion(a=0.0, b=0.0, g=0.0, t=1.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


def test_m16b_perfil_recebido_substitui_o_anterior_por_inteiro():
    """M16b: aplicar alcances A e depois B deixa valendo B, sem mistura."""
    session, _spy = _session()
    perfil_a = {"left": 12.0, "right": 13.0, "up": 14.0, "down": 15.0}
    perfil_b = {"left": 30.0, "right": 31.0, "up": 32.0, "down": 33.0}

    assert session.handle_calibrate(Calibrate(ranges=perfil_a)).accepted
    assert session.ranges == perfil_a
    assert session.handle_calibrate(Calibrate(ranges=perfil_b)).accepted
    assert session.ranges == perfil_b, "houve mistura entre os dois perfis"


def test_m16c_recalibrar_descarta_o_estado_do_filtro():
    """M16c: apos recalibrar, a primeira amostra na nova neutra da (0, 0).

    Sem arrasto da posicao anterior (invariante de SessionState).
    """
    spy = _AxisSpy()
    # Filtro FORTE de proposito: se o estado nao for descartado, o arrasto
    # aparece na primeira amostra.
    session = SessionState(spy, MetricsWindow(), smoothing_alpha=0.9, adaptive_smoothing=False)
    for t in range(20):
        session.handle_motion(Motion(a=-RANGE, b=0.0, g=0.0, t=float(t)))
    assert spy.axes[config.TILT_TARGET_AXIS][0] > 0.5  # mira deslocada

    session.handle_calibrate(Calibrate(center=(100.0, 5.0, 0.0)))
    session.handle_motion(Motion(a=100.0, b=5.0, g=0.0, t=100.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


def test_m15b_calibracao_absorve_o_zero_arbitrario_de_alpha():
    """F4/F5: a calibracao absorve o zero arbitrario de alpha do navegador."""
    session, spy = _session()
    session.handle_motion(Motion(a=237.0, b=3.0, g=-15.0, t=1.0))
    session.handle_calibrate(Calibrate())
    session.handle_motion(Motion(a=237.0, b=3.0, g=-15.0, t=2.0))
    assert spy.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)
    session.handle_motion(Motion(a=227.0, b=3.0, g=-15.0, t=3.0))
    assert spy.axes[config.TILT_TARGET_AXIS][0] > 0


def test_validacao_de_perfil_e_autoridade_do_servidor():
    """F12/KPI-14: perfil com direcao presente fora dos limites e REJEITADO.

    Direcao AUSENTE nao invalida (cai para o padrao) - e o caminho previsto
    para quando o usuario esgota as tentativas numa direcao (F12).
    """
    assert is_valid_range_profile({"left": 20.0, "right": 25.0, "up": 18.0, "down": 15.0})
    assert not is_valid_range_profile({"left": 2.0, "right": 25.0, "up": 18.0, "down": 15.0})
    assert not is_valid_range_profile({"left": 200.0, "right": 25.0, "up": 18.0, "down": 15.0})
    assert is_valid_range_profile({"right": 25.0, "up": 18.0})  # parcial: valido
    assert not is_valid_range_profile({})
    assert not is_valid_range_profile(None)

    # Rejeitado => o perfil ANTERIOR e mantido, com motivo (nunca em silencio).
    session, _spy = _session()
    bom = {"left": 20.0, "right": 25.0, "up": 18.0, "down": 15.0}
    session.handle_calibrate(Calibrate(ranges=bom))
    resultado = session.handle_calibrate(Calibrate(ranges={"left": 1.0}))
    assert not resultado.accepted
    assert resultado.reason
    assert session.ranges == bom, "perfil rejeitado alterou o estado da sessao"
