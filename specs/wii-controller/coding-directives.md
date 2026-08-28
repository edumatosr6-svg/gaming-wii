# wii-controller — Coding Directives

## Stack

- **Linguagem / framework:**
  - Servidor: Python 3.11+, assíncrono (`asyncio`). Biblioteca de WebSocket e
    biblioteca de gamepad virtual como únicas dependências de runtime obrigatórias.
    Sem framework web pesado — o servidor HTTP serve arquivos estáticos e nada mais.
  - Cliente: HTML5 + CSS + JavaScript ES2020 puro (vanilla). **Sem framework, sem
    bundler, sem transpilação, sem npm.** Um arquivo `.html` e assets estáticos.
- **Gerenciador de pacotes:** `pip` com `requirements.txt` versionado (versões
  fixadas com `>=` mínimo e testadas). Ambiente virtual (`venv`) recomendado no
  README, não obrigatório no código.

## Convenções

- **Estrutura de pastas:**

```
wii-controller/
├── server/
│   ├── main.py            # ponto de entrada, orquestra HTTP + WS
│   ├── protocol.py        # schema e validação das mensagens
│   ├── mapping.py         # inclinação/botões → estado do gamepad (puro, testável)
│   ├── gamepad/
│   │   ├── base.py        # interface abstrata do gamepad virtual
│   │   ├── windows.py     # implementação via driver do Windows
│   │   └── keyboard.py    # fallback teclado/mouse
│   └── config.py          # constantes: portas, zona morta, sensibilidade
├── web/
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── connection.js  # WebSocket, reconexão, estado
│       ├── motion.js      # leitura e throttle do giroscópio
│       ├── controls.js    # botões touch, multi-touch
│       └── haptics.js     # vibração
├── game/                  # hub de jogos + Duck Shooting — servidos para o navegador do PC
│   ├── index.html         # hub: lista de jogos (game-hub), não mais o Duck Shooting
│   └── duck-shooting/
│       ├── index.html
│       ├── js/
│       │   ├── input.js       # leitura do gamepad virtual via Gamepad API
│       │   ├── entities.js    # patos: spawn, trajetória, colisão (puro, testável)
│       │   ├── rules.js       # munição, rodadas, pontuação (puro, testável)
│       │   ├── render.js      # desenho em Canvas 2D
│       │   └── loop.js        # game loop, timing, instrumentação de latência
│       └── assets/            # sprites placeholder e sons
├── tests/
├── requirements.txt
└── README.md
```

  Regras que importam mais que o desenho exato: **a lógica de conversão de input
  (`mapping.py`) deve ser pura e sem I/O**, para ser testável sem driver, sem rede e
  sem celular. E **nenhum módulo fora de `server/gamepad/` pode importar a biblioteca
  de gamepad diretamente** — sempre pela interface abstrata.

  Mesma lógica no jogo: `entities.js` e `rules.js` não desenham nada, não leem input e
  não conhecem o Canvas — recebem estado e devolvem estado. `render.js` e `input.js`
  são as únicas partes que tocam o navegador.

  **O jogo não importa nada de `web/` e nada do servidor.** São dois aplicativos
  independentes que se comunicam apenas pelo gamepad virtual. Compartilhar um módulo
  de conveniência entre eles é o primeiro passo para o jogo deixar de representar um
  jogo de terceiros — se houver duplicação de código entre `web/` e `game/`, ela é
  intencional e deve ser mantida.

- **Estilo de código / linter:**
  - Python: `ruff` (lint) + `black` (formatação, linha de 100). Type hints
    obrigatórios em funções públicas. Sem `# type: ignore` sem comentário explicando.
  - JavaScript: `prettier` com aspas simples e ponto e vírgula. `const` por padrão,
    `let` quando reatribuir, nunca `var`. Módulos ES (`import`/`export`) nativos.
  - Nada de `print` para diagnóstico no servidor — usar o módulo `logging`, com
    níveis. Mensagens ao usuário no terminal (IP de acesso, status) são a exceção.

- **Padrões de nomenclatura:**
  - Python: `snake_case` para funções e variáveis, `PascalCase` para classes,
    `UPPER_SNAKE_CASE` para constantes de configuração.
  - JavaScript: `camelCase` para funções e variáveis, `PascalCase` para classes.
  - Arquivos: `kebab-case` para assets web, `snake_case` para módulos Python.
  - Mensagens do protocolo WebSocket: campo `type` em `snake_case`
    (`motion`, `button`, `calibrate`, `vibrate`), documentado em `protocol.py`.
  - Comentários e docstrings em português; nomes de identificadores em inglês.

