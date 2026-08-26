# Testing Report — wii-controller

**Veredito: SUCCESS**

Data: 2026-08-26 — iteração 1 do Testing Loop (pós-revisão humana).

> **Leia primeiro:** este SUCCESS cobre a faixa automatizada. Ele **não** afirma que o
> produto funciona no aparelho. **KPI-13 (partida jogável fim-a-fim) e KPI-15 (servidor
> com driver real) continuam NÃO VERIFICADOS**, porque exigem hardware. Ver a seção
> "O que ficou por verificar", que é parte obrigatória deste veredito por
> `tools/tooling.md`.

## Resumo da execução

- Comando: `pytest -q` (comando único da suíte inteira).
- Resultado: **63 passed, 24 deselected, 0 failed, 0 skipped na execução padrão**
  (~16 s; duas execuções consecutivas com resultado idêntico).
- A suíte passou de 52 para 63 testes executáveis. Os 11 novos são a faixa de
  integração em navegador headless, que **não existia** — era exatamente a faixa cuja
  ausência deixou os 5 defeitos chegarem ao usuário.

| Arquivo | Testes | Faixa |
|---|---|---|
| `tests/test_mapping.py` | 16 | M1–M16, lógica pura |
| `tests/test_protocol.py` | 13 | P1–P12, unitários + loopback |
| **`tests/test_client_headless.py`** | **11** | **W11–W19, W21 — navegador headless (nova)** |
| `tests/test_gamepad_emulation.py` | 7 | E1–E6 + NullGamepad |
| `tests/test_connection_lifecycle.py` | 7 | C1–C7 |
| `tests/test_metrics.py` | 5 | L1–L4 |
| `tests/test_js_suite.py` | 4 | ponte `node --test` (W1–W3, G1–G14) + checks estáticos |

### Faixa nova: integração em navegador headless

Playwright (Python) dirigindo Chromium, carregando a página real servida pelo servidor
real (`run_server`), com emulação de toque (`page.touchscreen.tap`) e captura do que sai
pelo socket (wrapper em `WebSocket.prototype.send`). Gamepad substituído pelo dublê
`FakeGamepad` — roda em qualquer SO, sem driver e sem celular.

| Teste | Caso | Verifica |
|---|---|---|
| `test_w11_uma_tela_por_vez_nos_quatro_estados` | W11 | Nos 4 estados, exatamente uma tela com área > 0 (F2.5) |
| `test_w12_todos_os_botoes_respondem_ao_toque` | W12 | Os 12 botões enviam down/up por toque puro, sem `click` (F2.6, F6.2) |
| `test_w13_calibrar_responde_ao_toque` | W13 | `calibrate` enviado por toque puro (F2.6) |
| `test_w14_nada_intercepta_o_toque` | W14 | Centro de cada controle recebe o toque, com todas as faixas visíveis (F2.7) |
| `test_w15_tela_cheia_nao_engole_o_acionamento` | W15 (a) | A mensagem `button` sai mesmo com o pedido de modo imersivo (F2.8) |
| `test_w15_pedido_de_tela_cheia_vem_de_gesto_concluido` | W15 (b) | O pedido está ligado a `touchend`, nunca a `touchstart` (F2.8) |
| `test_w16_nenhuma_acao_depende_apenas_de_click` | W16 | Nenhum controle com `click` como caminho único (F2.9) |
| `test_w17_conexao_automatica_pela_origem` | W17 | Conecta sem digitação em ≤ 5 s, no endereço da origem (F3.1, F3.2) |
| `test_w18_reconexao_automatica_sem_toque` | W18 | Reconecta sozinho em ≤ 5 s, sem nenhum toque (F9.5) |
| `test_w19_estado_da_conexao_sempre_visivel` | W19 | Estado visível em 100% das amostras; motivo da queda persiste (F9.6, F9.7) |
| `test_w21_faixas_visiveis_nao_se_cobrem` | W21 | Faixas visíveis simultaneamente não se intersectam (F2.2, F2.3, F9.6) |

**A faixa não é pulável.** Sem o navegador, a suíte **falha** com a instrução de
instalação, em vez de pular em silêncio — verificado executando com
`PLAYWRIGHT_BROWSERS_PATH` inválido: 9 erros nomeando `playwright install chromium`, e
apenas os 2 testes estáticos (W16 e W15-b) seguem passando, por não precisarem de
navegador. Pular era exatamente o modo de falha que deixou os defeitos passarem.

### Validação dos próprios testes por mutação

