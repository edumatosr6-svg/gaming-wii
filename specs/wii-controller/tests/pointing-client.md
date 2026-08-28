# Testes — Precisão do apontamento no cliente [F5, F12, F13, F14, F15]

Alvo: a lógica JS pura do cliente que passou a existir com a revisão de precisão —
**fusão de sensores, rejeição magnética, escada de fontes, captura de janela de
calibração e assistente de alcance**. Roda no runner JS do projeto (`node --test`
executado dentro do `pytest`, ver tools/tooling.md): **um único `pytest -q` continua
cobrindo servidor e cliente**.

Motivo de existir deste arquivo: pela decisão de "Divisão do processamento entre cliente
e servidor" (software-specs.md), essa lógica saiu do alcance da suíte Python. A spec
exige **cobertura equivalente do lado JS** — sem estes casos, a frente de precisão fica
sem rede de segurança justamente onde ela é mais fácil de quebrar em silêncio.

Todos os casos são alimentados por **fluxos sintéticos** (amostras de sensor ou de
orientação geradas no teste). Nenhum caso deste arquivo exige hardware, permissão de
navegador ou rede. As funções sob teste são puras: (estado anterior, amostras, dt) →
novo estado.

## Captura de janela do centro e dos extremos [F5]

- **PC1 — Média, não amostra**
  Dado uma janela de amostras em torno de um centro conhecido, com ruído de média zero,
  quando a captura conclui, então o centro calculado fica a menos de 0.2° do centro
  conhecido **e é diferente do valor da última amostra da janela** (critério F5.4).
  *Reprova a volta da calibração por amostra instantânea, que é o defeito que originou
  esta mudança.*
- **PC2 — Média circular no yaw**
  Dado uma janela de yaw oscilando em torno de 0° com amostras em 359.0° e 1.0°, quando
  a captura conclui, então o centro é ≈ 0° (tolerância 0.5°), nunca ≈ 180° (F5.5).
  *A média aritmética simples reprova aqui, e esse é o ponto do caso.*
- **PC3 — Janela instável rejeitada**
  Dado uma janela com uma amostra isolada afastada mais que `CALIB_STABILITY_PP_DEG` da
  média, quando a captura conclui, então o resultado é "rejeitado" com motivo, nenhum
  perfil é produzido e o chamador é instruído a repetir (F5.6).
- **PC4 — Fonte lenta: estende, conclui ou recusa — nunca trava (F5.8)**
  (a) Dado uma fonte a **12 Hz**, quando a janela padrão termina com menos de
  `CALIB_MIN_SAMPLES_FLOOR` = 8 amostras válidas, então a janela é **estendida** até
  `CALIB_WINDOW_MAX_MS` e a captura **conclui** com o centro médio.
  (b) Dado uma fonte a **5 Hz** (abaixo de `CALIB_MIN_SOURCE_HZ`), então a captura
  termina com resultado "fonte lenta demais", com motivo nomeado e oferta de troca de
  fonte — **não** com pedido de repetição, e **nunca** com um centro aceito sobre 3
  amostras. *Este caso existe porque exigir contagem fixa de amostras tornaria a
  calibração impossível no piso da escada (F13), contrariando KPI-23 — o produto tem que
  ser jogável lá.*
- **PC5 — Entradas inválidas na janela**
  Amostras com `NaN`, `null` ou `a` ausente são descartadas da janela; se sobrarem
  amostras suficientes, a captura conclui normalmente; se não, é rejeitada — nunca
  exceção nem centro `NaN`.
- **PC6 — Duração limitada pela configuração do cliente**
  A captura consome `CALIB_WINDOW_MS` e, no pior caso (fonte lenta, PC4a), no máximo
  `CALIB_WINDOW_MAX_MS` ≤ 1000 ms; não fica aberta indefinidamente esperando
  estabilidade (F5.7, KPI-21). As constantes lidas são as do **módulo de configuração do
  cliente**, que é o dono delas — o servidor não tem cópia (Data Models / Config).

