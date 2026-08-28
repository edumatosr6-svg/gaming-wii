# game-hub — Testes de navegação (F1, F2, F3)

## Hub renderiza o catálogo (F1)

- **Dado** o catálogo padrão do projeto (Duck Shooting + Fruit Ninja),
  **quando** `game/index.html` é carregado sem parâmetros,
  **então** o DOM contém exatamente 2 itens de jogo, com os nomes "Duck Shooting" e
  "Fruit Ninja" (ordem não é critério).

- **Dado** um catálogo vazio (`[]`) injetado no módulo de renderização,
  **quando** o hub é renderizado,
  **então** nenhum item de lista é criado, uma mensagem de estado vazio é exibida, e nenhum
  erro é lançado no console.

- **Dado** o catálogo padrão,
  **quando** o hub é carregado,
  **então** nenhum script de jogo (`duck-shooting/js/**`, `fruit-ninja/js/**`) é carregado
  pela página do hub (verificável pela lista de requisições de rede/`<script>` presentes no
  DOM do hub).

## Navegar do hub para um jogo (F2)

- **Dado** o hub carregado,
  **quando** o usuário clica na entrada "Duck Shooting",
  **então** a navegação ocorre via elemento `<a href="duck-shooting/index.html">` (ou
  equivalente relativo), e a página de destino carrega o Duck Shooting normalmente (canvas
  presente, sem erro de console).

- **Dado** o hub carregado,
  **quando** o usuário clica na entrada "Fruit Ninja",
  **então** a navegação ocorre para `fruit-ninja/index.html`, e a página carrega o Fruit
  Ninja normalmente (canvas presente, sem erro de console).

- **Dado** a entrada de um jogo no hub,
  **quando** inspecionada,
  **então** é um elemento `<a>` real (não um `<div onclick>` ou similar) — abrir em nova aba
  via Ctrl/Cmd+clique deve funcionar como em qualquer link padrão.

## Voltar ao hub a partir de um jogo (F3)

- **Dado** a página do Duck Shooting carregada (`game/duck-shooting/index.html`),
  **quando** o usuário ativa o controle de "voltar ao hub",
  **então** o navegador navega para `game/index.html` (ou caminho relativo equivalente,
  `../index.html`), e o hub é exibido novamente com o catálogo completo.

- **Dado** a página do Fruit Ninja carregada (`game/fruit-ninja/index.html`),
  **quando** o usuário ativa o controle de "voltar ao hub",
  **então** o navegador navega de volta para `game/index.html`.

- **Dado** o controle de "voltar ao hub" em qualquer jogo,
  **quando** inspecionado quanto à posição/área de toque,
  **então** não sobrepõe nem intercepta a área usada pelos controles de jogo (D-pad,
  botões, área de mira) — verificação de layout/geometria, não apenas de existência do
  elemento.

## Regressão dos jogos existentes

- **Dado** a suíte de testes já existente de Duck Shooting (`entities.js`, `rules.js`) rodada
  após a migração para `game/duck-shooting/`,
  **quando** comparada ao resultado da suíte antes da migração,
  **então** o mesmo conjunto de testes passa, sem novas falhas introduzidas pela mudança de
  pasta (ajustes de caminho de import são esperados; mudança de comportamento não é).

- **Dado** a suíte de testes já existente de Fruit Ninja (`rules.js`, `slicing.js`),
  **quando** rodada após a introdução do hub,
  **então** nenhuma falha nova aparece — o Fruit Ninja não foi tocado por esta feature além
  do controle de "voltar ao hub".

## Erros de console

- **Dado** o fluxo completo hub → Duck Shooting → voltar ao hub → Fruit Ninja → voltar ao
  hub,
  **quando** executado em sequência (ex. via browser-automation),
  **então** nenhuma mensagem de erro aparece no console do navegador em nenhuma das
  transições.