Um teste que nunca falhou não é evidência de nada — é a lição central deste projeto, onde
52 testes passavam com o produto inutilizável. Antes de declarar a faixa boa, reintroduzi
cada defeito e confirmei que o teste correspondente reprova:

| Mutação (defeito reintroduzido) | Resultado |
|---|---|
| Faixas ancoradas individualmente na mesma borda | **W21 falha** ✔ |
| `pointer-events: none` removido das faixas | **W14 falha** ✔ |
| Calibrar ligado só a `click` | **W13 e W16 falham** ✔ |
| CSS anulando a alternância de telas (`display: flex !important`) | **W11 falha** ✔ |
| Origem da página ignorada (exige digitação) | **W17 falha** ✔ |
| Reconexão automática removida | **W18 falha** ✔ |
| Motivo da queda fora da faixa persistente | **W19 falha** ✔ |
| Fullscreen pedido em `touchstart` | **W15 (b) falha** ✔ — ver abaixo |

**Achado do processo de mutação, corrigido durante esta iteração:** a primeira versão de
W15 **não era capaz de reprovar** a implementação errada. Ligar o pedido de tela cheia a
`touchstart` mantinha o teste passando, porque o cancelamento da sequência de toque ao
entrar em tela cheia é comportamento do Chromium **no aparelho** e não se reproduz no
Chromium headless. O caso foi então dividido em duas metades — a comportamental e uma
estrutural (o pedido tem de estar registrado num evento que conclui o gesto), que é a
redação normativa de F2.8 — e a spec de teste `tests/client-controller.md` foi atualizada
com a nota "onde observar" antes de o teste ser escrito. Sem a mutação, W15 teria entrado
na suíte como um teste decorativo.

## Alterações nas specs de teste (antes da implementação)

Nenhum teste órfão foi criado. Duas edições em `specs/wii-controller/tests/client-controller.md`,
ambas feitas **antes** do código de teste correspondente:

1. **W21 (novo caso)** — "Faixas visíveis não se cobrem". Cobre a classe de defeito "CSS
   anula um mecanismo de JS que está correto", que nenhuma faixa detectava: a lógica pura
   não conhece layout, e W11/W14 medem telas e captura de toque, não legibilidade de
   faixas sobrepostas. Os dois defeitos desta iteração (aviso de erro mudo sob a faixa de
   status; dica de rotação ilegível sob a linha de diagnóstico) foram achados por revisão
   estática, não por teste.
2. **W15 e W19 (nota "onde observar")** — sem mudar o critério, explicitam onde a
   verificação é válida: W15 precisa da metade estrutural (acima); W19 precisa olhar para
   um elemento **persistente**, porque a tela de queda é substituída pela de `conectando`
   em menos de 1 s, e medir só ali é uma corrida.

## Falhas

Nenhuma na execução final.

Durante o desenvolvimento houve 3 falhas, **todas em código de teste ou no meu próprio
manuseio do ambiente — nenhuma foi defeito de implementação nem lacuna de spec**:

1. `from tests.conftest import FakeGamepad` colidiu com um pacote `tests` instalado em
   `site-packages`, que sombreia o diretório local. Resolvido usando o fixture
   `fake_gamepad` em vez de importar a classe.
2. `page.expose_function` rejeita método builtin (`list.append`). Resolvido com funções
   Python nomeadas.
3. **Erro meu, registrado por transparência:** ao limpar uma mutação usei
   `git checkout web/js/connection.js`, que reverteu o arquivo para o último commit e
   desfez `addressFromLocation`, o parâmetro `secure` e a guarda de geração desta
   iteração. Isso produziu uma falha de W19 que **parecia** defeito de produto e não era.
   Detectado por `git status`, reconstruído e reverificado (11/11). Nenhuma mutação
   restante ficou aplicada: `git status` foi conferido ao final.

## KPIs verificados

| KPI | Caminho | Resultado |
|---|---|---|
| KPI-2 Taxa de amostras ≥ 50 Hz | `test_l2_taxa_de_amostras_kpi2` (cliente simulado a 60 Hz em loopback) | **PASS** |
| KPI-6 Zeragem na desconexão ≤ 250 ms | `test_c1`/`test_c2` (fechamento abrupto e limpo com eixo deslocado e botão pressionado) | **PASS** |
| KPI-9 Robustez do protocolo (0 crashes) | `test_p9_corpus_de_fuzzing` + P2–P7 | **PASS** |
| **KPI-12 Controles efetivamente acionáveis (100%)** | **W12, W13, W14 em navegador headless** | **PASS — verificado pela primeira vez.** Os 12 botões e o comando calibrar produzem sua mensagem acionados **apenas por toque**, e nenhum é interceptado por faixa/overlay |
| **KPI-14 Ausência de falha silenciosa** | **W11 e W19 em navegador headless** | **PASS — verificado pela primeira vez.** Estado da conexão visível em 100% das amostras durante a queda; código de fechamento exibido e persistente |
| F9.2 Timeout de detecção ≤ 3 s | `test_c3_timeout_de_ping_pong` | **PASS** |
| F8.1 `vibrate` ≤ 100 ms | `test_p12_vibrate_saindo` | **PASS** |
| F11.3 Composição `latency = net + proc` | `test_l4_janela_de_latencia` | **PASS** |

