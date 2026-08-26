# Testes — Ciclo de vida da conexão [F9, F3, KPI-5, KPI-6]

Automatizados com `pytest -q` + WebSocket em loopback + gamepad fake, exceto onde
marcado como **[manual/hardware]**.

## Automatizados

- **C1 — Zeragem na desconexão abrupta**
  Dado uma sessão com eixo deslocado (motion ativo) e botão A pressionado, quando o
  socket do cliente é fechado abruptamente (sem close frame), então todos os botões,
  eixos e gatilhos do gamepad fake estão zerados em ≤ 250 ms após a detecção
  (critérios F9.1, KPI-6).
- **C2 — Zeragem no fechamento limpo**
  Mesmo cenário com close frame normal: estado zerado.
- **C3 — Timeout de ping/pong**
  Dado um cliente que para de responder pong, quando decorre o timeout configurado,
  então a sessão é encerrada e o gamepad zerado; com os valores padrão de
  `config.py`, a detecção ocorre em ≤ 3 s (critério F9.2).
- **C4 — Reconexão restabelece input**
  Dado uma sessão encerrada, quando um novo cliente conecta, então recebe `hello`
  novo e mensagens `motion`/`button` voltam a atualizar o gamepad, sem reiniciar o
  servidor (critério F9.4).
- **C5 — Calibração não sobrevive à reconexão de forma residual**
  Dado uma sessão antiga calibrada com offset X, quando uma nova sessão conecta e
  envia `motion` sem calibrar, então o offset aplicado é o padrão (nulo), não X.
- **C6 — Início do servidor**
  Dado o servidor iniciado em porta livre, então HTTP responde 200 nas rotas do
  controle e do jogo e as URLs impressas contêm IP e porta (critérios F1.1, F1.2 —
  o fingerprint do certificado é igual entre duas execuções consecutivas).
- **C7 — Driver ausente**
  Dado a plataforma reportando driver indisponível (simulado no seletor de
  implementação), quando o servidor inicia, então termina com exit code ≠ 0 e a
  mensagem cita o driver e onde obtê-lo (critério F7.2).

## Manuais / hardware [manual/hardware]

- **C8 — Estado visível no celular**: derrubar o Wi-Fi do celular durante o uso; a UI
  mostra "desconectado" e um toque reconecta usando o último IP (critérios F9.3,
  F3.2).
- **C9 — Tempo de reconexão (KPI-5)**: com servidor já rodando e IP lembrado,
  cronometrar do desbloqueio do celular até input ativo no gamepad: < 15 s.
- **C10 — Estabilidade de sessão (KPI-11)**: sessão contínua de 30 min jogando Duck
  Shooting; registrar quedas de conexão e inputs travados. Aprovado com 0 ocorrências
  de ambos.
