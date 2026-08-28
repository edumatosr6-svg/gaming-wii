# Code Validation Report — wii-controller

**Veredito: SUCCESS**

Data: 2026-08-27 — validação estática da rodada "pegada vertical + apontamento
absoluto" (specs reaprovadas no commit 6d41125). Nenhum teste executado aqui
(Testing Loop é do impl-tester).

## Cobertura de specs

| Feature | Estado | Evidência |
|---|---|---|
| F1 Servidor local | Implementado (sem mudança nesta rodada) | `server/main.py` — HTTPS+WS mesma porta, rotas `/metrics`, `/rumble`, `/game` |
| F2 Cliente retrato "corpo de Wii Remote" | Implementado | `web/index.html` (ordem: `#sensor-tip` persistente → D-pad → A dominante `.a-main` 8.5rem → B/X/Y colados ao A → START/BACK → L/R), `web/css/style.css` (coluna centrada; A com área estritamente maior; `[data-conn-state]` distinto nos 4 estados; ilustração de pegada `.grip-illustration` em `pareamento`/`conectando`; reforço `.grip-reminder` junto ao calibrar), `web/js/main.js` (`screen.orientation.lock('portrait')`; ponta do sensor atualizada em `setScreen`) |
| F3 Pareamento por IP | Implementado (sem mudança) | `web/js/main.js`/`connection.js` |
| F4 Apontamento absoluto pegada vertical | Implementado | `server/mapping.py::pointing_to_axes` — yaw direita = −Δalpha → x; pitch cima = Δbeta → y; rolagem (gamma) fora do mapeamento por construção (F4.7); ordem (a) offset → (b) derivação → (c) zona morta radial → (d) sensibilidade → (e) saturação suave; puro, sem I/O; `web/js/motion.js` envia `a`,`b`,`g` crus a 60 Hz |
| F5 Calibração | Implementado | `server/session.py` — offset triplo `(alpha0, beta0, gamma0)`, zero padrão sem amostra prévia, sem acúmulo |
| F6 Botões touch | Implementado (sem mudança) | `web/js/controls.js` — posse do toque preservada |
| F7 Gamepad virtual | Implementado (sem mudança) | `server/gamepad/` — passagem direta y+ = cima (convenção XInput) confere com F4/F10.10 |
| F8 Rumble | Implementado (sem mudança) | `mapping.combine_rumble`/`clamp_rumble` |
| F9 Ciclo de vida | Implementado (sem mudança) | `session.disconnect`, reconexão no cliente |
| F10 Duck Shooting mira absoluta | Implementado | `game/js/aim.js::crosshairFromAxes` (pura: eixo + geometria → posição; (0,0)→centro, ±1→bordas, y+ ⇒ acima do centro); `game/js/input.js::normalizeGamepadAxes` (ÚNICO ponto de inversão do Y do standard mapping); `game/js/loop.js` sem integração de velocidade (`CROSSHAIR_SPEED` removido; mira derivada da leitura atual a cada quadro) |
| F11 Métricas | Implementado (sem mudança) | `server/metrics.py`, overlay do jogo |

Data models: `Motion` ganhou `a: float | None` (`server/protocol.py`), descarte
de malformadas preservado; `SessionState.calibration_offset` agora triplo,
`last_motion` quádruplo `(a, b, g, t)`; `ClientViewState` inalterado;
`Config` com `MAX_ANGLE_DEG = 20°` documentado como parâmetro de ergonomia
(faixa 15–30) e `SMOOTHING_ALPHA = 0.2` dentro do orçamento KPI-17
(degrau → 90% em 2 amostras a 60 Hz, ≤ 6 exigidas).

## Verificações de diretivas

- Estrutura de pastas respeitada; nenhum import de driver fora de
  `server/gamepad/`; `mapping.py` continua sem I/O.
- `ruff check server` e `black --check server` passam; `node --check` passa em
  todos os módulos JS alterados; type hints presentes nas funções públicas
  novas; comentários em português, identificadores em inglês.
- Jogo não importa nada de `web/` nem do servidor (`aim.js` é local);
  `WebSocket` não aparece em código do jogo fora do fallback (apenas menção em
  comentário pré-existente de `input.js`).
- `game/fruit-ninja/` não foi tocado (slug próprio), conforme instrução.

## Pontos verificados contra os defeitos-alvo da revisão

1. **Eixo trocado/invertido de paisagem**: o mapeamento antigo (gamma→x,
   beta→y, alpha ignorado) foi removido; `adjustForLandscape` do cliente foi
   removido. O novo par (−Δalpha→x, Δbeta→y) responde à metáfora do
   infravermelho: sentidos conferidos analiticamente (alpha cresce no sentido
   anti-horário visto de cima ⇒ ponta à direita ⇒ −Δalpha > 0 ⇒ x > 0;
   levantar a ponta ⇒ beta cresce ⇒ y > 0).
2. **Mira por velocidade**: `loop.js` não guarda mais posição anterior da mira
   — `crosshair` é recomputado por quadro de `crosshairFromAxes(eixo atual)`;
   invariante do GameState respeitada.
3. **Sinal do eixo Y na fronteira da Gamepad API** (reprovação da iteração 1
   do spec-loop): a inversão vive só em `normalizeGamepadAxes` e o resto do
   jogo opera no valor normalizado (y+ = cima), como exige F10.10.

## Observações

- **Fruit Ninja (registro, não ação)**: `game/fruit-ninja/js/input.js::axesToTarget`
  já consome o eixo como posição absoluta com calibração própria e assume
  `axes[3]` positivo = baixo (convenção do standard mapping), que esta rodada
  preserva na fronteira do driver. Compatível; nenhuma edição feita lá.
- **Borda ±180°**: `_wrap_180` normaliza −180 → +180 (mesmo ponto físico);
  documentado no código. M4/M7 satisfeitos; um vetor de teste que espere
  −1.0 exatamente em −180° deve usar a nota de borda do docstring.
- **Alpha nulo (M8b)**: degradação documentada — eixo horizontal em 0.0,
  vertical funcional; aplica-se também quando a calibração capturou alpha nulo.
- **Suíte de testes atual está desatualizada por concepção**: `tests/test_mapping.py`
  referencia `tilt_to_axes` e `tests/test_client_headless.py` mede o layout de
  paisagem — a atualização é responsabilidade do impl-tester nesta iteração
  (specs de teste M8b/M17–M20, G20–G23, W22–W24 já reescritas).
- `prettier` não está instalado no ambiente local (sem npm no projeto, por
  diretiva); formatação JS seguida manualmente e sintaxe conferida com
  `node --check`.
