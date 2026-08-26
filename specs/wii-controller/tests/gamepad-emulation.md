# Testes — Emulação de gamepad virtual [F7]

## Automatizados (com dublê da interface `gamepad/base.py`)

- **E1 — Contrato da interface**: o fake e a implementação Windows expõem a mesma
  interface (setar botão, eixo, gatilho, callback de rumble, reset); testes de
  contrato rodam contra o fake em qualquer SO (critério F7.3).
- **E2 — Reset atômico**: chamar reset com vários botões e eixos ativos zera tudo em
  uma única operação observável (base do C1/KPI-6).
- **E3 — Mapa de botões XInput**: cada id do protocolo (`a,b,x,y,up,down,left,right,
  lb,rb,start,back`) mapeia para o botão XInput correto e distinto (tabela de
  referência no teste).
- **E4 — Faixa de eixos**: valores [-1.0, 1.0] da camada de mapeamento são
  convertidos para a faixa nativa do driver sem inversão de sinal nem clipping
  incorreto (testado no fake com a mesma função de conversão).
- **E5 — Isolamento de import (estático)**: busca por import da biblioteca do driver
  (`vgamepad`) no código só encontra ocorrências em `server/gamepad/`
  (critérios F1.5, F7.4).
- **E6 — Seleção por plataforma**: no seletor de implementação, plataforma Windows
  com driver presente → implementação Windows; driver ausente → erro acionável
  (ver C7); plataforma não suportada → mensagem clara citando o fallback futuro.

## Manuais [manual/hardware]

- **E7 — Reconhecimento pelo SO**: com servidor rodando e cliente conectado no
  Windows com ViGEmBus instalado, `joy.cpl` lista um controle Xbox 360 e mostra
  botões/eixos respondendo aos toques e à inclinação (critério F7.1).
- **E8 — Jogo de terceiros**: um jogo comercial qualquer com suporte a XInput
  reconhece o controle sem configuração manual (prova da promessa central).
- **E9 — Rumble do driver**: um jogo/ferramenta que emite rumble no controle faz o
  celular vibrar (fio completo da F8, complementa P12 e G16).
