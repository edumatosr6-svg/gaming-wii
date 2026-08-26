# Code Validation Report — wii-controller

**Veredito: SUCCESS**

Data: 2026-08-26 — iteração 1 do Coding Loop (pós-revisão humana), 2ª passada
(após correção dos 2 problemas apontados na 1ª passada).

Escopo desta iteração: reconciliação do cliente (`web/`) com as specs reaprovadas, que
agora exigem a máquina de estados visuais (F2.5), entrada por toque sem depender de
`click` (F2.6/F2.9), não-interceptação de toque (F2.7), fullscreen em gesto concluído
(F2.8), conexão pela origem (F3.1/F3.2), reconexão automática (F9.5) e proibição de
falha silenciosa (F9.6/F9.7). No servidor houve apenas autofix de `ruff` (UP035/UP017)
e `black`, sem mudança de comportamento.

## Cobertura de specs

| Feature | Status | Evidência |
|---|---|---|
| F1 Servidor local (HTTPS + WS mesma porta) | Implementado | `server/main.py` (`run_server`, `make_process_request`, `print_urls`), `server/tls.py` |
| F2.1–F2.4 Cliente vanilla, imersivo, falha alta | Implementado | `web/index.html`, `web/js/main.js`; aviso de erro agora legível (ver Correções) |
| F2.5 Máquina de estados visuais | Implementado | `web/index.html` (4 seções `[data-screen]` em `#screens`), `web/js/main.js:40` (`setScreen`, mecanismo único), `web/css/style.css:11` (`[hidden] { display: none !important }` documentado como contrato) |
| F2.6/F2.9 Entrada por toque, nunca só `click` | Implementado | `web/js/controls.js:96` (`onActivate`: `touchstart` primário + `click` adicional com guarda de ghost-click); varredura de `addEventListener` confirma que o **único** listener de `click` do cliente está dentro de `onActivate` |
| F2.7 Nada intercepta o toque | Implementado | `web/css/style.css:113` (`pointer-events: none` em `.banner-stack`) e `:127` (em `.banner`, defesa em profundidade); recuos de `#buttons-area` reservam a faixa |
| F2.8 Fullscreen em gesto concluído | Implementado | `web/js/main.js:176` (`touchend`, uma única vez via `immersiveRetried`); listener dos botões em `#buttons-area` dispara antes por bubbling |
| F3 Pareamento por IP / conexão pela origem | Implementado | `web/js/connection.js:16` (`addressFromLocation`, puro), `web/js/main.js:236` (auto-conexão), tela de pareamento manual como exceção |
| F4 Controle por inclinação | Implementado | `server/mapping.py` (`tilt_to_axes`), `web/js/motion.js` (throttle 60 Hz) |
| F5 Calibração de centro | Implementado | `server/session.py` (`handle_calibrate`), `web/js/main.js:189` (`sendCalibrate` via `onActivate`, com guarda de conexão) |
| F6 Botões touch multi-touch | Implementado | `web/js/controls.js` (`createButtonTracker`: posse do toque, 1 down/1 up por pressão) |
| F7 Emulação de gamepad virtual | Implementado | `server/gamepad/`; callback de rumble sem anotações preservado em `windows.py:62` |
| F8 Rumble fim-a-fim | Implementado | callback do driver → `combine_rumble` → `vibrate`; `web/js/haptics.js`; `game/js/rumble-fallback.js` |
| F9.1–F9.4 Ciclo de vida / zeragem | Implementado | ping/pong ≤ 3 s, `SessionState.disconnect()` no `finally` |
| F9.5 Reconexão automática | Implementado | `web/js/main.js:99` (`scheduleReconnect`, 800 ms), `web/js/connection.js:59` (guarda de geração impede o laço de sockets obsoletos) |
| F9.6/F9.7 Estado sempre visível, sem falha silenciosa | Implementado | Pilha de faixas persistente fora das telas + `#close-reason` + guarda em `sendCalibrate` |
| F10 Duck Shooting | Implementado | `game/js/` (lógica pura, input só por Gamepad API, loop de passo fixo) |
| F11 Instrumentação de latência | Implementado | `server/metrics.py`, `GET /metrics`, overlay do jogo |

Verificações estáticas de `tools/tooling.md`: (1) `vgamepad` só em `server/gamepad/windows.py` ✔;
(2) nenhum `WebSocket` em `game/` fora do fallback isolado ✔; (3) sem imports cruzados
`game/`↔`web/` ✔; (4) tuning centralizado em `server/config.py` ✔; (5) nenhum controle
com `click` como caminho único ✔; (6) faixas com captura de toque neutralizada ✔.

## Correções desta passada (todas verificadas)

1. **Empilhamento das faixas (Problemas 1 e 2 da passada anterior) — corrigido na raiz.**
   As quatro faixas deixaram de ser ancoradas individualmente. `web/index.html:28` e `:33`
   introduzem duas pilhas de fluxo — `#top-banners` (`.banner-stack.top`, com
   `#error-banner` e `#status-banner`) e `#bottom-banners` (`.banner-stack.bottom`, com
   `#rotate-hint` e `#debug-line`). Em `web/css/style.css:100`, `.banner-stack` é o
   **único** elemento com `position: fixed` + `z-index`, e usa
   `display: flex; flex-direction: column`; `.banner` (`:124`) perdeu `position`, `top`,
   `bottom`, `left`, `right` e `z-index`, ficando só com apresentação. Varredura do
   arquivo confirma que as únicas ocorrências restantes de `position:`/`z-index:`/`top:`/
   `bottom:` são as da `.banner-stack` (`:101`, `:104`, `:117`, `:121`).
   Isto é a correção estrutural, não o remendo de `z-index`: uma faixa nova acrescentada
   a qualquer das pilhas empilha em fluxo e não tem como esconder as existentes.
   Medição em Chromium headless com **as duas faixas excepcionais forçadas visíveis ao
   mesmo tempo**: `error-banner` 0–36, `status-banner` 36–72, `rotate-hint` 345–381,
   `debug-line` 381–400, `SOBREPOSICOES: []`. F2.3 (aviso em ≤ 2 s nomeando o problema) e
   F3 critério 4 (erro de endereço em ≤ 5 s) voltam a ser observáveis; F2.2 recupera o
   fallback visual de rotação legível.
