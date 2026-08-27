# wii-controller — Implementation Report

**Origem:** revisão humana após teste manual com hardware real (Galaxy A57 + PC
Windows com ViGEmBus). Não veio de `FAIL SPEC` do `impl-tester`: a suíte
automatizada passou integralmente (52 testes) em todas as rodadas.

**Estado do produto:** o software **não é utilizável**. O servidor, o protocolo e
a emulação de gamepad estão corretos e verificados por medição direta. O cliente
do celular está parcialmente funcional: a inclinação chega ao jogo (a mira se
move), mas **nenhum botão touch e nem a calibração operam de forma confiável**.
Sem calibrar e sem disparar, não há como jogar.

## O que a implementação revelou

O ponto central: **todos os defeitos encontrados vivem na fronteira entre o
código e o mundo real** — driver de gamepad, motor de renderização do navegador,
semântica de eventos de toque do Chrome Android. Nenhum deles era detectável pela
suíte automatizada, e nenhum deles tinha comportamento definido nas specs. A spec
classificou 22 procedimentos como "verificação manual" mas **não descreveu o que
deveria acontecer neles**, o que os deixou sem critério de aceite e sem forma de
reprovar uma implementação errada.

### 1. Integração com o driver do gamepad não é especificada além da presença

A biblioteca `vgamepad` valida a assinatura do callback de vibração comparando-a
com um modelo **sem anotações de tipo**, e rejeita callbacks anotados. O servidor
lançava `TypeError` na inicialização e não subia. A spec cobre a *ausência* do
ViGEmBus, mas não o contrato de integração com ele quando está presente.

**O que a spec precisa passar a definir:** o contrato de registro do callback de
rumble e a exigência de que a inicialização do gamepad seja verificada com o
driver real antes de o servidor se declarar pronto.

### 2. A troca de telas do cliente não tem comportamento especificado

A seção do controle usa `display: flex`, que por precedência de CSS anula o
`display: none` do atributo `hidden` usado pelo JavaScript para alternar as
telas. A tela de pareamento nunca saía da frente, escondendo um controle que já
estava conectado e funcionando.

**O que a spec precisa passar a definir:** os estados visuais do cliente
(pareamento, conectando, conectado, desconectado) como uma máquina de estados
explícita, com o critério de aceite de que exatamente um estado é visível por
vez.

### 3. Falha silenciosa: o cliente não expõe o estado real da conexão

Com o socket fechado, o envio de mensagens era descartado sem qualquer sinal ao
usuário. A interface continuava respondendo ao toque enquanto nada saía do
aparelho — o sintoma "conectou mas não funciona", que foi o mais caro de
diagnosticar em toda a sessão.

**O que a spec precisa passar a definir:** proibição de descarte silencioso;
estado da conexão sempre visível na tela; reconexão automática (a spec previa
apenas reconexão manual, insuficiente quando a queda é invisível).

### 4. Semântica de entrada touch não é especificada

Três defeitos distintos, todos com a mesma raiz — a spec descreve *quais* botões
existem, mas não *como* a entrada por toque funciona:

- **`click` não existe no controle.** O tratamento multi-touch chama
  `preventDefault()` na área dos botões, o que impede o navegador de sintetizar
  o evento `click`. O botão CALIBRAR era o único ligado a `click` e por isso
  nunca disparava no celular (funcionaria no desktop com mouse — foi assim que
  escapou da revisão).
- **Elementos decorativos capturam o toque.** As faixas fixas de status e de
  aviso atravessam a tela por cima da fileira de botões L/R e recebiam o toque
  no lugar do botão.
- **Pedir tela cheia cancela o toque em andamento.** O Chrome Android cancela a
  sequência de toque ao entrar em fullscreen; um pedido de fullscreen disparado
  no início do toque faz o `touchstart` do botão nunca ocorrer, engolindo o
  aperto.

**O que a spec precisa passar a definir:** que todo controle da interface responde
a eventos de toque (nunca a `click`); que nenhum elemento não-interativo pode
interceptar toques destinados a botões; e em que momento do ciclo de vida o modo
imersivo é solicitado, dado que o navegador exige gesto do usuário e cancela
toques durante a transição.

### 5. As specs de teste não cobrem a camada de interação

`tests/client-controller.md` especifica a lógica pura do rastreador de toques
(que sempre passou), mas nada sobre a integração dessa lógica com o DOM real: se
o evento chega ao elemento certo, se a mensagem sai pelo socket, se a tela
correta está visível. É exatamente essa faixa não coberta que concentrou 100% dos
defeitos.

**O que a spec precisa passar a definir:** casos de teste de integração da
interface, executáveis em navegador headless, cobrindo toque → mensagem enviada,
e os procedimentos manuais com critérios de aceite observáveis (o que o operador
deve ver, não apenas o que deve fazer).

## Correções já aplicadas no código

Aplicadas durante a revisão manual, sem passar pelo `impl-loop`. Devem ser
tratadas como estado de partida, não como solução definitiva — o comportamento
que elas assumem precisa ser ratificado pelas specs atualizadas:

| Arquivo | Correção |
|---|---|
| `server/gamepad/windows.py` | callback de rumble registrado sem anotações de tipo |
| `web/css/style.css` | `[hidden]` com `display: none !important`; `overscroll-behavior: none`; faixas com `pointer-events: none` |
| `web/js/main.js` | conexão automática pelo endereço da própria URL; reconexão automática; estado e código de queda visíveis; fullscreen movido para `touchend` e uma única vez; calibração por `touchstart` |
| `web/js/controls.js` | botão identificado por `touch.target` no início do toque |
| `web/js/connection.js` | código e razão do fechamento propagados ao chamador |

## Verificações feitas por medição direta

Para separar o que está certo do que está quebrado, sem suposição:

- Cliente WebSocket simulado: 97 mensagens de movimento a 60 Hz mais botões — a
  sessão sobrevive, o servidor não derruba.
- Leitura do estado real do gamepad virtual via XInput: botão A produz
  `wButtons=4096`; soltar volta a `0`; movimento move os eixos do analógico
  direito.
- Calibração via XInput: após o comando, a mesma inclinação passa a ler `(0, 0)`
  e inclinar além dela volta a mover os eixos.

**Conclusão:** servidor, protocolo, mapeamento, emulação de gamepad e calibração
estão corretos. Todo o defeito remanescente está no cliente web e na ausência de
especificação da camada de interação.

## Pedido para o spec-loop

Atualizar as specs para que a camada de interação do cliente deixe de ser
território não especificado: máquina de estados visuais, semântica de entrada por
toque, política de falha visível e reconexão, contrato de integração com o driver,
e specs de teste que cubram essa faixa — incluindo critérios de aceite
observáveis para os procedimentos manuais.
