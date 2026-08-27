"""Testes B1–B17 de specs/fruit-ninja/tests/integration-browser.md.

Faixa **obrigatória na execução padrão** (specs/fruit-ninja/tools/tooling.md):
carregam a página real do jogo, servida pelo servidor real em loopback, com um
dublê de gamepad injetado antes de qualquer script.

Por que esta faixa existe: neste repositório já houve suíte verde de lógica pura
com o produto inutilizável — toda a faixa de defeitos vivia na integração (DOM,
ligação entre input e tela, carregamento dos módulos). Lógica pura não prova que
o jogo **liga** as peças. Estes testes não podem ser pulados em silêncio: sem o
navegador, a suíte falha com a instrução de instalação.
"""

from __future__ import annotations

import asyncio
import socket
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from server.main import App, run_server

_INSTALL_HINT = (
    "Os testes de integração em navegador headless são obrigatórios na suíte padrão "
    "(specs/fruit-ninja/tools/tooling.md) e não podem ser pulados.\n"
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

# Dublê de gamepad (contrato de tests/integration-browser.md). Injetado com
# `add_init_script`, antes de qualquer script da página. NÃO dispara
# `gamepadconnected`: o jogo tem que descobrir o pad por polling (F1.7).
FAKE_GAMEPAD = """
window.__fakeGamepad = {
  // `add_init_script` roda de novo a cada reload, então o estado inicial do
  // dublê vem da URL: `?nopad=1` reabre a página sem gamepad.
  present: !location.search.includes('nopad'),
  axes: [0, 0, 0, 0],
  buttons: new Array(17).fill(false),
  actuatorThrows: false,
  effects: 0,
  set(patch) { Object.assign(this, patch); },
};
window.__rumbleErrors = 0;
navigator.getGamepads = function () {
  const fg = window.__fakeGamepad;
  if (!fg.present) return [];
  return [{
    index: 0,
    id: 'Fake XInput',
    connected: true,
    mapping: 'standard',
    axes: fg.axes.slice(),
    buttons: fg.buttons.map((p) => ({ pressed: !!p, touched: !!p, value: p ? 1 : 0 })),
    timestamp: performance.now(),
    vibrationActuator: {
      type: 'dual-rumble',
      playEffect() {
        fg.effects += 1;
        if (fg.actuatorThrows) {
          window.__rumbleErrors += 1;
          throw new Error('atuador falhou (injetado pelo teste)');
        }
        return Promise.resolve('complete');
      },
    },
  }];
};
"""


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
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/game/fruit-ninja/"

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


@dataclass
class Jogo:
    """Página do jogo carregada, com console e rede sob observação."""

    page: object
    server: ServerHandle
    console_errors: list[str] = field(default_factory=list)
    console_warnings: list[str] = field(default_factory=list)
    page_errors: list[str] = field(default_factory=list)
    requests: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)

    async def state(self) -> dict:
        return await self.page.evaluate("window.__fruitNinja.getState()")

    async def config(self) -> dict:
        return await self.page.evaluate("window.__fruitNinja.getConfig()")

    async def set_axes(self, ax: float, ay: float) -> None:
        await self.page.evaluate(
            "([ax, ay]) => window.__fakeGamepad.set({ axes: [0, 0, ax, ay] })", [ax, ay]
        )

    async def set_present(self, present: bool) -> None:
        await self.page.evaluate(
            "(v) => window.__fakeGamepad.set({ present: v })", present
        )

    async def hold(self, index: int, pressed: bool) -> None:
        await self.page.evaluate(
            "([i, v]) => { const b = window.__fakeGamepad.buttons.slice();"
            " b[i] = v; window.__fakeGamepad.set({ buttons: b }); }",
            [index, pressed],
        )

    async def pulse(self, index: int) -> None:
        """Pressiona e solta, garantindo que o jogo veja a borda de subida."""
        await self.hold(index, True)
        await self.page.wait_for_timeout(120)
        await self.hold(index, False)
        await self.page.wait_for_timeout(80)

    async def wait_screen(self, screen: str, timeout: int = 4000) -> None:
        await self.page.wait_for_function(
            "(alvo) => window.__fruitNinja.getState().screen === alvo",
            arg=screen,
            timeout=timeout,
        )

    async def calibrar_e_iniciar(self) -> None:
        """aguardando → calibracao → jogando, pelo caminho real do jogador."""
        await self.wait_screen("calibracao")
        await self.set_axes(0.0, 0.0)
        await self.pulse(BOTAO_A)
        # Estabilidade exigida por F12.3 antes de o Start valer.
        cfg = await self.config()
        await self.page.wait_for_timeout(cfg["calibrationStableMs"] + 250)
        await self.pulse(BOTAO_START)
        await self.wait_screen("jogando")


