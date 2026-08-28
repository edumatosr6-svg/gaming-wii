"""Testes de specs/wii-controller/tests/latency-and-kpis.md (L1–L4, KPI-2)."""

from __future__ import annotations

import asyncio
import json
import math
import statistics
import urllib.request

import pytest
import websockets

from server.metrics import MetricsWindow, percentile


async def _connect(port: int):
    return await websockets.connect(f"ws://127.0.0.1:{port}/ws")


async def test_l1_get_metrics(live_server):
    _app, port, _pad = live_server
    ws = await _connect(port)
    await asyncio.wait_for(ws.recv(), timeout=2)  # hello (sessão ativa)
    await ws.send(json.dumps({"type": "motion", "a": 5, "b": 5, "g": 5, "t": 1}))
    await asyncio.sleep(0.1)

    def fetch() -> dict:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=5) as response:
            assert response.status == 200
            return json.loads(response.read())

    data = await asyncio.to_thread(fetch)
    for key in (
        "latency_ms_p50",
        "latency_ms_p95",
        "motion_rate_hz",
        "jitter_ms",
        "net_ms",
        "proc_ms",
    ):
        assert key in data, f"campo {key} ausente em /metrics (F11.3)"
        assert isinstance(data[key], (int, float))
    await ws.close()


async def test_l2_taxa_de_amostras_kpi2(live_server):
    """KPI-2 (caminho automatizado): cliente simulado a 60 Hz → >= 50 Hz."""
    _app, port, _pad = live_server
    ws = await _connect(port)
    await asyncio.wait_for(ws.recv(), timeout=2)

    async def reply_pings() -> None:
        try:
            async for raw in ws:
                message = json.loads(raw)
                if message.get("type") == "ping":
                    await ws.send(json.dumps({"type": "pong", "t": message["t"]}))
        except websockets.ConnectionClosed:
            pass

    reader = asyncio.create_task(reply_pings())
    # 60 Hz em lotes de 6 a cada 100 ms (sleep fino é impreciso no Windows)
    for _ in range(20):  # 2 s
        for i in range(6):
            await ws.send(json.dumps({"type": "motion", "a": 5, "b": 5, "g": float(i), "t": 1}))
        await asyncio.sleep(0.1)

    def fetch() -> dict:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=5) as response:
            return json.loads(response.read())

    data = await asyncio.to_thread(fetch)
    assert data["motion_rate_hz"] >= 50, f"KPI-2 reprovado: {data['motion_rate_hz']:.1f} Hz"
    reader.cancel()
    await ws.close()


async def test_l3_custo_zero_com_overlay_desligado(live_server):
    """F11.2: processar `motion` não gera nenhuma mensagem adicional."""
    _app, port, _pad = live_server
    ws = await _connect(port)
    await asyncio.wait_for(ws.recv(), timeout=2)  # hello
    for i in range(30):
        await ws.send(json.dumps({"type": "motion", "a": 0, "b": i, "g": 0, "t": i}))
    await asyncio.sleep(0.3)
    # sem leitura de /metrics: as únicas mensagens do servidor são ping (e o
    # hello já consumido) — nenhuma mensagem de medição por amostra
    received: list[str] = []
    try:
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=0.2)
            received.append(json.loads(raw)["type"])
    except TimeoutError:
        pass
    assert set(received) <= {"ping"}, f"mensagens inesperadas no caminho crítico: {received}"
    await ws.close()


def test_l4_janela_de_latencia():
    """Composição definida em F11: latency = net (RTT/2 mediano) + proc."""
    window = MetricsWindow(window_size=64)
    rtts = [10.0, 12.0, 8.0, 10.0]  # net por amostra: 5, 6, 4, 5 → mediana 5
    procs = [1.0, 2.0, 3.0, 4.0]
    for rtt in rtts:
        window.record_rtt(rtt)
    for proc in procs:
        window.record_processing(proc)
    snapshot = window.snapshot()

    net_expected = percentile([r / 2 for r in rtts], 0.5)
    latencies = [net_expected + p for p in procs]
    assert snapshot["net_ms"] == pytest.approx(net_expected)
    assert snapshot["proc_ms"] == pytest.approx(percentile(procs, 0.5))
    assert snapshot["latency_ms_p50"] == pytest.approx(percentile(latencies, 0.5))
    assert snapshot["latency_ms_p95"] == pytest.approx(percentile(latencies, 0.95))
    expected_jitter = statistics.pstdev(latencies)
    assert snapshot["jitter_ms"] == pytest.approx(expected_jitter)
    # latency_ms_* ≈ net + proc na mesma janela
    assert snapshot["latency_ms_p50"] == pytest.approx(snapshot["net_ms"] + percentile(procs, 0.5))
    assert math.isfinite(snapshot["latency_ms_p95"])


def test_percentile_basico():
    assert percentile([], 0.5) == 0.0
    assert percentile([7.0], 0.95) == 7.0
    assert percentile([1.0, 2.0, 3.0], 0.5) == 2.0


# ------------------------------------------------------ manuais / hardware

hardware = pytest.mark.hardware


@hardware
def test_l5_latencia_fim_a_fim_kpi1_manual():
    pytest.skip("Procedimento manual L5 (KPI-1): p95 < 30 ms no overlay")


