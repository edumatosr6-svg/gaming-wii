# Testes — Procedimentos manuais (hardware real) [KPI-2, KPI-4, KPI-10]

Faixa **manual**, marcada (`@pytest.mark.hardware`) e **excluída da execução padrão**.
Regras herdadas de `tools/tooling.md` do `wii-controller` e obrigatórias aqui:

- Cada procedimento declara um **critério observável** — o que o operador deve **ver**,
  não apenas o que fazer. Sem isso o procedimento não é capaz de reprovar nada.
- **Teste marcado nunca conta como cobertura.** Um relatório de testes não pode declarar
  `SUCCESS` apoiado em uma faixa cuja verificação foi adiada para procedimento manual
  não executado; o veredito precisa dizer explicitamente o que ficou por verificar.

Pré-condições comuns: servidor do `wii-controller` no ar, celular pareado e gamepad
virtual ativo, jogo aberto em `/game/fruit-ninja/` no PC.

- **M1 — Calibração e apontamento absoluto (F1, F12)**
  - Fazer: segurar o aparelho na posição de jogo, calibrar (`A`), depois inclinar o
    aparelho até um canto, voltar à posição neutra, e repetir chegando ao mesmo canto
    por um caminho diferente (passando pelo canto oposto antes).
  - **Observar**: (a) na posição neutra a lâmina está no **centro** da tela, e volta
    para lá toda vez, sem deriva; (b) a mesma inclinação leva a lâmina ao **mesmo ponto
    da tela** nos dois caminhos, a olho nu; (c) a lâmina não continua se movendo quando
    o aparelho está parado. Qualquer "a mira sai à deriva e é preciso persegui-la"
    **reprova** — é o comportamento por velocidade que este jogo existe para descartar.

- **M2 — Bombas inconfundíveis (F5)**
  - Fazer: jogar até aparecerem pelo menos 5 bombas junto com frutas.
  - **Observar**: em todas as ocorrências a bomba é reconhecida como bomba **antes** de
    a lâmina chegar perto (cor escura, contorno de alerta, pavio), sem precisar olhar
    duas vezes. Corte acidental por confusão visual reprova.

- **M3 — Continuidade do rastro (KPI-3, F2)**
  - Fazer: com o aparelho, desenhar círculos amplos e contínuos por 15 s.
  - **Observar**: o rastro é uma linha contínua, sem trechos retos longos entre pontos
    (saltos) e sem engasgos periódicos; o rastro desaparece em fração de segundo.
    Saltos visíveis reprovam (amostragem insuficiente ou decimação).

- **M4 — Rumble e áudio (F9, F10)**
  - Fazer: cortar frutas, cortar uma bomba, deixar uma fruta cair.
  - **Observar**: (a) corte de fruta produz vibração curta perceptível; (b) bomba e
    perda de vida produzem vibração **nitidamente mais longa/forte**, distinguível da
    de corte sem olhar para a tela; (c) os três sons (corte, bomba, perda) são
    distinguíveis entre si à escuta; (d) com o `GamepadHapticActuator` indisponível, o
    fallback assume sem mudança perceptível na jogabilidade.

- **M5 — Cortabilidade (KPI-2)**
  - Fazer: um jogador já calibrado e familiarizado joga 3 partidas de ~2 min; ao fim de
    cada uma, ler `fruitsSliced` e `fruitsSpawned` em
    `window.__fruitNinja.getState()` (console do navegador) e registrar a razão.
  - **Observar**: a taxa é **registrada** no relatório e comparada com a da versão
    anterior do controle. Métrica **comparativa** entre versões (regressão de qualidade
    de controle), não limiar absoluto de aceite; queda relevante em relação à medição
    anterior exige investigação antes da entrega.

- **M6 — Taxa de quadros (KPI-4)**
  - Fazer: jogar até o nível 5 (ou forçar `maxSimultaneous` do nível 5) com o contador
    de FPS ativo, por 60 s.
  - **Observar**: o contador não desce abaixo de 55 fps em nenhum momento e a imagem não
    apresenta engasgo perceptível. Engasgo reprova — falsifica qualquer avaliação do
    controle, porque o jogador não distingue engasgo de atraso de controle.

- **M7 — Produto jogável fim-a-fim (KPI-10) — critério de pronto**
  - Fazer: com o servidor no ar e o jogo aberto no PC, jogar uma partida completa (até
    game over) usando **apenas o celular**: calibrar, iniciar, cortar, evitar bombas,
    reiniciar.
  - **Observar**: nenhum comando fica inerte (calibrar, iniciar e reiniciar respondem),
    a lâmina acompanha a inclinação durante toda a partida, não foi necessário
    recalibrar por deriva, e o jogo terminou por regra de jogo (bomba ou vidas), não por
    travamento. **Nenhuma entrega é declarada completa sem este procedimento
    executado e registrado.**

- **M8 — Perda e retorno do controle (F11)**
  - Fazer: durante a partida, desconectar o celular (fechar a página do controle) e
    reconectar após ~10 s.
  - **Observar**: a tela de "aguardando controle" aparece com instrução legível, o jogo
    congela (nenhuma fruta continua caindo e nenhuma vida é perdida durante a ausência)
    e, ao reconectar, a partida retoma com a mesma pontuação e vidas, sem corte espúrio
    no instante do retorno.