BOTAO_A = 0
BOTAO_START = 9

# Recursos do jogo cuja falha reprova B1. `/favicon.ico` fica de fora por
# decisão explícita de F14.2: corrigi-lo exigiria mexer no servidor.
EXTENSOES_DO_JOGO = (".html", ".css", ".js")


@pytest.fixture
async def jogo(browser, live_http_server):
    context = await browser.new_context(viewport={"width": 1280, "height": 720})
    await context.add_init_script(FAKE_GAMEPAD)
    page = await context.new_page()
    handle = Jogo(page=page, server=live_http_server)

    def on_console(msg):
        if msg.type == "error":
            handle.console_errors.append(msg.text)
        elif msg.type == "warning":
            handle.console_warnings.append(msg.text)

    page.on("console", on_console)
    page.on("pageerror", lambda exc: handle.page_errors.append(str(exc)))
    page.on("request", lambda req: handle.requests.append(req.url))
    page.on(
        "response",
        lambda res: handle.failed.append(f"{res.status} {res.url}")
        if res.status >= 400
        else None,
    )

    resposta = await page.goto(live_http_server.url, wait_until="load")
    handle.resposta = resposta  # type: ignore[attr-defined]
    await page.wait_for_function("() => Boolean(window.__fruitNinja)", timeout=5000)
    try:
        yield handle
    finally:
        await context.close()


# --------------------------------------------------------------------- casos


async def test_b1_carrega_limpo(jogo):
    """B1 (KPI-9) — 200, contrato exposto, console limpo, recursos servidos."""
    assert jogo.resposta.status == 200
    assert await jogo.page.evaluate("() => typeof window.__fruitNinja") == "object"

    await jogo.page.wait_for_timeout(500)

    assert jogo.console_errors == [], f"erros de console: {jogo.console_errors}"
    assert jogo.page_errors == [], f"exceções não tratadas: {jogo.page_errors}"

    do_jogo = [
        entrada
        for entrada in jogo.failed
        if any(entrada.split(" ", 1)[1].endswith(ext) for ext in EXTENSOES_DO_JOGO)
        or entrada.split(" ", 1)[1].rstrip("/").endswith("fruit-ninja")
    ]
    assert do_jogo == [], f"recursos do jogo falharam: {do_jogo}"


async def test_b2_aguardando_controle_e_descoberta_por_polling(jogo):
    """B2 (F11.1/F1.7) — sem pad, tela `aguardando`; com pad, `calibracao`."""
    await jogo.page.goto(jogo.server.url + "?nopad=1", wait_until="load")
    await jogo.page.wait_for_function("() => Boolean(window.__fruitNinja)")
    await jogo.page.wait_for_timeout(300)

    estado = await jogo.state()
    assert estado["screen"] == "aguardando"

    texto = await jogo.page.inner_text("#screen-aguardando .instrucao")
    assert texto.strip(), "a tela de espera precisa de instrução legível"
    assert jogo.console_errors == [], jogo.console_errors

    # Sem disparar `gamepadconnected`: descoberta é por polling.
    await jogo.set_present(True)
    await jogo.wait_screen("calibracao", timeout=500)


async def test_b3_apontamento_absoluto_fim_a_fim(jogo):
    """B3 (KPI-1) — dois caminhos, mesma inclinação final, mesma posição.

    Este é o caso que reprova a implementação por velocidade no produto real,
    não só na função pura.
    """
    await jogo.calibrar_e_iniciar()
    cfg = await jogo.config()
    espera = cfg["pointingSettleMs"] + 250

    async def percorrer(caminho):
        for ax, ay in caminho:
            await jogo.set_axes(ax, ay)
            await jogo.page.wait_for_timeout(140)
        await jogo.set_axes(0.3, -0.2)
        await jogo.page.wait_for_timeout(espera)
        return (await jogo.state())["blade"]["pos"]

    a = await percorrer([(0.0, 0.0), (-0.7, -0.7)])
    b = await percorrer([(0.0, 0.0), (0.7, 0.7)])

    distancia = ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
    assert distancia <= 1.0, f"caminhos diferentes deram posições diferentes: {distancia:.3f} px"


