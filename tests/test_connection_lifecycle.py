"""Testes de specs/wii-controller/tests/connection-lifecycle.md (C1–C10)."""

from __future__ import annotations

import asyncio
import json
import ssl
import time
import urllib.request

import pytest
import websockets

from server import config
from server.main import main as server_main
from server.tls import ensure_certificate


async def _connect(port: int):
    return await websockets.connect(f"ws://127.0.0.1:{port}/ws")


async def _hello(ws) -> dict:
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=2))


async def _activate_inputs(ws) -> None:
    # Ponta girada ao maximo para a direita (alpha negativo): eixo horizontal
    # saturado na pegada vertical (F4.6).
    await ws.send(
        json.dumps({"type": "motion", "a": -config.MAX_ANGLE_DEG, "b": 0, "g": 0, "t": 1})
    )
    await ws.send(json.dumps({"type": "button", "id": "a", "down": True}))
    await asyncio.sleep(0.15)


async def _wait_zeroed(pad, budget_s: float) -> float:
    """Espera o gamepad zerar; devolve o tempo decorrido (s)."""
    start = time.monotonic()
    while time.monotonic() - start < budget_s:
        if pad.is_zeroed() and pad.reset_calls > 0:
            return time.monotonic() - start
        await asyncio.sleep(0.005)
    raise AssertionError(f"gamepad não zerou em {budget_s}s")


async def test_c1_zeragem_na_desconexao_abrupta(live_server):
    _app, port, pad = live_server
    ws = await _connect(port)
    await _hello(ws)
    await _activate_inputs(ws)
    assert pad.axes[config.TILT_TARGET_AXIS] != (0.0, 0.0)
    assert pad.buttons["a"] is True
    # fechamento abrupto: aborta o transporte sem close frame
    transport = getattr(ws, "transport", None)
    if transport is not None:
        transport.abort()
    else:  # fallback improvável
        await ws.close()
    elapsed = await _wait_zeroed(pad, 1.0)
    assert elapsed <= 0.250, f"zeragem levou {elapsed * 1000:.0f} ms (KPI-6: <= 250 ms)"


async def test_c2_zeragem_no_fechamento_limpo(live_server):
    _app, port, pad = live_server
    ws = await _connect(port)
    await _hello(ws)
    await _activate_inputs(ws)
    await ws.close()
    elapsed = await _wait_zeroed(pad, 1.0)
    assert elapsed <= 0.250


async def test_c3_timeout_de_ping_pong(live_server):
    _app, port, pad = live_server
    # Cliente que nunca responde pong (só lê): a detecção deve ocorrer <= 3 s
    ws = await _connect(port)
    await _hello(ws)
    await _activate_inputs(ws)
    start = time.monotonic()

    async def drain() -> None:
        try:
            async for _ in ws:
                pass  # lê pings sem responder
        except websockets.ConnectionClosed:
            pass

    drain_task = asyncio.create_task(drain())
    await _wait_zeroed(pad, 4.0)
    detection = time.monotonic() - start
    assert detection <= 3.0, f"detecção levou {detection:.2f}s (F9.2: <= 3 s)"
    drain_task.cancel()


async def test_c4_reconexao_restabelece_input(live_server):
    _app, port, pad = live_server
    ws1 = await _connect(port)
    first = await _hello(ws1)
    await ws1.close()
    await asyncio.sleep(0.1)
    ws2 = await _connect(port)
    second = await _hello(ws2)
    assert second["session_id"] != first["session_id"]
    await _activate_inputs(ws2)
    assert pad.axes[config.TILT_TARGET_AXIS][0] == pytest.approx(1.0)
    assert pad.buttons["a"] is True
    await ws2.close()


async def test_c5_calibracao_nao_residual(live_server):
    _app, port, pad = live_server
    ws1 = await _connect(port)
    await _hello(ws1)
    await ws1.send(json.dumps({"type": "motion", "a": 0.0, "b": 20.0, "g": 0.0, "t": 1}))
    await asyncio.sleep(0.1)
    await ws1.send(json.dumps({"type": "calibrate"}))
    await asyncio.sleep(0.1)
    await ws1.close()
    await asyncio.sleep(0.1)
    # nova sessão sem calibrar: offset padrão (nulo)
    ws2 = await _connect(port)
    await _hello(ws2)
    await ws2.send(json.dumps({"type": "motion", "a": 0.0, "b": 20.0, "g": 0.0, "t": 2}))
    await asyncio.sleep(0.15)
    _x, y = pad.axes[config.TILT_TARGET_AXIS]
    assert y > 0.0, "offset da sessão anterior vazou para a nova sessão"
    await ws2.close()


async def test_c6_inicio_do_servidor(fake_gamepad, capsys, tmp_path):
    from server.main import App, print_urls, run_server

    # fingerprint do certificado estável entre execuções consecutivas (F1.2)
    cert_a, _ = ensure_certificate()
    first = cert_a.read_bytes()
    cert_b, _ = ensure_certificate()
    assert cert_b.read_bytes() == first

    app = App(fake_gamepad)
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    server = await run_server(app, port, use_tls=True)
    try:
        print_urls(port)
        output = capsys.readouterr().out
        assert str(port) in output
        assert "https://" in output
        assert any(ch.isdigit() for ch in output.split("https://")[1].split(":")[0])

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        def fetch(path: str) -> int:
            with urllib.request.urlopen(
                f"https://127.0.0.1:{port}{path}", context=ctx, timeout=5
            ) as response:
                return response.status

        assert await asyncio.to_thread(fetch, "/") == 200
        assert await asyncio.to_thread(fetch, "/game/") == 200
    finally:
        server.close()
        await server.wait_closed()


def test_c7_driver_ausente(monkeypatch, capsys):
    from server.gamepad.base import GamepadUnavailableError

    def boom() -> None:
        raise GamepadUnavailableError(
            "Driver ViGEmBus não encontrado. Instale em "
            "https://github.com/nefarius/ViGEmBus/releases"
        )

    monkeypatch.setattr("server.main.select_gamepad", boom)
    exit_code = server_main([])
    err = capsys.readouterr().err
    assert exit_code != 0
    assert "ViGEmBus" in err
    assert "https://" in err


# ------------------------------------------------------ manuais / hardware


@pytest.mark.hardware
def test_c8_estado_visivel_no_celular_manual():
    pytest.skip("Procedimento manual C8: derrubar Wi-Fi e verificar UI 'desconectado'")


@pytest.mark.hardware
def test_c9_tempo_de_reconexao_kpi5_manual():
    pytest.skip("Procedimento manual C9 (KPI-5): cronometrar reconexão < 15 s")


@pytest.mark.hardware
def test_c10_estabilidade_de_sessao_kpi11_manual():
    pytest.skip("Procedimento manual C10 (KPI-11): 30 min de sessão sem queda")
