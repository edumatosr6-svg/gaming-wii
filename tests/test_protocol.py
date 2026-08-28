"""Testes de specs/wii-controller/tests/protocol.md (P1–P18)."""

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
    Status,
    parse_message,
)

# ---------------------------------------------------------------- unitários


def test_p1_mensagens_validas():
    assert parse_message('{"type":"motion","a":10.0,"b":1.5,"g":-2.0,"t":123.0}') == Motion(
        10.0, 1.5, -2.0, 123.0
    )
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
    assert parse_message('{"type":"motion","a":0,"g":1,"t":2}') is None
    assert parse_message('{"type":"motion","a":0,"b":1,"t":2}') is None
    assert parse_message('{"type":"motion","a":0,"b":1,"g":2}') is None
    assert parse_message('{"type":"button","down":true}') is None
    assert parse_message('{"type":"button","id":"a"}') is None
    assert parse_message('{"type":"pong"}') is None


def test_p4_motion_sem_o_campo_a_e_descartado():
    """P4 (excecao documentada): `a: null` e VALIDO, mas `a` AUSENTE e descartado.

    A distincao importa: `a: null` e a fonte declarando que nao tem yaw; `a`
    ausente e mensagem malformada. Tratar as duas igual faria um cliente
    quebrado passar por sensor sem magnetometro.
    """
    assert parse_message('{"type":"motion","a":null,"b":1,"g":2,"t":3}') == Motion(
        None, 1.0, 2.0, 3.0
    )
    assert parse_message('{"type":"motion","b":1,"g":2,"t":3}') is None


def test_p4b_motion_nao_carrega_sensor_cru():
    """P4b (F14.8): o schema do `motion` e FECHADO nos cinco campos.

    Nenhuma leitura crua de sensor trafega no protocolo: a fusao acontece no
    cliente justamente para caber em tres angulos. Aceitar campos extras
    abriria a porta para o caminho quente engordar em silencio.
    """
    valida = '{"type":"motion","a":0,"b":1,"g":2,"t":3}'
    assert parse_message(valida) is not None
    for extra in ('"acc":{"x":0,"y":0,"z":1}', '"mag":{"x":1,"y":2,"z":3}', '"gyro":[1,2,3]'):
        crua = '{"type":"motion","a":0,"b":1,"g":2,"t":3,' + extra + "}"
        assert parse_message(crua) is None, f"sensor cru aceito no motion: {extra}"


def test_p5_tipos_errados():
    assert parse_message('{"type":"motion","a":0,"b":"x","g":1,"t":2}') is None
    assert parse_message('{"type":"motion","a":0,"b":null,"g":1,"t":2}') is None
    # `a` com tipo errado degrada para None (nao derruba a amostra): o eixo
    # horizontal fica neutro e o vertical continua funcional (M8b/F4.4).
    degradada = parse_message('{"type":"motion","a":"x","b":1,"g":2,"t":3}')
    assert degradada == Motion(None, 1.0, 2.0, 3.0)
    assert parse_message('{"type":"button","id":"a","down":1}') is None
    assert parse_message('{"type":"button","id":5,"down":true}') is None
    assert parse_message('{"type":"motion","a":0,"b":true,"g":1,"t":2}') is None


def test_p6_button_id_fora_do_enum():
    for bad_id in ("lt", "", "A", "ç", "aa", "select"):
        assert parse_message(json.dumps({"type": "button", "id": bad_id, "down": True})) is None


def test_p7_payload_gigante():
    huge = '{"type":"motion","a":0,"b":1,"g":2,"t":3,"pad":"' + "x" * (1024 * 1024) + '"}'
    assert parse_message(huge) is None


def test_w3_formato_das_mensagens_do_cliente():
    """W3 (client-controller.md): mensagens geradas pelo cliente validam aqui.

    Espelha exatamente os objetos construídos por web/js/motion.js
    (buildMotionMessage) e web/js/controls.js (buildButtonMessage).
    """
    client_motion = {"type": "motion", "a": 137.0, "b": 12.5, "g": -3.0, "t": 1000.0}
    client_button = {"type": "button", "id": "lb", "down": False}
    assert parse_message(json.dumps(client_motion)) == Motion(137.0, 12.5, -3.0, 1000.0)
    assert parse_message(json.dumps(client_button)) == Button("lb", False)

    # `a: null` e valido (sensor sem yaw) - excecao documentada em P4.
    sem_alpha = {"type": "motion", "a": None, "b": 12.5, "g": -3.0, "t": 1000.0}
    assert parse_message(json.dumps(sem_alpha)) == Motion(None, 12.5, -3.0, 1000.0)


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
        await ws.send(
            json.dumps({"type": "motion", "a": 0, "b": config.DEFAULT_RANGE_DEG, "g": 0, "t": 1})
        )
        await asyncio.sleep(0.2)
        # servidor vivo e processando as válidas (KPI-9: 0 crashes)
        assert pad.axes[config.TILT_TARGET_AXIS][1] != 0.0
    # nova conexão continua funcionando
    async with await _connect(port) as ws2:
        await _recv_hello(ws2)


