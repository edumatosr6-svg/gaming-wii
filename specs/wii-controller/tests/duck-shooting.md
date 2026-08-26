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

## Estáticos

- **G13 — Sem WebSocket de input**: busca no código de `game/` por `WebSocket`
  encontra no máximo o módulo isolado de fallback de rumble, com comentário
  explicativo; input vem só de `navigator.getGamepads()` (critério F10.1).
- **G14 — Sem imports de `web/` ou do servidor**: nenhum arquivo de `game/` importa
  caminho fora de `game/`.

## Manuais / visuais [manual/hardware]

- **G15 — Fluxo de entrada**: primeira execução guia a calibração antes da rodada 1 e
  confirma mira estável no centro (F10, P4.2).
- **G16 — Rumble na mecânica**: disparo vibra curto (coice); acerto vibra com padrão
  distinto e distinguível (critério F8.4); com `GamepadHapticActuator` indisponível,
  o fallback `POST /rumble` assume sem mudança perceptível na jogabilidade (F8.3).
- **G17 — Áudio**: tiro, acerto e escape têm sons sintetizados distintos.
- **G18 — FPS (KPI-8)**: com o overlay de latência ativo, o jogo mantém 60 fps
  estáveis durante uma rodada cheia com o máximo de patos simultâneos.
- **G19 — Aguardando controle**: abrir o jogo sem o servidor/celular conectado mostra
  a tela "aguardando controle" e entra no fluxo normal quando o gamepad aparece.
