"""Testes de integração do cliente em navegador headless (W11–W19, W21).

Faixa **obrigatória na execução padrão** (tools/tooling.md). Carregam a página
real do controle servida pelo servidor real, emulam toque e inspecionam o que
efetivamente sai pelo socket.

Por que esta faixa existe: a suíte anterior passava com 52 testes enquanto o
produto era inutilizável, porque cobria lógica pura e servidor — e **toda a
faixa de defeitos vivia na integração com o DOM**, que não tinha teste algum.

Estes testes não podem ser marcados como opcionais nem pulados em silêncio: sem
o navegador, a suíte **falha** com a instrução de instalação (ver
``_INSTALL_HINT``). Pular era exatamente o modo de falha que deixou os defeitos
passarem.
"""

from __future__ import annotations

import asyncio
import socket
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from server.main import App, run_server

# `FakeGamepad` vem do fixture `fake_gamepad` de tests/conftest.py — importar a
# classe por caminho de pacote colidiria com um `tests` instalado em
# site-packages, que sombreia o diretório local.

_INSTALL_HINT = (
    "Os testes de integração em navegador headless são obrigatórios na suíte padrão "
    "(specs/wii-controller/tools/tooling.md) e não podem ser pulados.\n"
    "Instale as dependências com:\n"
    "    pip install -r requirements.txt\n"
    "    playwright install chromium"
)

try:
    from playwright.async_api import async_playwright

    _IMPORT_ERROR: Exception | None = None
except ImportError as exc:  # pragma: no cover - caminho de ambiente incompleto
    async_playwright = None  # type: ignore[assignment] # ausência tratada nos fixtures
    _IMPORT_ERROR = exc

ROOT = Path(__file__).resolve().parent.parent
WEB_JS_DIR = ROOT / "web" / "js"

# Contrato do DOM lido por estes testes (mantido em web/index.html).
SCREEN_STATES = ("pareamento", "conectando", "conectado", "desconectado")
BUTTON_IDS = (
    "a",
    "b",
    "x",
    "y",
    "up",
    "down",
    "left",
    "right",
    "lb",
    "rb",
    "start",
    "back",
)
BANNER_IDS = ("error-banner", "status-banner", "rotate-hint", "debug-line")

# Viewport RETRATO obrigatório (tools/tooling.md): o aparelho de referência em
# pé. Medir geometria em paisagem valida um layout que não existe mais e
# mascara todos os defeitos de disposição do corpo de Wii Remote (F2).
PORTRAIT_VIEWPORT = {"width": 412, "height": 915}

# Endereço não roteável: a conexão fica pendente, mantendo o cliente no estado
# `conectando` por tempo suficiente para medi-lo (W11).
UNREACHABLE_HOST = "10.255.255.1"


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


# ----------------------------------------------------------------- fixtures


@pytest.fixture
async def playwright_driver():
    if async_playwright is None:
        pytest.fail(f"{_INSTALL_HINT}\n\nImportError original: {_IMPORT_ERROR}")
    async with async_playwright() as driver:
        yield driver


@pytest.fixture
async def browser(playwright_driver):
    try:
        instance = await playwright_driver.chromium.launch()
    except Exception as exc:  # navegador não baixado
        pytest.fail(f"{_INSTALL_HINT}\n\nErro ao abrir o Chromium: {exc}")
    try:
        yield instance
    finally:
        await instance.close()


@dataclass
class ServerHandle:
    """Servidor real em loopback, com gamepad fake (sem driver, sem celular)."""

    app: App
    port: int
    gamepad: object
    _server: object

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def stop(self) -> None:
        """Derruba o servidor e as conexões abertas.

        ``wait_closed()`` fica pendente enquanto houver sessão viva, então o
        encerramento é feito só com ``close(close_connections=True)``.
        """
        self._server.close(close_connections=True)


