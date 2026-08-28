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


def test_g6_localstorage_com_lista_fechada_de_duas_chaves():
    """localStorage nunca em game/, e no cliente só em `storage.js` (F3.5/F12.8).

    A regra da spec é literal: EXATAMENTE duas chaves — o último endereço e o
    perfil de alcances. Estado de jogo continua proibido. Centralizar o acesso
    num módulo é o que torna a regra verificável: com o acesso espalhado,
    "quantas chaves existem?" vira uma busca no projeto inteiro e uma terceira
    chave entra sem ninguém notar.
    """
    usage = re.compile(r"localStorage\s*[.\[]")  # uso real, não comentário
    for path in _game_js_files():
        assert not usage.search(path.read_text(encoding="utf-8")), path

    dono = ROOT / "web" / "js" / "storage.js"
    for path in sorted((ROOT / "web").rglob("*.js")):
        if path == dono:
            continue
        assert not usage.search(path.read_text(encoding="utf-8")), (
            f"{path.name} toca localStorage fora do módulo dono (storage.js) — "
            "a lista fechada de duas chaves deixa de ser verificável"
        )

    texto = dono.read_text(encoding="utf-8")
    chaves = set(re.findall(r"['\"](wii-controller\.[\w.-]+)['\"]", texto))
    assert chaves == {
        "wii-controller.last-address",
        "wii-controller.ranges-profile",
    }, f"lista de chaves de localStorage não é a fechada de duas (F12.8): {sorted(chaves)}"


# ------------- verificações estáticas da revisão de precisão (tooling.md)


def test_sem_normalizacao_radial_no_mapeamento():
    """tooling.md 7 (F4): sem hipotenusa no mapeamento de apontamento.

    A normalização é por eixo e por direção; qualquer combinação radial dos
    dois eixos antes da normalização reintroduz o raio único que esta revisão
    remove — e desfaz, em silêncio, os quatro alcances medidos pela F12.
    """
    mapping = (ROOT / "server" / "mapping.py").read_text(encoding="utf-8")
    ofensas = [
        linha.strip()
        for linha in mapping.splitlines()
        if re.search(r"\bmath\.hypot\b|\bhypot\(", linha) and not linha.strip().startswith("#")
    ]
    assert ofensas == [], f"normalização radial de volta em mapping.py: {ofensas}"


def test_pc22_selecao_de_fonte_nao_decide_por_user_agent():
    """PC22/tooling.md 8 (F13.1): nada de decisão por nome de navegador.

    A detecção é em tempo de execução — a fonte só conta como disponível se
    amostras realmente chegarem. Decidir por `navigator.userAgent` envelhece
    mal e é cego para o modo de falha real do evento clássico, que é existir,
    ter permissão e mesmo assim não emitir nada sob economia de bateria.
    """
    proibido = re.compile(r"navigator\s*\.\s*(userAgent|userAgentData|platform|vendor)")
    for path in sorted((ROOT / "web" / "js").glob("*.js")):
        texto = path.read_text(encoding="utf-8")
        ofensas = [
            linha.strip()
            for linha in texto.splitlines()
            if proibido.search(linha) and not linha.strip().startswith("//")
        ]
        assert ofensas == [], f"decisão por user agent em {path.name}: {ofensas}"


