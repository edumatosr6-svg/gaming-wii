# Testes — Ciclo de vida da conexão [F9, F3, F1, KPI-5, KPI-6, KPI-25]

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
  envia `motion` sem calibrar, então o offset aplicado é o padrão (nulo), não X — e os
  alcances aplicados são `DEFAULT_RANGE_DEG` até chegar um `calibrate` com `ranges`.
  *O servidor não guarda perfil entre sessões; quem lembra os alcances é o cliente
  (P3.4), e ele os reenvia.*
- **C5b — Reenvio de alcances após reconexão**
  Dado uma nova sessão que recebe `calibrate` com `ranges` e `center: null` logo após o
  `hello`, então os quatro alcances passam a valer e o centro continua o padrão até uma
  captura de centro (P3.4, F9).
- **C6 — Início do servidor**
  Dado o servidor iniciado em porta livre, então HTTP responde 200 nas rotas do
  controle e do jogo e as URLs impressas contêm IP e porta (critérios F1.1, F1.2 —
  o fingerprint do certificado é igual entre duas execuções consecutivas).
- **C7 — Driver ausente**
  Dado a plataforma reportando driver indisponível (simulado no seletor de
  implementação), quando o servidor inicia, então termina com exit code ≠ 0 e a
  mensagem cita o driver e onde obtê-lo (critério F7.2).
- **C6b — QR code decodifica para a URL impressa**
  Dado o servidor iniciado em porta livre, quando se captura o QR exibido (ASCII lido
  da saída do terminal, ou a imagem no caminho impresso) e se decodifica com uma
  biblioteca de leitura de QR, então o conteúdo decodificado é **exatamente igual** à
  URL do controle impressa no mesmo start (critério F1.6). Repetir iniciando com
  `--port` diferente e/ou uma segunda interface de rede simulada (IP diferente): o novo
  QR decodifica para o novo IP:porta, nunca para o do start anterior (critério F1.7,
  KPI-25 parte automatizada).
- **C6c — Nenhuma chamada de rede para gerar o QR**
  Dado o servidor iniciado com acesso à internet bloqueado no ambiente de teste, quando
  o QR é gerado, então a geração conclui normalmente (critério F1.8) — prova que a
  biblioteca de QR não depende de serviço de terceiros pela rede.
- **C6d — Falha na geração do QR não derruba o servidor**
  Dado a biblioteca/renderização de QR forçada a falhar (dublê de erro), quando o
  servidor inicia, então ele sobe normalmente, imprime as URLs (critério F1.1) e emite
  um aviso no terminal nomeando a causa da falha do QR, sem exceção não tratada
  (critério F1.9). O campo de IP manual (F3) continua funcional nesse cenário.

## Manuais / hardware [manual/hardware]

- **C8 — Queda visível e reconexão automática**: derrubar o Wi-Fi do celular durante o
  uso e restabelecê-lo em seguida. *Observar:* a tela passa a `desconectado` de forma
  visível, exibindo o código de fechamento; enquanto durar a queda o estado permanece
  na tela (a interface nunca aparenta funcionar sem estar conectada); ao voltar a rede,
  o cliente **reconecta sozinho, sem nenhum toque**, e o input volta a funcionar
  (critérios F9.3, F9.5, F9.6, F9.7). O toque em reconectar continua funcionando como
  atalho, mas reprovar por exigir toque é o ponto do caso.
- **C9 — Tempo de reconexão (KPI-5)**: com servidor já rodando e IP lembrado,
  cronometrar do desbloqueio do celular até input ativo no gamepad: < 15 s.
- **C10 — Estabilidade de sessão (KPI-11)**: sessão contínua de 30 min jogando Duck
  Shooting; registrar quedas de conexão e inputs travados. Aprovado com 0 ocorrências
  de ambos.
- **C11 — Pareamento inicial via QR vs. digitação manual (KPI-25)**: com uma pessoa que
  nunca usou o produto, cronometrar (a) do QR exibido no terminal até o celular no
  estado `conectado`, escaneando com a câmera, e (b) do IP exibido até `conectado`,
  digitando manualmente no campo da F3. *Observar:* (a) fica abaixo de 10 s e é
  perceptivelmente mais rápido e com menos erro de digitação que (b); nenhum dos dois
  caminhos fica indisponível durante o teste (F3 continua funcional mesmo com o QR
  presente).
