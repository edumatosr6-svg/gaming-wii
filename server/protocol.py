"""Schema e validação das mensagens do protocolo WebSocket (JSON).

Tabela de mensagens (software-specs.md, Data Models):

| type        | direção            | campos                                        |
|-------------|--------------------|-----------------------------------------------|
| `hello`     | servidor→cliente   | `session_id: str`, `server_version: str`      |
| `motion`    | cliente→servidor   | `a: float|null`, `b: float`, `g: float`, `t: float` |
| `button`    | cliente→servidor   | `id: str` (enum), `down: bool`                |
| `calibrate` | cliente→servidor   | — (degradado) ou `center` + `ranges` (F5/F12) |
| `calibration_applied` | servidor→cliente | `accepted: bool`, `reason`, `effective`  |
| `status`    | cliente→servidor   | `source: str` (enum fechado), `mag_rejected: bool` |
| `vibrate`   | servidor→cliente   | `intensity: float [0..1]`, `duration_ms: int` |
| `ping`/`pong` | ambos            | `t: float`                                    |

O `motion` **não cresce** nesta revisão: precisão nova não pode ser paga com
tráfego na mensagem mais frequente. Fonte de orientação e rejeição magnética
viajam em `status`, de baixa frequência, justamente porque são constantes na
maior parte do tempo — embuti-los no `motion` é proibido (F14.8/PC26), e
nenhuma leitura CRUA de sensor trafega no protocolo: a fusão acontece no
cliente e entrega os três ângulos da convenção do `DeviceOrientationEvent`.

Invariante: mensagens desconhecidas/inválidas são descartadas sem exceção
propagada (F1.4, KPI-9). O parsing devolve ``None`` no descarte.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

from server import config

SERVER_VERSION = "0.1.0"

# Campos aceitos no `motion` — o schema é fechado (F14.8/P4b).
_MOTION_FIELDS: frozenset[str] = frozenset({"type", "a", "b", "g", "t"})

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
    """Pedido de calibração (F5/F12).

    ``center`` é a orientação MÉDIA de uma janela de captura feita no cliente
    (nunca uma amostra instantânea — F5), e ``ranges`` são os quatro alcances
    medidos pelo assistente (F12). Os dois campos são INDEPENDENTES: reenviar
    só ``ranges`` numa reconexão é válido (P3.4), e o caminho degradado sem
    nenhum payload continua válido (o servidor zera na última amostra `motion`
    recebida, F5.3).
    """

    center: tuple[float | None, float, float] | None = None
    ranges: dict[str, object] | None = None


@dataclass(frozen=True)
class Status:
    """Fonte de orientação em uso e estado da rejeição magnética (F13/F14).

    Baixa frequência (no `hello`, a cada mudança e no máximo 1×/s). Sem o
    degrau em uso registrado, comparar precisão entre dois aparelhos vira
    depuração (F13.6).
    """

    source: str
    mag_rejected: bool


@dataclass(frozen=True)
class Pong:
    """Resposta ao ping do servidor; ``t`` é o timestamp ecoado."""

    t: float


@dataclass(frozen=True)
class Ping:
    """Ping vindo do cliente (eco simétrico)."""

    t: float


Message = Motion | Button | Calibrate | Status | Pong | Ping

# Enum fechado do campo `source` (F13): os quatro degraus da escada mais a
# fonte de diagnóstico `synthetic`, que nunca é escolhida pela detecção
# automática e só aparece aqui quando explicitamente forçada.
SOURCE_IDS: frozenset[str] = frozenset({*config.SOURCE_LADDER, config.DIAGNOSTIC_SOURCE})


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


def _parse_center(value: object) -> tuple[float | None, float, float] | None:
    """Extrai o centro do payload de `calibrate` (F5).

    ``a`` é anulável (fonte sem yaw — o mesmo contrato do `motion`); ``b`` e
    ``g`` são obrigatórios. Payload malformado degrada para ``None`` (centro
    ausente) em vez de derrubar a mensagem inteira: os dois campos do
    `calibrate` são independentes, e um `ranges` válido não pode ser perdido
    por causa de um `center` ruim.
    """
    if not isinstance(value, dict):
        return None
    b = _as_float(value.get("b"))
    g = _as_float(value.get("g"))
    if b is None or g is None:
        return None
    return (_as_float(value.get("a")), b, g)


def _parse_ranges(value: object) -> dict[str, object] | None:
    """Extrai os alcances do payload de `calibrate` (F12).

    Apenas transporte: a validação de FAIXA (e a rejeição com motivo) é
    autoridade do servidor e vive em ``mapping.is_valid_range_profile``, para
    que um perfil degenerado gere `calibration_applied {accepted: false}` em
    vez de ser descartado em silêncio como "mensagem malformada".

    ATENÇÃO À DISTINÇÃO (é o que P14 cobre): direção **ausente** significa "use
    o padrão desta direção" e é legítima; direção **presente com valor
    inválido** (string, null, NaN) é perfil ruim e precisa ser REJEITADA. Por
    isso o valor cru é preservado quando não converte — descartar a chave aqui
    transformaria um payload corrompido em "use o padrão" silencioso, que é
    exatamente o "aceito em silêncio" que a KPI-14 proíbe.
    """
    if not isinstance(value, dict):
        return None
    parsed: dict[str, object] = {}
    for key in ("left", "right", "up", "down"):
        if key not in value:
            continue
        number = _as_float(value[key])
        parsed[key] = number if number is not None else value[key]
    return parsed or None


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
        # SCHEMA FECHADO nos cinco campos (F14.8): nenhuma leitura crua de
        # sensor trafega aqui — a fusão acontece no cliente justamente para
        # caber em três ângulos. Aceitar campos extras deixaria a mensagem mais
        # frequente do protocolo engordar em silêncio.
        if data.keys() - _MOTION_FIELDS:
            return None
        # `a` AUSENTE é malformado; `a: null` é válido (fonte sem yaw — F4/M8b).
        # A distinção importa: tratar as duas igual faria um cliente quebrado
        # passar por "sensor sem magnetômetro".
        if "a" not in data:
            return None
        # Valor inválido em `a` degrada para None em vez de descartar a amostra.
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
        return Calibrate(
            center=_parse_center(data.get("center")),
            ranges=_parse_ranges(data.get("ranges")),
        )

    if msg_type == "status":
        source = data.get("source")
        mag_rejected = data.get("mag_rejected")
        if not isinstance(source, str) or source not in SOURCE_IDS:
            return None
        if not isinstance(mag_rejected, bool):
            return None
        return Status(source=source, mag_rejected=mag_rejected)

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


def calibration_applied_message(
    accepted: bool,
    reason: str | None,
    ranges: dict[str, float],
    has_center: bool,
) -> str:
    """Serializa a resposta ao `calibrate` (F12, KPI-14).

    Um perfil inválido/degenerado é rejeitado COM MOTIVO e o perfil anterior é
    mantido — nunca aceito em silêncio. ``effective`` devolve o que de fato
    está valendo, para que o assistente do cliente possa exibir a divergência
    em vez de seguir como se tivesse calibrado.
    """
    return json.dumps(
        {
            "type": "calibration_applied",
            "accepted": accepted,
            "reason": reason,
            "effective": {"ranges": ranges, "has_center": has_center},
        }
    )


def ping_message(t: float) -> str:
    """Serializa o `ping` do servidor com timestamp ``t`` (ms monotônico)."""
    return json.dumps({"type": "ping", "t": t})


def pong_message(t: float) -> str:
    """Serializa o `pong` ecoando ``t`` (resposta ao ping do cliente)."""
    return json.dumps({"type": "pong", "t": t})
