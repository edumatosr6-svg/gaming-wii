# Testes — Instrumentação e KPIs [F11, KPI-1..KPI-4, KPI-7, KPI-10]

Mistura de testes automatizados (endpoint de métricas, cliente simulado) e
procedimentos manuais instrumentados no hardware de referência. Os procedimentos
manuais são roteiros passo a passo com critério de aprovação objetivo — o resultado é
registrado no testing-report.

## Automatizados

- **L1 — `GET /metrics`**: com uma sessão simulada ativa, o endpoint responde JSON
  contendo `latency_ms_p50`, `latency_ms_p95`, `motion_rate_hz`, `jitter_ms`,
  `net_ms` e `proc_ms` (critério F11.3).
- **L2 — Taxa de amostras (KPI-2, caminho automatizado)**: um cliente WebSocket
  simulado em loopback enviando `motion` a 60 Hz por 10 s resulta em
  `motion_rate_hz ≥ 50` reportado nas métricas.
- **L3 — Custo zero com overlay desligado**: com nenhuma leitura de `/metrics`, o
  processamento de uma mensagem `motion` não gera nenhuma mensagem adicional de
  medição (critério F11.2 — verificável contando mensagens no fake/transporte).
- **L4 — Janela de latência**: injetando pongs com RTTs conhecidos e tempos de
  processamento medidos conhecidos (fake instrumentado), p50/p95/jitter calculados
  batem com os valores esperados da janela, e `latency_ms_*` corresponde à soma
  `net + proc` definida em F11 (composição da métrica do KPI-1).

## Procedimentos manuais instrumentados [manual/hardware]

Pré-condição comum: A57 + PC na mesma rede Wi-Fi, servidor rodando, overlay ativo.

- **L5 — Latência fim-a-fim (KPI-1)**: jogar 2 min de Duck Shooting; registrar
  `latency_ms_p95` do overlay a cada 30 s. Aprovado se p95 < 30 ms em todas as
  leituras. (Se reprovado de forma consistente, aciona a alternativa de protocolo
  binário prevista nos Data Models.)
- **L6 — Taxa de amostras real (KPI-2)**: com o celular inclinando continuamente,
  `motion_rate_hz ≥ 50` sustentado por 2 min.
- **L7 — Jitter (KPI-3)**: na mesma sessão de L5, `jitter_ms < 10` em todas as
  leituras.
- **L8 — Deriva do centro (KPI-4)**: calibrar; apoiar o aparelho imóvel por 15 min
  com a tela do jogo aberta; aprovado se a mira permanece dentro da zona morta (eixo
  em 0,0) ao final, sem recalibrar. *Atenção especial ao eixo horizontal:* no modelo
  de apontamento vertical (F4) ele deriva de `alpha`, que em giroscópio relativo é o
  ângulo que mais escorrega — a deriva horizontal é o modo de falha esperado deste
  caso.
- **L9 — Estabilidade da mira (KPI-7)**: com o aparelho na mão, parado, observar a
  mira por 30 s: o tremor deve ser menor que o raio da hitbox do pato (sobrepor a
  mira a um pato-alvo estático de teste ou medir amplitude no overlay).
- **L10 — Modo de diagnóstico direto**: ativar o modo secundário explícito de medição
  sem a camada de emulação e registrar a diferença para decompor a latência do
  driver; confirmar que o modo é desativado por padrão.
- **L11 — Bateria (KPI-10)**: registrar % de bateria no início e após 1 h de sessão
  contínua; reportar %/h (métrica de acompanhamento, não bloqueia aceite).
- **L12 — Taxa de acerto comparativa**: rodar o cenário determinístico (semente fixa,
  rodadas 1–3) antes e depois de mudanças de suavização/mapeamento e registrar a taxa
  de acerto do mesmo jogador; regressão significativa reprova a mudança.
