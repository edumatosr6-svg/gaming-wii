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

`playwright` (Python) dirigindo Chromium: exigido pelos testes de integração em
navegador headless (W11–W29), que são obrigatórios na suíte padrão. É dependência de
**desenvolvimento apenas** — não entra no runtime, não introduz build step e não afeta
a regra de o cliente ser vanilla sem npm. Requer o passo único
`playwright install chromium`, documentado no README.

## Revisão de precisão: nenhuma dependência nova

A frente de precisão (fusão de sensores, rejeição magnética, escada de fontes,
calibração guiada, suavização adaptativa) **não adiciona nenhuma dependência**, e isso é
requisito, não coincidência:

- A **fusão é JavaScript puro** servido como arquivo estático — proibido resolver com
  biblioteca de fusão via npm/CDN, o que reintroduziria build step e dependência de
  runtime no cliente (restrição das coding directives e do `descriptions.md`).
- As **APIs de sensor** usadas (evento clássico, API de sensores moderna e sensores
  crus) são do próprio navegador; a disponibilidade é detectada em runtime (F13), nunca
  presumida — não há polyfill, e um aparelho sem magnetômetro continua jogando.
- No **servidor**, as mudanças (zonas mortas por eixo, limites por direção, suavização
  adaptativa, validação de perfil, `tremor_x`/`tremor_y`) são aritmética em módulo puro:
  sem numpy, sem scipy, sem biblioteca de filtro.
- Os testes novos usam o que já existe: `node --test` embutido para a faixa JS
  (PC1–PC27) e Playwright para os headless — a fonte `synthetic` (F13) substitui
  qualquer necessidade de emulação de sensores por ferramenta externa.

## Explicitamente não usar

Frameworks de frontend, bundlers, engines de jogo (Phaser/PixiJS/Three.js), frameworks
web Python pesados, bibliotecas de jogo no cliente, qualquer asset de terceiros com
licença restritiva.
