# wii-controller — Implementation Report

**Origem:** revisão humana após teste manual com hardware real. O ciclo anterior
(cliente reconstruído, 63 testes) resolveu os defeitos de conexão e de acionamento: o
controle conecta, os botões respondem, a calibração funciona. O produto passou a ser
operável — e só então o defeito abaixo pôde ser percebido.

**Veredito:** `FAIL SPEC`. Não é defeito de implementação: o código faz exatamente o
que a spec descreve. A spec é que não define o comportamento certo.

## O defeito: mirar é impraticável

Relato do usuário em uso real: *"está muito difícil e confuso usar o controle, está
impossível mirar"*.

**Causa raiz — o modelo de apontamento nunca foi especificado.** Em
`game/js/loop.js`, a mira é integrada a partir do eixo:

```js
crosshair.x + axisX * CROSSHAIR_SPEED * dt
```

Ou seja, a inclinação do aparelho define a **velocidade** com que a mira se desloca,
não a **posição** dela. Inclinar não aponta: acelera. A mira continua andando enquanto
o aparelho estiver inclinado, e voltar ao centro apenas a faz parar onde estiver — não
a traz de volta. O usuário passa a perseguir um cursor à deriva em vez de apontar para
um alvo.

**Por que a implementação está correta em relação à spec.** F10 diz apenas que *"o
analógico direito (alimentado pela inclinação) move a mira"*. "Move" é ambíguo, e a
leitura escolhida — deflexão de analógico como taxa de deslocamento — é a convenção
universal de gamepad, portanto a leitura mais razoável para quem implementa. Nada em
`software-specs.md` diz que a inclinação deve mapear para **posição absoluta**.

**Por que isso contradiz a intenção do produto.** O `descriptions.md` promete um
controle *"no estilo Wii Remote"*, e apontar é a característica que define esse
estilo — é a diferença entre o Wii e qualquer gamepad anterior. A spec preservou a
letra (inclinação vira eixo analógico) e perdeu a intenção (inclinação vira mira).

**Onde o defeito NÃO está.** O mapeamento no servidor (`mapping.py`) está correto e
verificado: ângulo → valor de eixo em [-1, 1], com zona morta, sensibilidade e
saturação. A calibração está correta. A emulação XInput está correta. O problema é
exclusivamente a **interpretação** desse eixo pelo jogo.

## A tensão arquitetural que a spec precisa resolver

Apontamento absoluto e "qualquer jogo de terceiros funciona sem configuração" são
objetivos que **não podem ser satisfeitos ao mesmo tempo pelo mesmo eixo**:

- Um jogo de terceiros interpreta o analógico direito como taxa (convenção XInput).
  Nada que o servidor faça muda isso — a semântica está do lado do jogo.
- Um jogo nosso (Duck Shooting, e o novo Fruit Ninja) pode interpretar o mesmo valor
  como **posição absoluta**, porque nós escrevemos a interpretação.

Portanto a spec deve declarar explicitamente: o eixo transporta uma **posição
apontada** normalizada; jogos próprios a consomem como posição, e o comportamento em
jogos de terceiros (cursor por taxa) é uma limitação conhecida e documentada — não um
defeito. Perfis de mapeamento por jogo já estão previstos na segunda onda e são o
caminho para tratar terceiros no futuro.

## Pontos secundários de conforto de mira (a spec não define critério)

Além do modelo, o usuário relata "confuso". Itens que a spec menciona mas sem meta
verificável, e que devem ganhar critério:

- `MAX_ANGLE_DEG = 30.0` define a inclinação para atingir o extremo. Com apontamento
  absoluto, esse valor passa a determinar **quanto o pulso precisa girar para varrer a
  tela inteira** — vira um parâmetro de ergonomia, não de ganho, e precisa de critério
  observável.
- `SMOOTHING_ALPHA = 0.2` reduz tremor mas adiciona atraso. Com apontamento absoluto o
  atraso é percebido diretamente como "a mira não obedece". Precisa de meta que
  equilibre tremor (KPI-7) e resposta (KPI-1).
- A relação entre eixo horizontal/vertical e os ângulos do aparelho em paisagem não
  tem critério de "sentido correto": inversão de sinal em um dos eixos produz
  exatamente a sensação de controle "confuso" e nenhum teste atual reprovaria isso.

## Pedido para o spec-loop

1. Definir o **modelo de apontamento** como requisito de primeira classe: a inclinação
   mapeia para posição absoluta da mira, com o centro calibrado correspondendo ao
   centro da tela e o ângulo máximo às bordas. Incluir critério de aceite verificável
   e caso de teste (mesma inclinação ⇒ mesma posição da mira, independentemente do
   histórico de movimento — que é precisamente o que a implementação por velocidade
   viola).
2. Resolver e documentar a tensão com jogos de terceiros.
3. Dar critério observável aos parâmetros de ergonomia acima, incluindo o sentido dos
   eixos.
4. Especificar o novo jogo **Fruit Ninja** (ver `descriptions.md`), cujo valor
   principal é ser um segundo banco de prova do modelo de apontamento — corte por
   gesto contínuo estressa o apontamento de forma diferente do tiro pontual do Duck
   Shooting.
