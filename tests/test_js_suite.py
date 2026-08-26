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
    return sorted((ROOT / "game").rglob("*.js"))


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
def test_w5_fullscreen_paisagem_manual():
    pytest.skip("Procedimento manual W5: fullscreen + paisagem no A57")


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
