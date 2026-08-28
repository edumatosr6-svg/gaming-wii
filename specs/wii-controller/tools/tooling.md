# wii-controller — Tooling

## Test runner

- **Comando único da suíte inteira: `pytest -q`** (exigência das coding directives).
- Testes Python: `pytest` + `pytest-asyncio` (servidor é asyncio; os testes de
  integração de WebSocket em loopback precisam de event loop).
- Testes da lógica JS pura do jogo (`entities.js`, `rules.js`) e do cliente
  (throttle, transições de botão): executados **dentro do `pytest`** invocando
  `node --test` (test runner nativo do Node) como subprocesso — um teste pytest que
  roda a suíte JS e falha se ela falhar. Node.js é ferramenta de desenvolvimento
  apenas; nada de npm/pacotes — só o runner embutido. Assim um único `pytest -q`
  cobre servidor e jogo.
- **A faixa JS pura cresce nesta revisão e passa a ser obrigatória para a precisão.**
  Fusão de sensores, rejeição magnética, escada de fontes, captura de janela de
  calibração e lógica do assistente rodam no cliente e **saíram do alcance da suíte
  Python** (ver "Divisão do processamento" em software-specs.md). Os casos PC1–PC27 de
  tests/pointing-client.md rodam no mesmo `node --test`, alimentados por fluxos
  sintéticos de sensores. Uma entrega que mova lógica para o cliente sem essa cobertura
  reprova: seria trocar testes existentes por nenhum teste.
- **Testes de integração em navegador headless: obrigatórios na execução padrão.**
  Carregam a página real do controle servida pelo servidor real, emulam toque e
  inspecionam as mensagens que saem pelo socket e a geometria do layout (casos
  W11–W29). Ferramenta: Playwright para Python, dirigindo Chromium — mesma família do
  navegador do aparelho de referência. **Viewport retrato obrigatório** nos casos que
  medem geometria (dimensões do A57 em pé, ex. 412×915): a interface é um corpo de
  Wii Remote vertical (F2), e medir em paisagem valida um layout que não existe mais.
  **Fonte de orientação nos casos headless: o degrau `synthetic` (`?src=synthetic`,
  F13)** — o navegador headless não tem sensores, e sem essa costura o assistente de
  calibração, o indicador de fonte e o de interferência ficariam sem cobertura
  automatizada. A costura é do próprio produto (é o mesmo mecanismo de forçamento de
  fonte usado para diagnóstico, F15), não um caminho que só existe em teste.
  Justificativa: a suíte anterior cobria lógica pura e servidor, e
  passava com 52 testes enquanto o produto era inutilizável; **toda a faixa de
  defeitos vivia na integração com o DOM**, que ficava sem teste algum.
  Estes testes **não podem ser marcados como opcionais nem pulados em silêncio**: se o
  navegador não estiver instalado, a suíte falha com instrução de instalação
  (`playwright install chromium`, passo único documentado no README) — pular era
  exatamente o modo de falha que deixou os defeitos passarem.
- Testes que exigem hardware/driver real são marcados (`@pytest.mark.hardware`) e
  **excluídos da execução padrão** (config no `pyproject.toml`/`pytest.ini`). Cada um
  precisa declarar um critério **observável** (o que o operador deve ver), e não apenas
  os passos a executar — sem isso o procedimento não é capaz de reprovar nada.
- **Teste marcado nunca conta como cobertura.** Um relatório de testes não pode
  declarar `SUCCESS` apoiado em uma faixa inteira de comportamento cuja verificação foi
  adiada para procedimento manual não executado; o veredito precisa dizer
  explicitamente o que ficou por verificar.
- O gamepad virtual é substituído por um fake da interface `server/gamepad/base.py`
  em toda a suíte padrão — roda em qualquer SO, sem driver e sem celular.

## Lint e formatação

- Python: `ruff` (lint) + `black` (formatação, linha 100). Type hints obrigatórios em
  funções públicas.
- JavaScript: `prettier` (aspas simples, ponto e vírgula) rodando localmente sobre os
  arquivos estáticos — não é etapa de build; os arquivos servidos são os versionados.
