# Code Validation Report — wii-controller

**Veredito: SUCCESS**

Data: 2026-08-26 — iteração 1 do Coding Loop, 2ª passada (após correção dos 3 problemas
apontados na passada anterior).

## Cobertura de specs

| Feature | Status | Evidência |
|---|---|---|
| F1 Servidor local (HTTPS + WS mesma porta) | Implementado | `server/main.py` (`run_server`, `make_process_request`, `print_urls`), `server/tls.py` (cert gerado e reutilizado) |
| F2 Cliente web do controle | Implementado | `web/index.html`, `web/css/style.css`, `web/js/main.js` (fullscreen, paisagem, falhar alto em sensores) |
| F3 Pareamento por IP | Implementado | `web/js/connection.js` (último IP/porta em `localStorage`, timeout 5 s, reconexão por um toque) |
| F4 Controle por inclinação | Implementado | `server/mapping.py` (`tilt_to_axes`: offset → zona morta radial → sensibilidade → saturação suave com derivada contínua), `web/js/motion.js` (throttle 60 Hz) |
| F5 Calibração de centro | Implementado | `server/session.py` (`handle_calibrate`: substitui offset sem acúmulo; offset nulo sem amostra prévia) |
| F6 Botões touch multi-touch | Implementado | `web/js/controls.js` (`createButtonTracker`: exatamente 1 down/1 up por pressão; deslize para fora gera up) |
| F7 Emulação de gamepad virtual | Implementado | `server/gamepad/`: `base.py` (interface + `axis_to_native`), `windows.py` (vgamepad isolado, erro acionável), `keyboard.py` (stub 2ª onda), `__init__.py` (seleção por plataforma injetável) |
| F8 Rumble fim-a-fim | Implementado | callback do driver → `combine_rumble` → `vibrate`; `web/js/haptics.js` (padrão proporcional, 0 cancela); `game/js/rumble-fallback.js` (actuator primeiro, `POST /rumble` isolado e comentado) |
| F9 Ciclo de vida da conexão | Implementado | ping/pong com timeout ≤ 3 s; `SessionState.disconnect()` zera o gamepad no `finally`; reconexão cria sessão nova sem offset residual |
| F10 Duck Shooting | Implementado | lógica pura em `rules.js`/`entities.js` (posição analítica ⇒ física independente de FPS, RNG com semente); input só via Gamepad API (`input.js`); loop de passo fixo (`loop.js`); áudio sintetizado (`audio.js`) |
| F11 Instrumentação de latência | Implementado | `server/metrics.py` (`MetricsWindow`: `latency_ms_* = net + proc`), `GET /metrics`, overlay no jogo (tecla O; poll 1 Hz apenas quando visível — custo zero desligado) |
| P1–P4 Procedures | Implementado | cobertos pelos módulos acima |

Verificações estáticas de tools/tooling.md: (1) `vgamepad` só em `server/gamepad/windows.py` ✔;
(2) nenhum `WebSocket` em `game/`; único HTTP fora da Gamepad API é o fallback de rumble
isolado e a leitura de `/metrics` permitida pela F11 ✔; (3) sem imports cruzados
`game/`↔`web/`/servidor ✔; (4) tuning centralizado em `server/config.py` ✔.

Correções desta passada, todas verificadas:
1. `ping_loop` em `server/main.py` agora captura `ConnectionClosed` — sem exceção não
   recuperada na task quando o cliente cai.
2. `websocket` virou campo declarado de `SessionState` (`server/session.py`), alinhado ao
   data model; removido o `type: ignore` em `main.py`.
3. `game/js/loop.js` usa `MAX_AMMO` de `rules.js` em vez de `3` hardcoded.

## Problemas encontrados

Nenhum.

## Observações

- `POST /rumble` recebe parâmetros por query string (o handler HTTP do `websockets` não lê
  corpo; diretivas proíbem framework web). A spec não define o payload — decisão documentada
  no código. Se os testes concluírem que corpo JSON era exigido, é lacuna de spec.
- `web/js/main.js` espelha `MOTION_SEND_HZ = 60` e a porta padrão `8443` de
  `server/config.py` (JS estático não importa Python); espelhos comentados na fonte.
- `latency_window` do data model vive em `MetricsWindow` (referenciada pela sessão) —
  janela única, coerente com a sessão única do MVP.
- Sintaxe verificada: `py_compile` em todos os módulos Python e `node --check`/import em
  todos os JS — sem erros. Smoke de import do servidor OK. Testes reais ficam para o
  Testing Loop (`impl-tester`).
