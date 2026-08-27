# fruit-ninja — Coding Directives

## Stack

- **Linguagem / framework:** HTML5 + CSS + JavaScript ES2020 puro (vanilla), módulos
  ES nativos. **Sem framework, sem bundler, sem transpilação, sem npm, sem CDN.**
  Nenhuma engine de jogo — Canvas 2D direto.
- **Gerenciador de pacotes:** nenhum para o runtime. O jogo é servido como arquivos
  estáticos exatamente como versionados.
- **Servidor:** nenhum novo. O jogo é servido pelo servidor existente do
  `wii-controller` na rota `/game/fruit-ninja/`, que já funciona sem alteração.

## Convenções

- **Estrutura de pastas:**

```
game/fruit-ninja/
├── index.html
├── css/
└── js/
    ├── input.js      # Gamepad API -> posição absoluta da lâmina (única fonte de input)
    ├── blade.js      # rastro da lâmina, histórico de posições (puro)
    ├── entities.js   # frutas e bombas: arremesso, trajetória, metades (puro)
    ├── slicing.js    # deteccao de corte: segmento x círculo + velocidade mínima (puro)
    ├── rules.js      # combos, pontuação, vidas, dificuldade (puro)
    ├── render.js     # desenho em Canvas 2D
    ├── audio.js      # síntese Web Audio
    └── loop.js       # game loop, passo de tempo fixo
```

  Regras que importam mais que o desenho exato:

  - **`slicing.js`, `entities.js`, `rules.js` e `blade.js` são puros**: recebem estado
    e devolvem estado, sem tocar Canvas, sem ler input, sem timers. O corte por
    movimento é a regra mais sutil do jogo e precisa ser testável sem navegador e sem
    celular.
  - **`input.js` é o único módulo que chama `navigator.getGamepads()`**, e é onde mora
    a conversão de eixo para **posição absoluta** da lâmina. Nenhum outro módulo
    conhece a origem do input.
  - **`render.js` e `loop.js` são os únicos que tocam o navegador** (Canvas, rAF).
  - **Nada de `WebSocket`** em todo o jogo, com a única exceção do módulo de fallback
    de rumble, se ele for necessário — isolado e comentado.
  - **Nenhum import de fora de `game/fruit-ninja/`**: nem de `web/`, nem do servidor,
    nem do Duck Shooting em `game/`. Duplicar é preferível a acoplar.

- **Estilo de código:** aspas simples, ponto e vírgula, mesma convenção do restante do
  projeto. Comentários explicam *por quê*, não *o quê*.
- **Nomenclatura:** funções e variáveis em inglês camelCase; comentários e mensagens
  ao usuário em português.
- **Constantes de tuning** (gravidade, velocidade mínima de corte, duração do rastro,
  tamanho das frutas, taxa de arremesso, vidas iniciais) ficam em um único módulo de
  configuração — nenhum número mágico espalhado pela lógica.

## Test runner

- **Comando:** `pytest -q` na raiz do projeto, que já orquestra a suíte inteira
  (Python e JS). Os testes da lógica pura deste jogo rodam via `node --test`, como os
  do Duck Shooting, e ficam em `tests/js/`.
- Os testes de integração em navegador headless usam Playwright + Chromium, já
  instalado e configurado no projeto.
- Nenhum teste pode exigir celular, driver de gamepad ou GPU para rodar na suíte
  padrão. O gamepad é substituído por um dublê que injeta posições de lâmina.

## Restrições

- Não alterar nada fora de `game/fruit-ninja/` e `tests/`. Em especial, **não alterar o
  servidor do `wii-controller`** — se algo parecer exigir isso, é sinal de que a
  decisão de rota precisa ser revista na spec, não contornada no código.
- Não introduzir dependência de runtime de nenhum tipo.
- Não usar imagens, sprites ou arquivos de áudio externos: formas geométricas
  desenhadas em Canvas e som sintetizado.
