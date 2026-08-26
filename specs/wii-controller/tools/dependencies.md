# wii-controller — Dependências

Somente o exigido pelas specs. Cliente e jogo **não têm dependência nenhuma** (vanilla,
sem CDN, sem npm) — restrição das coding directives.

## Runtime (servidor Python 3.11+, via `requirements.txt`)

| Dependência | Por quê | Observações |
|---|---|---|
| `websockets` | Canal WebSocket assíncrono de input (F1). Referência indicada em references/. | Usar o servidor asyncio nativo da lib; suporta TLS (`wss://`) exigido pela estratégia de contexto seguro. |
| `vgamepad` | Binding Python do ViGEmBus para o gamepad virtual XInput (F7). | Importado **apenas** em `server/gamepad/windows.py`. Exige o driver ViGEmBus instalado no Windows (pré-requisito de usuário, documentado no README; ausência detectada com mensagem acionável — F7.2). |
| `cryptography` | Gerar o certificado autoassinado no primeiro start (F1, estratégia HTTPS). | Alternativa aceitável: gerar via `openssl` externo com instrução no README, se preferir zero dependência — a spec exige apenas que o certificado seja gerado/reutilizado automaticamente ou com passo único documentado. |

Servidor HTTP estático: usar a biblioteca padrão (`http.server`/`asyncio` ou o handler
HTTP do próprio `websockets` para a mesma porta). **Sem framework web** (FastAPI, Flask
etc.) — restrição das diretivas. As rotas dinâmicas exigidas são mínimas: `GET /metrics`
(F11) e `POST /rumble` (fallback F8).

## Pré-requisitos de sistema (não são pacotes pip)

- **ViGEmBus** (Windows): driver de gamepad virtual. Instalação manual pelo usuário;
  o servidor detecta a ausência e instrui (F7.2).
- Rede Wi-Fi local com celular e PC no mesmo segmento.
- Aparelho de referência: Samsung Galaxy A57 (Chromium, giroscópio, vibração).

## Desenvolvimento/teste (ver tools/tooling.md)

`pytest`, `pytest-asyncio`, `ruff`, `black`, `prettier` (este último como ferramenta de
formatação local dos arquivos JS estáticos — não introduz build step nem dependência de
runtime).

## Explicitamente não usar

Frameworks de frontend, bundlers, engines de jogo (Phaser/PixiJS/Three.js), frameworks
web Python pesados, bibliotecas de jogo no cliente, qualquer asset de terceiros com
licença restritiva.
