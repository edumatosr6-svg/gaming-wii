"""Ponte pytest → runner JS nativo do Node (tools/tooling.md) e checks estáticos.

Um único `pytest -q` cobre servidor e jogo: este teste roda `node --test`
como subprocesso e falha se a suíte JS falhar (W1–W3, G1–G12).
"""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
JS_TEST_DIR = ROOT / "tests" / "js"


def test_suite_js_via_node():
    node = shutil.which("node")
    assert node is not None, "Node.js é ferramenta de desenvolvimento exigida (tooling.md)"
    test_files = sorted(str(p) for p in JS_TEST_DIR.glob("*.test.mjs"))
    assert test_files, "nenhum arquivo de teste JS encontrado em tests/js/"
    result = subprocess.run(
        [node, "--test", *test_files],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        pytest.fail(f"suíte JS falhou:\n{result.stdout}\n{result.stderr}")
    assert "# fail 0" in result.stdout or "fail 0" in result.stdout


# --------------------------------------- verificações estáticas (G13, G14)


def _game_js_files() -> list[Path]:
    """Só o Duck Shooting (`game/js`).

    As checagens G13/G14/G6 abaixo são regras do slug `wii-controller`. Varrer
    `game/**` fazia elas alcançarem `game/fruit-ninja/`, que tem regras próprias
    (X1–X12, em `tests/test_fruit_ninja_static.py`) e cuja exceção de `fetch` é
    `js/rumble.js`, não `rumble-fallback.js`.
    """
    return sorted((ROOT / "game" / "js").rglob("*.js"))


def test_g13_sem_websocket_de_input_no_jogo():
    """`WebSocket` não aparece em game/ fora do fallback isolado (F10.1)."""
    for path in _game_js_files():
        text = path.read_text(encoding="utf-8")
        # nenhuma construção de WebSocket em módulo algum do jogo
        assert not re.search(r"new\s+WebSocket", text), f"WebSocket de input em {path}"
    # input vem só da Gamepad API
    input_js = (ROOT / "game" / "js" / "input.js").read_text(encoding="utf-8")
    assert "navigator.getGamepads" in input_js
    # fetch fora do overlay de métricas só no módulo isolado de fallback
    for path in _game_js_files():
        text = path.read_text(encoding="utf-8")
        if path.name in ("rumble-fallback.js", "loop.js"):
            continue  # fallback documentado (F8.3) e leitura de /metrics (F11)
        assert "fetch(" not in text, f"acesso HTTP inesperado em {path}"
    fallback = (ROOT / "game" / "js" / "rumble-fallback.js").read_text(encoding="utf-8")
    assert "POR QUE ESTE MÓDULO EXISTE" in fallback  # comentário explicativo exigido


def test_g14_sem_imports_cruzados():
    """Nenhum arquivo de game/ importa fora de game/; idem web/ (diretiva)."""
    for path in _game_js_files():
        for match in re.findall(r"from\s+'([^']+)'", path.read_text(encoding="utf-8")):
            assert match.startswith("./"), f"{path} importa fora de game/: {match}"
    for path in sorted((ROOT / "web").rglob("*.js")):
        for match in re.findall(r"from\s+'([^']+)'", path.read_text(encoding="utf-8")):
            assert match.startswith("./"), f"{path} importa fora de web/: {match}"


def test_g6_sem_localstorage_para_estado_de_jogo():
    """localStorage só no cliente (último IP) — nunca em game/ (diretiva)."""
    usage = re.compile(r"localStorage\s*[.\[]")  # uso real, não comentário
    for path in _game_js_files():
        assert not usage.search(path.read_text(encoding="utf-8")), path
    # em web/, apenas connection.js (pareamento F3)
    for path in sorted((ROOT / "web").rglob("*.js")):
        if path.name == "connection.js":
            continue
        assert not usage.search(path.read_text(encoding="utf-8")), path


# ------------------------------------------------------ manuais / hardware

hardware = pytest.mark.hardware


@hardware
def test_w4_sem_dependencias_externas_manual():
    pytest.skip("Procedimento manual W4: sem requests a domínio externo no A57")


@hardware
def test_w5_fullscreen_retrato_manual():
    """W5 - pegada vertical (F2.2). Observar: apos o toque inicial, a barra do
    navegador some, a tela permanece em RETRATO mesmo girando o aparelho para
    apontar, e gestos de scroll/zoom/duplo-toque nao movem nem redimensionam
    a interface.
    """
    pytest.skip("Procedimento manual W5: fullscreen + retrato (aparelho em pe) no A57")


@hardware
def test_w6_sensor_indisponivel_falha_alto_manual():
    pytest.skip("Procedimento manual W6: aviso visível em <= 2 s sem sensores")


@hardware
def test_w7_pareamento_manual():
    pytest.skip("Procedimento manual W7: pré-preenchimento de IP e erros F3")


@hardware
def test_w8_multi_touch_manual():
    pytest.skip("Procedimento manual W8: L + A + inclinação simultâneos")


@hardware
def test_w9_vibracao_manual():
    pytest.skip("Procedimento manual W9: vibrate real no aparelho")


@hardware
def test_w10_calibracao_manual():
    pytest.skip("Procedimento manual W10: calibrar recentra a mira")


@hardware
def test_g15_a_g19_duck_shooting_manuais():
    pytest.skip("Procedimentos manuais G15–G19: fluxo de entrada, rumble, áudio, FPS")


@hardware
def test_w20_sessao_jogavel_fim_a_fim_manual():
    """W20 / KPI-13 — critério de "o produto funciona". Sem caminho automatizável.

    Observar: com o servidor no ar e o Duck Shooting aberto no PC, jogar uma
    rodada completa usando apenas o celular, SEGURANDO-O EM PE COMO UM WII
    REMOTE — a mira esta onde a ponta do aparelho aponta (apontar para um canto
    leva a mira ao canto; voltar ao neutro RECENTRA a mira, ela nunca fica "a
    deriva"), o botao A dispara, a calibracao recentraliza e nenhum controle
    fica inerte durante a partida.
    """
    pytest.skip("Procedimento manual W20 (KPI-13): partida completa só com o celular")


@hardware
def test_w22m_ergonomia_e_sentido_do_apontamento_manual():
    """W22m / KPI-18 - o fio que so o hardware fecha (F4, pegada vertical).

    Observar, com o jogo aberto e o aparelho calibrado em pe:
    (a) apontar a ponta para a DIREITA move a mira para a DIREITA; esquerda,
        esquerda; LEVANTAR a ponta move a mira para CIMA; abaixar, baixo -
        4/4 direcoes corretas, sem nenhuma inversao;
    (b) varrer a mira de uma borda a outra e possivel SO com o giro do pulso,
        sem mover o cotovelo (MAX_ANGLE_DEG padrao de 20 graus - se exigir o
        braco, o parametro reprova);
    (c) torcer o aparelho no proprio eixo (ponta fixa) NAO desloca a mira
        perceptivelmente;
    (d) a mira responde sem atraso perceptivel - a suavizacao padrao nao pode
        ser sentida como borracha.
    """
    pytest.skip("Procedimento manual W22m (KPI-18): sentido e ergonomia com sensor real")


@hardware
def test_e10_inicializacao_com_driver_real_manual():
    """E10 / KPI-15 — o dublê da suíte padrão não é evidência de integração.

    Observar: com o ViGEmBus instalado, `python server/main.py` conclui a
    inicialização, o terminal imprime as URLs e nenhuma exceção aparece —
    incluindo o registro do callback de rumble, cuja assinatura a biblioteca
    inspeciona em tempo de execução.
    """
    pytest.skip("Procedimento manual E10 (KPI-15): subir o servidor com o driver real")


def test_g20_static_mira_nao_integra_velocidade_no_consumidor():
    """G20/KPI-16 (estático): o consumidor da mira não reintroduz velocidade.

    Complementa os testes puros G20–G21, que medem `aim.js`. Verificado por
    mutação: reintroduzir `crosshair.x + eixo * ganho * dt` em `loop.js`
    mantinha G20/G21 passando (eles só enxergam a função pura), e apenas este
    caso reprova — a invariante do GameState (`crosshair` é função da leitura
    ATUAL do eixo, nunca do valor anterior) vive no consumidor também.
    """
    loop_js = (ROOT / "game" / "js" / "loop.js").read_text(encoding="utf-8")

    # A mira tem de vir da função pura de posição absoluta.
    assert (
        "crosshairFromAxes(" in loop_js
    ), "loop.js não deriva a mira da função pura de posição absoluta (F10.7)"

    # E não pode se realimentar da posição anterior.
    realimentacao = re.compile(
        r"crosshair\s*\.\s*[xy]\s*[-+]|[-+]=\s*[^;\n]*\baxis[XY]\b|"
        r"\bstate\s*\.\s*crosshair\s*\.\s*[xy]\s*\+",
    )
    ofensas = [line.strip() for line in loop_js.splitlines() if realimentacao.search(line)]
    assert ofensas == [], (
        "a posição da mira se realimenta da posição anterior (integração de "
        f"velocidade) — proibido por F10.7/KPI-16: {ofensas}"
    )
