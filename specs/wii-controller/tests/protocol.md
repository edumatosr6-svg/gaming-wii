# Testes — Protocolo WebSocket [F1, KPI-9]

Alvo: `server/protocol.py` (validação/parsing) e o handler de mensagens do servidor.
Automatizados com `pytest -q`; o gamepad virtual é um dublê.

## Parsing e validação (unitário, sem rede)

- **P1 — Mensagens válidas**: cada tipo (`motion`, `button`, `calibrate`, `pong`) com
  campos corretos é aceito e produz a estrutura interna esperada.
- **P2 — JSON inválido**: payload que não é JSON é rejeitado com resultado de descarte
  (não exceção propagada).
- **P3 — `type` desconhecido**: descartado sem efeito no estado.
- **P4 — Campos ausentes**: `motion` sem `b`/`g`/`t`, `button` sem `id` ou `down` →
  descartados. Exceção documentada: `motion` com `a: null` é **válido** (fonte sem
  alpha — Data Models); `motion` sem o campo `a` é descartado.
- **P4b — `motion` não carrega sensor cru**: mensagem `motion` com campos extras de
  sensor cru (ex. `acc`, `mag`, `gyro`) é tratada como formato inválido/ignorado —
  o schema do `motion` é fechado nos cinco campos (F14.8).
- **P5 — Tipos errados**: `a` string, `b` string, `down` número, `intensity` booleano
  → descartados ou saturados conforme documentado; nunca exceção não tratada.
- **P6 — `button.id` fora do enum**: id não listado (ex.: `"lt"`, `""`, unicode) é
  descartado.
- **P7 — Payload gigante**: mensagem de tamanho anômalo (ex.: 1 MB) é descartada sem
  travar o loop.

## Integração servidor (WebSocket real em loopback, gamepad fake)

- **P8 — Handshake**: ao conectar, o cliente recebe `hello` com `session_id` e
  `server_version` (critério F1.3).
- **P9 — Corpus de fuzzing leve**: enviar uma sequência de ~100 mensagens malformadas
  variadas intercaladas com válidas; o servidor processa as válidas normalmente e não
  cai (critérios F1.4, KPI-9: 0 crashes).
- **P10 — Fluxo motion→estado**: mensagem `motion` válida (`a`, `b`, `g`, `t`)
  atualiza o eixo do gamepad fake conforme `mapping.py` — posição apontada absoluta
  (fio de ponta a ponta sem driver real).
- **P11 — Fluxo button→estado**: `button {id: "a", down: true}` liga o botão A no
  fake; `down: false` desliga.
- **P12 — `vibrate` saindo**: um rumble injetado no fake resulta em mensagem `vibrate`
  bem-formada entregue ao cliente de teste em ≤ 100 ms (critério F8.1).

## Perfil de calibração e status [F5, F12, F13, F14]

- **P13 — `calibrate` com payload aplica o perfil**: `calibrate` com `center` e `ranges`
  válidos passa a valer imediatamente — a `motion` seguinte é convertida com o novo
  offset e com os **quatro alcances distintos** —, e o servidor responde
  `calibration_applied {accepted: true}` com os alcances efetivos.
- **P14 — Perfil inválido é rejeitado com motivo**: `ranges` com valor fora de
  `RANGE_MIN_DEG`–`RANGE_MAX_DEG`, zero, negativo, `NaN`, string ou faltando direções
  produz `calibration_applied {accepted: false, reason: ...}`; o perfil **anterior é
  mantido** e o servidor não cai. *Nunca aceito em silêncio (F12, KPI-14).*
- **P15 — `calibrate` sem payload (caminho degradado)**: continua válido — zera na
  última `motion` recebida e usa `DEFAULT_RANGE_DEG` nas quatro direções (F5.3).
- **P16 — Só `ranges` (reconexão)**: `calibrate` com `ranges` e `center: null` aplica os
  alcances sem definir centro; `has_center` na resposta reflete isso (P3.4).
- **P17 — `status` registrado e exposto**: `status {source, mag_rejected}` válido
  atualiza o estado da sessão e aparece em `GET /metrics`. O enum aceito é fechado: os
  quatro degraus da escada **mais** `synthetic` (fonte de diagnóstico, F13); qualquer
  outro valor de `source`, e `mag_rejected` não booleano, são descartados sem derrubar a
  conexão.
- **P18 — Ordem hostil**: `motion` antes de qualquer `calibrate`, `calibrate` duplicado
  e `status` antes do `hello` não produzem exceção nem estado inconsistente.
