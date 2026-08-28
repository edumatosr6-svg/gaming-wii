# Spec Validation Report — wii-controller

**Veredito: SUCCESS**

_Iteração 2 — 2026-08-27 (rodada da precisão do apontamento)_

## Pontos verificados
- [x] **Completude** — as sete frentes do `descriptions.md` desta revisão estão cobertas
  com critério de aceite verificável: calibração de centro por **média de janela** com
  média circular e rejeição de janela instável (F5, F5.4–F5.8), **assistente guiado de
  alcance por direção** (F12, P6) com a consequência arquitetural normatizada no pipeline
  (F4 passo 4: limite por direção e **proibição explícita** da normalização radial),
  **zona morta e sensibilidade por eixo** (F4 passo 3 + Config, com invariante
  `DEAD_ZONE_YAW_DEG >= DEAD_ZONE_PITCH_DEG`), **suavização adaptativa por velocidade**
  (F4, com a estimativa por deslocamento em janela normatizada), **escada de degradação
  de fontes** detectada em runtime e visível na tela (F13, F2.13), **fusão própria no
  cliente com rejeição magnética** (F14) e os **novos KPIs de precisão** (KPI-19 a
  KPI-24). O que já era válido foi preservado: apontamento absoluto (F4/KPI-16), pegada
  vertical e sentido dos eixos (F4.6/KPI-18), ciclo de vida, jogos, layout do corpo de
  Wii Remote, protocolo.
- [x] **KPIs** — mensuráveis, com meta numérica e rastreados a feature + teste nomeado.
  Destaques desta rodada: KPI-19 exige simetria **por eixo** e proíbe explicitamente
  aprovar pela média dos dois; KPI-21 tem parte automatizável (orçamento configurado,
  L18) e parte cronometrada; KPI-22 exige a comparação **medida** entre fontes que o
  `descriptions.md` pediu ("melhorar de forma medida, não intuída"); KPI-24 dá gate
  automatizado à frente 4. KPI-7 e KPI-17 deixaram de ser trade-off: são exigidos **na
  mesma configuração** (M20 + M21), que é a resolução do conflito apontado na tarefa.
- [x] **Testabilidade** — caminho feliz, bordas e falhas cobertos: M21–M28 (servidor),
  PC1–PC27 (novo arquivo `tests/pointing-client.md`, faixa JS), W25–W29 e W28m (headless
  e manual), P13–P18 (protocolo), L13–L18 (comparativos e orçamento). Os quatro furos da
  iteração 1 foram fechados (ver abaixo).
- [x] **Consistência interna** — protocolo, `CalibrationProfile`, `SessionState`,
  `ClientViewState` (agora cinco telas, com `link` separado da tela) e as duas seções de
  Config concordam entre si e com as features e procedures (P1–P7, agora em ordem).
- [x] **Consistência entre slugs (contratos externos)** — ver seção própria.
- [x] **Consistência com `implementation-report.md`** — os quatro pedidos da rodada
  anterior seguem endereçados, e nada nesta revisão os desfaz. Em particular, a
  suavização adaptativa **não** reintroduz mira por velocidade: F4 declara o filtro como
  transiente, M22 exige que o estado estacionário seja igual ao valor não suavizado e
  independente do caminho, e KPI-16/M19 permanecem intactos.
- [x] **Consistência com `references/`** — cliente sem build/npm mantido (F14 exige fusão
  em JS puro; `tools/dependencies.md` declara "nenhuma dependência nova" como requisito
  explícito, incluindo a proibição de biblioteca de fusão por CDN); contexto seguro
  preservado; a escada de fontes é coerente com a irregularidade de disponibilidade
  descrita nas referências e no `descriptions.md`.
- [x] **Tools** — nada supérfluo: nenhuma dependência nova, a fonte `synthetic` substitui
  emulação de sensores por ferramenta externa, e as checagens estáticas novas (sem
  `hypot` no mapeamento, sem user agent na seleção de fonte, duas chaves de
  `localStorage`, dono único das constantes) são exatamente as que reprovam o
  desfazimento silencioso desta revisão.

## Contratos entre slugs

- `fruit-ninja` — **valor do eixo do gamepad virtual** (posição apontada absoluta em
  [-1,1], lida por `axes[2]`/`axes[3]` no *standard mapping*) — **compatível**. Forma e
  significado inalterados; o que mudou (zona morta por eixo, limite por direção,
  suavização adaptativa) altera *como o ângulo vira o valor*, não *o que o valor
  significa*. Este era o risco mais perigoso da rodada (semântica mudando sem mudar a
  forma) e foi verificado ponto a ponto contra `specs/fruit-ninja/software-specs.md` F1.
- `fruit-ninja` — **rota estática `/game/fruit-ninja/` e fallback `POST /rumble`** —
  **compatível**: esta revisão não mexe em rotas nem no caminho de rumble.
- `fruit-ninja` — **zona morta e suavização em série** (servidor + as próprias do jogo) —
  **compatível**, com o efeito colateral registrado nas Observações.