## Test runner

- **Comando para rodar os testes:** `pytest -q`
- Cobertura esperada, em ordem de prioridade:
  - `mapping.py`: conversão de ângulo → eixo, zona morta, saturação, offset de
    calibração, valores extremos e negativos. É a lógica com maior chance de bug
    silencioso e a mais barata de testar.
  - `protocol.py`: mensagens malformadas, campos ausentes, tipos errados, JSON
    inválido — o servidor não pode cair por causa de um pacote ruim.
  - Ciclo de vida da conexão: ao desconectar, todos os botões e eixos voltam a zero.
  - O gamepad virtual é substituído por um dublê (fake) nos testes — a suíte deve
    rodar inteira em qualquer sistema operacional, sem driver instalado e sem
    celular conectado.
- Testes que exigem hardware real (giroscópio, vibração, driver) ficam marcados e
  são excluídos da execução padrão.
- Lógica do jogo (`entities.js`, `rules.js`): trajetória de pato, detecção de acerto,
  contagem de munição, transição de rodada e pontuação são funções puras e devem ter
  testes. Sendo puras, rodam sem navegador — usar o mesmo runner ou um runner JS
  leve, mas **um comando único deve rodar a suíte inteira**, servidor e jogo.
- Renderização e game loop não são testados automaticamente. Verificação visual.

## Restrições

- **Sem dependências no cliente.** Nada de CDN, nada de biblioteca externa carregada
  em runtime — o controle precisa funcionar em rede local sem acesso à internet.
- **Sem framework de frontend** (React, Vue, etc.) e sem etapa de build. Se a
  solução exigir compilar algo antes de abrir no celular, está fora das diretrizes.
- **Sem engine de jogo.** Canvas 2D e `requestAnimationFrame`. Nada de Phaser, PixiJS,
  Three.js ou similares.
- **O jogo lê input exclusivamente pela Gamepad API.** É proibido o jogo abrir conexão
  WebSocket com o servidor para receber input — isso quebra o propósito dele existir.
  A única exceção prevista é o canal de rumble, se a via padrão do navegador falhar,
  e ainda assim isolada em um único módulo com comentário explicando o porquê.
- **Game loop com passo de tempo desacoplado da taxa de quadros**: a física dos patos
  usa delta time, não assume 60 fps. Um jogo que fica mais rápido em monitor de 144 Hz
  invalida qualquer medição de latência.
- **Assets placeholder são aceitáveis e preferíveis** a gastar tempo em arte. Formas
  geométricas e sons sintetizados servem. Nenhum asset de terceiros com licença
  restritiva, e nada retirado do Duck Hunt original — a referência é de mecânica, não
  de conteúdo.
- **Sem `localStorage` para estado de jogo** — apenas para lembrar o último IP usado.
- **A biblioteca de gamepad virtual é dependente de plataforma e não pode vazar** para
  o resto do código. Importar apenas dentro da implementação concreta, e escolher a
  implementação em runtime, com mensagem de erro clara e acionável quando o driver
  não estiver instalado.
- **Nenhum bloqueio no loop de eventos do servidor.** Toda operação de I/O é `async`.
  O caminho crítico (mensagem recebida → estado do gamepad atualizado) não deve fazer
  alocação desnecessária, log em nível `INFO` por mensagem, nem chamada de rede.
- **Sem estado global mutável compartilhado** entre módulos. O estado da sessão fica
  em um objeto explícito, passado por parâmetro.
- **Parâmetros de tuning** (zona morta, sensibilidade, ângulo máximo, taxa de envio,
  portas) ficam em `config.py`, nunca espalhados como números mágicos no código.
- **Falhar alto no cliente, falhar suave no servidor**: se o giroscópio não estiver
  disponível no navegador, a interface diz isso ao usuário de forma visível; se uma
  mensagem chegar corrompida, o servidor descarta e continua.
- Compatibilidade alvo do cliente: navegador Chromium no Android (referência: Galaxy
  A57). Não gastar esforço com suporte a navegadores legados.