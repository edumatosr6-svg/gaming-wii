"""Verificações estáticas X1–X12 de specs/fruit-ninja/tests/static-constraints.md.

Faixa barata que pega exatamente as regressões que a arquitetura deste slug
proíbe: fonte única de input, ausência de rede/persistência/engine, pureza dos
módulos de regra e invariantes de `config.js`.
"""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / "game" / "fruit-ninja"
JS = GAME / "js"


def _js_files() -> list[Path]:
    files = sorted(JS.rglob("*.js"))
    assert files, "nenhum módulo JS encontrado em game/fruit-ninja/js/"
    return files


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_x1_fonte_unica_de_input():
    """`navigator.getGamepads` só em js/input.js — e tem que existir (F1.6)."""
    com_gamepad_api = [p for p in _js_files() if "navigator.getGamepads" in _read(p)]
    assert com_gamepad_api, (
        "nenhum arquivo chama navigator.getGamepads: o jogo não tem fonte de input. "
        "Uma varredura que passe vazia aqui não prova nada."
    )
    assert [p.name for p in com_gamepad_api] == ["input.js"], (
        f"Gamepad API fora de input.js: {[str(p) for p in com_gamepad_api]}"
    )
    # E a chamada real existe, não só a menção em comentário.
    assert re.search(r"^\s*(return |const |let )?navigator\.getGamepads\(\)", _read(JS / "input.js"), re.M)


def test_x2_sem_websocket():
    for path in _js_files():
        assert not re.search(r"new\s+WebSocket", _read(path)), f"WebSocket em {path}"


def test_x3_rede_isolada_no_modulo_de_rumble():
    for path in _js_files():
        texto = _read(path)
        tem_rede = "fetch(" in texto or "XMLHttpRequest" in texto
        if tem_rede:
            assert path.name == "rumble.js", f"acesso HTTP inesperado em {path}"
    rumble = _read(JS / "rumble.js")
    assert "POR QUE ESTE MÓDULO EXISTE" in rumble, "a exceção de rede precisa da justificativa"


def test_x4_sem_persistencia():
    proibidos = ("localStorage", "sessionStorage", "document.cookie")
    for path in _js_files():
        texto = _read(path)
        for termo in proibidos:
            assert termo not in texto, f"{termo} em {path} (F8.4 proíbe persistência)"


def test_x5_sem_imports_externos():
    for path in _js_files():
        for alvo in re.findall(r"from\s+['\"]([^'\"]+)['\"]", _read(path)):
            assert alvo.startswith("./"), f"{path} importa fora do jogo: {alvo}"
            assert (path.parent / alvo).resolve().is_file(), f"{path}: import quebrado {alvo}"

    html = _read(GAME / "index.html")
    for alvo in re.findall(r"(?:src|href)=\"([^\"]+)\"", html):
        assert alvo.startswith("./"), f"index.html referencia recurso externo: {alvo}"
        assert (GAME / alvo).resolve().is_file(), f"index.html: recurso inexistente {alvo}"


def test_x6_servidor_intocado():
    """Nada fora de game/fruit-ninja/ e tests/ foi alterado — em especial server/."""
    resultado = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr

    tocados = []
    for linha in resultado.stdout.splitlines():
        caminho = linha[3:].strip().strip('"')
        if caminho.startswith(("game/fruit-ninja/", "tests/", "specs/")):
            continue
        tocados.append(caminho)
    assert not tocados, f"arquivos alterados fora do escopo permitido: {tocados}"

    servidor = [linha for linha in resultado.stdout.splitlines() if "server/" in linha]
    assert not servidor, f"server/ foi alterado: {servidor}"


PUROS = ("slicing.js", "entities.js", "rules.js", "blade.js")


@pytest.mark.parametrize("nome", PUROS)
def test_x7_pureza_dos_modulos_de_regra(nome):
    texto = _read(JS / nome)
    # Remove comentários: a proibição é de USO, não de menção na documentação.
    codigo = re.sub(r"/\*.*?\*/", "", texto, flags=re.S)
    codigo = re.sub(r"//.*", "", codigo)
    for termo in (
        "document",
        "window",
        "canvas",
        "Math.random",
        "Date.now",
        "performance.now",
        "setTimeout",
        "setInterval",
        "requestAnimationFrame",
    ):
        assert termo not in codigo, f"{nome} usa {termo} — deveria ser puro (X7)"