- Comandos esperados: `ruff check server tests`, `black --check server tests`,
  `prettier --check "web/**/*.js" "game/**/*.js"`.

## Verificações estáticas específicas da spec

Automatizadas como testes (rodam no `pytest -q`):
1. Nenhum import de `vgamepad` fora de `server/gamepad/` (E5).
2. Nenhum uso de `WebSocket` em `game/` fora do módulo isolado de fallback de rumble
   (G13).
3. Nenhum import cruzado entre `game/` e `web/`/servidor (G14).
4. Constantes de tuning referenciadas somente via `config.py` (busca por números
   mágicos nos módulos de mapping/protocolo é revisão de código, não automatizada).
5. Nenhum controle acionável de `web/js/` tem `click` como único caminho de
   acionamento (W16, F2.9) — `click` só é aceito como caminho adicional ao lado de um
   registro de evento de toque para a mesma ação.
6. Nenhum elemento não-interativo posicionado sobre a área dos controles fica sem
   neutralizar a captura de toque (W14, F2.7); a verificação por geometria real é o
   W14 em navegador headless, esta é a checagem estática que a acompanha.
7. **Sem `hypot` no mapeamento de apontamento** (F4): a normalização é por eixo e por
   direção; qualquer combinação radial dos dois eixos antes da normalização reintroduz
   o raio único que esta revisão remove.
8. **Sem decisão de fonte por user agent** no cliente (F13.1, PC22): a seleção da fonte
   de orientação não pode ler `navigator.userAgent` nem equivalente.
9. **Constantes de precisão centralizadas e com dono único:** zona morta, sensibilidade,
   alcances e suavização só aparecem em `config.py` (servidor); janela de captura,
   estabilidade, retries e orçamento do assistente só aparecem no módulo de configuração
   do cliente. **Única duplicação permitida:** `RANGE_MIN_DEG`/`RANGE_MAX_DEG` nos dois
   lados (servidor é a autoridade; cliente pré-valida) — qualquer outra constante
   duplicada entre os dois lados reprova, porque é divergência silenciosa esperando
   acontecer.
10. **`localStorage` com lista fechada de duas chaves** (endereço e perfil de alcances,
    F3.5/F12.8): qualquer terceira chave reprova.
11. **Sem chamada de rede na geração do QR** (F1.8): a inicialização do servidor com
    acesso à internet bloqueado no ambiente de teste ainda produz o QR corretamente —
    prova que a biblioteca escolhida não depende de um serviço externo de geração.

## Scripts utilitários

- `python server/main.py [--port N]` — inicia o servidor (P1).
- Script/flag de diagnóstico `--direct-metrics` (F11, modo secundário explícito) —
  desativado por padrão.
- Geração do certificado autoassinado: automática no primeiro start (F1) — sem passo
  manual obrigatório.

## Interruptores de diagnóstico da precisão (F15)

Não são ferramentas novas: são parâmetros do próprio produto, documentados no README e
usados pelos testes e pelos procedimentos manuais comparativos.

| Interruptor | Onde | Usado por |
|---|---|---|
| `?src=fusion_mag\|fusion_nomag\|sensor_api\|deviceorientation\|synthetic` (os quatro degraus da escada + a fonte de diagnóstico `synthetic`, que **nunca** é escolhida pela detecção automática — F13.1) | URL do controle | W25, W26, W28, PC24, L16, W28m |
| `?mag=off` / `?magreject=off` | URL do controle | PC25, L16 |
| `ADAPTIVE_SMOOTHING_ENABLED`, zonas mortas e sensibilidades por eixo, alcances padrão | `server/config.py` | M21–M27 |

Regra: **um interruptor por frente**. Uma implementação que só permita ligar/desligar as
quatro frentes em bloco reprova F15 — sem isolamento, uma regressão de precisão não tem
como ser atribuída, e é a precisão que se está tentando medir.

## CI (opcional, não exigido pelo MVP)

Se houver CI, o pipeline é: `ruff check` → `black --check` → `prettier --check` →
`pytest -q`. Nenhum job pode exigir driver, celular ou GPU.
