# fruit-ninja — Descriptions

> Um jogo de cortar frutas arremessadas, rodando no navegador do PC e jogado com o
> celular como controle, através do gamepad virtual criado pelo projeto
> `wii-controller`. A inclinação do aparelho aponta a lâmina na tela; o corte acontece
> quando a lâmina atravessa a fruta em movimento.
>
> **Este jogo existe primeiro como instrumento de avaliação do controle, e só depois
> como entretenimento.** O Duck Shooting valida posicionamento fino num instante
> pontual — a mira só precisa estar certa no momento do disparo. O Fruit Ninja valida
> o regime oposto: o **caminho percorrido pela lâmina é a jogada**, então atraso,
> tremor e descontinuidade aparecem de forma implacável e imediata, sem precisar de
> instrumentação. Se apontar funciona, cortar uma fruta atravessando a tela é natural;
> se não funciona, é impossível — e a diferença se percebe em segundos.

## Features

### Núcleo (MVP)

- **Apontamento absoluto da lâmina (requisito nº 1)**: a posição da lâmina na tela é
  determinada pela **inclinação atual** do aparelho, não pelo histórico de movimento.
  O centro calibrado do controle corresponde ao centro da tela; o ângulo máximo
  corresponde às bordas. Voltar o aparelho à posição neutra traz a lâmina de volta ao
  centro — não apenas a faz parar onde estava.

  Isto é o oposto do comportamento de analógico convencional, em que a deflexão define
  a *velocidade* do cursor. Essa interpretação por velocidade foi testada no Duck
  Shooting e se mostrou impraticável: a mira sai à deriva e o jogador passa a
  persegui-la em vez de apontar. **A mesma inclinação deve sempre produzir a mesma
  posição da lâmina, independentemente de como se chegou até ela** — é este o critério
  que separa apontar de pilotar.

  A conversão de eixo para posição é responsabilidade deste jogo: o gamepad virtual
  entrega um par de valores em [-1, 1], e é o jogo que decide interpretá-los como
  posição. Nenhuma mudança no `wii-controller` é necessária.

- **Rastro da lâmina**: um traço visível acompanha o movimento recente da lâmina,
  desaparecendo em fração de segundo. Além de ser o feedback que dá sensação de corte,
  é o **revelador visual da qualidade do apontamento** — um rastro trêmulo ou
  engasgado mostra na hora um problema que um número no overlay esconderia.

- **Arremesso de frutas**: frutas sobem da base da tela em trajetórias balísticas
  variadas (posição, ângulo e força de lançamento diferentes a cada arremesso) e caem
  por gravidade. Uma fruta que sai pela base sem ser cortada é perdida.

- **Corte por movimento**: a fruta é cortada quando o segmento percorrido pela lâmina
  entre dois quadros intersecta a fruta **e** a lâmina está acima de uma velocidade
  mínima. Encostar a lâmina parada sobre a fruta não corta — o gesto faz parte do
  critério, não só a posição. Cada fruta cortada se parte em duas metades que caem com
  a física do arremesso.

- **Bombas**: entre as frutas surgem bombas, visualmente inconfundíveis. Cortar uma
  bomba penaliza (encerra a partida ou custa uma vida — a spec decide, contanto que a
  penalidade seja severa o bastante para exigir atenção). Bombas não cortadas caem sem
  punição, o que obriga o jogador a **controlar onde a lâmina passa**, não apenas a
  agitar o aparelho. Este é o mecanismo que impede a estratégia degenerada de sacudir o
  celular ao acaso — e é o que faz o jogo realmente medir o controle.

- **Combos**: cortar várias frutas num mesmo traço contínuo vale bônus crescente. É a
  recompensa direta ao gesto contínuo, ou seja, exatamente a habilidade que este jogo
  existe para avaliar.

- **Vidas e progressão**: o jogador perde uma vida a cada fruta que cai sem ser
  cortada; a partida termina quando as vidas acabam. A dificuldade cresce ao longo da
  partida em quantidade de frutas simultâneas e velocidade de arremesso.

- **Pontuação**: pontos por fruta cortada, multiplicados pelo combo. Recorde da sessão
  visível, guardado apenas em memória da página.

- **Feedback tátil**: vibração curta ao cortar fruta e vibração distinta (mais longa
  ou mais intensa) ao cortar bomba ou perder vida. Usa o mesmo caminho de rumble do
  projeto `wii-controller`.

- **Áudio sintetizado**: sons de corte, de bomba e de fruta perdida, gerados por
  síntese no navegador, sem arquivos externos.

- **Tela de aguardando controle**: se nenhum gamepad estiver conectado, o jogo mostra
  instrução clara em vez de uma tela morta — o jogador precisa saber que falta conectar
  o celular, e não achar que o jogo travou.