## O que ficou por verificar

`tools/tooling.md` proíbe declarar SUCCESS apoiado em faixa de comportamento cuja
verificação foi adiada para procedimento manual não executado, e exige que o veredito
diga explicitamente o que ficou de fora. Os 24 testes deselecionados são procedimentos
`@pytest.mark.hardware`, **nenhum deles executado**:

| KPI / caso | Procedimento | Situação |
|---|---|---|
| **KPI-13 Produto jogável fim-a-fim** | `test_w20_sessao_jogavel_fim_a_fim_manual` (W20) | **NÃO VERIFICADO.** A spec o define como **critério de pronto: "nenhuma entrega é declarada completa sem ele"**. Nada nesta suíte substitui uma partida real jogada só com o celular |
| **KPI-15 Inicialização com o driver real** | `test_e10_inicializacao_com_driver_real_manual` (E10) | **NÃO VERIFICADO.** O dublê `FakeGamepad` **não é evidência** de integração com o ViGEmBus — em especial o registro do callback de rumble, cuja assinatura a biblioteca inspeciona em tempo de execução e que nenhum dublê reproduz |
| KPI-1 Latência fim-a-fim p95 < 30 ms | L5 | NÃO VERIFICADO (exige celular + rede) |
| KPI-3 Jitter < 10 ms | L7 | NÃO VERIFICADO |
| KPI-4 Deriva do centro em 15 min | L8 | NÃO VERIFICADO |
| KPI-5 Tempo de reconexão até jogar < 15 s | C9 | NÃO VERIFICADO |
| KPI-7 Estabilidade da mira parada | L9 | NÃO VERIFICADO |
| KPI-8 Taxa de quadros 60 fps | G15–G19 | NÃO VERIFICADO |
| KPI-10 Consumo de bateria | L11 | NÃO VERIFICADO (métrica de acompanhamento, não bloqueia aceite) |
| KPI-11 Estabilidade de sessão 30 min | C10 | NÃO VERIFICADO |
| Sensores, vibração, fullscreen/paisagem no A57 | W4–W10 | NÃO VERIFICADO |
| Reconhecimento pelo SO, jogo de terceiros, rumble do driver | E7–E9 | NÃO VERIFICADO |

W20 e E10 não existiam como testes marcados; foram criados nesta iteração, com critério
observável, para que passem a aparecer na contagem de deselecionados em vez de
desaparecerem do processo.

## Observações

1. **`POST /rumble` por query string** — nenhum teste falhou por causa disso. A spec
   (F8.3) não define o payload do fallback; a decisão está documentada no código.
   Permanece observação, **não** é `FAIL SPEC`.
2. **Atrito `prettier` × "sem npm"** — `tools/tooling.md` prescreve
   `prettier --check "web/**/*.js"`, e `coding-directives.md` proíbe dependência npm. Não
   há caminho para executar o comando sem violar a outra diretiva; a formatação JS segue
   a convenção manualmente. Nenhum teste falha por isso. Vale decidir na próxima revisão
   de spec.
3. **Servidor de teste sem TLS.** A faixa headless usa `http://127.0.0.1:<porta>`, que o
   navegador já trata como contexto seguro. Evita o custo e a variabilidade do
   certificado autoassinado sem desviar de nenhum caminho de código do cliente, que
   deriva o esquema do socket da origem da página (`addressFromLocation`). O caminho TLS
   real continua coberto por `server/tls.py` e pelos procedimentos manuais.
4. **W11, estado `conectando`.** Medido apontando o cliente para um endereço não
   roteável (`10.255.255.1`), o que mantém a tentativa pendente por tempo suficiente. É a
   forma determinística de observar um estado que, no fluxo feliz, dura poucos
   milissegundos.
5. **Lint:** `ruff check server tests` e `black --check server tests` limpos (corrigidos
   de passagem 4 achados pré-existentes em `tests/`: imports desordenados, `math` não
   usado, `zip()` sem `strict`, `asyncio.TimeoutError` aliasado).
