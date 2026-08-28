"""Testes de specs/game-hub/tests/navigation.md (F1–F3) em navegador headless.

Segue o mesmo padrão de `tests/test_client_headless.py`: servidor real em
loopback (sem TLS), Chromium via Playwright, sem gamepad/driver real
envolvido — o hub não lê input de controle (fora de escopo, ver
software-specs.md), só navegação real de página.
"""

from __future__ import annotations

import asyncio
import socket
from dataclasses import dataclass
from pathlib import Path

import pytest

from server.main import App, run_server

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
except ImportError as exc:  # pragma: no cover - ambiente incompleto
    async_playwright = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc

ROOT = Path(__file__).resolve().parent.parent


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


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
    app: App
    port: int
    _server: object

    @property
    def hub_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/game/"

    def stop(self) -> None:
        self._server.close(close_connections=True)


@pytest.fixture
async def live_http_server(fake_gamepad):
    app = App(fake_gamepad)
    port = _free_port()
    server = await run_server(app, port, use_tls=False)
    handle = ServerHandle(app=app, port=port, _server=server)
    try:
        yield handle
    finally:
        handle.stop()
        await asyncio.sleep(0)


@pytest.fixture
async def page(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    pg = await context.new_page()
    console_errors: list[str] = []
    pg.on(
        "console",
        lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
    )
    pg.on("pageerror", lambda exc: console_errors.append(str(exc)))
    pg.console_errors = console_errors  # type: ignore[attr-defined]
    try:
        yield pg
    finally:
        await context.close()


# ------------------------------------------------------------------ F1


async def test_hub_renderiza_catalogo_padrao(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    items = page.locator(".hub-item")
    await items.first.wait_for(state="visible")
    assert await items.count() == 2
    nomes = await page.locator(".hub-link-name").all_inner_texts()
    assert set(nomes) == {"Duck Shooting", "Fruit Ninja"}
    assert page.console_errors == []


async def test_hub_catalogo_vazio_sem_erro(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    resultado = await page.evaluate(
        """async () => {
            const { renderHub } = await import('./hub.js');
            const container = document.getElementById('hub-container');
            renderHub(container, []);
            return {
                itens: container.querySelectorAll('.hub-item').length,
                vazio: container.querySelectorAll('.hub-empty').length,
            };
        }"""
    )
    assert resultado["itens"] == 0
    assert resultado["vazio"] == 1
    assert page.console_errors == []


async def test_hub_extensibilidade_catalogo_sem_editar_render(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    total = await page.evaluate(
        """async () => {
            const { games } = await import('./games.js');
            const { renderHub } = await import('./hub.js');
            const estendido = [
                ...games,
                { id: 'jogo-teste', name: 'Jogo Teste', url: 'jogo-teste/index.html' },
            ];
            const container = document.getElementById('hub-container');
            renderHub(container, estendido);
            return container.querySelectorAll('.hub-item').length;
        }"""
    )
    assert total == 3


async def test_hub_nao_carrega_script_de_jogo(page, live_http_server):
    requests: list[str] = []
    page.on("request", lambda req: requests.append(req.url))
    await page.goto(live_http_server.hub_url)
    await page.locator(".hub-item").first.wait_for(state="visible")
    assert not any("duck-shooting/js" in url for url in requests)
    assert not any("fruit-ninja/js" in url for url in requests)


# ------------------------------------------------------------------ F2


async def test_hub_entrada_e_link_real(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    link = page.locator("a.hub-link", has_text="Duck Shooting")
    assert await link.evaluate("(el) => el.tagName") == "A"
    href = await link.get_attribute("href")
    assert href == "duck-shooting/index.html"


async def test_navegar_para_duck_shooting(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Duck Shooting")
    await page.wait_for_url("**/game/duck-shooting/index.html")
    assert await page.locator("#game-canvas").count() == 1
    assert page.console_errors == []


async def test_navegar_para_fruit_ninja(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Fruit Ninja")
    await page.wait_for_url("**/game/fruit-ninja/index.html")
    assert await page.locator("#game-canvas").count() == 1
    assert page.console_errors == []


# ------------------------------------------------------------------ F3


async def test_voltar_ao_hub_a_partir_do_duck_shooting(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Duck Shooting")
    await page.wait_for_url("**/game/duck-shooting/index.html")
    await page.click("#back-to-hub")
    await page.wait_for_url("**/game/index.html")
    assert await page.locator(".hub-item").count() == 2
    assert page.console_errors == []


async def test_voltar_ao_hub_a_partir_do_fruit_ninja(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Fruit Ninja")
    await page.wait_for_url("**/game/fruit-ninja/index.html")
    await page.click("#back-to-hub")
    await page.wait_for_url("**/game/index.html")
    assert await page.locator(".hub-item").count() == 2
    assert page.console_errors == []


async def test_botao_voltar_nao_sobrepoe_area_de_jogo(page, live_http_server):
    """Geometria: o controle de voltar fica num canto pequeno, fora do centro
    da tela onde a mira/área de jogo do canvas se concentra."""
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Duck Shooting")
    await page.wait_for_url("**/game/duck-shooting/index.html")
    box = await page.locator("#back-to-hub").bounding_box()
    assert box is not None
    assert box["y"] < 60, "back-to-hub deveria ficar no canto superior"
    assert box["height"] < 40 and box["width"] < 160, "back-to-hub deveria ser um controle pequeno"


# ------------------------------------------------------------- fluxo completo


async def test_fluxo_completo_sem_erros_console(page, live_http_server):
    await page.goto(live_http_server.hub_url)
    await page.click("a.hub-link >> text=Duck Shooting")
    await page.wait_for_url("**/game/duck-shooting/index.html")
    await page.click("#back-to-hub")
    await page.wait_for_url("**/game/index.html")
    await page.click("a.hub-link >> text=Fruit Ninja")
    await page.wait_for_url("**/game/fruit-ninja/index.html")
    await page.click("#back-to-hub")
    await page.wait_for_url("**/game/index.html")
    assert page.console_errors == []