@pytest.fixture
async def live_http_server(fake_gamepad):
    """Servidor sem TLS: `127.0.0.1` já é contexto seguro para o navegador.

    Evita o custo e a variabilidade do certificado autoassinado sem mudar
    nenhum caminho de código exercitado — o cliente deriva o esquema do socket
    da origem da página (`addressFromLocation`).
    """
    app = App(fake_gamepad)
    port = _free_port()
    server = await run_server(app, port, use_tls=False)
    handle = ServerHandle(app=app, port=port, gamepad=fake_gamepad, _server=server)
    try:
        yield handle
    finally:
        handle.stop()
        await asyncio.sleep(0)


@dataclass
class Controller:
    """Página do controle carregada, com o tráfego de saída capturado."""

    page: object
    server: ServerHandle
    sent: list[str] = field(default_factory=list)

    async def screen_areas(self) -> dict[str, float]:
        return await self.page.eval_on_selector_all(
            "#screens [data-screen]",
            """els => Object.fromEntries(els.map(e => {
                 const r = e.getBoundingClientRect();
                 return [e.dataset.screen, r.width * r.height];
               }))""",
        )

    async def visible_screens(self) -> list[str]:
        areas = await self.screen_areas()
        return sorted(name for name, area in areas.items() if area > 0)

    async def wait_state(self, state: str, timeout: float = 8000) -> None:
        await self.page.wait_for_selector(f'#status-banner[data-state="{state}"]', timeout=timeout)

    async def tap(self, selector: str) -> None:
        """Sequência de toque completa, sem nenhum evento `click` sintético."""
        box = await self.page.locator(selector).bounding_box()
        assert box is not None, f"controle sem caixa de layout: {selector}"
        await self.page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)

    def messages_of_type(self, message_type: str) -> list[dict]:
        import json

        out = []
        for raw in self.sent:
            try:
                parsed = json.loads(raw)
            except ValueError:
                continue
            if parsed.get("type") == message_type:
                out.append(parsed)
        return out


async def _open_controller(browser, server: ServerHandle, *, goto: bool = True) -> Controller:
    context = await browser.new_context(has_touch=True, viewport=dict(PORTRAIT_VIEWPORT))
    page = await context.new_page()
    controller = Controller(page=page, server=server)

    # `expose_function` exige um callable Python puro (não aceita método builtin).
    def record_sent(data: str) -> None:
        controller.sent.append(data)

    def record_click(target: str) -> None:
        controller.sent.append(f"CLICK:{target}")

    await page.expose_function("__recordSent", record_sent)
    await page.expose_function("__recordClick", record_click)
    # Espelha o que sai pelo socket e registra qualquer `click` que chegue a um
    # controle acionável — é o que permite afirmar "sem nenhum evento click".
    await page.add_init_script("""
        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
          try { window.__recordSent(String(data)); } catch (e) { /* ignora */ }
          return originalSend.call(this, data);
        };
        const fullscreenCalls = [];
        window.__fullscreenCalls = fullscreenCalls;
        const originalRequest = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function (...args) {
          fullscreenCalls.push(Date.now());
          return originalRequest.apply(this, args);
        };
        document.addEventListener('click', (event) => {
          const sel = '[data-button], #calibrate-button';
          const control = event.target.closest && event.target.closest(sel);
          if (control) {
            const name = control.dataset.button || control.id;
            try { window.__recordClick(name); } catch (e) { /* ignora */ }
          }
        }, true);
        """)
    if goto:
        await page.goto(server.url)
    return controller


@pytest.fixture
async def controller(browser, live_http_server):
    instance = await _open_controller(browser, live_http_server)
    yield instance


@pytest.fixture
async def connected_controller(controller: Controller):
    await controller.wait_state("conectado")
    controller.sent.clear()
    return controller


# ------------------------------------------------------- W11: uma tela por vez


