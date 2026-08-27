# Testes — Duck Shooting [F10, F8, KPI-8]

A lógica pura (`entities.js`, `rules.js`) tem testes automatizados que rodam sem
navegador, integrados ao comando único da suíte (ver tools/tooling.md).
Renderização e game loop: verificação visual.

## Automatizados — `rules.js` (munição, rodadas, pontuação)

- **G1 — Munição**: rodada começa com 3 tiros; cada disparo decrementa; disparo com 0
  não decrementa, não abate e sinaliza "sem munição" (critério F10.2); `ammo` nunca
  negativo (invariante GameState).
- **G2 — Recarga**: ao fim da leva/rodada, munição volta a 3 automaticamente.
- **G3 — Pontuação e streak**: acerto soma pontos; acertos consecutivos aplicam bônus
  crescente; um erro reseta o multiplicador a 0/base (critério F10.5).
- **G4 — Avanço de rodada**: atingido o critério mínimo de acertos, avança; abaixo do
  critério, game over com pontuação final (fluxo P4).
- **G5 — Curva de dificuldade**: para todo N, os parâmetros da rodada N+1 têm
  velocidade e quantidade de patos ≥ rodada N, com aumento estrito em pelo menos um
  (critério F10.4).
- **G6 — Recorde de sessão**: highScore atualiza quando score final o supera; nenhuma
  escrita em `localStorage` (restrição das diretivas).

## Automatizados — `entities.js` (spawn, trajetória, colisão)

- **G7 — Spawn**: patos surgem na base da tela (faixa da vegetação), com trajetória e
  velocidade dentro dos parâmetros da rodada.
- **G8 — Escape**: pato não abatido cruza o topo e é marcado como escapado, contando
  contra o critério da rodada.
- **G9 — Colisão de tiro**: tiro dentro da hitbox abate; na borda exata segue a regra
  documentada (inclusivo/exclusivo definido no código); fora, não abate (F10.3).
- **G10 — Sobreposição**: dois patos sobrepostos, um tiro abate exatamente um, de
  forma determinística (o mais acima na ordem de desenho) (F10.3).
- **G11 — Delta time**: simular a mesma rodada com dt=1/60 e dt=1/144 (mesma semente
  de aleatoriedade): posições finais equivalentes dentro da tolerância definida no
  teste (critério F10.6).
- **G12 — Determinismo com semente**: mesma semente → mesmas trajetórias (pré-condição
  para G11 e para comparação entre versões).

## Automatizados — mira absoluta (posição, não taxa) [F10.7–F10.10, KPI-16, KPI-18]

Alvo: a função pura que deriva a posição da mira da leitura atual do eixo (lógica de
`loop.js`/módulo de mira extraída como função testável — recebe eixo + geometria da
tela, devolve posição).

- **G20 — Eixo constante ⇒ mira parada**: dado eixo constante (0.5, 0) alimentado por
  N quadros consecutivos (N ≥ 100, dt variado), então a posição da mira é a mesma em
  todos os quadros — a mira **não** se desloca (critério F10.7). *Reprova a
  implementação por velocidade (`pos += eixo × ganho × dt`), na qual a mira andaria a
  cada quadro.*
- **G21 — Independência de histórico (KPI-16)**: dado duas sequências diferentes de
  leituras de eixo que terminam no mesmo valor, então a posição final da mira é
  exatamente igual nos dois casos (critério F10.8).
- **G22 — Centro, bordas e sentido**: eixo normalizado (0, 0) ⇒ mira no centro da
  área de jogo; (±1, ±1) ⇒ bordas correspondentes (tolerância 1 px); x > 0 ⇒ mira à
  direita do centro; y > 0 ⇒ mira **acima** do centro em coordenadas de tela
  (critérios F10.7 e F10.9 — cobre a inversão do eixo y do Canvas; opera sobre o
  valor **já normalizado** por G23).
- **G23 — Normalização da convenção da Gamepad API (KPI-18)**: dado uma amostra
  sintética crua no *standard mapping* da Gamepad API com `axes[3] = -0.5` (stick
  para **cima**), quando a função de normalização de `input.js` converte e a posição
  da mira é derivada, então o eixo interno tem y **positivo** e a mira fica **acima**
  do centro; com `axes[3] = +0.5` (baixo), y negativo e mira abaixo; com
  `axes[2] = ±0.5`, x com o mesmo sinal e mira à direita/esquerda correspondente
  (critério F10.10). *Fecha por teste automatizado o fio ponta a ponta do sentido
  vertical, que a convenção invertida do standard mapping tornaria um defeito
  invisível para testes que só olham a função pura da mira.*

## Estáticos

- **G13 — Sem WebSocket de input**: busca no código de `game/` por `WebSocket`
  encontra no máximo o módulo isolado de fallback de rumble, com comentário
  explicativo; input vem só de `navigator.getGamepads()` (critério F10.1).
- **G14 — Sem imports de `web/` ou do servidor**: nenhum arquivo de `game/` importa
  caminho fora de `game/`.

## Manuais / visuais [manual/hardware]

- **G15 — Fluxo de entrada**: primeira execução guia a calibração antes da rodada 1,
  instruindo a segurar o aparelho **em pé apontando para a tela** (pegada vertical), e
  confirma mira estável no centro (F10, P4.2). *Observar:* com o aparelho na posição
  neutra calibrada, a mira está no centro; apontar a ponta para um canto leva a mira
  àquele canto; voltar ao neutro **recentra** a mira (não apenas a para onde estava).
- **G16 — Rumble na mecânica**: disparo vibra curto (coice); acerto vibra com padrão
  distinto e distinguível (critério F8.4); com `GamepadHapticActuator` indisponível,
  o fallback `POST /rumble` assume sem mudança perceptível na jogabilidade (F8.3).
- **G17 — Áudio**: tiro, acerto e escape têm sons sintetizados distintos.
- **G18 — FPS (KPI-8)**: com o overlay de latência ativo, o jogo mantém 60 fps
  estáveis durante uma rodada cheia com o máximo de patos simultâneos.
- **G19 — Aguardando controle**: abrir o jogo sem o servidor/celular conectado mostra
  a tela "aguardando controle" e entra no fluxo normal quando o gamepad aparece.