## Assistente de calibração guiada [F12]

- **PC7 — Cinco etapas na ordem**
  A máquina de estados do assistente percorre neutro → esquerda → direita → cima →
  baixo, uma etapa por vez, e só avança com captura aceita (F12.1).
- **PC8 — Alcance por direção calculado do centro**
  Dado centro e extremos sintéticos conhecidos, então `range.right`, `range.left`,
  `range.up` e `range.down` são os módulos das diferenças correspondentes, **quatro
  valores independentes** — nenhum é derivado da média dos outros (F12.2, F12.4).
- **PC9 — Alcance degenerado rejeitado**
  Dado um extremo a menos de `RANGE_MIN_DEG` do centro (o usuário não se moveu), então a
  etapa é rejeitada, o assistente pede repetição e o perfil final não contém o valor
  degenerado (F12.3). Idem para alcance acima de `RANGE_MAX_DEG`. *A pré-validação no
  cliente é conveniência; a autoridade é o servidor (Config): se os limites divergirem, o
  perfil aceito localmente e rejeitado por `calibration_applied` leva ao caminho de
  W26c, e o assistente exibe o motivo em vez de seguir como se tivesse calibrado.*
- **PC10 — Saída após repetições**
  Após `CALIB_MAX_RETRIES` rejeições seguidas na mesma direção, o assistente oferece o
  valor padrão daquela direção e avança — não prende o usuário num laço.
- **PC11 — Pular e persistir**
  Pular produz perfil com `DEFAULT_RANGE_DEG` nas quatro direções (F12.5). Concluir
  persiste **apenas os quatro alcances** (nunca o centro) na chave dedicada de
  `localStorage`, com `schemaVersion`; recarregar reidrata os alcances e **não** o
  centro (F12.6). `schemaVersion` desconhecido é tratado como perfil ausente.
- **PC11b — Orçamento de tempo**
  A soma das durações configuradas do assistente (5 capturas + transições) é
  ≤ `WIZARD_BUDGET_MS` (F12.7 / KPI-21) — checagem sobre a **configuração do cliente**
  (dona destas constantes), sem cronômetro. É o mesmo valor verificado por L18.

## Fusão de sensores e rejeição magnética [F14]

- **PC12 — Rejeição magnética eficaz (KPI-24)**
  Dado um fluxo sintético de giroscópio/acelerômetro/magnetômetro com um trecho de campo
  corrompido (módulo fora de `FUSION_MAG_MIN_UT`–`FUSION_MAG_MAX_UT` e/ou inclinação
  alterada além de `FUSION_MAG_DIP_TOL_DEG`), quando a fusão processa o fluxo com e sem
  rejeição, então o erro de yaw ao fim do trecho é **estritamente menor com rejeição** e
  ≤ 5° em módulo (F14.4). *Sem este caso, "a fusão melhorou" é opinião.*
- **PC13 — Estabilidade estática**
  Giroscópio em repouso e acelerômetro/magnetômetro constantes por 60 s simulados: a
  orientação varia menos que 0.5° (F14.2).
- **PC14 — Correção de deriva do giroscópio**
  Giroscópio com viés constante conhecido (ex. 1 °/s em pitch) + acelerômetro coerente:
  o erro de pitch converge e permanece < 2°, em vez de crescer sem limite (F14.3).
- **PC15 — Sem magnetômetro ainda funciona**
  Fluxo sem magnetômetro: a fusão opera em `fusion_nomag`, sem exceção, com pitch
  correto e yaw relativo (F14.5). *Um aparelho sem magnetômetro é caso real.*
- **PC16 — Aceleração suspende a correção de gravidade**
  Durante um trecho em que o módulo da aceleração se afasta de 1 g mais que
  `FUSION_ACC_TOL_G` (aparelho sacudido), a correção por acelerômetro é suspensa e a
  orientação segue pelo giroscópio; ao normalizar, a correção volta.