async def test_w11_uma_tela_por_vez_nos_quatro_estados(browser, live_http_server):
    """W11: em cada um dos 4 estados, exatamente uma tela tem área > 0 (F2.5).

    Pega o caso de uma regra de CSS anular o mecanismo de alternância — a tela
    de pareamento permanecia sobre um controle já conectado e funcional.
    """
    controller = await _open_controller(browser, live_http_server)
    observed: dict[str, list[str]] = {}

    # conectado — a conexão é automática (F3.1)
    await controller.wait_state("conectado")
    observed["conectado"] = await controller.visible_screens()

    # desconectado — servidor derrubado
    live_http_server.stop()
    await controller.wait_state("desconectado")
    observed["desconectado"] = await controller.visible_screens()

    # pareamento — alcançável pelo comando da tela de queda
    await controller.tap("#pair-manually-button")
    await controller.wait_state("pareamento")
    observed["pareamento"] = await controller.visible_screens()

    # conectando — endereço não roteável mantém a tentativa pendente
    await controller.page.fill("#ip-input", UNREACHABLE_HOST)
    await controller.tap("#connect-button")
    await controller.wait_state("conectando", timeout=4000)
    observed["conectando"] = await controller.visible_screens()

    for state in SCREEN_STATES:
        assert observed[state] == [
            state
        ], f"estado {state}: telas visíveis = {observed[state]} (esperado exatamente [{state}])"


# ---------------------------------------------- W12/W13: acionamento por toque


async def test_w12_todos_os_botoes_respondem_ao_toque(connected_controller: Controller):
    """W12: os 12 botões enviam down/up por toque puro, sem `click` (F2.6, F6.2)."""
    controller = connected_controller
    for button_id in BUTTON_IDS:
        await controller.tap(f'[data-button="{button_id}"]')
    await controller.page.wait_for_timeout(200)

    for button_id in BUTTON_IDS:
        events = [m for m in controller.messages_of_type("button") if m["id"] == button_id]
        assert [m["down"] for m in events] == [
            True,
            False,
        ], f"botão {button_id}: sequência enviada = {events} (esperado um down e um up)"

    ghost_clicks = [raw for raw in controller.sent if raw.startswith("CLICK:")]
    assert ghost_clicks == [], f"controles acionados por `click`, não por toque: {ghost_clicks}"


async def test_w13_calibrar_responde_ao_toque(connected_controller: Controller):
    """W13: o comando de calibrar envia `calibrate` por toque puro (F2.6).

    O comando esteve ligado apenas a `click`, que o tratamento multi-touch
    suprime: funcionava com mouse e era inerte no celular.
    """
    controller = connected_controller
    await controller.tap("#calibrate-button")
    await controller.page.wait_for_timeout(200)

    assert (
        len(controller.messages_of_type("calibrate")) == 1
    ), f"mensagens enviadas: {controller.sent}"
    ghost_clicks = [raw for raw in controller.sent if raw.startswith("CLICK:")]
    assert ghost_clicks == [], f"calibrar acionado por `click`: {ghost_clicks}"


# ------------------------------------------------ W14: nada intercepta o toque


async def test_w14_nada_intercepta_o_toque(connected_controller: Controller):
    """W14: no centro de cada controle, quem recebe o toque é o próprio controle (F2.7).

    Medido no cenário adverso — todas as faixas visíveis ao mesmo tempo —,
    porque no estado normal só há uma faixa por borda e o defeito não aparece.
    """
    controller = connected_controller
    await _force_all_banners_visible(controller.page)

    intercepted = await controller.page.eval_on_selector_all(
        "#pad-screen [data-button], #calibrate-button",
        """els => els.map(el => {
             const r = el.getBoundingClientRect();
             const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
             const ok = hit === el || el.contains(hit);
             return { control: el.dataset.button || el.id, ok,
                      hit: hit ? (hit.id || hit.className || hit.tagName) : null };
           }).filter(x => !x.ok)""",
    )
    assert intercepted == [], f"controles interceptados por outro elemento: {intercepted}"


# --------------------------------------- W15: tela cheia não engole o toque


async def test_w15_tela_cheia_nao_engole_o_acionamento(connected_controller: Controller):
    """W15, metade (a): com o cliente pedindo modo imersivo, o botão dispara (F2.8)."""
    controller = connected_controller
    await controller.tap('[data-button="a"]')
    await controller.page.wait_for_timeout(250)

    requested = await controller.page.evaluate("() => window.__fullscreenCalls.length")
    assert requested > 0, "o cliente não chegou a pedir modo imersivo — W15 não foi exercitado"

    events = [m for m in controller.messages_of_type("button") if m["id"] == "a"]
    assert [m["down"] for m in events] == [
        True,
        False,
    ], f"acionamento engolido pelo pedido de tela cheia: {events}"