2. **F2.7/W14 não regrediu.** `pointer-events: none` subiu para `.banner-stack` — que é
   onde a captura precisa morrer agora, já que é o contêiner que cobre os controles — e
   permanece em `.banner` como defesa em profundidade. Revalidado no mesmo cenário, com
   erro e dica visíveis: `W14 interceptados: []`.
3. **Corrida em `sendCalibrate` (Observação 6) — corrigida.** `web/js/main.js:194`: com
   `connection.isOpen` falso a função exibe `Calibração não enviada: sem conexão com o
   PC.` e retorna, em vez de escrever confirmação de uma calibração que
   `connection.send()` descartaria em silêncio (F9.7).

## Problemas encontrados

Nenhum.

## Observações

1. **`POST /rumble` por query string** (`server/main.py`, rota `/rumble`) — pendência
   herdada, inalterada. O handler HTTP embutido do `websockets` não lê corpo de
   requisição e as diretivas proíbem framework web; a spec (F8.3) não define o payload do
   fallback. Decisão documentada no código. **Se o `impl-tester` concluir que corpo JSON
   era exigido, isto é lacuna de spec (`FAIL SPEC`), não defeito de código** — mas não
   bloqueia enquanto nenhum teste falhar por causa disso.
2. **W15 não foi exercitado.** A estrutura que o satisfaz existe e está localizada:
   fullscreen apenas em `touchend` e uma única vez (`web/js/main.js:175-185`), com o
   listener dos botões em `#buttons-area` (`web/js/main.js:220`) disparando antes por
   bubbling — a mensagem `button` já saiu quando o pedido de fullscreen acontece. A
   verificação é do Testing Loop.
3. **`prettier --check` não pôde rodar.** Não há npm no ambiente e as diretivas proíbem
   dependência npm no cliente; a formatação JS foi feita à mão seguindo a convenção
   (aspas simples, ponto e vírgula). `tools/tooling.md` lista o comando, mas não há
   caminho para executá-lo sem violar outra diretiva — **atrito entre `tooling.md` e
   `coding-directives.md` que a spec não resolve**. Não bloqueia; convém decidir
   explicitamente na próxima revisão de spec.
4. **W16 admite duas leituras.** A checagem foi implementada como "todo
   `addEventListener('click')` em `web/js/` convive com um registro de evento de toque
   para a mesma ação", concentrada em `onActivate` (`web/js/controls.js:96`). Se o
   `impl-tester` escrever o check por outro critério (varredura por elemento acionável em
   vez de por handler), pode divergir sem que o código esteja errado.
5. **Risco para W19:** passados os 800 ms de `RECONNECT_DELAY_MS`, `connectTo()`
   (`web/js/main.js:76`) troca para a tela `conectando` e reescreve o texto da faixa, e o
   `#close-reason` passa a viver numa tela oculta. O motivo da queda continua visível
   apenas na faixa persistente `#debug-line` ("última queda: …", `web/js/main.js:228`).
   F9.7 é atendido em sentido estrito, mas **o teste W19 precisa olhar para o lugar onde o
   motivo realmente sobrevive**, não para `#close-reason` depois que a tela já mudou.
6. **Recuos de `#buttons-area` dimensionados para uma faixa por pilha.**
   `web/css/style.css` usa `padding: 2.8rem 1rem 1.6rem`, que cobre o caso normal (só a
   faixa de status no topo, só a linha de diagnóstico no rodapé). Quando uma faixa
   excepcional aparece, a pilha cresce e passa a se sobrepor visualmente à fileira de
   ombro — **sem bloquear o toque**, porque a captura está neutralizada na pilha. Nenhum
   critério de aceite cobre a legibilidade dos botões durante um erro, e reservar duas
   linhas permanentemente custaria ~17% da altura útil em paisagem. Comportamento
   comentado na fonte.
7. **Classe de defeito ainda sem cobertura automatizada.** Os dois problemas desta
   iteração eram CSS anulando um mecanismo de JS correto — a mesma família documentada no
   `implementation-report.md`. Foram achados por revisão estática, não por teste: nem a
   lógica pura nem W11–W19 como especificados medem legibilidade de faixas sobrepostas.
   **Recomendação ao Testing Loop:** cobrir isso com um caso próprio (faixas visíveis
   simultaneamente não podem ter caixas de layout que se intersectam), acrescentando-o
   antes à spec de teste em `tests/client-controller.md` para não criar teste órfão.
8. **Espelhos de constantes:** `web/js/main.js` espelha `MOTION_SEND_HZ = 60` e a porta
   padrão `8443` de `server/config.py` (JS estático não importa Python); ambos comentados
   na fonte.
9. **Estado verificado sem rodar a suíte nova:** `pytest -q` em 52 passed / 22 deselected,
   `ruff check server` e `black --check server` limpos, `node --check` sem erro em todos
   os módulos de `web/`. Isso é o estado *anterior* à faixa W11–W19 — que ainda não existe
   como teste versionado e é obrigatória na suíte padrão. **Este relatório não é evidência
   de que o produto funciona**; é evidência de que o código está estruturalmente apto a
   ser testado.
