# Testes — Cliente web do controle [F2, F3, F4, F6, F8]

O cliente é vanilla JS sem build; a maior parte é verificação manual guiada no
aparelho de referência (Galaxy A57, Chromium). Casos automatizáveis de lógica pura
(throttle, formatação de mensagens) podem rodar no runner JS da suíte.

## Automatizáveis (lógica pura em `web/js/`)

- **W1 — Throttle de motion**: dado eventos de orientação chegando a ~200 Hz, quando
  o throttle de `MOTION_SEND_HZ` (60 Hz) é aplicado, então a taxa de mensagens
  produzidas fica entre 50 e 70 Hz e a última amostra nunca fica retida por mais de
  um período.
- **W2 — Transições de botão**: dado uma sequência touchstart/touchmove/touchend,
  então exatamente um `button down` e um `button up` são gerados por pressão
  (critério F6.4), inclusive quando o dedo desliza para fora do botão (F6.3).
- **W3 — Formato das mensagens**: as mensagens geradas pelo cliente validam contra o
  schema de `protocol.py` (mesmos campos e tipos da tabela em software-specs.md).

## Manuais no aparelho de referência [manual/hardware]

- **W4 — Sem dependências externas**: com o celular sem acesso à internet (apenas
  Wi-Fi local), a página carrega e funciona; o painel de rede do navegador não mostra
  nenhuma requisição a domínio externo (critério F2.1).
- **W5 — Fullscreen + paisagem**: após o toque inicial, tela cheia e paisagem; gestos
  de scroll/zoom/duplo-toque não movem a interface (critério F2.2).
- **W6 — Sensor indisponível falha alto**: servindo por HTTP simples (ou negando a
  permissão), a UI mostra aviso visível nomeando o problema em ≤ 2 s (critério F2.3).
- **W7 — Pareamento**: primeira visita mostra campo vazio + porta padrão; após
  conectar, recarregar pré-preenche o último IP; IP inalcançável mostra erro em ≤ 5 s
  (critérios F3.1–F3.3). Inspecionar `localStorage`: somente IP/porta (F3.4).
- **W8 — Multi-touch**: segurar L, apertar A e inclinar ao mesmo tempo: os três
  inputs ativos simultaneamente no gamepad (verificar em `joy.cpl` ou no jogo)
  (critério F6.1). Todos os 12 botões respondem com feedback visual imediato (F6.2).
- **W9 — Vibração**: mensagem `vibrate` de teste faz o aparelho vibrar com
  intensidade/duração perceptíveis e proporcional; intensidade 0 cancela (F8.2).
- **W10 — Calibração**: inclinar o aparelho, tocar em calibrar: mira/eixo volta ao
  centro imediatamente e permanece (critérios F5.1, F5.2).
