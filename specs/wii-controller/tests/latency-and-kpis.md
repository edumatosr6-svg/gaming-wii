# Testes — Instrumentação e KPIs [F11, KPI-1..KPI-4, KPI-7, KPI-10]

Mistura de testes automatizados (endpoint de métricas, cliente simulado) e
procedimentos manuais instrumentados no hardware de referência. Os procedimentos
manuais são roteiros passo a passo com critério de aprovação objetivo — o resultado é
registrado no testing-report.

## Automatizados

- **L1 — `GET /metrics`**: com uma sessão simulada ativa, o endpoint responde JSON
  contendo `latency_ms_p50`, `latency_ms_p95`, `motion_rate_hz`, `jitter_ms`,
  `net_ms` e `proc_ms` (critério F11.3), **mais** `tremor_x`, `tremor_y`, `source` e
  `mag_reject_ratio` (critério F11.4). `tremor_x` e `tremor_y` são reportados
  **separadamente**: um valor único agregado reprova o caso, porque esconderia o eixo
  ruim que a revisão de precisão existe para expor (KPI-19).
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
  com a tela do jogo aberta; aprovado se a mira permanece dentro da zona morta do eixo
  ao final, sem recalibrar. **Registrar o desvio em graus, por eixo** — não só
  aprovado/reprovado: esse número é a linha de base da comparação do KPI-22. *Atenção
  especial ao eixo horizontal:* no modelo de apontamento vertical (F4) ele deriva de
  `alpha`, o ângulo que mais escorrega — a deriva horizontal é o modo de falha esperado
  deste caso, e é o alvo da fusão (F14).
- **L9 — Estabilidade da mira (KPI-7)**: com o aparelho na mão, parado, observar a
  mira por 30 s: o tremor deve ser menor que o raio da hitbox do pato (sobrepor a
  mira a um pato-alvo estático de teste ou medir amplitude no overlay). Registrar
  `tremor_x` e `tremor_y` **separadamente** (entram no L13).
- **L10 — Modo de diagnóstico direto**: ativar o modo secundário explícito de medição
  sem a camada de emulação e registrar a diferença para decompor a latência do
  driver; confirmar que o modo é desativado por padrão.
- **L11 — Bateria (KPI-10)**: registrar % de bateria no início e após 1 h de sessão
  contínua; reportar %/h (métrica de acompanhamento, não bloqueia aceite).
- **L12 — Taxa de acerto comparativa**: rodar o cenário determinístico (semente fixa,
  rodadas 1–3) antes e depois de mudanças de suavização/mapeamento e registrar a taxa
  de acerto do mesmo jogador; regressão significativa reprova a mudança.

## Precisão do apontamento — procedimentos comparativos [manual/hardware]

Todos registram **números**, não impressões: a revisão de precisão existe justamente
porque "está difícil mirar" não é um relatório que se possa refutar ou confirmar.

- **L13 — Simetria de precisão entre os eixos (KPI-19)**: com o aparelho calibrado e
  apoiado imóvel, registrar `tremor_x` e `tremor_y` do overlay por 60 s; em seguida,
  com um alvo estático de teste, medir o erro de apontamento em uma sequência de alvos
  **horizontais** e outra de alvos **verticais**. *Aprovado se:* razão entre `tremor_x`
  e `tremor_y` ≤ 2.0 **e** os erros dos dois eixos na mesma ordem de grandeza. *Um bom
  resultado "na média dos dois eixos" não aprova* — o eixo pior é o que decide.
- **L14 — Ganho da calibração guiada (KPI-20)**: com **duas pessoas de alcance de pulso
  visivelmente diferente**, cada uma joga uma rodada (a) com os alcances padrão e
  (b) após concluir o assistente. *Observar e registrar:* se alcança as quatro bordas e
  os quatro cantos sem contorção em cada condição, e qual das duas a pessoa prefere.
  *Aprovado se:* após o assistente, ambas alcançam 4/4 bordas e 4/4 cantos, e nenhuma
  precisou editar constante de configuração.
- **L15 — Custo de entrada do assistente (KPI-21)**: cronometrar, com pessoa que nunca
  usou o assistente, do início da primeira etapa até o retorno ao estado `conectado`.
  *Aprovado se* < 30 s. *Registrar também* quantas etapas exigiram repetição — muita
  repetição indica critério de estabilidade apertado demais para a mão real.
- **L16 — Melhoria medida da deriva (KPI-22)**: repetir o L8 duas vezes na mesma sessão
  de teste, no mesmo lugar e com o mesmo aparelho: (a) `?src=deviceorientation` e
  (b) `?src=fusion_mag`. *Aprovado se:* a deriva horizontal em graus de (b) é
  **estritamente menor** que a de (a). Opcionalmente, repetir com `?magreject=off` para
  separar o ganho da fusão do ganho da rejeição. *Se (b) não for melhor, a frente 4
  reprova — é este o critério de aceite dela, e ele é medido, não intuído.*
- **L17 — Interferência provocada (KPI-24, confirmação no hardware)**: com o aparelho
  perto de uma fonte de interferência real (gabinete do PC, monitor, fonte), observar o
  indicador de rejeição magnética acender e a mira **não** ser puxada para o lado
  enquanto ele estiver aceso. Complementa o PC12 (sintético), que é o gate automatizado.

## Automatizado adicional

- **L18 — Orçamento configurado do assistente (KPI-21, parte automatizada)**: a soma das
  durações configuradas do assistente (5 capturas + transições) é ≤ `WIZARD_BUDGET_MS`
  (20 s), lidas do **módulo de configuração do cliente**, que é o dono dessas constantes
  (o servidor não tem cópia). No pior caso de fonte lenta, cada captura conta
  `CALIB_WINDOW_MAX_MS`. *Reprova a configuração que tornaria o assistente longo demais
  antes de qualquer pessoa cronometrar.*
