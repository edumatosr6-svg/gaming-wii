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
  schema de `protocol.py` (mesmos campos e tipos da tabela em software-specs.md);
  `motion` carrega os **três** ângulos `a`, `b`, `g` (com `a: null` quando o sensor
  não reportar alpha) e `t`.

## Integração em navegador headless [obrigatórios na suíte padrão]

Carregam a página real do controle servida pelo servidor real, com emulação de toque,
e inspecionam o que efetivamente sai pelo socket. Cada caso abaixo corresponde a um
defeito que chegou ao usuário final e que nenhuma outra faixa de teste detectaria.

**Viewport obrigatório: retrato** (dimensões do aparelho de referência em pé, ex.
412×915 CSS px). A interface é um corpo de Wii Remote vertical (F2); medir geometria
em viewport de paisagem valida um layout que não existe mais e mascara todos os
defeitos de disposição.

**Fonte de orientação nos testes headless:** o navegador headless não tem sensores. Os
casos que precisam de orientação usam o degrau `synthetic` da escada da F13
(`?src=synthetic`), que injeta um fluxo de amostras roteirizado pelo teste. Sem essa
costura, toda a faixa de assistente/fonte/interferência ficaria sem cobertura headless —
que é exatamente onde os defeitos deste projeto sempre viveram.

- **W11 — Uma tela por vez**: dado o cliente em cada um dos **cinco** estados
  (`pareamento`, `conectando`, `conectado`, `calibrando`, `desconectado`), quando se
  mede a caixa de layout de todas as telas, então exatamente uma tem área maior que zero
  (F2.5). *Pega o caso de uma regra de CSS anular o mecanismo de alternância — a tela de
  pareamento permanecia sobre um controle já conectado e funcional.*
- **W12 — Toque aciona todos os controles**: dado a página conectada, quando cada um
  dos 12 botões recebe uma sequência de toque completa (**sem nenhum evento `click`**),
  então cada um envia sua mensagem `button` com `down: true` e depois `down: false`
  (F2.6, F6.2).
- **W13 — Calibrar responde ao toque**: dado a página conectada, quando o comando de
  calibrar recebe uma sequência de toque (sem `click`), então a captura de janela começa
  (a instrução de segurar parado fica visível) e a mensagem `calibrate` **com payload de
  centro** é enviada ao fim da janela — isto é, **depois** de `CALIB_WINDOW_MS`, não no
  toque (F2.6, F5). *O comando estava ligado apenas a `click`, que o tratamento
  multi-touch suprime: funcionava com mouse e era inerte no celular. **Onde observar:**
  o teste precisa aguardar a janela; medir só "saiu alguma mensagem no toque" passaria
  com a calibração instantânea que esta revisão remove.*
- **W14 — Nada intercepta o toque**: dado a tela do controle visível, quando se
  consulta qual elemento está no ponto central de cada controle acionável, então esse
  elemento é o próprio controle ou um descendente dele — nunca uma faixa de status,
  aviso ou overlay de diagnóstico (F2.7).
- **W15 — Tela cheia não engole o acionamento**: dado que o cliente pede modo imersivo,
  quando uma sequência de toque completa ocorre sobre um botão, então a mensagem
  `button` é enviada de qualquer forma (F2.8). *Pedir tela cheia no início do toque
  faz o navegador cancelar a sequência e o botão nunca dispara.* **Onde observar:** o
  cancelamento do toque ao entrar em tela cheia é comportamento do Chromium no
  aparelho, e **não se reproduz no Chromium headless** — medir só a mensagem enviada
  faz o caso passar tanto com a implementação correta quanto com a defeituosa. Por
  isso o caso tem duas metades, e ambas são obrigatórias: (a) a mensagem `button`
  sai numa sequência de toque completa, e (b) o pedido de tela cheia está registrado
  num evento que **conclui** o gesto (`touchend`), nunca em `touchstart`/`pointerdown`/
  `mousedown` — que é a redação normativa de F2.8 e o que efetivamente reprova a
  implementação errada.
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
  respondia ao toque enquanto nada saía do aparelho.* **Onde observar:** o motivo
  precisa continuar legível depois que o cliente entra em nova tentativa de conexão —
  a tela de queda é substituída pela de `conectando` em menos de 1 s, então verificar
  apenas o elemento dessa tela mede uma janela curta demais para ser confiável. O
  critério é o motivo estar visível em algum elemento **persistente**, fora da
  máquina de estados de telas.

