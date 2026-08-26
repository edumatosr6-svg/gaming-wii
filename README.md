# wii-controller

Transforma um celular Android em um gamepad estilo Wii Remote para PC:
inclinação vira eixo analógico, tela vira botões touch, e o PC enxerga um
gamepad XInput (Xbox 360) padrão. Conexão exclusivamente por Wi-Fi local, via
página web servida pelo próprio PC — sem app, sem build.

Especificações completas em `specs/wii-controller/`.

## Pré-requisitos

- Python 3.11+
- Windows com o driver **ViGEmBus** instalado
  (<https://github.com/nefarius/ViGEmBus/releases>) — o servidor detecta a
  ausência e instrui.
- Celular Android com Chromium na mesma rede Wi-Fi (referência: Galaxy A57).
- (Desenvolvimento) Node.js para os testes JS (`node --test`, sem npm).

## Instalação

```bash
python -m venv .venv          # recomendado
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium   # passo único: navegador dos testes de integração
```

O `playwright install chromium` é obrigatório para rodar a suíte: os testes de
integração em navegador headless (W11–W19) fazem parte da execução padrão e
**não são pulados** quando o navegador falta — a suíte falha apontando este
comando. Pular essa faixa foi exatamente o modo de falha que deixou passar os
defeitos de integração com o DOM.

## Uso

```bash
python server/main.py [--port N]
```

O terminal imprime as URLs:

- **Controle (celular):** `https://<ip-do-pc>:8443/` — aceite o aviso do
  certificado autoassinado na primeira visita. A conexão é **automática**: o
  endereço vem da própria URL, sem digitação. A tela de pareamento manual só
  aparece se a página for aberta fora do servidor.
- **Jogo (PC):** `https://localhost:8443/game/` — Duck Shooting, lê o gamepad
  virtual pela Gamepad API. Tecla `O` alterna o overlay de latência.

Modo de diagnóstico (mede latência sem a camada de emulação, desativado por
padrão): `python server/main.py --direct-metrics`.

## Testes

```bash
pytest -q
```

Um comando único roda a suíte inteira: servidor Python, lógica JS do jogo via
`node --test` e os testes de integração em navegador headless (Playwright +
Chromium). Testes que exigem hardware/driver ficam marcados com
`@pytest.mark.hardware` e fora da execução padrão — e não contam como
cobertura: o relatório de testes precisa dizer explicitamente o que ficou por
verificar manualmente.

Lint/formatação: `ruff check server tests`, `black --check server tests`,
`prettier --check "web/**/*.js" "game/**/*.js"`.