@hardware
def test_l6_taxa_real_kpi2_manual():
    pytest.skip("Procedimento manual L6 (KPI-2): >= 50 Hz sustentado 2 min")


@hardware
def test_l7_jitter_kpi3_manual():
    pytest.skip("Procedimento manual L7 (KPI-3): jitter < 10 ms")


@hardware
def test_l8_deriva_do_centro_kpi4_manual():
    pytest.skip("Procedimento manual L8 (KPI-4): deriva em 15 min")


@hardware
def test_l9_estabilidade_da_mira_kpi7_manual():
    pytest.skip("Procedimento manual L9 (KPI-7): tremor < raio da hitbox")


@hardware
def test_l10_modo_diagnostico_direto_manual():
    pytest.skip("Procedimento manual L10: --direct-metrics decompõe a latência")


@hardware
def test_l11_bateria_kpi10_manual():
    pytest.skip("Procedimento manual L11 (KPI-10): %/h em 1 h de sessão")


@hardware
def test_l12_taxa_de_acerto_comparativa_manual():
    pytest.skip("Procedimento manual L12: comparação entre versões")


# ---- manuais da revisão de precisão (L13–L17) ------------------------------
# Cada um declara o que o operador deve OBSERVAR, não só o que executar: um
# procedimento sem critério observável não é capaz de reprovar nada. Estes
# ficam fora da execução padrão e NÃO contam como cobertura — o testing-report
# precisa dizer explicitamente que seguem por verificar.


@hardware
def test_l13_simetria_de_precisao_entre_eixos_kpi19_manual():
    """L13 (KPI-19) — a assimetria REAL do sensor, que M23 não alcança.

    M23 prova que o processamento não introduz assimetria; só o aparelho diz se
    o sensor tem.

    Executar: com o aparelho calibrado e apoiado imóvel, registrar `tremor_x` e
    `tremor_y` do overlay por 60 s; depois, com um alvo estático, medir o erro
    de apontamento numa sequência de alvos HORIZONTAIS e outra de VERTICAIS.

    Observar: razão entre `tremor_x` e `tremor_y` <= 2.0 E os erros dos dois
    eixos na mesma ordem de grandeza. Um bom resultado "na média dos dois
    eixos" NÃO aprova — o eixo pior é o que decide.
    """
    pytest.skip("Procedimento manual L13 (KPI-19): simetria de precisão no aparelho")


@hardware
def test_l14_ganho_da_calibracao_guiada_kpi20_manual():
    """L14 (KPI-20) — o assistente serve para gente de pulso diferente?

    Executar: com DUAS pessoas de alcance de pulso visivelmente diferente, cada
    uma joga uma rodada (a) com os alcances padrão e (b) após concluir o
    assistente.

    Observar: após o assistente, ambas alcançam 4/4 bordas e 4/4 cantos sem
    contorção, e nenhuma precisou editar constante de configuração. Registrar
    qual das duas condições a pessoa prefere.
    """
    pytest.skip("Procedimento manual L14 (KPI-20): ganho da calibração guiada")


@hardware
def test_l15_custo_de_entrada_do_assistente_kpi21_manual():
    """L15 (KPI-21) — o assistente é a primeira coisa entre o usuário e o jogo.

    Executar: cronometrar, com pessoa que nunca usou o assistente, do início da
    primeira etapa até o retorno ao estado `conectado`.

    Observar: menos de 30 s. Registrar TAMBÉM quantas etapas exigiram
    repetição — muita repetição indica critério de estabilidade apertado demais
    para a mão real (a parte configurada do orçamento é o L18/PC11b, já
    automatizado).
    """
    pytest.skip("Procedimento manual L15 (KPI-21): < 30 s com pessoa real")


@hardware
def test_l16_melhoria_medida_da_deriva_kpi22_manual():
    """L16 (KPI-22) — é ESTE o critério de aceite da frente 4, e ele é medido.

    Executar: repetir o L8 duas vezes na mesma sessão, no mesmo lugar e com o
    mesmo aparelho: (a) `?src=deviceorientation` e (b) `?src=fusion_mag`.
    Opcionalmente repetir com `?magreject=off` para separar o ganho da fusão do
    ganho da rejeição.

    Observar: a deriva horizontal em graus de (b) é ESTRITAMENTE MENOR que a de
    (a). Se (b) não for melhor, a frente 4 reprova — não se intui esse ganho.
    """
    pytest.skip("Procedimento manual L16 (KPI-22): deriva de fusion_mag < deviceorientation")


@hardware
def test_l17_interferencia_provocada_kpi24_manual():
    """L17 (KPI-24) — confirmação no hardware do que PC12 mede em sintético.

    Executar: aproximar o aparelho de uma fonte de interferência real (gabinete
    do PC, monitor, fonte).

    Observar: o indicador de rejeição magnética ACENDE e a mira NÃO é puxada
    para o lado enquanto ele estiver aceso. O gate automatizado é o PC12; este
    caso confirma que a faixa de rejeição escolhida corresponde à interferência
    do mundo real.
    """
    pytest.skip("Procedimento manual L17 (KPI-24): interferência real acende o indicador")