async def test_p10_fluxo_motion_estado(live_server):
    """P10: motion (a, b, g, t) vira posicao apontada absoluta no gamepad fake.

    Fio de ponta a ponta sem driver real: ponta girada ao maximo para a
    DIREITA (alpha negativo) satura o eixo horizontal em +1.0, e a rolagem
    (g) nao interfere (F4.6/F4.7).
    """
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(
            json.dumps(
                {"type": "motion", "a": -config.DEFAULT_RANGE_DEG, "b": 0, "g": 45.0, "t": 1}
            )
        )
        await asyncio.sleep(0.15)
        x, y = pad.axes[config.TILT_TARGET_AXIS]
        assert x == pytest.approx(1.0)
        assert y == pytest.approx(0.0)

        # Levantar a ponta leva o eixo vertical ao maximo (y positivo = cima).
        # A sessao aplica a suavizacao padrao, entao o degrau e alimentado com
        # amostras a 60 Hz como faz o cliente real (orcamento do KPI-17: 90%
        # do valor final em <= 6 amostras).
        for i in range(6):
            await ws.send(
                json.dumps(
                    {"type": "motion", "a": 0, "b": config.DEFAULT_RANGE_DEG, "g": 0, "t": 2 + i}
                )
            )
        await asyncio.sleep(0.2)
        x2, y2 = pad.axes[config.TILT_TARGET_AXIS]
        assert y2 >= 0.9, f"eixo vertical nao respondeu ao degrau: {y2}"
        assert x2 == pytest.approx(0.0, abs=0.05)


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


# ---------------------- perfil de calibração e status [F5, F12, F13, F14]


async def _recv_tipo(ws, tipo: str, timeout: float = 1.0) -> dict:
    """Consome mensagens até chegar a do tipo pedido (ping/pong intercalam)."""
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        message = json.loads(raw)
        if message["type"] == tipo:
            return message


PERFIL_VALIDO = {"left": 15.0, "right": 25.0, "up": 18.0, "down": 12.0}


async def test_p13_calibrate_com_payload_aplica_o_perfil(live_server):
    """P13: centro + quatro alcances passam a valer imediatamente."""
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(
            json.dumps(
                {
                    "type": "calibrate",
                    "center": {"a": 100.0, "b": 10.0, "g": 0.0},
                    "ranges": PERFIL_VALIDO,
                }
            )
        )
        resposta = await _recv_tipo(ws, "calibration_applied")
        assert resposta["accepted"] is True
        assert resposta["effective"]["ranges"] == PERFIL_VALIDO
        assert resposta["effective"]["has_center"] is True

        # A `motion` seguinte usa o novo offset: no centro calibrado, (0, 0).
        await ws.send(json.dumps({"type": "motion", "a": 100.0, "b": 10.0, "g": 0.0, "t": 1}))
        await asyncio.sleep(0.15)
        assert pad.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)

        # E os QUATRO alcances sao distintos de ponta a ponta: +25 satura a
        # direita, e -15 (o alcance da esquerda) satura a esquerda.
        await ws.send(json.dumps({"type": "motion", "a": 75.0, "b": 10.0, "g": 0.0, "t": 2}))
        await asyncio.sleep(0.15)
        assert pad.axes[config.TILT_TARGET_AXIS][0] == pytest.approx(1.0)
        await ws.send(json.dumps({"type": "motion", "a": 115.0, "b": 10.0, "g": 0.0, "t": 3}))
        await asyncio.sleep(0.15)
        assert pad.axes[config.TILT_TARGET_AXIS][0] == pytest.approx(-1.0)


async def test_p14_perfil_invalido_rejeitado_com_motivo(live_server):
    """P14 (KPI-14): perfil degenerado é recusado COM MOTIVO e o anterior fica.

    Nunca aceito em silêncio — aceitar calado é o modo de falha que trava a
    mira e some sem deixar rastro.
    """
    _app, port, _pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "calibrate", "ranges": PERFIL_VALIDO}))
        assert (await _recv_tipo(ws, "calibration_applied"))["accepted"] is True

        invalidos = [
            {"left": 1.0, "right": 25.0, "up": 18.0, "down": 12.0},  # abaixo do minimo
            {"left": 200.0, "right": 25.0, "up": 18.0, "down": 12.0},  # acima do maximo
            {"left": 0.0, "right": 25.0, "up": 18.0, "down": 12.0},  # zero
            {"left": -5.0, "right": 25.0, "up": 18.0, "down": 12.0},  # negativo
            {"left": "x", "right": 25.0, "up": 18.0, "down": 12.0},  # string
        ]
        for ruim in invalidos:
            await ws.send(json.dumps({"type": "calibrate", "ranges": ruim}))
            resposta = await _recv_tipo(ws, "calibration_applied")
            assert resposta["accepted"] is False, f"perfil aceito indevidamente: {ruim}"
            assert resposta["reason"], "rejeicao sem motivo (KPI-14)"
            # O perfil ANTERIOR permanece valendo.
            assert resposta["effective"]["ranges"] == PERFIL_VALIDO

        # E o servidor continua vivo e processando.
        await ws.send(json.dumps({"type": "button", "id": "a", "down": True}))
        await asyncio.sleep(0.1)