def test_w15_pedido_de_tela_cheia_vem_de_gesto_concluido():
    """W15, metade (b): o pedido de tela cheia está ligado a `touchend` (F2.8).

    Esta metade é obrigatória porque a primeira **não é capaz de reprovar** a
    implementação errada: o cancelamento da sequência de toque ao entrar em tela
    cheia é comportamento do Chromium no aparelho e não se reproduz no Chromium
    headless. Verificado por mutação — ligar o pedido a `touchstart` mantém a
    metade (a) passando e só esta falha.
    """
    main_js = (WEB_JS_DIR / "main.js").read_text(encoding="utf-8")
    marker = "padScreen.addEventListener("
    assert marker in main_js, "registro do modo imersivo não encontrado em web/js/main.js"

    registration = main_js[main_js.index(marker) : main_js.index(marker) + 400]
    assert "'touchend'" in registration, (
        "o pedido de tela cheia não está ligado a `touchend`: um gesto ainda em "
        f"andamento é cancelado pelo navegador e engole o botão (F2.8).\n{registration}"
    )
    for forbidden in ("'touchstart'", "'pointerdown'", "'mousedown'"):
        assert (
            forbidden not in registration
        ), f"pedido de tela cheia ligado a {forbidden}, que ocorre com o toque em andamento (F2.8)"


# ------------------------------------------- W16: nenhuma ação depende de click


def test_w16_nenhuma_acao_depende_apenas_de_click():
    """W16: nenhum controle acionável tem `click` como caminho único (F2.9).

    Leitura adotada: todo registro de `click` em `web/js/` convive com um
    registro de evento de toque para a mesma ação. O cliente concentra isso em
    `onActivate` (web/js/controls.js), então o check é: todo `click` registrado
    está dentro de `onActivate`, e `onActivate` também registra `touchstart`.
    """
    sources = {path.name: path.read_text(encoding="utf-8") for path in WEB_JS_DIR.glob("*.js")}
    assert sources, "nenhum módulo encontrado em web/js/"

    click_registrations = {
        name: text.count("addEventListener('click'") for name, text in sources.items()
    }
    offenders = {n: c for n, c in click_registrations.items() if c and n != "controls.js"}
    assert offenders == {}, (
        "registro de `click` fora do caminho touch-first de onActivate: "
        f"{offenders} — um controle ligado só a `click` fica inerte no aparelho"
    )

    controls = sources["controls.js"]
    start = controls.index("export function onActivate")
    end = controls.index("export function wireTouchButtons")
    activate_body = controls[start:end]
    assert activate_body.count("addEventListener('click'") == controls.count(
        "addEventListener('click'"
    ), "há registro de `click` em controls.js fora de onActivate"
    assert (
        "'touchstart'" in activate_body
    ), "onActivate registra `click` sem registrar toque — caminho único proibido (F2.9)"

    index_html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert "onclick=" not in index_html, "handler `onclick` inline em web/index.html"


# ----------------------------------------- W17/W18: conexão e reconexão sozinhas


async def test_w17_conexao_automatica_pela_origem(controller: Controller):
    """W17: conecta sem digitação em ≤ 5 s, usando o endereço da origem (F3.1, F3.2)."""
    await controller.wait_state("conectado", timeout=5000)

    address = await controller.page.get_attribute("#status-banner", "data-address")
    assert (
        address == f"127.0.0.1:{controller.server.port}"
    ), f"endereço usado ({address}) não é o da origem da página"
    assert controller.server.app.session is not None, "servidor não registrou a sessão"


async def test_w18_reconexao_automatica_sem_toque(browser, live_http_server, fake_gamepad):
    """W18: derrubada a conexão, o cliente reconecta sozinho em ≤ 5 s (F9.5)."""
    controller = await _open_controller(browser, live_http_server)
    await controller.wait_state("conectado")

    live_http_server.stop()
    await controller.wait_state("desconectado")

    # Servidor volta a aceitar conexões na mesma porta; nenhum toque é dado.
    app = App(fake_gamepad)
    restarted = await run_server(app, live_http_server.port, use_tls=False)
    try:
        await controller.wait_state("conectado", timeout=5000)
        assert app.session is not None, "reconectou na interface mas o servidor não viu sessão"
    finally:
        restarted.close(close_connections=True)


