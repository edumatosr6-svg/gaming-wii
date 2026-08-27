# fruit-ninja — Dependências

O jogo **não tem nenhuma dependência de runtime**: HTML/CSS/JS ES2020 vanilla, módulos
ES nativos, Canvas 2D, servidos como arquivos estáticos exatamente como versionados.
Sem framework, sem bundler, sem npm, sem CDN, sem engine de jogo (restrição das coding
directives e do `descriptions.md`).

## Runtime

| Item | Situação |
|---|---|
| Bibliotecas JS | **nenhuma** |
| Assets (imagens, sprites, áudio) | **nenhum** — formas geométricas em Canvas e som sintetizado via Web Audio (F10) |
| Servidor | **nenhum novo** — o servidor existente do `wii-controller` já serve `/game/fruit-ninja/`; nenhuma alteração nele é permitida (F14) |
| Dependências Python novas | **nenhuma** |

APIs de navegador usadas (nativas, sem polyfill): Gamepad API (F1), Canvas 2D +
`requestAnimationFrame` (F13), Web Audio API (F10), `GamepadHapticActuator` (F9).

## Desenvolvimento e teste

Tudo já instalado e configurado no projeto — **nenhuma dependência nova é introduzida
por este slug**:

| Ferramenta | Por quê | Observação |
|---|---|---|
| `pytest` | comando único da suíte (`pytest -q`), que já orquestra Python e JS | já em `requirements.txt` |
| Node.js (`node --test`) | testes da lógica pura (`tests/js/`), sem navegador e sem celular | ferramenta de desenvolvimento apenas; nada de npm/pacotes |
| `playwright` (Python) + Chromium | faixa **obrigatória** de integração em navegador headless (`tests/integration-browser.md`) | já instalado; requer `playwright install chromium`, passo único documentado |
| `prettier` (opcional, local) | formatação dos `.js` estáticos (aspas simples, ponto e vírgula) | não é etapa de build — os arquivos servidos são os versionados |

## Pré-requisitos apenas para os procedimentos manuais

Não exigidos pela suíte padrão (`tests/manual.md`): celular pareado pelo
`wii-controller`, driver ViGEmBus no Windows e gamepad virtual ativo.

## Explicitamente não usar

Engines de jogo (Phaser, PixiJS, Three.js), frameworks de frontend, bundlers,
transpiladores, bibliotecas de física, bibliotecas de áudio, qualquer CDN, qualquer
código importado de `web/`, do servidor ou do Duck Shooting em `game/js/`.