- **W21 — Faixas visíveis não se cobrem**: dado quaisquer duas faixas persistentes
  (status, erro, dica de orientação, diagnóstico) visíveis ao mesmo tempo, quando se
  medem suas caixas de layout **em viewport retrato**, então elas não se intersectam
  (F2.2, F2.3, F9.6).
  *Cobre a classe de defeito "CSS anula um mecanismo de JS que está correto": faixas
  ancoradas individualmente na mesma borda se cobrem conforme a ordem do documento, e
  foi assim que o aviso de erro dos sensores ficou mudo por baixo da faixa de status e
  a dica de orientação ficou ilegível sob a linha de diagnóstico. Nenhuma outra faixa
  de teste detecta isso: a lógica pura não conhece layout, e W11/W14 medem as telas e
  a captura de toque, não a legibilidade de faixas sobrepostas. O teste força o
  cenário adverso — todas as faixas visíveis simultaneamente — porque o estado normal
  tem uma faixa por borda e esconde o defeito.*
- **W22 — Geometria do corpo de Wii Remote**: dado a tela `conectado` em viewport
  retrato, quando se medem as caixas de layout dos controles, então (critério F2.10):
  (a) a ordem vertical dos centros, de cima para baixo, é ponta do sensor → D-pad →
  A → START/BACK → L/R; (b) a área de toque do botão A é estritamente maior que a de
  qualquer outro botão; (c) o centro do A dista do eixo vertical central no máximo 5%
  da largura do viewport; (d) cada um de B, X e Y tem centro mais próximo do centro
  do A do que dos centros de qualquer botão do D-pad, de L e de R. *Reprova o
  reaproveitamento do layout de paisagem, que não tem nem a ordem nem a dominância do
  A.*
- **W23 — Ponta do sensor ancorada e com estado**: dado cada um dos **cinco** estados de
  `ClientViewState`, quando se inspeciona o elemento da ponta do sensor, então na
  tela `conectado` ele está visível acima de todos os controles acionáveis (menor
  centro-y), e em cada estado ele carrega classe/atributo distinto que reflete o
  estado de conexão (critério F2.11).
- **W24 — Ilustração de pegada ensina a segurar**: dado os estados `pareamento` e
  `conectando`, quando se mede a caixa de layout do elemento de ilustração da pegada,
  então ele tem área maior que zero em ambos (critério F2.12). *A tela de entrada
  deve ensinar a pegada vertical sem manual — a ilustração ausente ou oculta por CSS
  reprova.*