def test_x8_toque_no_navegador_restrito():
    com_raf = [p.name for p in _js_files() if "requestAnimationFrame" in _read(p)]
    assert com_raf == ["loop.js"], f"requestAnimationFrame fora de loop.js: {com_raf}"

    com_ctx = [p.name for p in _js_files() if "getContext('2d')" in _read(p)]
    assert com_ctx == ["render.js"], f"getContext('2d') fora de render.js: {com_ctx}"


def test_x9_constantes_de_tuning_so_em_config():
    """Os nomes de tuning da spec existem em config.js e só lá são definidos."""
    config_js = _read(JS / "config.js")
    esperados = [
        "deadzone",
        "maxTilt",
        "smoothingTauMs",
        "pointingSettleMs",
        "pointingToleranceCss",
        "trailDurationMs",
        "maxTrailSamples",
        "trailReferenceSpeedCssPerS",
        "bladeMaxStepCss",
        "gravityCssPerS2",
        "minAirtimeS",
        "fruitRadiusCss",
        "bombRadiusCss",
        "minSliceSpeedCssPerS",
        "comboBreakMs",
        "basePoints",
        "startingLives",
        "levelDurationS",
        "maxLevel",
        "fixedStepS",
        "maxFrameDeltaS",
        "calibrationStableRadiusCss",
        "calibrationStableMs",
        "dtToleranceCss",
    ]
    faltando = [nome for nome in esperados if nome not in config_js]
    assert not faltando, f"constantes da spec ausentes de config.js: {faltando}"

    # Nenhum outro módulo redefine uma constante de tuning.
    for path in _js_files():
        if path.name == "config.js":
            continue
        codigo = re.sub(r"//.*", "", _read(path))
        for nome in esperados:
            assert not re.search(rf"\b(const|let|var)\s+{nome}\s*=", codigo), (
                f"{path.name} redefine a constante de tuning {nome} (X9)"
            )


def test_x10_sem_engine_nem_dependencia():
    for path in _js_files():
        texto = _read(path).lower()
        for engine in ("phaser", "pixi", "three.js", "matter.js"):
            assert engine not in texto, f"engine {engine} referenciada em {path}"
    assert not (GAME / "package.json").exists(), "package.json novo sob game/fruit-ninja/"
    assert not (GAME / "node_modules").exists(), "node_modules sob game/fruit-ninja/"


def test_x11_contrato_de_diagnostico():
    definem = [p.name for p in _js_files() if "window.__fruitNinja" in _read(p)]
    assert definem == ["main.js"], f"__fruitNinja definido em {definem} (deveria ser só main.js)"

    main = _read(JS / "main.js")
    for funcao in ("getState", "getConfig", "setGamepadIndex", "setSeed", "spawnForTest"):
        assert re.search(rf"\b{funcao}\s*\(", main), f"__fruitNinja não expõe {funcao} (F14.5)"


def _config_como_json() -> dict:
    """Lê `config` executando o módulo no Node — a fonte é o arquivo real."""
    script = (
        "import('./game/fruit-ninja/js/config.js')"
        ".then((m) => console.log(JSON.stringify(m.config)))"
    )
    resultado = subprocess.run(
        ["node", "-e", script], cwd=ROOT, capture_output=True, text=True, timeout=60
    )
    assert resultado.returncode == 0, f"falha ao ler config.js: {resultado.stderr}"
    return json.loads(resultado.stdout)


def test_x12_invariantes_de_configuracao():
    cfg = _config_como_json()

    assert 0 <= cfg["deadzone"] < cfg["maxTilt"] <= 1, "0 <= deadzone < maxTilt <= 1"
    assert cfg["smoothingTauMs"] <= 60, "smoothingTauMs acima de 60 ms atrasa o apontamento"
    assert 150 <= cfg["trailDurationMs"] <= 400, "trailDurationMs fora da faixa de F2.3"

    esperado = 1.5 * cfg["trailReferenceSpeedCssPerS"] / 60
    assert abs(cfg["bladeMaxStepCss"] - esperado) < 1e-9, (
        f"bladeMaxStepCss ({cfg['bladeMaxStepCss']}) não deriva de "
        f"trailReferenceSpeedCssPerS ({esperado})"
    )

    niveis = cfg["levels"]
    assert len(niveis) == cfg["maxLevel"] + 1, "número de níveis não bate com maxLevel"
    for i, nivel in enumerate(niveis):
        assert nivel["bombChance"] > 0, f"nível {i} sem bombas"
        if i:
            assert nivel["bombChance"] >= niveis[i - 1]["bombChance"], (
                f"bombChance caiu no nível {i}"
            )
