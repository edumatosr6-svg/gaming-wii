"""Testes de specs/wii-controller/tests/protocol.md (P1–P12)."""

from __future__ import annotations

import asyncio
import json
import time

import pytest
import websockets

from server import config
from server.protocol import (
    Button,
    Calibrate,
    Motion,
    Pong,
    parse_message,
)

# ---------------------------------------------------------------- unitários


def test_p1_mensagens_validas():
    assert parse_message('{"type":"motion","b":1.5,"g":-2.0,"t":123.0}') == Motion(1.5, -2.0, 123.0)
    assert parse_message('{"type":"button","id":"a","down":true}') == Button("a", True)
    assert parse_message('{"type":"calibrate"}') == Calibrate()
    assert parse_message('{"type":"pong","t":9.0}') == Pong(9.0)


def test_p2_json_invalido():
    for raw in ("not json", "{", "", b"\xff\xfe garbage"):
        assert parse_message(raw) is None


def test_p3_type_desconhecido():
    assert parse_message('{"type":"warp","x":1}') is None
    assert parse_message('{"no_type":true}') is None
    assert parse_message("[1,2,3]") is None


def test_p4_campos_ausentes():
    assert parse_message('{"type":"motion","g":1,"t":2}') is None
    assert parse_message('{"type":"motion","b":1,"t":2}') is None
    assert parse_message('{"type":"motion","b":1,"g":2}') is None
    assert parse_message('{"type":"button","down":true}') is None
    assert parse_message('{"type":"button","id":"a"}') is None
    assert parse_message('{"type":"pong"}') is None


def test_p5_tipos_errados():
    assert parse_message('{"type":"motion","b":"x","g":1,"t":2}') is None
    assert parse_message('{"type":"motion","b":null,"g":1,"t":2}') is None
    assert parse_message('{"type":"button","id":"a","down":1}') is None
    assert parse_message('{"type":"button","id":5,"down":true}') is None
    assert parse_message('{"type":"motion","b":true,"g":1,"t":2}') is None


def test_p6_button_id_fora_do_enum():
    for bad_id in ("lt", "", "A", "ç", "aa", "select"):
        assert parse_message(json.dumps({"type": "button", "id": bad_id, "down": True})) is None


def test_p7_payload_gigante():
    huge = '{"type":"motion","b":1,"g":2,"t":3,"pad":"' + "x" * (1024 * 1024) + '"}'
    assert parse_message(huge) is None


def test_w3_formato_das_mensagens_do_cliente():
    """W3 (client-controller.md): mensagens geradas pelo cliente validam aqui.

    Espelha exatamente os objetos construídos por web/js/motion.js
    (buildMotionMessage) e web/js/controls.js (buildButtonMessage).
    """
    client_motion = {"type": "motion", "b": 12.5, "g": -3.0, "t": 1000.0}
    client_button = {"type": "button", "id": "lb", "down": False}
    assert parse_message(json.dumps(client_motion)) == Motion(12.5, -3.0, 1000.0)
    assert parse_message(json.dumps(client_button)) == Button("lb", False)


# ------------------------------------------------- integração em loopback


async def _connect(port: int):
    return await websockets.connect(f"ws://127.0.0.1:{port}/ws")


async def _recv_hello(ws) -> dict:
    message = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
    assert message["type"] == "hello"
    return message


async def test_p8_handshake(live_server):
    _app, port, _pad = live_server
    async with await _connect(port) as ws:
        hello = await _recv_hello(ws)
        assert isinstance(hello["session_id"], str) and hello["session_id"]
        assert isinstance(hello["server_version"], str) and hello["server_version"]


async def test_p9_corpus_de_fuzzing(live_server):
    _app, port, pad = live_server
    malformed = [
        "garbage",
        "{",
        "[]",
        "null",
        '{"type":"motion"}',
        '{"type":"button","id":"zz","down":true}',
        '{"type":"motion","b":"NaN","g":null,"t":[]}',
        '{"type":"vibrate","intensity":true}',
        json.dumps({"type": "x" * 500}),
        '{"type":"pong","t":"later"}',
    ]
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        for i in range(100):
            await ws.send(malformed[i % len(malformed)])
            if i % 10 == 0:  # intercala válidas
                await ws.send(json.dumps({"type": "button", "id": "a", "down": True}))
                await ws.send(json.dumps({"type": "button", "id": "a", "down": False}))
        await ws.send(json.dumps({"type": "motion", "b": config.MAX_ANGLE_DEG, "g": 0, "t": 1}))
        await asyncio.sleep(0.2)
        # servidor vivo e processando as válidas (KPI-9: 0 crashes)
        assert pad.axes[config.TILT_TARGET_AXIS][1] != 0.0
    # nova conexão continua funcionando
    async with await _connect(port) as ws2:
        await _recv_hello(ws2)


async def test_p10_fluxo_motion_estado(live_server):
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "motion", "b": 0, "g": config.MAX_ANGLE_DEG, "t": 1}))
        await asyncio.sleep(0.15)
        x, y = pad.axes[config.TILT_TARGET_AXIS]
        assert x == pytest.approx(1.0)
        assert y == pytest.approx(0.0)


async def test_p11_fluxo_button_estado(live_server):
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "button", "id": "a", "down": True}))
        await asyncio.sleep(0.1)
        assert pad.buttons["a"] is True
        await ws.send(json.dumps({"type": "button", "id": "a", "down": False}))
        await asyncio.sleep(0.1)
        assert pad.buttons["a"] is False


async def test_p12_vibrate_saindo(live_server):
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        start = time.monotonic()
        pad.trigger_rumble(0.5, 0.8)
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
            message = json.loads(raw)
            if message["type"] == "vibrate":
                break
        elapsed_ms = (time.monotonic() - start) * 1000
        assert elapsed_ms <= 100, f"vibrate demorou {elapsed_ms:.0f} ms (F8.1: <= 100 ms)"
        assert message["intensity"] == pytest.approx(0.8)
        assert message["duration_ms"] > 0
