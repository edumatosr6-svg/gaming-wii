# Testes — Cliente web do controle [F2, F3, F4, F6, F8, F9]

O cliente é vanilla JS sem build. A cobertura se divide em três faixas, e a do meio
é obrigatória: **a lógica pura sempre esteve correta enquanto o produto não
funcionava** — todos os defeitos encontrados em uso real viviam na integração entre
essa lógica e o DOM/navegador, faixa que antes não tinha nenhum teste.

1. **Lógica pura** (`web/js/`) — roda no runner JS da suíte.
2. **Integração em navegador headless** — DOM, eventos de toque e socket reais.
   Obrigatória na suíte padrão; ver `tools/tooling.md`.
3. **Manuais no aparelho de referência** — só o que exige hardware físico
   (sensores, vibração, bateria), cada um com critério observável.

## Automatizáveis (lógica pura em `web/js/`)

- **W1 — Throttle de motion**: dado eventos de orientação chegando a ~200 Hz, quando
  o throttle de `MOTION_SEND_HZ` (60 Hz) é aplicado, então a taxa de mensagens
  produzidas fica entre 50 e 70 Hz e a última amostra nunca fica retida por mais de
  um período.
- **W2 — Transições de botão**: dado uma sequência touchstart/touchmove/touchend,
  então exatamente um `button down` e um `button up` são gerados por pressão
  (critério F6.4), inclusive quando o dedo desliza para fora do botão (F6.3).
- **W2b — Posse do toque**: dado um toque iniciado sobre o botão A, quando o dedo
  arrasta por cima do botão B e solta ali, então é gerado `a up` e **nenhum** `b down`
  (F6.3). *Impede que o botão seja resolvido pelo elemento sob o dedo a cada
  movimento, o que trocaria de botão no meio do arrasto.*
- **W3 — Formato das mensagens**: as mensagens geradas pelo cliente validam contra o
  schema de `protocol.py` (mesmos campos e tipos da tabela em software-specs.md).

## Integração em navegador headless [obrigatórios na suíte padrão]

Carregam a página real do controle servida pelo servidor real, com emulação de toque,
e inspecionam o que efetivamente sai pelo socket. Cada caso abaixo corresponde a um
defeito que chegou ao usuário final e que nenhuma outra faixa de teste detectaria.

- **W11 — Uma tela por vez**: dado o cliente em cada um dos quatro estados
  (`pareamento`, `conectando`, `conectado`, `desconectado`), quando se mede a caixa de
  layout de todas as telas, então exatamente uma tem área maior que zero (F2.5).
  *Pega o caso de uma regra de CSS anular o mecanismo de alternância — a tela de
  pareamento permanecia sobre um controle já conectado e funcional.*
- **W12 — Toque aciona todos os controles**: dado a página conectada, quando cada um
  dos 12 botões recebe uma sequência de toque completa (**sem nenhum evento `click`**),
  então cada um envia sua mensagem `button` com `down: true` e depois `down: false`
  (F2.6, F6.2).
- **W13 — Calibrar responde ao toque**: dado a página conectada, quando o comando de
  calibrar recebe uma sequência de toque (sem `click`), então a mensagem `calibrate`
  é enviada (F2.6). *O comando estava ligado apenas a `click`, que o tratamento
  multi-touch suprime: funcionava com mouse e era inerte no celular.*
- **W14 — Nada intercepta o toque**: dado a tela do controle visível, quando se
  consulta qual elemento está no ponto central de cada controle acionável, então esse
  elemento é o próprio controle ou um descendente dele — nunca uma faixa de status,
  aviso ou overlay de diagnóstico (F2.7).
- **W15 — Tela cheia não engole o acionamento**: dado que o cliente pede modo imersivo,
  quando uma sequência de toque completa ocorre sobre um botão, então a mensagem
  `button` é enviada de qualquer forma (F2.8). *Pedir tela cheia no início do toque
  faz o navegador cancelar a sequência e o botão nunca dispara.*
- **W16 — Nenhuma ação depende de `click`**: inspeção estática dos registros de evento
  em `web/js/`: nenhum controle acionável tem `click` como único caminho (F2.9).
- **W17 — Conexão automática pela origem**: dado a página aberta na URL servida pelo
  PC, quando ela carrega, então o cliente conecta sem nenhuma digitação em até 5 s e o
  endereço usado é o da origem da página (F3.1, F3.2).
- **W18 — Reconexão automática**: dado o cliente conectado, quando a conexão é
  derrubada e o servidor volta a aceitar conexões, então o cliente reconecta sozinho,
  sem nenhum toque, em até 5 s (F9.5).
- **W19 — Estado da conexão sempre visível**: dado a tela do controle aberta, então o
  estado da conexão está visível em todos os momentos; após uma queda, o motivo
  (código de fechamento) é exibido (F9.6, F9.7). *Cobre a falha silenciosa: a interface
  respondia ao toque enquanto nada saía do aparelho.*

## Manuais no aparelho de referência [manual/hardware]

Cada caso declara o que o operador deve **observar**, não apenas o que fazer — um
procedimento sem critério observável não pode reprovar uma implementação errada.

- **W4 — Sem dependências externas**: com o celular sem acesso à internet (apenas
  Wi-Fi local), a página carrega e funciona. *Observar:* o painel de rede do navegador
  não lista nenhuma requisição a domínio externo (F2.1).
- **W5 — Fullscreen + paisagem**: após o toque inicial. *Observar:* a barra do
  navegador some, a tela fica em paisagem, e gestos de scroll/zoom/duplo-toque não
  movem nem redimensionam a interface (F2.2).
- **W6 — Sensor indisponível falha alto**: servindo por HTTP simples ou negando a
  permissão. *Observar:* aviso visível nomeando o problema em ≤ 2 s (F2.3).
- **W7 — Persistência do pareamento manual**: abrir a página fora do servidor.
  *Observar:* último endereço pré-preenchido e conexão com um toque; em
  `localStorage`, somente IP/porta (F3.3, F3.5).
- **W8 — Multi-touch**: segurar L, apertar A e inclinar ao mesmo tempo. *Observar:* os
  três inputs simultaneamente ativos em `joy.cpl` ou no jogo, e feedback visual
  imediato em cada um dos 12 botões (F6.1, F6.2).
- **W9 — Vibração**: mensagem `vibrate` de teste. *Observar:* o aparelho vibra com
  intensidade e duração perceptivelmente proporcionais; intensidade 0 interrompe a
  vibração em andamento (F8.2).
- **W10 — Calibração com sensor real**: inclinar o aparelho e tocar em calibrar.
  *Observar:* a mira volta ao centro imediatamente e ali permanece com o aparelho
  parado; repetir a calibração em outra posição funciona sem reconectar (F5.1, F5.2).
- **W20 — Sessão jogável fim-a-fim**: com o servidor no ar e o Duck Shooting aberto no
  PC, jogar uma rodada completa usando apenas o celular. *Observar:* a mira acompanha
  a inclinação, o botão A dispara, a calibração recentraliza, e nenhum controle fica
  inerte durante a partida. **Este é o critério de "o produto funciona"** — nenhuma
  entrega pode ser declarada pronta sem ele.