# ------------------------------------- W19: estado sempre visível, sem silêncio


async def test_w19_estado_da_conexao_sempre_visivel(controller: Controller):
    """W19: estado visível 100% do tempo; após a queda, o motivo persiste (F9.6, F9.7).

    O motivo é verificado no elemento **persistente** de diagnóstico, e não na
    tela de queda: passados os ~800 ms de reconexão o cliente entra em
    `conectando` e aquela tela sai do ar, o que tornaria a asserção uma corrida.
    """
    await controller.wait_state("conectado")

    # Amostra a faixa de status durante toda a transição de queda.
    await controller.page.evaluate("""() => {
             window.__statusSamples = [];
             window.__sampler = setInterval(() => {
               const el = document.getElementById('status-banner');
               const r = el.getBoundingClientRect();
               window.__statusSamples.push({
                 area: r.width * r.height,
                 text: el.textContent.trim(),
               });
             }, 40);
           }""")
    controller.server.stop()
    await controller.wait_state("desconectado")
    await controller.page.wait_for_timeout(1500)  # atravessa a volta para `conectando`
    await controller.page.evaluate("() => clearInterval(window.__sampler)")

    samples = await controller.page.evaluate("() => window.__statusSamples")
    assert len(samples) > 10, f"amostragem insuficiente: {len(samples)}"
    invisible = [s for s in samples if s["area"] <= 0 or s["text"] == ""]
    assert invisible == [], f"estado da conexão sumiu da tela em {len(invisible)} amostras"

    # O motivo da queda (código de fechamento) sobrevive na faixa persistente.
    debug_text = (await controller.page.text_content("#debug-line")).strip()
    assert "última queda" in debug_text, f"linha de diagnóstico sem o motivo: {debug_text!r}"
    assert (
        "código" in debug_text
    ), f"o motivo da queda não nomeia o código de fechamento: {debug_text!r}"

    # E a tela de queda, enquanto esteve visível, exibiu esse motivo.
    close_reason = (await controller.page.text_content("#close-reason")).strip()
    assert "código" in close_reason, f"tela de queda sem código de fechamento: {close_reason!r}"


# ------------------------------------------- W21: faixas visíveis não se cobrem


async def _force_all_banners_visible(page) -> None:
    """Cenário adverso: todas as faixas persistentes visíveis ao mesmo tempo."""
    await page.evaluate("""() => {
             const error = document.getElementById('error-banner');
             error.textContent = 'Sensores indisponíveis: contexto não seguro';
             error.hidden = false;
             const hint = document.getElementById('rotate-hint');
             hint.hidden = false;
           }""")
    await page.wait_for_timeout(80)


async def test_w21_faixas_visiveis_nao_se_cobrem(connected_controller: Controller):
    """W21: faixas visíveis simultaneamente não se intersectam (F2.2, F2.3, F9.6).

    Cobre a classe "CSS anula um mecanismo de JS correto": faixas ancoradas
    individualmente na mesma borda se cobrem conforme a ordem do documento — foi
    assim que o aviso de erro dos sensores ficou mudo sob a faixa de status e a
    dica de rotação ficou ilegível sob a linha de diagnóstico.
    """
    controller = connected_controller
    await _force_all_banners_visible(controller.page)

    boxes = await controller.page.evaluate(
        """(ids) => Object.fromEntries(ids.map(id => {
             const el = document.getElementById(id);
             const r = el.getBoundingClientRect();
             return [id, { hidden: el.hidden, top: r.top, bottom: r.bottom,
                           left: r.left, right: r.right, area: r.width * r.height }];
           }))""",
        list(BANNER_IDS),
    )

    visible = {i: b for i, b in boxes.items() if not b["hidden"] and b["area"] > 0}
    assert set(visible) == set(
        BANNER_IDS
    ), f"o cenário adverso não pôs todas as faixas na tela: {sorted(visible)}"

    overlaps = []
    names = sorted(visible)
    for i, first in enumerate(names):
        for second in names[i + 1 :]:
            a, b = visible[first], visible[second]
            vertical = a["top"] < b["bottom"] and b["top"] < a["bottom"]
            horizontal = a["left"] < b["right"] and b["left"] < a["right"]
            if vertical and horizontal:
                overlaps.append((first, second))
    assert (
        overlaps == []
    ), f"faixas visíveis se cobrindo (a de baixo fica ilegível): {overlaps} — caixas: {visible}"


