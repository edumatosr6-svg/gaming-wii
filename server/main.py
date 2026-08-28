"""Ponto de entrada do servidor wii-controller: HTTPS estático + WebSocket.

HTTP(S) e WebSocket compartilham a mesma porta (F1). Rotas dinâmicas:
``GET /metrics`` (F11) e ``POST /rumble`` (fallback F8, parâmetros por query
string — o handler HTTP embutido do `websockets` não lê corpo de requisição).
"""

from __future__ import annotations

import argparse
import asyncio
import http
import logging
import ssl
import sys
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

if __package__ in (None, ""):
    # Permite `python server/main.py` direto, sem instalar o pacote (P1).
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import config, mapping, protocol  # noqa: E402
from server.gamepad import NullGamepad, select_gamepad  # noqa: E402
from server.gamepad.base import GamepadUnavailableError, VirtualGamepad  # noqa: E402
from server.metrics import MetricsWindow  # noqa: E402
from server.session import SessionState  # noqa: E402
from server.tls import ensure_certificate, get_local_ips  # noqa: E402

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT_DIR / "web"
GAME_DIR = ROOT_DIR / "game"

_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class App:
    """Estado do servidor: gamepad virtual, métricas e sessão corrente.

    Objeto explícito passado por parâmetro — sem estado global mutável.
    """

    def __init__(self, gamepad: VirtualGamepad) -> None:
        self.gamepad = gamepad
        self.metrics = MetricsWindow()
        self.session: SessionState | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        gamepad.set_rumble_callback(self._on_driver_rumble)

    def _on_driver_rumble(self, low: float, high: float) -> None:
        """Callback do driver (pode vir de outra thread) → `vibrate` (F8)."""
        intensity = mapping.combine_rumble(low, high)
        duration_ms = 0 if intensity == 0.0 else 200
        loop = self.loop
        if loop is not None:
            loop.call_soon_threadsafe(self.schedule_vibrate, intensity, duration_ms)

    def schedule_vibrate(self, intensity: float, duration_ms: int) -> None:
        """Agenda o envio de `vibrate` para a sessão corrente (thread do loop)."""
        session = self.session
        if session is None or not session.connected:
            return
        payload = protocol.vibrate_message(intensity, duration_ms)
        asyncio.ensure_future(self._send_safe(session, payload))

    async def _send_safe(self, session: SessionState, payload: str) -> None:
        websocket = session.websocket
        if websocket is None:
            return
        try:
            await websocket.send(payload)
        except ConnectionClosed:
            logger.debug("vibrate descartado: sessão fechada")


async def _handle_session(app: App, websocket: ServerConnection) -> None:
    """Ciclo de vida de uma sessão de controle (P2/P3)."""
    session = SessionState(app.gamepad, app.metrics, websocket=websocket)
    app.session = session
    await websocket.send(protocol.hello_message(session.session_id))
    logger.info("sessão %s conectada", session.session_id)

    last_pong = time.monotonic()

    async def ping_loop() -> None:
        nonlocal last_pong
        try:
            while True:
                await asyncio.sleep(config.PING_INTERVAL_S)
                if time.monotonic() - last_pong > config.PING_TIMEOUT_S:
                    logger.warning("sessão %s: timeout de ping/pong", session.session_id)
                    await websocket.close()
                    return
                await websocket.send(protocol.ping_message(time.monotonic() * 1000.0))
        except ConnectionClosed:
            # Cliente caiu entre o timeout e o cancel: falhar suave (F1/KPI-9)
            logger.debug("sessão %s: ping_loop encerrado (conexão fechada)", session.session_id)

    ping_task = asyncio.create_task(ping_loop())
    try:
        async for raw in websocket:
            message = protocol.parse_message(raw)
            if message is None:
                logger.debug("mensagem descartada (malformada)")
                continue
            if isinstance(message, protocol.Motion):
                arrival = time.perf_counter()
                app.metrics.record_motion()
                session.handle_motion(message, arrival_ms=arrival * 1000.0)
                app.metrics.record_processing((time.perf_counter() - arrival) * 1000.0)
            elif isinstance(message, protocol.Button):
                session.handle_button(message)
            elif isinstance(message, protocol.Calibrate):
                # A resposta é obrigatória (F12/P6.5): o assistente do cliente
                # aguarda `calibration_applied` e um perfil rejeitado precisa
                # chegar com motivo, nunca ser engolido (KPI-14).
                outcome = session.handle_calibrate(message)
                await websocket.send(
                    protocol.calibration_applied_message(
                        outcome.accepted, outcome.reason, outcome.ranges, outcome.has_center
                    )
                )
            elif isinstance(message, protocol.Status):
                session.handle_status(message)
            elif isinstance(message, protocol.Pong):
                last_pong = time.monotonic()
                rtt = time.monotonic() * 1000.0 - message.t
                app.metrics.record_rtt(rtt)
            elif isinstance(message, protocol.Ping):
                await websocket.send(protocol.pong_message(message.t))
    except ConnectionClosed:
        logger.debug("sessão %s: conexão fechada", session.session_id)
    finally:
        ping_task.cancel()
        session.disconnect()
        if app.session is session:
            app.session = None
        logger.info("sessão %s encerrada; gamepad zerado", session.session_id)


