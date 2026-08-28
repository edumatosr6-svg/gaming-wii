# game-hub — Software Specs

## Visão geral

O game-hub é a nova tela de entrada do projeto webgaming: `game/index.html` deixa de abrir
diretamente o Duck Shooting e passa a ser um menu que lista os jogos disponíveis (hoje Duck
Shooting e Fruit Ninja), permitindo ao usuário escolher qual jogar e voltar ao menu a partir
de qualquer jogo. É puramente navegação/apresentação: não lê input de gamepad/WebSocket, não
altera a lógica dos jogos existentes, e foi desenhado para que novos jogos entrem na lista
sem reestruturação.

## Decisão arquitetural: onde cada jogo passa a morar

Hoje `game/index.html` é o próprio Duck Shooting. Para que o hub assuma esse caminho, o
Duck Shooting precisa passar a viver em sua própria subpasta, no mesmo padrão já usado pelo
Fruit Ninja:

- `game/index.html` → passa a ser o **hub** (este spec).
- `game/duck-shooting/` → recebe o Duck Shooting inteiro (`index.html`, `js/`, `assets/`),
  movido de `game/` sem alteração de conteúdo — é um mover de arquivos, não uma reescrita.
- `game/fruit-ninja/` → inalterado, já segue esse padrão.

Isso mantém os dois jogos simétricos (cada um em sua própria pasta, com seu próprio
`index.html`) e evita depender de query string (`?jogo=`) para decidir o que renderizar
dentro de um `index.html` compartilhado — abordagem descartada porque misturaria a lógica de
dois jogos independentes num único ponto de entrada, contrariando a restrição de que os jogos
não compartilham módulos entre si.

**Critério de aceite:** após a migração, `game/duck-shooting/index.html` carrega e roda o
Duck Shooting de ponta a ponta (patos, disparo, pontuação) exatamente como `game/index.html`
fazia antes desta feature, sem qualquer mudança de comportamento.

**Contrato cruzado com `wii-controller` (obrigatório, parte desta feature, não opcional):**
`specs/wii-controller/coding-directives.md`, seção "Estrutura de pastas", documenta
`game/index.html` e `game/js/...` como a localização do Duck Shooting — essa árvore fica
desatualizada por esta decisão. Como parte da implementação de F2/F3 do game-hub (não como
mudança de escopo do slug `wii-controller`), o `impl-generator` deve atualizar essa seção de
`wii-controller/coding-directives.md` para refletir `game/duck-shooting/index.html` e
`game/duck-shooting/js/...`, mantendo todo o resto da diretiva (regras de pureza de
`mapping.py`, proibição de import cruzado, etc.) inalterado. O restante do documento
(`wii-controller/coding-directives.md`) e o diagrama de topologia de
`wii-controller/software-specs.md` não usam caminho de arquivo literal e não precisam de
ajuste.

Referências **históricas** a `game/js/...` em `wii-controller/implementation-report.md` e em
`wii-controller/reports/code-validation-report.md` são registro de uma iteração já concluída
— **não devem ser reescritas retroativamente**; só o documento vivo
(`coding-directives.md`) precisa refletir o caminho novo.

## Features

### F1 — Menu principal (hub)

- `game/index.html` passa a renderizar uma lista de jogos disponíveis em vez de carregar o
  Duck Shooting diretamente.
- Cada entrada da lista mostra ao menos: nome do jogo e um controle (link/botão) para abri-lo.
- A lista é construída a partir de um catálogo de dados único (ver Data Models — `GameEntry`),
  não de HTML duplicado por jogo.

**Critérios de aceite:**
- Abrir `game/index.html` sem parâmetros de URL exibe o hub (lista de jogos), nunca um jogo
  diretamente.
- A lista renderizada contém exatamente as entradas do catálogo de dados (mesma quantidade,
  mesmos nomes), verificável inspecionando o DOM.
- Com o catálogo vazio (caso de teste), o hub renderiza um estado vazio sem lançar erro de
  JavaScript no console.

### F2 — Navegação para o jogo escolhido

- Selecionar uma entrada do hub navega para a página daquele jogo, usando o caminho definido
  no catálogo (`GameEntry.url`), sem alterar a lógica (JS) de Duck Shooting ou Fruit Ninja —
  apenas a localização de pasta do Duck Shooting muda (ver "Decisão arquitetural" acima).