# --------------------------- W22–W24: corpo de Wii Remote em retrato (F2.10–F2.12)


async def _control_boxes(page) -> dict:
    """Caixas de layout dos controles acionáveis da tela `conectado`."""
    return await page.eval_on_selector_all(
        "#pad-screen [data-button], #calibrate-button",
        """els => Object.fromEntries(els.map(el => {
             const r = el.getBoundingClientRect();
             return [el.dataset.button || el.id, {
               cx: r.x + r.width / 2, cy: r.y + r.height / 2,
               area: r.width * r.height, width: r.width, height: r.height,
             }];
           }))""",
    )


async def test_w22_geometria_do_corpo_de_wii_remote(connected_controller: Controller):
    """W22 (F2.10): ordem vertical, dominância do A, centralização e proximidade.

    Reprova o reaproveitamento do layout de paisagem, que não tem nem a ordem
    nem a dominância do botão A.
    """
    controller = connected_controller
    viewport = controller.page.viewport_size
    assert (
        viewport["height"] > viewport["width"]
    ), f"o viewport do teste precisa ser retrato (F2): {viewport}"

    boxes = await _control_boxes(controller.page)
    faltando = [name for name in (*BUTTON_IDS, "calibrate-button") if name not in boxes]
    assert faltando == [], f"controles ausentes da tela conectado: {faltando}"

    tip = await controller.page.evaluate("""() => {
             const el = document.getElementById('sensor-tip');
             const r = el.getBoundingClientRect();
             return { cy: r.y + r.height / 2, area: r.width * r.height };
           }""")

    # (a) ordem vertical: ponta do sensor < D-pad < A < START/BACK < L/R
    dpad_cy = max(boxes[d]["cy"] for d in ("up", "down", "left", "right"))
    a_cy = boxes["a"]["cy"]
    system_cy = min(boxes["start"]["cy"], boxes["back"]["cy"])
    shoulders_cy = min(boxes["lb"]["cy"], boxes["rb"]["cy"])
    dpad_top = min(boxes[d]["cy"] for d in ("up", "down", "left", "right"))

    assert tip["cy"] < dpad_top, f"ponta do sensor não está acima do D-pad: {tip} vs {dpad_top}"
    assert dpad_cy < a_cy, f"D-pad não está acima do A: {dpad_cy} vs {a_cy}"
    assert a_cy < system_cy, f"A não está acima de START/BACK: {a_cy} vs {system_cy}"
    assert (
        system_cy < shoulders_cy
    ), f"START/BACK não estão acima de L/R: {system_cy} vs {shoulders_cy}"

    # (b) o botão A domina o corpo: área estritamente maior que a de qualquer outro
    outros = {name: box["area"] for name, box in boxes.items() if name != "a"}
    maior_outro = max(outros.values())
    assert boxes["a"]["area"] > maior_outro, (
        f"o botão A não domina o corpo do controle: área {boxes['a']['area']:.0f} "
        f"não é maior que a de {max(outros, key=outros.get)} ({maior_outro:.0f})"
    )

    # (c) centro do A a no máximo 5% da largura do eixo vertical central
    eixo_central = viewport["width"] / 2
    desvio = abs(boxes["a"]["cx"] - eixo_central)
    assert desvio <= 0.05 * viewport["width"], (
        f"centro do A a {desvio:.1f}px do eixo central "
        f"(máximo {0.05 * viewport['width']:.1f}px)"
    )

    # (d) B, X e Y ficam mais perto do A do que do D-pad, de L e de R
    distantes = ("up", "down", "left", "right", "lb", "rb")

    def distancia(um, outro):
        dx = boxes[um]["cx"] - boxes[outro]["cx"]
        dy = boxes[um]["cy"] - boxes[outro]["cy"]
        return (dx**2 + dy**2) ** 0.5

    for face in ("b", "x", "y"):
        ate_a = distancia(face, "a")
        for longe in distantes:
            assert ate_a < distancia(face, longe), (
                f"o botão {face.upper()} está mais perto de {longe.upper()} "
                f"({distancia(face, longe):.1f}px) do que do A ({ate_a:.1f}px) — F2.10(d)"
            )