def _response(status: http.HTTPStatus, body: bytes, content_type: str) -> Response:
    headers = Headers(
        [
            ("Content-Type", content_type),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"),
        ]
    )
    return Response(status.value, status.phrase, headers, body)


def _serve_static(root: Path, relative: str) -> Response:
    """Serve um arquivo dentro de ``root``, sem escapar do diretório."""
    candidate = (root / relative.lstrip("/")).resolve()
    if candidate.is_dir():
        candidate = candidate / "index.html"
    if not str(candidate).startswith(str(root.resolve())) or not candidate.is_file():
        return _response(http.HTTPStatus.NOT_FOUND, b"not found", "text/plain")
    content_type = _CONTENT_TYPES.get(candidate.suffix, "application/octet-stream")
    return _response(http.HTTPStatus.OK, candidate.read_bytes(), content_type)


def make_process_request(
    app: App,
) -> Callable[[ServerConnection, Request], Awaitable[Response | None]]:
    """Cria o roteador HTTP que convive com o handshake WebSocket."""

    async def process_request(connection: ServerConnection, request: Request) -> Response | None:
        parsed = urlparse(request.path)
        path = parsed.path
        if path == "/ws":
            return None  # segue para o handshake WebSocket

        if path == "/metrics":
            import json  # noqa: PLC0415 — evita custo no caminho crítico

            body = json.dumps(app.metrics.snapshot()).encode()
            return _response(http.HTTPStatus.OK, body, "application/json")

        if path == "/rumble":
            # Fallback do rumble do jogo (F8.3): parâmetros por query string.
            params = parse_qs(parsed.query)
            try:
                intensity = float(params.get("intensity", ["0"])[0])
                duration_ms = int(float(params.get("duration_ms", ["0"])[0]))
            except ValueError:
                intensity, duration_ms = 0.0, 0
            intensity, duration_ms = mapping.clamp_rumble(intensity, duration_ms)
            app.schedule_vibrate(intensity, duration_ms)
            return _response(http.HTTPStatus.OK, b"{}", "application/json")

        if path == "/game" or path.startswith("/game/"):
            relative = path[len("/game") :] or "/index.html"
            return _serve_static(GAME_DIR, relative)

        return _serve_static(WEB_DIR, path or "/index.html")

    return process_request


async def run_server(app: App, port: int, use_tls: bool = True) -> Server:
    """Sobe HTTP(S) + WebSocket na mesma porta e devolve o servidor."""
    app.loop = asyncio.get_running_loop()
    ssl_context: ssl.SSLContext | None = None
    if use_tls:
        cert_file, key_file = ensure_certificate()
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cert_file, key_file)

    async def handler(websocket: ServerConnection) -> None:
        await _handle_session(app, websocket)

    return await serve(
        handler,
        host="0.0.0.0",
        port=port,
        ssl=ssl_context,
        process_request=make_process_request(app),
        max_size=config.MAX_MESSAGE_BYTES,
    )


def print_urls(port: int) -> None:
    """Imprime as URLs de acesso (mensagem ao usuário — exceção ao logging)."""
    ips = get_local_ips()
    print("wii-controller pronto:")
    for ip in ips:
        print(f"  Controle (celular): https://{ip}:{port}/")
    print(f"  Jogo (PC):          https://localhost:{port}/game/")
    print("  (aceite o aviso do certificado autoassinado na primeira visita)")


async def _amain(args: argparse.Namespace) -> None:
    if args.direct_metrics:
        print("MODO DIAGNÓSTICO --direct-metrics: SEM camada de emulação de gamepad.")
        gamepad: VirtualGamepad = NullGamepad()
    else:
        gamepad = select_gamepad()
    app = App(gamepad)
    server = await run_server(app, args.port)
    print_urls(args.port)
    await server.wait_closed()


def main(argv: list[str] | None = None) -> int:
    """CLI: ``python server/main.py [--port N] [--direct-metrics]`` (P1)."""
    parser = argparse.ArgumentParser(description="Servidor wii-controller")
    parser.add_argument("--port", type=int, default=config.PORT)
    parser.add_argument(
        "--direct-metrics",
        action="store_true",
        help="modo secundário de diagnóstico: mede latência sem emulação (F11)",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    try:
        asyncio.run(_amain(args))
    except GamepadUnavailableError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