- **Calibração antes de jogar**: uma tela de entrada orienta o jogador a segurar o
  aparelho na posição em que vai jogar e calibrar, confirmando quando a lâmina estiver
  estável no centro. Jogar com o centro descalibrado é a primeira frustração
  previsível, e no apontamento absoluto ela é ainda mais grave: um centro errado
  desloca **toda** a área alcançável.

### Segunda onda (fora do MVP, mas o desenho deve comportar)

- Modos de jogo alternativos (tempo limitado, sobrevivência sem bombas).
- Frutas especiais com efeitos (câmera lenta, bônus múltiplo).
- Dois jogadores, duas lâminas na mesma tela.
- Ajuste de sensibilidade do apontamento dentro do jogo, para calibrar conforto sem
  reiniciar.

### Explicitamente fora de escopo

Arte original, trilha sonora, campanha ou progressão entre partidas; persistência de
recorde entre sessões; qualquer forma de rede ou multiplayer online; suporte a mouse
ou teclado como forma de jogar (o jogo existe para avaliar o controle por inclinação —
oferecer mouse esconderia exatamente o que se quer medir). Formas geométricas e cores
bastam como representação visual das frutas.

## KPIs

- **Fidelidade do apontamento**: para uma mesma inclinação, a posição da lâmina deve
  ser sempre a mesma, com tolerância mínima, independentemente do caminho percorrido
  antes. É o KPI que reprova a implementação por velocidade.

- **Cortabilidade**: taxa de frutas cortadas com sucesso por um jogador que já
  calibrou e entendeu o jogo. Serve como métrica comparativa entre versões do controle
  — se uma mudança no apontamento melhora ou piora o controle, isto mostra.

- **Continuidade do rastro**: o traço da lâmina não deve apresentar saltos visíveis
  entre quadros com o aparelho em movimento normal. Salto no rastro é sintoma direto de
  taxa de amostragem insuficiente ou de suavização mal ajustada.

- **Taxa de quadros**: 60 fps estáveis. Um jogo engasgando falsifica qualquer
  avaliação do controle, porque o jogador não consegue distinguir engasgo de jogo do
  atraso de controle.

- **Ausência de estratégia degenerada**: sacudir o aparelho ao acaso deve produzir
  pontuação claramente inferior à de um jogo com apontamento deliberado. Se agitar
  funcionar, o jogo deixou de medir controle e virou um teste de agitação.

## Arquitetura / restrições

### Dependência do wii-controller

Este jogo consome o **gamepad virtual XInput** produzido pelo projeto `wii-controller`
(mesmo repositório). Ele não conhece o celular, não conhece o servidor e não abre
WebSocket para receber input — lê exclusivamente a Gamepad API do navegador, como
qualquer jogo de terceiros faria. Essa restrição é deliberada e não deve ser
relaxada por conveniência: ler o input direto do socket daria menos latência mas
testaria um caminho que nenhum jogo real usa, escondendo justamente os problemas que o
projeto precisa descobrir.

Única exceção permitida, herdada do wii-controller: o canal de rumble, quando a API de
vibração do gamepad não estiver disponível no navegador, pode usar o caminho de
fallback já existente — isolado em um único módulo e documentado como exceção.

### Onde o código vive

Em `game/fruit-ninja/`, servido pelo servidor existente do wii-controller na rota
`/game/fruit-ninja/` — a rota `/game/*` já mapeia para a pasta `game/`, então **nenhuma
alteração no servidor do wii-controller é necessária**. Esta é uma decisão consciente
para manter o ciclo deste slug independente. Reorganizar a pasta `game/` em
subpastas por jogo (movendo também o Duck Shooting) é melhoria desejável, mas pertence
ao slug `wii-controller`, não a este.

### Restrições técnicas

- **Sem build step**: HTML, CSS e JavaScript puros (ES2020), servidos como arquivos
  estáticos. Sem framework, sem bundler, sem npm, sem CDN — mesma regra do resto do
  projeto.
- **Sem engine de jogo**: Canvas 2D direto. Nada de Phaser, PixiJS ou similares.
- **Lógica pura separada do desenho**: as regras (arremesso, trajetória, detecção de
  corte, combos, pontuação, vidas) devem ser funções puras que recebem estado e
  devolvem estado, sem tocar Canvas nem ler input. Só assim o corte por movimento pode
  ser testado sem navegador e sem celular — e ele *precisa* ser testado assim, porque é
  a regra mais sutil do jogo.
- **Física independente da taxa de quadros**: o jogo deve se comportar igual a 60 e a
  144 Hz. Trajetória de fruta e detecção de corte dependem de passo de tempo, e um
  jogo que muda de dificuldade conforme o monitor é inavaliável.
- **Sem importar nada do wii-controller**: nem de `web/`, nem do servidor, nem do Duck
  Shooting em `game/`. Duplicação é preferível a acoplamento entre jogos.