async def test_w23_ponta_do_sensor_ancorada_e_com_estado(browser, live_http_server):
    """W23 (F2.11): a ponta do sensor fica acima de tudo e muda com o estado."""
    controller = await _open_controller(browser, live_http_server)

    async def tip_state() -> dict:
        return await controller.page.evaluate("""() => {
                 const el = document.getElementById('sensor-tip');
                 const r = el.getBoundingClientRect();
                 return { marker: el.dataset.connState || el.className,
                          cy: r.y + r.height / 2, area: r.width * r.height };
               }""")

    marcadores: dict[str, str] = {}

    # conectado: visível, acima de todos os controles acionáveis
    await controller.wait_state("conectado")
    conectado = await tip_state()
    marcadores["conectado"] = conectado["marker"]
    assert conectado["area"] > 0, "ponta do sensor invisível na tela conectado"
    boxes = await _control_boxes(controller.page)
    mais_alto = min(box["cy"] for box in boxes.values())
    assert (
        conectado["cy"] < mais_alto
    ), f"ponta do sensor não está acima dos controles: {conectado['cy']} vs {mais_alto}"

    # desconectado
    live_http_server.stop()
    await controller.wait_state("desconectado")
    marcadores["desconectado"] = (await tip_state())["marker"]

    # pareamento
    await controller.tap("#pair-manually-button")
    await controller.wait_state("pareamento")
    marcadores["pareamento"] = (await tip_state())["marker"]

    # conectando
    await controller.page.fill("#ip-input", UNREACHABLE_HOST)
    await controller.tap("#connect-button")
    await controller.wait_state("conectando", timeout=4000)
    marcadores["conectando"] = (await tip_state())["marker"]

    assert set(marcadores) == set(SCREEN_STATES), f"estados não cobertos: {marcadores}"
    assert len(set(marcadores.values())) == len(SCREEN_STATES), (
        "a ponta do sensor não tem aparência distinta em cada estado de conexão "
        f"(F2.11): {marcadores}"
    )


async def test_w24_ilustracao_de_pegada_ensina_a_segurar(browser, live_http_server):
    """W24 (F2.12): a ilustração da pegada tem área > 0 em pareamento e conectando."""
    controller = await _open_controller(browser, live_http_server)

    async def illustration_area() -> float:
        return await controller.page.evaluate("""() => {
                 const visible = [...document.querySelectorAll('#screens [data-screen]')]
                   .find(s => !s.hidden);
                 if (!visible) return -1;
                 const el = visible.querySelector('.grip-illustration');
                 if (!el) return 0;
                 const r = el.getBoundingClientRect();
                 return r.width * r.height;
               }""")

    # pareamento: alcançável pelo comando da tela de queda
    await controller.wait_state("conectado")
    live_http_server.stop()
    await controller.wait_state("desconectado")
    await controller.tap("#pair-manually-button")
    await controller.wait_state("pareamento")
    area_pareamento = await illustration_area()
    assert (
        area_pareamento > 0
    ), f"ilustração de pegada ausente/oculta no estado pareamento (área={area_pareamento})"

    # conectando: endereço não roteável mantém a tentativa pendente
    await controller.page.fill("#ip-input", UNREACHABLE_HOST)
    await controller.tap("#connect-button")
    await controller.wait_state("conectando", timeout=4000)
    area_conectando = await illustration_area()
    assert (
        area_conectando > 0
    ), f"ilustração de pegada ausente/oculta no estado conectando (área={area_conectando})"