- **PC17 — Entradas hostis**
  `NaN`, amostra ausente, `dt` zero, negativo ou muito grande não produzem exceção nem
  `NaN` na orientação de saída (F14.6).
- **PC18 — Histerese do indicador de interferência**
  Uma interferência que liga/desliga mais rápido que `FUSION_MAG_HYSTERESIS_MS` não faz
  o estado `mag_rejected` alternar a cada amostra (F14.7).
- **PC19 — Saída na convenção do contrato**
  Para um fluxo sintético correspondente a uma orientação conhecida, a fusão devolve
  `a` ∈ [0, 360), `b` ∈ [-180, 180), `g` ∈ [-90, 90) coerentes com a convenção do
  `DeviceOrientationEvent` (contrato da F4). *É o caso que garante que trocar de fonte
  não inverte nem troca eixo — o defeito que M17/M18 pegam do lado do servidor.*

## Escada de fontes de orientação [F13]

- **PC20 — Ordem e degradação**
  Dado provedores simulados em que o degrau 1 não entrega amostras dentro de
  `SOURCE_PROBE_MS`, então a seleção cai para o degrau 2, e assim por diante, na ordem
  da tabela da F13 (F13.2).
- **PC21 — Detecção por amostra recebida, não por existência da API**
  Dado um provedor que existe e concede permissão mas **nunca emite amostra**, então ele
  não é escolhido. *Reprova a detecção por presença de API — o modo de falha real do
  evento clássico sob economia de bateria.*
- **PC22 — Nenhuma decisão por user agent**
  Inspeção estática: a seleção de fonte não lê `navigator.userAgent` nem equivalente
  (F13.1).
- **PC23 — Queda em runtime**
  Dado a fonte em uso parando de emitir por mais que `SOURCE_STALL_MS`, então o cliente
  desce um degrau, atualiza o rótulo exposto e marca `status` como pendente de envio
  (F13.6).
- **PC24 — Forçamento por parâmetro e `synthetic` fora da escada**
  (a) `?src=<fonte>` seleciona a fonte indicada sem sondagem, inclusive `synthetic`, e
  forçar uma fonte indisponível **não** cai calado para outra: produz erro visível
  (F13.4, F13.3). (b) Com os **quatro degraus indisponíveis** e sem `?src`, o resultado é
  o erro de F13.3 — **nunca** a fonte sintética (F13.1). *`synthetic` é fonte de
  diagnóstico, não degrau: se a detecção automática puder cair nela, um aparelho sem
  sensores "funcionaria" em cima de dados inventados, que é o pior modo de falha
  possível para um projeto cujo defeito histórico é passar em teste e não funcionar.*
- **PC25 — Interruptores isolados (F15)**
  `?mag=off` desliga a correção magnética (resultado igual ao de `fusion_nomag` para o
  mesmo fluxo) e `?magreject=off` mantém a correção sem rejeição (resultado igual ao do
  ramo "sem rejeição" de PC12). *Prova que os dois interruptores medem coisas
  diferentes — é o que separa "a fusão ajuda?" de "a rejeição ajuda?" (KPI-22).*

## Contrato de saída para o protocolo [F4, F14.8]

- **PC26 — `motion` não engorda**
  A mensagem produzida pelo cliente contém exatamente `type`, `a`, `b`, `g`, `t` —
  nenhuma leitura crua de sensor, nenhum campo de fonte ou de rejeição magnética
  (F14.8). *Precisão nova não pode ser paga com tráfego na mensagem mais frequente.*
- **PC27 — `status` em baixa frequência**
  Mudanças de fonte e de rejeição magnética produzem `status` no máximo 1×/s, e uma
  sequência de 60 mudanças em 1 s gera no máximo 1 mensagem além da inicial.