async def test_b4_neutro_volta_ao_centro(jogo):
    """B4 — extremo, 1 s, e de volta ao neutro: sem deriva residual."""
    await jogo.calibrar_e_iniciar()
    cfg = await jogo.config()

    await jogo.set_axes(0.7, 0.7)
    await jogo.page.wait_for_timeout(1000)
    await jogo.set_axes(0.0, 0.0)
    await jogo.page.wait_for_timeout(cfg["pointingSettleMs"] + 400)

    estado = await jogo.state()
    campo = estado["playfield"]
    centro_x = campo["x"] + campo["width"] / 2
    centro_y = campo["y"] + campo["height"] / 2
    pos = estado["blade"]["pos"]
    distancia = ((pos["x"] - centro_x) ** 2 + (pos["y"] - centro_y) ** 2) ** 0.5
    assert distancia <= cfg["pointingToleranceCss"], f"deriva de {distancia:.3f} px"


async def test_b5_calibracao_muda_a_area_alcancavel(jogo):
    """B5 (F12) — calibrar em (0.3, 0) recentra; voltar a (0,0) vai à esquerda."""
    await jogo.wait_screen("calibracao")
    cfg = await jogo.config()

    await jogo.set_axes(0.3, 0.0)
    await jogo.page.wait_for_timeout(200)
    await jogo.pulse(BOTAO_A)
    await jogo.page.wait_for_timeout(cfg["pointingSettleMs"] + 300)

    estado = await jogo.state()
    campo = estado["playfield"]
    centro_x = campo["x"] + campo["width"] / 2
    pos = estado["blade"]["pos"]
    assert abs(pos["x"] - centro_x) <= cfg["pointingToleranceCss"], "calibrar não recentrou"

    await jogo.set_axes(0.0, 0.0)
    await jogo.page.wait_for_timeout(cfg["pointingSettleMs"] + 300)
    pos = (await jogo.state())["blade"]["pos"]
    assert pos["x"] < centro_x - 10, "devolver ao neutro deveria levar a lâmina para a esquerda"


async def test_b6_instabilidade_bloqueia_o_inicio(jogo):
    """B6 (F12.3) — oscilando, Start não inicia; estável, inicia."""
    await jogo.wait_screen("calibracao")
    await jogo.set_axes(0.0, 0.0)
    await jogo.pulse(BOTAO_A)

    # Oscila bem além do raio de estabilidade e tenta iniciar.
    for _ in range(4):
        await jogo.set_axes(0.6, 0.0)
        await jogo.page.wait_for_timeout(120)
        await jogo.set_axes(-0.6, 0.0)
        await jogo.page.wait_for_timeout(120)
    await jogo.pulse(BOTAO_START)
    assert (await jogo.state())["screen"] == "calibracao", "instável não pode iniciar a partida"

    # Agora estabiliza no centro e inicia.
    cfg = await jogo.config()
    await jogo.set_axes(0.0, 0.0)
    await jogo.page.wait_for_timeout(cfg["calibrationStableMs"] + 300)
    await jogo.pulse(BOTAO_START)
    await jogo.wait_screen("jogando", timeout=2000)


async def _atravessar_com_a_lamina(jogo, kind: str) -> dict:
    """Coloca uma entidade no centro e varre a lâmina por cima dela."""
    await jogo.calibrar_e_iniciar()
    await jogo.page.evaluate("() => window.__fruitNinja.setSeed(42)")

    # Lâmina parada na esquerda antes do gesto.
    await jogo.set_axes(-0.7, 0.0)
    await jogo.page.wait_for_timeout(400)

    entidade_id = await jogo.page.evaluate(
        """(kind) => {
             const s = window.__fruitNinja.getState();
             const pf = s.playfield;
             return window.__fruitNinja.spawnForTest(kind, {
               pos: { x: pf.x + pf.width / 2, y: pf.y + pf.height / 2 },
               vel: { x: 0, y: 0 },
             });
           }""",
        kind,
    )

    # Varredura rápida para a direita, atravessando o centro.
    await jogo.set_axes(0.7, 0.0)
    await jogo.page.wait_for_timeout(400)
    return {"id": entidade_id, "estado": await jogo.state()}


