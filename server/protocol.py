"""Schema e validação das mensagens do protocolo WebSocket (JSON).

Tabela de mensagens (software-specs.md, Data Models):

| type        | direção            | campos                                        |
|-------------|--------------------|-----------------------------------------------|
| `hello`     | servidor→cliente   | `session_id: str`, `server_version: str`      |
| `motion`    | cliente→servidor   | `a: float|null`, `b: float`, `g: float`, `t: float` |
| `button`    | cliente→servidor   | `id: str` (enum), `down: bool`                |
| `calibrate` | cliente→servidor   | —                                             |
| `vibrate`   | servidor→cliente   | `intensity: float [0..1]`, `duration_ms: int` |
| `ping`/`pong` | ambos            | `t: float`                                    |

Invariante: mensagens desconhecidas/inválidas são descartadas sem exceção
propagada (F1.4, KPI-9). O parsing devolve ``None`` no descarte.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

from server import config

SERVER_VERSION = "0.1.0"

BUTTON_IDS: frozenset[str] = frozenset(
    {"a", "b", "x", "y", "up", "down", "left", "right", "lb", "rb", "start", "back"}
)


@dataclass(frozen=True)
class Motion:
    """Amostra de orientação (graus) com timestamp do cliente (ms).

    ``a`` (alpha/yaw) pode ser ``None`` quando o sensor não reporta yaw — os
    três ângulos são necessários para derivar a direção da ponta na pegada
    vertical (F4), e a ausência de alpha degrada o eixo horizontal (M8b).
    """

    a: float | None
    b: float
    g: float
    t: float


@dataclass(frozen=True)
class Button:
    """Transição de botão: ``down=True`` pressionar, ``False`` soltar."""

    id: str
    down: bool


@dataclass(frozen=True)
class Calibrate:
    """Pedido de calibração de centro (sem campos)."""


@dataclass(frozen=True)
class Pong:
    """Resposta ao ping do servidor; ``t`` é o timestamp ecoado."""

    t: float


@dataclass(frozen=True)
class Ping:
    """Ping vindo do cliente (eco simétrico)."""

    t: float


Message = Motion | Button | Calibrate | Pong | Ping


def _as_float(value: object) -> float | None:
    """Converte para float finito; devolve None para qualquer coisa inválida."""
    if isinstance(value, bool):  # bool é subclasse de int — rejeitar
        return None
    if not isinstance(value, (int, float)):
        return None
    result = float(value)
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def parse_message(raw: str | bytes) -> Message | None:
    """Faz o parse de um payload bruto do WebSocket.

    Devolve a mensagem tipada ou ``None`` quando o payload deve ser descartado
    (JSON inválido, tipo desconhecido, campos ausentes ou com tipo errado,
    payload de tamanho anômalo). Nunca levanta exceção para entrada ruim.
    """
    try:
        if isinstance(raw, bytes):
            if len(raw) > config.MAX_MESSAGE_BYTES:
                return None
            raw = raw.decode("utf-8")
        if len(raw) > config.MAX_MESSAGE_BYTES:
            return None
        data = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None

    if not isinstance(data, dict):
        return None

    msg_type = data.get("type")
    if msg_type == "motion":
        # `a` é opcional/anulável (sensor sem yaw — F4/M8b); valor inválido
        # degrada para None em vez de descartar a amostra inteira.
        a = _as_float(data.get("a"))
        b = _as_float(data.get("b"))
        g = _as_float(data.get("g"))
        t = _as_float(data.get("t"))
        if b is None or g is None or t is None:
            return None
        return Motion(a=a, b=b, g=g, t=t)

    if msg_type == "button":
        button_id = data.get("id")
        down = data.get("down")
        if not isinstance(button_id, str) or button_id not in BUTTON_IDS:
            return None
        if not isinstance(down, bool):
            return None
        return Button(id=button_id, down=down)

    if msg_type == "calibrate":
        return Calibrate()

    if msg_type == "pong":
        t = _as_float(data.get("t"))
        if t is None:
            return None
        return Pong(t=t)

    if msg_type == "ping":
        t = _as_float(data.get("t"))
        if t is None:
            return None
        return Ping(t=t)

    return None


def hello_message(session_id: str) -> str:
    """Serializa a mensagem `hello` enviada na abertura da sessão (F1.3)."""
    return json.dumps({"type": "hello", "session_id": session_id, "server_version": SERVER_VERSION})


def vibrate_message(intensity: float, duration_ms: int) -> str:
    """Serializa a mensagem `vibrate`, saturando aos limites válidos (F8.2)."""
    safe_intensity = min(1.0, max(0.0, float(intensity)))
    safe_duration = max(0, int(duration_ms))
    return json.dumps(
        {"type": "vibrate", "intensity": safe_intensity, "duration_ms": safe_duration}
    )


def ping_message(t: float) -> str:
    """Serializa o `ping` do servidor com timestamp ``t`` (ms monotônico)."""
    return json.dumps({"type": "ping", "t": t})


def pong_message(t: float) -> str:
    """Serializa o `pong` ecoando ``t`` (resposta ao ping do cliente)."""
    return json.dumps({"type": "pong", "t": t})