- A navegação é feita por link de verdade (`<a href="...">` ou `location.href`), preservando
  o comportamento padrão do navegador (abrir em nova aba com Ctrl/Cmd+clique, "abrir em nova
  guia" no menu de contexto, etc.) — nada de interceptar o clique com `preventDefault`.

**Critérios de aceite:**
- Clicar na entrada "Duck Shooting" navega para `game/duck-shooting/index.html` e o jogo
  carrega e roda normalmente (mesmo comportamento de antes desta feature existir).
- Clicar na entrada "Fruit Ninja" navega para `game/fruit-ninja/index.html` e o jogo carrega
  e roda normalmente.
- Nenhum arquivo de lógica (`game/duck-shooting/js/**`, `game/fruit-ninja/js/**`) é
  modificado para implementar F1/F2/F3 — apenas movido, no caso do Duck Shooting.

### F3 — Voltar ao hub

- De dentro de cada jogo existe um elemento de UI (link/botão) que volta ao hub, sem exigir
  edição manual da URL.
- O elemento de "voltar" não interfere com os controles do jogo (não ocupa área de toque
  usada pelo gamepad virtual, não captura teclas usadas pelo jogo).

**Critérios de aceite:**
- A partir da tela do Duck Shooting, existe um controle visível de "voltar ao hub" que, ao
  ser ativado, navega de volta para `game/index.html` (hub).
- A partir da tela do Fruit Ninja, existe um controle equivalente com o mesmo destino.
- Adicionar o controle de voltar não altera o resultado dos testes automatizados já
  existentes de `entities.js`/`rules.js` (Duck Shooting) e `rules.js`/`slicing.js`
  (Fruit Ninja) — fora do escopo desta feature.

### F4 — Preparado para crescer (catálogo extensível)

- O catálogo de jogos (`GameEntry[]`) vive em um único ponto de dados (ex.: um módulo JS ou
  JSON), separado da lógica de renderização do hub.
- Adicionar um novo jogo ao catálogo (nova entrada com nome + url) faz o hub exibi-lo sem
  qualquer mudança na função/módulo de renderização.

**Critérios de aceite:**
- Um teste que insere uma terceira entrada fictícia no catálogo e renderiza o hub mostra três
  itens, sem editar a função de renderização.
- O catálogo pode ser lido/editado sem tocar em CSS ou no HTML do hub.

## Fora de escopo

- Qualquer lógica de jogo (patos, frutas, pontuação, gamepad virtual) — o hub não lê input de
  controle nem WebSocket.
- Autenticação, perfis de usuário, persistência de progresso entre jogos.
- Miniaturas/screenshots dos jogos, animações de transição elaboradas, temas customizáveis —
  aceitável um visual simples (lista/cards com HTML/CSS puro).
- Build step, framework ou dependência externa — mesma restrição do resto do projeto
  (ver `specs/wii-controller/coding-directives.md`): HTML, CSS e JS puros, sem npm.

## Procedures

### P1 — Carregar o hub

1. Usuário abre `game/index.html` (ou navega "voltar ao hub" a partir de um jogo).
2. O script do hub lê o catálogo de jogos (`GameEntry[]`).
3. Para cada entrada, o hub renderiza um item de lista com nome e link para `entry.url`.
4. Se o catálogo estiver vazio, o hub renderiza uma mensagem de estado vazio (não uma lista
   quebrada nem um erro).

### P2 — Escolher e abrir um jogo

1. Usuário clica/toca em uma entrada do hub.
2. O navegador navega para a URL daquele jogo (comportamento padrão de link, sem JS
   interceptando o clique).
3. A página do jogo carrega normalmente, incluindo seu próprio HTML/CSS/JS, sem depender de
   nenhum script do hub.

### P3 — Voltar ao hub a partir de um jogo

1. Usuário, dentro de um jogo, ativa o controle de "voltar".
2. O navegador navega para `game/index.html`.
3. O hub é recarregado do zero (P1) — não há estado compartilhado entre a sessão de jogo e o
   hub.

## Data Models

### GameEntry

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | identificador curto, único no catálogo (`kebab-case`), ex. `duck-shooting`. |
| `name` | string | sim | nome exibido no hub, ex. "Duck Shooting". |
| `url` | string | sim | caminho relativo para a página do jogo, ex. `duck-shooting/index.html` ou `fruit-ninja/index.html` (relativo a `game/`). |
| `description` | string | não | texto curto opcional exibido junto ao nome. |

Invariantes:
- `id` é único dentro do catálogo — duas entradas com o mesmo `id` são um erro de dados,
  não um caso a tratar em runtime (detectável em teste/lint do catálogo).
- `url` nunca é vazio quando a entrada está presente no catálogo renderizado.
- O catálogo em si é uma lista ordenável (a ordem de exibição segue a ordem da lista); não há
  requisito de ordenação alfabética ou por popularidade.

## KPIs

| KPI | Feature relacionada | Meta | Como verificar |
|---|---|---|---|
| Tempo até entrar em um jogo a partir do hub | F1, F2 | 1 clique/toque do hub até a página do jogo carregar (sem etapas intermediárias, sem formulário) | `tests/navigation.md`: contar cliques no fluxo hub → jogo |
| Ausência de regressão nos jogos existentes | F2, F3 | 0 falhas novas nas suítes existentes de Duck Shooting e Fruit Ninja após integrar o hub | rodar a suíte de testes de `game/` e `game/fruit-ninja/` antes/depois e comparar resultado |
| Erros de console ao navegar hub ↔ jogos | F1, F2, F3 | 0 erros de JavaScript no console em qualquer transição do fluxo (hub → Duck Shooting → hub → Fruit Ninja → hub) | `tests/navigation.md` + verificação manual/browser-automation |
| Extensibilidade do catálogo | F4 | Adicionar uma entrada ao catálogo não exige alterar o módulo de renderização do hub (0 linhas mudadas fora do arquivo de catálogo) | `tests/catalog.md`: teste com catálogo estendido |

Não há KPI de latência/rede aqui — o hub é uma tela estática sem I/O em tempo real; os KPIs
de latência do controle (wii-controller) continuam medidos dentro de cada jogo, fora do
escopo desta feature.