async def test_b7_corte_fim_a_fim(jogo):
    """B7 (F4) — atravessar a fruta pontua, gera metades e conta o corte."""
    antes = None
    await jogo.calibrar_e_iniciar()
    await jogo.page.evaluate("() => window.__fruitNinja.setSeed(42)")
    await jogo.set_axes(-0.7, 0.0)
    await jogo.page.wait_for_timeout(400)
    antes = await jogo.state()

    entidade_id = await jogo.page.evaluate(
        """() => {
             const s = window.__fruitNinja.getState();
             const pf = s.playfield;
             return window.__fruitNinja.spawnForTest('fruit', {
               pos: { x: pf.x + pf.width / 2, y: pf.y + pf.height / 2 },
               vel: { x: 0, y: 0 },
             });
           }"""
    )

    await jogo.set_axes(0.7, 0.0)
    await jogo.page.wait_for_timeout(400)
    depois = await jogo.state()

    assert depois["score"] > antes["score"], "cortar a fruta tem que pontuar"
    assert depois["fruitsSliced"] >= antes["fruitsSliced"] + 1
    ativas = [e["id"] for e in depois["entities"] if e["state"] == "active"]
    assert entidade_id not in ativas, "a fruta atravessada deveria ter sido cortada"
    metades = [h for h in depois["halves"] if h["parentId"] == entidade_id]
    assert len(metades) == 2, f"esperava 2 metades, veio {len(metades)}"
    assert jogo.console_errors == [], f"erros durante o corte: {jogo.console_errors}"


async def test_b8_recorde_so_em_memoria(jogo):
    """B8 (F8.3) — recorde vive na sessão; recarregar zera; sem persistência."""
    resultado = await _atravessar_com_a_lamina(jogo, "bomb")
    estado = resultado["estado"]
    assert estado["screen"] == "gameOver"
    assert estado["highScore"] == estado["score"] or estado["highScore"] >= estado["score"]

    armazenamento = await jogo.page.evaluate(
        "() => [localStorage.length, sessionStorage.length, document.cookie]"
    )
    assert armazenamento[0] == 0, "localStorage deveria ficar vazio"
    assert armazenamento[1] == 0, "sessionStorage deveria ficar vazio"
    assert armazenamento[2] == "", "nenhum cookie deveria ser escrito"

    await jogo.page.reload(wait_until="load")
    await jogo.page.wait_for_function("() => Boolean(window.__fruitNinja)")
    assert (await jogo.state())["highScore"] == 0, "o recorde não pode sobreviver ao reload"


async def test_b9_pausa_e_retomada_por_perda_do_gamepad(jogo):
    """B9 (F11.3/F11.4) — congela sem controle e retoma sem corte espúrio."""
    await jogo.calibrar_e_iniciar()
    await jogo.page.wait_for_timeout(600)

    await jogo.set_present(False)
    await jogo.wait_screen("aguardando", timeout=2000)
    congelado = await jogo.state()

    await jogo.page.wait_for_timeout(1000)
    depois = await jogo.state()
    assert depois["elapsedS"] == congelado["elapsedS"], "o tempo avançou durante a pausa"
    assert depois["score"] == congelado["score"]
    assert depois["lives"] == congelado["lives"]
    posicoes = [(e["id"], e["pos"]["x"], e["pos"]["y"]) for e in depois["entities"]]
    congeladas = [(e["id"], e["pos"]["x"], e["pos"]["y"]) for e in congelado["entities"]]
    assert posicoes == congeladas, "as entidades se moveram durante a pausa"
    assert depois["blade"]["samples"] == [], "o rastro tem que ser limpo na pausa (T7)"

    await jogo.set_present(True)
    await jogo.wait_screen("jogando", timeout=2000)
    retomado = await jogo.state()
    assert retomado["score"] == congelado["score"], "corte espúrio no quadro do retorno"
    assert retomado["lives"] == congelado["lives"]