- **W25 — Fonte de orientação visível e correta (KPI-23)**: dado a página aberta com
  `?src=<degrau>` para cada degrau da F13 (incluindo `synthetic`), quando se inspeciona
  o indicador de fonte nas telas `conectado` e `calibrando`, então ele está visível
  (área > 0) e exibe o rótulo do degrau forçado (critério F2.13, F13.4). *Sem isso, a
  primeira pergunta de qualquer comparação entre aparelhos ("qual fonte cada um está
  usando?") só teria resposta depurando.*
- **W26 — Assistente de calibração completo em headless (F12)**: dado `?src=synthetic`
  com um fluxo roteirizado (neutro, esquerda, direita, cima, baixo), quando o assistente
  é percorrido tocando em "capturar" em cada etapa, então: (a) uma etapa visível por vez
  (F2.15); (b) a instrução de segurar parado aparece durante cada captura; (c) ao final,
  sai pelo socket um `calibrate` **com payload** contendo quatro alcances independentes
  coerentes com o fluxo injetado; (d) o cliente volta ao estado `conectado` ao receber
  `calibration_applied {accepted: true}`.
- **W26b — Pular e refazer**: o comando de pular encerra o assistente aplicando os
  alcances padrão (F12.5); a partir de `conectado`, o comando de refazer volta ao estado
  `calibrando` sem reconectar.
- **W26c — Rejeição não passa em silêncio**: dado o servidor respondendo
  `calibration_applied {accepted: false, reason: ...}`, então a tela exibe o motivo e
  oferece refazer — o cliente não segue como se tivesse calibrado (F12, KPI-14).
- **W27 — Botões suspensos durante a calibração (F2.16)**: dado o estado `calibrando`,
  quando se aciona por toque um botão de gamepad, então **nenhuma** mensagem `button`
  sai pelo socket; e mensagens `motion` continuam saindo no mesmo intervalo. *Evita
  disparar no jogo enquanto o usuário calibra.*
- **W28 — Indicador de interferência magnética (F2.14)**: dado `?src=synthetic` com um
  trecho de leituras magnéticas fora do esperado, quando o trecho começa, então o
  indicador de rejeição fica visível **sem trocar de tela**, e volta a ocultar quando o
  trecho termina.
- **W29 — Persistência do perfil (F12.6)**: dado um assistente concluído, quando a
  página é recarregada, então o cliente reenvia os quatro alcances sem exibir as quatro
  etapas de extremo, **e** pede a captura de centro de novo; `localStorage` contém
  exatamente duas chaves (endereço e perfil de alcances) e nenhuma de estado de jogo
  (F3.5, F12.8).

## Manuais no aparelho de referência [manual/hardware]

Cada caso declara o que o operador deve **observar**, não apenas o que fazer — um
procedimento sem critério observável não pode reprovar uma implementação errada.

- **W4 — Sem dependências externas**: com o celular sem acesso à internet (apenas
  Wi-Fi local), a página carrega e funciona. *Observar:* o painel de rede do navegador
  não lista nenhuma requisição a domínio externo (F2.1).
- **W5 — Fullscreen + retrato**: após o toque inicial. *Observar:* a barra do
  navegador some, a tela permanece em **retrato** (mesmo girando o aparelho para
  apontar), e gestos de scroll/zoom/duplo-toque não movem nem redimensionam a
  interface (F2.2).
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
- **W10 — Calibração de centro com sensor real**: inclinar o aparelho e tocar em
  calibrar. *Observar:* a tela pede para **segurar parado** e mostra o progresso da
  janela; ao fim da captura a mira vai para o centro e ali permanece com o aparelho
  parado; mexer o aparelho durante a captura faz a interface **pedir repetição** em vez
  de aceitar um centro ruim; repetir a calibração em outra posição funciona sem
  reconectar (F5.1, F5.2, F5.6).
- **W28m — Jogável no pior degrau da escada (KPI-23)**: abrir o controle com
  `?src=deviceorientation` e jogar uma rodada completa de Duck Shooting. *Observar:* o
  indicador de fonte mostra `deviceorientation`, a mira responde e a partida é
  concluída — pior precisão é aceitável, controle inutilizável não é (F13.5). Repetir,
  se houver aparelho sem magnetômetro disponível, confirmando que ele joga em
  `fusion_nomag`.
- **W20 — Sessão jogável fim-a-fim**: com o servidor no ar e o Duck Shooting aberto no
  PC, jogar uma rodada completa usando apenas o celular, **segurando-o em pé como um
  Wii Remote**. *Observar:* **a mira está onde a ponta do aparelho aponta** (apontar
  para um canto leva a mira ao canto; voltar ao neutro recentra a mira — ela nunca
  fica "à deriva"), o botão A dispara, a calibração recentraliza, e nenhum controle
  fica inerte durante a partida. **Este é o critério de "o produto funciona"** —
  nenhuma entrega pode ser declarada pronta sem ele.
- **W22m — Ergonomia e sentido do apontamento (KPI-18, F4)**: com o jogo aberto e o
  aparelho calibrado na pegada vertical. *Observar:* (a) apontar a ponta para a
  **direita** move a mira para a **direita**; para a esquerda, esquerda; **levantar**
  a ponta move a mira para **cima**; abaixar, baixo — 4/4 direções corretas, sem
  nenhuma inversão; (b) varrer a mira de uma borda à outra da tela é possível **só
  com o giro do pulso**, sem mover o cotovelo (`DEFAULT_RANGE_DEG` padrão de 20° por
  direção, ou os alcances medidos no assistente da F12 — se
  exigir o braço, o parâmetro reprova); (c) torcer o aparelho no próprio eixo (ponta
  fixa) **não** desloca a mira perceptivelmente; (d) a mira responde sem atraso
  perceptível ("a mira obedece" — a suavização padrão não pode ser sentida como
  borracha).