def test_constantes_de_precisao_tem_dono_unico():
    """tooling.md 9: nenhuma constante espelhada além de RANGE_MIN/RANGE_MAX.

    Zona morta, sensibilidade, alcances e suavização são do servidor; janela de
    captura, estabilidade, retries e orçamento do assistente são do cliente.
    Qualquer outra constante duplicada reprova, porque é divergência silenciosa
    esperando acontecer.
    """
    servidor = (ROOT / "server" / "config.py").read_text(encoding="utf-8")
    cliente = (ROOT / "web" / "js" / "config.js").read_text(encoding="utf-8")

    def atribuidas(texto: str, padrao: str) -> set[str]:
        return set(re.findall(padrao, texto, re.MULTILINE))

    do_servidor = atribuidas(servidor, r"^([A-Z][A-Z0-9_]+)\s*[:=]")
    do_cliente = atribuidas(cliente, r"^export const ([A-Z][A-Z0-9_]+)\s*=")

    # ESCOPO DA REGRA: constantes de PRECISÃO/TUNING, que é onde a divergência
    # é silenciosa — dois lados com zonas mortas diferentes não dão erro
    # nenhum, só produzem uma mira que ninguém entende. Enums de PROTOCOLO
    # (`SOURCE_LADDER`, `DIAGNOSTIC_SOURCE`) e a taxa de envio são contrato
    # compartilhado por definição: os dois lados precisam concordar, e a
    # divergência ali falha alto (mensagem rejeitada), não em silêncio. O
    # projeto já tratava `BUTTON_IDS` assim, presente nos dois lados desde
    # antes desta revisão. Esses são verificados por ACORDO, logo abaixo.
    contrato_compartilhado = {"SOURCE_LADDER", "DIAGNOSTIC_SOURCE", "MOTION_SEND_HZ"}
    duplicadas = (do_servidor & do_cliente) - contrato_compartilhado
    assert duplicadas == {"RANGE_MIN_DEG", "RANGE_MAX_DEG"}, (
        "duplicação de constantes de precisão entre servidor e cliente fora da "
        f"única permitida: {sorted(duplicadas)}"
    )

    # O cliente é dono das constantes de captura/assistente; o servidor não
    # pode ter cópia delas.
    for constante in (
        "CALIB_WINDOW_MS",
        "CALIB_MIN_SAMPLES_FLOOR",
        "CALIB_STABILITY_PP_DEG",
        "WIZARD_BUDGET_MS",
    ):
        assert constante in do_cliente, f"{constante} deveria morar no cliente"
        assert constante not in do_servidor, f"{constante} duplicada no servidor"

    # E o servidor é dono das de mapeamento.
    for constante in (
        "DEAD_ZONE_YAW_DEG",
        "DEAD_ZONE_PITCH_DEG",
        "DEFAULT_RANGE_DEG",
        "SMOOTH_ALPHA_STILL",
    ):
        assert constante in do_servidor, f"{constante} deveria morar no servidor"
        assert constante not in do_cliente, f"{constante} duplicada no cliente"


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


def test_contrato_compartilhado_concorda_entre_os_dois_lados():
    """Os enums que os dois lados precisam conhecer têm de ser IGUAIS.

    `SOURCE_LADDER`/`DIAGNOSTIC_SOURCE` e a taxa de envio são contrato de
    protocolo, não parâmetro de tuning: existem nos dois lados por necessidade
    (o cliente percorre a escada, o servidor valida o enum do `status`). O que
    a spec exige deles não é ausência de cópia — é ACORDO. Um degrau a mais só
    no cliente faria o servidor descartar o `status` em silêncio, e o degrau em
    uso sumiria de `GET /metrics` (F13.6).
    """
    import json
    import subprocess

    from server import config

    node = shutil.which("node")
    assert node is not None
    resultado = subprocess.run(
        [
            node,
            "--input-type=module",
            "-e",
            "import('./web/js/config.js').then((m) => console.log(JSON.stringify({"
            "ladder: m.SOURCE_LADDER, diag: m.DIAGNOSTIC_SOURCE, hz: m.MOTION_SEND_HZ,"
            "rmin: m.RANGE_MIN_DEG, rmax: m.RANGE_MAX_DEG})))",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert resultado.returncode == 0, resultado.stderr
    cliente = json.loads(resultado.stdout.strip())

    assert tuple(cliente["ladder"]) == config.SOURCE_LADDER
    assert cliente["diag"] == config.DIAGNOSTIC_SOURCE
    assert cliente["hz"] == config.MOTION_SEND_HZ
    # A duplicação permitida também precisa concordar: o servidor é a
    # autoridade, e um cliente mais permissivo só produziria um "não" tardio.
    assert cliente["rmin"] == config.RANGE_MIN_DEG
    assert cliente["rmax"] == config.RANGE_MAX_DEG
