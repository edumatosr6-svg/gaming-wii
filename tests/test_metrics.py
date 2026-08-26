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
    await ws.send(json.dumps({"type": "motion", "b": 5, "g": 5, "t": 1}))
    await asyncio.sleep(0.1)

    def fetch() -> dict:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=5) as response:
            assert response.status == 200
            return json.loads(response.read())

    data = await asyncio.to_thread(fetch)
    for key in ("latency_ms_p50", "latency_ms_p95", "motion_rate_hz", "jitter_ms", "net_ms", "proc_ms"):
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
            await ws.send(json.dumps({"type": "motion", "b": 5, "g": float(i), "t": 1}))
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
        await ws.send(json.dumps({"type": "motion", "b": i, "g": 0, "t": i}))
    await asyncio.sleep(0.3)
    # sem leitura de /metrics: as únicas mensagens do servidor são ping (e o
    # hello já consumido) — nenhuma mensagem de medição por amostra
    received: list[str] = []
    try:
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=0.2)
            received.append(json.loads(raw)["type"])
    except (TimeoutError, asyncio.TimeoutError):
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
    assert snapshot["latency_ms_p50"] == pytest.approx(
        snapshot["net_ms"] + percentile(procs, 0.5)
    )
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