async def test_b10_exatamente_uma_tela_visivel(jogo):
    """B10 (F11.5) — em cada transição, uma única tela visível de fato."""

    async def visiveis() -> list[str]:
        return await jogo.page.eval_on_selector_all(
            "[data-screen]",
            """els => els.filter(e => {
                 const r = e.getBoundingClientRect();
                 const cs = getComputedStyle(e);
                 return r.width > 0 && r.height > 0
                   && cs.display !== 'none' && cs.visibility !== 'hidden';
               }).map(e => e.dataset.screen)""",
        )

    await jogo.page.goto(jogo.server.url + "?nopad=1", wait_until="load")
    await jogo.page.wait_for_function("() => Boolean(window.__fruitNinja)")
    await jogo.page.wait_for_timeout(250)
    assert await visiveis() == ["aguardando"]

    await jogo.set_present(True)
    await jogo.wait_screen("calibracao")
    await jogo.page.wait_for_timeout(150)
    assert await visiveis() == ["calibracao"]

    await jogo.calibrar_e_iniciar()
    await jogo.page.wait_for_timeout(150)
    assert await visiveis() == ["jogando"]

    await jogo.page.evaluate(
        """() => {
             const s = window.__fruitNinja.getState();
             const pf = s.playfield;
             window.__fruitNinja.spawnForTest('bomb', {
               pos: { x: s.blade.pos.x, y: s.blade.pos.y },
               vel: { x: 0, y: 0 },
             });
           }"""
    )
    await jogo.set_axes(0.7, 0.4)
    await jogo.wait_screen("gameOver", timeout=3000)
    await jogo.page.wait_for_timeout(150)
    assert await visiveis() == ["gameOver"]


async def test_b11_rumble_nao_derruba_o_quadro(jogo):
    """B11 (F9.3) — atuador que lança não pode congelar o loop."""
    await jogo.calibrar_e_iniciar()
    await jogo.page.evaluate("() => window.__fakeGamepad.set({ actuatorThrows: true })")

    await jogo.set_axes(-0.7, 0.0)
    await jogo.page.wait_for_timeout(400)
    antes = await jogo.state()

    await jogo.page.evaluate(
        """() => {
             const pf = window.__fruitNinja.getState().playfield;
             window.__fruitNinja.spawnForTest('fruit', {
               pos: { x: pf.x + pf.width / 2, y: pf.y + pf.height / 2 },
               vel: { x: 0, y: 0 },
             });
           }"""
    )
    await jogo.set_axes(0.7, 0.0)
    await jogo.page.wait_for_timeout(500)

    depois = await jogo.state()
    assert depois["score"] > antes["score"], "o corte tem que pontuar mesmo com rumble falhando"
    assert depois["elapsedS"] > antes["elapsedS"], "o loop congelou após a exceção do atuador"

    # O quadro segue avançando depois disso.
    await jogo.page.wait_for_timeout(400)
    assert (await jogo.state())["elapsedS"] > depois["elapsedS"]
    assert jogo.page_errors == [], f"exceção não tratada vazou: {jogo.page_errors}"


async def test_b12_sem_assets_externos(jogo):
    """B12 (F10.1/F14.4) — nada sai do servidor de teste, nenhum arquivo de mídia."""
    await jogo.calibrar_e_iniciar()
    await jogo.page.wait_for_timeout(600)

    origem = f"127.0.0.1:{jogo.server.port}"
    externas = [url for url in jogo.requests if origem not in url]
    assert externas == [], f"requisições para fora do servidor de teste: {externas}"

    midia = [
        url
        for url in jogo.requests
        if url.split("?")[0].endswith((".mp3", ".wav", ".ogg", ".png", ".jpg", ".jpeg", ".gif"))
    ]
    assert midia == [], f"o jogo baixou assets: {midia}"


async def test_b13_audio_antes_do_gesto(jogo):
    """B13 (F10.2) — som antes do gesto não quebra; depois, contexto `running`."""
    await jogo.page.wait_for_timeout(300)
    assert jogo.console_errors == [], f"erro antes de qualquer gesto: {jogo.console_errors}"
    assert jogo.page_errors == [], jogo.page_errors

    await jogo.calibrar_e_iniciar()
    await jogo.page.wait_for_timeout(300)

    estado_audio = await jogo.page.evaluate("() => window.__fruitNinja.audioContextState()")
    assert estado_audio == "running", f"AudioContext em {estado_audio!r} após o primeiro gesto"
    assert jogo.page_errors == [], jogo.page_errors