- Não há outros slugs além de `fruit-ninja` e `wii-controller` (`specs/_template` é
  gabarito, não slug).

## Problemas encontrados
Nenhum bloqueante nesta iteração. Os quatro da iteração 1 foram corrigidos:

| # (it. 1) | Como foi resolvido | Onde reprova |
|---|---|---|
| 1. Calibração impossível no piso da escada | F5 ganhou o "Critério de suficiência sob fonte lenta": janela estende até `CALIB_WINDOW_MAX_MS`, piso de 8 amostras (justificado: ruído a ~35% do de uma amostra), e abaixo de `CALIB_MIN_SOURCE_HZ` a spec manda **recusar nomeando a causa**, nunca repetir em laço nem aceitar centro fraco. Janela instável e fonte lenta são declarados casos distintos | F5.8, PC4 (a: 12 Hz conclui; b: 5 Hz recusa) |
| 2. `synthetic` dentro ou fora da escada | F13 tem agora definição normativa: a escada tem quatro degraus, `synthetic` é **fonte de diagnóstico fora dela**, jamais elegível pela detecção automática; F13.1, F13.4, o enum de `status` e P7 foram alinhados | F13.1, PC24b (quatro degraus indisponíveis ⇒ erro, nunca sintética), P17 |
| 3. Constantes de calibração sem dono | Cada constante tem dono único: captura/estabilidade/retries/orçamento no **cliente**; `RANGE_MIN_DEG`/`RANGE_MAX_DEG` no **servidor**, com a única duplicação permitida declarada e com regra de desempate ("vale a decisão do servidor") | Config (servidor e cliente), checagem estática 9 de tooling.md, PC6, PC9, PC11b, L18 |
| 4. M22b exigia observabilidade não requerida | F4 passou a exigir que a conversão devolva **fator efetivo e velocidade estimada por eixo**, com faixas numéricas em F4.14; M22b foi reescrito sobre esses valores devolvidos, não sobre estado interno | F4.14, M22b |

`recorrente: não` para todos.

## Observações (mesmo com SUCCESS)

- **Leitura normativa para o impl-loop (evita uma ida e volta):** F5, passo 3, diz que a
  interface "oferece trocar/forçar outra fonte". A forma exigida é mínima: **mensagem
  visível nomeando a causa + um caminho de um toque que recarregue forçando outra fonte**
  (o mesmo mecanismo `?src=` da F13). Um seletor de fontes na UI também satisfaz, mas não
  é exigido.
- **Cobertura sugerida (não bloqueante):** F5.8 é verificada na faixa JS (PC4). Como a
  fonte `synthetic` torna isso barato, vale o `impl-tester` acrescentar um caso headless
  afirmando que a mensagem de "fonte lenta demais" fica **visível** — o histórico deste
  projeto é de defeitos que vivem na camada DOM com a lógica pura correta.
- **Coerência a preservar em retuning:** `CALIB_MIN_SAMPLES_FLOOR` (8) e
  `CALIB_MIN_SOURCE_HZ` (8 Hz) só coincidem porque `CALIB_WINDOW_MAX_MS` é 1000 ms. Se
  alguém retunar a janela, os três precisam ser reavaliados juntos, senão a mensagem de
  "fonte lenta" passa a mentir sobre o limiar.
- **Efeito colateral entre slugs a acompanhar:** `fruit-ninja` aplica zona morta
  **radial** própria sobre o eixo (F1, passo 2) e suavização própria
  (`smoothingTauMs <= 60 ms`). Com o wii-controller passando a ter zona morta por eixo e
  suavização adaptativa, o resultado percebido no Fruit Ninja é a composição das duas —
  a zona morta radial do jogo re-simetriza parte do ganho da frente 1 perto do centro.
  Não quebra contrato, mas se o KPI-19 aprovar aqui e o Fruit Ninja continuar pesado no
  eixo horizontal, o lugar a olhar é a F1 do slug `fruit-ninja`, não o mapeamento do
  servidor.
- **Risco assumido (herdado, agora com plano):** a deriva de `alpha` continua sendo o
  ponto fraco do modelo vertical. A diferença é que agora existe critério medido
  (KPI-22/L16): se a fusão não melhorar a deriva no hardware de referência, a frente 4
  reprova por decisão de spec — comportamento desejado, não defeito do processo.
- **Débito consciente:** a suíte headless passa a depender da fonte `synthetic` para uma
  faixa inteira de casos (assistente, indicador de fonte, interferência). Se a fonte
  sintética divergir do caminho real de sensores, os testes passam e o produto não
  funciona — que é exatamente o modo de falha histórico deste projeto. Mitigação já na
  spec: PC19 amarra a saída da fusão à convenção do contrato, e W20/W22m/W28m continuam
  sendo verificação com hardware real.
- **Input humano a corrigir na próxima revisão:** `references/README.md` ainda descreve a
  Screen Orientation API como "travar em paisagem", resquício da decisão substituída. Não
  bloqueia (a spec é normativa e exige retrato), mas é ruído para quem ler a referência.