async def test_p15_calibrate_sem_payload_caminho_degradado(live_server):
    """P15 (F5.3): sem payload, zera na última `motion` e usa o alcance padrão."""
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "motion", "a": 42.0, "b": 7.0, "g": 3.0, "t": 1}))
        await asyncio.sleep(0.1)
        await ws.send(json.dumps({"type": "calibrate"}))
        resposta = await _recv_tipo(ws, "calibration_applied")
        assert resposta["accepted"] is True
        padrao = config.DEFAULT_RANGE_DEG
        assert resposta["effective"]["ranges"] == {
            "left": padrao,
            "right": padrao,
            "up": padrao,
            "down": padrao,
        }
        await ws.send(json.dumps({"type": "motion", "a": 42.0, "b": 7.0, "g": 3.0, "t": 2}))
        await asyncio.sleep(0.15)
        assert pad.axes[config.TILT_TARGET_AXIS] == (0.0, 0.0)


async def test_p16_so_ranges_na_reconexao(live_server):
    """P16 (P3.4): `ranges` sem `center` aplica alcances sem definir centro."""
    _app, port, _pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "calibrate", "ranges": PERFIL_VALIDO, "center": None}))
        resposta = await _recv_tipo(ws, "calibration_applied")
        assert resposta["accepted"] is True
        assert resposta["effective"]["ranges"] == PERFIL_VALIDO
        assert resposta["effective"]["has_center"] is False


async def test_p17_status_registrado_e_exposto(live_server):
    """P17 (F13.6): `status` válido chega ao estado da sessão e a GET /metrics."""
    app, port, _pad = live_server
    async with await _connect(port) as ws:
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "status", "source": "fusion_mag", "mag_rejected": True}))
        await asyncio.sleep(0.15)
        snapshot = app.metrics.snapshot()
        assert snapshot["source"] == "fusion_mag"
        assert snapshot["mag_rejected"] is True

        # Enum FECHADO: os quatro degraus + a fonte de diagnóstico.
        for fonte in ("fusion_mag", "fusion_nomag", "sensor_api", "deviceorientation", "synthetic"):
            assert parse_message(
                json.dumps({"type": "status", "source": fonte, "mag_rejected": False})
            ) == Status(source=fonte, mag_rejected=False)
        for ruim in ("inventada", "", "FUSION_MAG", 3, None):
            assert (
                parse_message(json.dumps({"type": "status", "source": ruim, "mag_rejected": False}))
                is None
            )
        assert parse_message('{"type":"status","source":"fusion_mag","mag_rejected":"sim"}') is None

        # Um `status` inválido não derruba a conexão.
        await ws.send(json.dumps({"type": "status", "source": "inventada", "mag_rejected": False}))
        await asyncio.sleep(0.1)
        await ws.send(json.dumps({"type": "button", "id": "b", "down": True}))
        await asyncio.sleep(0.1)


async def test_p18_ordem_hostil(live_server):
    """P18: motion antes de calibrate, calibrate duplicado e status antes de tudo."""
    _app, port, pad = live_server
    async with await _connect(port) as ws:
        # `status` como primeira mensagem do cliente, antes de qualquer motion.
        await ws.send(json.dumps({"type": "status", "source": "synthetic", "mag_rejected": False}))
        await _recv_hello(ws)
        await ws.send(json.dumps({"type": "motion", "a": 5.0, "b": 5.0, "g": 0.0, "t": 1}))
        await asyncio.sleep(0.1)
        for _ in range(2):
            await ws.send(json.dumps({"type": "calibrate", "ranges": PERFIL_VALIDO}))
            assert (await _recv_tipo(ws, "calibration_applied"))["accepted"] is True
        await ws.send(json.dumps({"type": "motion", "a": 5.0, "b": 5.0, "g": 0.0, "t": 2}))
        await asyncio.sleep(0.15)
        x, y = pad.axes[config.TILT_TARGET_AXIS]
        assert -1.0 <= x <= 1.0
        assert -1.0 <= y <= 1.0