async def test_b14_game_over_por_bomba(jogo):
    """B14 (F5.1) — cortar bomba encerra na hora, com vidas sobrando."""
    resultado = await _atravessar_com_a_lamina(jogo, "bomb")
    estado = resultado["estado"]

    assert estado["screen"] == "gameOver"
    assert estado["gameOverReason"] == "bomb"
    assert estado["lives"] > 0, "a bomba encerra independentemente das vidas"

    motivo = await jogo.page.inner_text("#gameover-motivo")
    assert motivo.strip(), "a tela de game over precisa exibir o motivo"
    assert "bomba" in motivo.lower(), f"motivo não está em português: {motivo!r}"


async def test_b15_diagnostico_e_somente_leitura(jogo):
    """B15 (F14.5/F14.7) — mutar o getState não afeta o jogo."""
    await jogo.calibrar_e_iniciar()
    await jogo.page.wait_for_timeout(300)

    antes = await jogo.state()
    await jogo.page.evaluate(
        """() => {
             const s = window.__fruitNinja.getState();
             s.score = 999;
             s.lives = 99;
             s.entities.length = 0;
           }"""
    )
    depois = await jogo.state()
    assert depois["score"] != 999, "getState devolveu uma referência viva ao estado"
    assert depois["score"] == antes["score"]
    assert depois["lives"] == antes["lives"]

    # spawnForTest não mexe em nível nem no relógio da partida (F14.7).
    nivel_antes = depois["level"]
    await jogo.page.evaluate(
        """() => {
             const pf = window.__fruitNinja.getState().playfield;
             window.__fruitNinja.spawnForTest('fruit', {
               pos: { x: pf.x + 10, y: pf.y + pf.height - 10 },
               vel: { x: 0, y: -100 },
             });
           }"""
    )
    apos_spawn = await jogo.state()
    assert apos_spawn["level"] == nivel_antes, "spawnForTest alterou o nível"


async def test_b16_sem_mouse_nem_teclado_como_jogabilidade(jogo):
    """B16 (F12.5) — mouse e teclado não movem a lâmina nem iniciam a partida."""
    await jogo.wait_screen("calibracao")
    await jogo.set_axes(0.2, -0.1)
    await jogo.page.wait_for_timeout(500)
    antes = await jogo.state()

    await jogo.page.mouse.move(50, 60)
    await jogo.page.mouse.move(1200, 680)
    await jogo.page.mouse.click(640, 360)
    for tecla in ("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Space", "KeyA"):
        await jogo.page.keyboard.press(tecla)
    await jogo.page.wait_for_timeout(300)

    depois = await jogo.state()
    assert depois["screen"] == antes["screen"], "teclado/mouse iniciaram a partida"
    pos_a, pos_b = antes["blade"]["pos"], depois["blade"]["pos"]
    distancia = ((pos_a["x"] - pos_b["x"]) ** 2 + (pos_a["y"] - pos_b["y"]) ** 2) ** 0.5
    assert distancia <= 1.0, f"a lâmina se moveu {distancia:.2f} px com mouse/teclado"


async def test_b17_calibrar_nao_gera_rede(jogo):
    """B17 (F12.6) — calibrar é local ao jogo, não fala com o servidor."""
    await jogo.wait_screen("calibracao")
    await jogo.page.wait_for_timeout(200)

    marco = len(jogo.requests)
    await jogo.set_axes(0.25, -0.15)
    await jogo.page.wait_for_timeout(150)
    await jogo.pulse(BOTAO_A)
    await jogo.page.wait_for_timeout(400)
    assert jogo.requests[marco:] == [], f"calibrar gerou rede: {jogo.requests[marco:]}"

    # E também em partida. Os eixos ficam onde foram calibrados: é isso que
    # põe a lâmina no centro e satisfaz a estabilidade de F12.3.
    cfg = await jogo.config()
    await jogo.page.wait_for_timeout(cfg["calibrationStableMs"] + 300)
    await jogo.pulse(BOTAO_START)
    await jogo.wait_screen("jogando", timeout=2000)

    marco = len(jogo.requests)
    await jogo.pulse(BOTAO_A)
    await jogo.page.wait_for_timeout(400)
    assert jogo.requests[marco:] == [], f"calibrar em partida gerou rede: {jogo.requests[marco:]}"
