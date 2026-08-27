"""Procedimentos manuais M1–M8 de specs/fruit-ninja/tests/manual.md.

Faixa **manual**, marcada `@pytest.mark.hardware` e **excluída da execução
padrão** (`addopts = -m 'not hardware'`). Rode com `pytest -m hardware`.

Duas regras herdadas de `tools/tooling.md` e obrigatórias aqui:

- Cada procedimento declara um **critério observável** — o que o operador deve
  **ver**, não só o que fazer. Sem isso o procedimento não reprova nada.
- **Teste marcado nunca conta como cobertura.** Nenhum relatório pode declarar
  `SUCCESS` apoiado numa faixa cuja verificação foi adiada para um procedimento
  manual não executado; o veredito precisa dizer explicitamente o que ficou por
  verificar.

Pré-condições comuns: servidor do `wii-controller` no ar, celular pareado,
gamepad virtual ativo e o jogo aberto em `/game/fruit-ninja/` no PC.
"""

from __future__ import annotations

import pytest

hardware = pytest.mark.hardware


@hardware
def test_m1_calibracao_e_apontamento_absoluto():
    """M1 (F1, F12) — o requisito nº 1 do jogo, com o aparelho real.

    Fazer: segurar o aparelho na posição de jogo, calibrar (A), inclinar até um
    canto, voltar ao neutro e chegar ao MESMO canto por outro caminho (passando
    antes pelo canto oposto).

    Observar:
      (a) no neutro a lâmina está no CENTRO e volta para lá toda vez, sem deriva;
      (b) a mesma inclinação leva a lâmina ao MESMO ponto da tela nos dois
          caminhos, a olho nu;
      (c) a lâmina não continua se movendo com o aparelho parado.
    Qualquer "a mira sai à deriva e é preciso persegui-la" REPROVA — é o
    comportamento por velocidade que este jogo existe para descartar.
    """
    pytest.skip("Manual M1: apontamento absoluto e calibração com o aparelho real")


@hardware
def test_m2_bombas_inconfundiveis():
    """M2 (F5) — distinguibilidade visual da bomba.

    Fazer: jogar até aparecerem pelo menos 5 bombas junto com frutas.

    Observar: em TODAS as ocorrências a bomba é reconhecida como bomba ANTES de
    a lâmina chegar perto (cor escura, contorno de alerta, pavio), sem precisar
    olhar duas vezes. Corte acidental por confusão visual reprova.
    """
    pytest.skip("Manual M2: bomba reconhecível antes da lâmina chegar perto")


@hardware
def test_m3_continuidade_do_rastro():
    """M3 (KPI-3, F2) — o rastro é o revelador da qualidade do apontamento.

    Fazer: com o aparelho, desenhar círculos amplos e contínuos por 15 s.

    Observar: o rastro é uma linha contínua, sem trechos retos longos entre
    pontos (saltos) e sem engasgos periódicos; some em fração de segundo.
    Saltos visíveis reprovam (amostragem insuficiente ou decimação).
    """
    pytest.skip("Manual M3: rastro contínuo, sem saltos visíveis")


@hardware
def test_m4_rumble_e_audio():
    """M4 (F9, F10) — os dois canais de retorno não visuais.

    Fazer: cortar frutas, cortar uma bomba, deixar uma fruta cair.

    Observar:
      (a) corte de fruta produz vibração curta perceptível;
      (b) bomba e perda de vida vibram nitidamente MAIS LONGO/FORTE,
          distinguível da de corte sem olhar para a tela;
      (c) os três sons (corte, bomba, perda) são distinguíveis à escuta;
      (d) com o GamepadHapticActuator indisponível, o fallback assume sem
          mudança perceptível na jogabilidade.
    """
    pytest.skip("Manual M4: vibração e som distinguíveis sem olhar para a tela")


@hardware
def test_m5_cortabilidade():
    """M5 (KPI-2) — métrica COMPARATIVA entre versões, não limiar absoluto.

    Fazer: um jogador calibrado e familiarizado joga 3 partidas de ~2 min; ao
    fim de cada uma, ler `fruitsSliced` e `fruitsSpawned` em
    `window.__fruitNinja.getState()` (console) e registrar a razão.

    Observar: a taxa é REGISTRADA no relatório e comparada com a da versão
    anterior do controle. Queda relevante em relação à medição anterior exige
    investigação antes da entrega.
    """
    pytest.skip("Manual M5: registrar fruitsSliced/fruitsSpawned em 3 partidas")


@hardware
def test_m6_taxa_de_quadros():
    """M6 (KPI-4) — engasgo falsifica qualquer avaliação do controle.

    Fazer: jogar até o nível 5 (ou forçar `maxSimultaneous` do nível 5) com o
    contador de FPS ativo, por 60 s.

    Observar: o contador não desce abaixo de 55 fps em nenhum momento e a
    imagem não apresenta engasgo perceptível. Engasgo REPROVA — o jogador não
    distingue engasgo de atraso de controle.
    """
    pytest.skip("Manual M6: >= 55 fps por 60 s no nível 5, sem engasgo")


@hardware
def test_m7_produto_jogavel_fim_a_fim():
    """M7 (KPI-10) — CRITÉRIO DE PRONTO. Sem caminho automatizável.

    Fazer: com o servidor no ar e o jogo aberto no PC, jogar uma partida
    completa (até game over) usando APENAS o celular: calibrar, iniciar,
    cortar, evitar bombas, reiniciar.

    Observar: nenhum comando fica inerte (calibrar, iniciar e reiniciar
    respondem), a lâmina acompanha a inclinação durante toda a partida, não foi
    necessário recalibrar por deriva, e o jogo terminou por regra de jogo
    (bomba ou vidas), não por travamento.

    NENHUMA ENTREGA É DECLARADA COMPLETA SEM ESTE PROCEDIMENTO EXECUTADO E
    REGISTRADO.
    """
    pytest.skip("Manual M7 (KPI-10): partida completa só com o celular")


@hardware
def test_m8_perda_e_retorno_do_controle():
    """M8 (F11) — a pausa tem que ser inócua.

    Fazer: durante a partida, desconectar o celular (fechar a página do
    controle) e reconectar após ~10 s.

    Observar: a tela de "aguardando controle" aparece com instrução legível, o
    jogo congela (nenhuma fruta continua caindo e nenhuma vida é perdida
    durante a ausência) e, ao reconectar, a partida retoma com a mesma
    pontuação e vidas, sem corte espúrio no instante do retorno.
    """
    pytest.skip("Manual M8: congelar e retomar sem perda nem corte espúrio")
