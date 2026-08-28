# Spec Validation Report — wii-controller

**Veredito: SUCCESS**

_Iteração 3 — 2026-08-28 (adição pontual: QR code de pareamento, F1)_

## Pontos verificados

- [x] **Completude** — a única feature nova do `descriptions.md` desta rodada ("QR code
  de pareamento", dentro de "Pareamento por IP") está coberta em F1 com descrição
  normativa (URL codificada é exatamente a impressa, formato ASCII/imagem à escolha do
  impl-loop, campo manual F3 preservado como fallback, geração local, regeneração por
  IP/porta, falha não aborta o servidor) e quatro novos critérios de aceite verificáveis
  (F1.6–F1.9), um por sub-requisito do `descriptions.md`. Nada do resto do
  `descriptions.md` foi tocado nem precisava ser — é o único delta desta iteração.
- [x] **KPIs** — KPI-25 mede especificamente o ganho do QR no primeiro pareamento
  (automatizado: QR decodificado == URL impressa, inclusive após mudar porta/interface;
  manual: tempo até `conectado` escaneando, comparado à digitação via F3), evitando
  duplicar o KPI de "Tempo de setup" existente, que é sobre reconexão, não sobre a
  primeira entrada. Meta numérica (< 10 s) e forma de verificação nomeada (C6b, C11).
- [x] **Testabilidade** — caminho feliz (C6b), regeneração entre interfaces/porta (C6b,
  segunda parte), ausência de dependência de rede (C6c), falha degradada (C6d) e
  comparação manual (C11) cobrem caminho feliz, borda (múltiplas interfaces) e falha
  (biblioteca indisponível) para a feature nova. Cada caso é transformável em teste
  automatizado ou procedimento manual sem ambiguidade adicional.
- [x] **Consistência interna** — F3 permanece explicitamente como fallback ("o QR ... não
  é uma forma alternativa de conexão nem um caminho que dispensa este campo"), sem
  contradizer a regra pré-existente de F3.5 sobre `localStorage` (o QR não introduz
  persistência nova). A política de "falhar suave" do F1 (já usada para mensagens
  corrompidas, F1.4) é reaproveitada coerentemente para falha de geração do QR (F1.9),
  em vez de inventar uma política nova. `Config` ganhou `QR_ENABLED`/`QR_FORMAT`/
  `QR_IMAGE_PATH` no mesmo padrão das demais constantes do servidor, sem número mágico
  fora de `config.py`.
- [x] **Consistência entre slugs (contratos externos)** — ver seção própria.
- [x] **Consistência com `implementation-report.md`** — o relatório existente é da rodada
  de precisão do apontamento (modelo absoluto, eixos, fusão), já endereçada e validada na
  iteração 2 (`SUCCESS` anterior). Nada nesta iteração o reabre nem o contradiz; a
  mudança é ortogonal (servidor/inicialização vs. mapeamento de apontamento).
- [x] **Consistência com `references/`** — nenhuma referência versionada trata de
  QR/pareamento; a regra "sem dependência de internet" citada no `descriptions.md` para
  esta feature é a mesma já presente no projeto (contexto seguro, fusão local, etc.) e
  foi propagada a `tools/dependencies.md` (nova entrada da biblioteca de QR) e
  `tools/tooling.md` (item estático 11).
- [x] **Tools** — `tools/dependencies.md` adiciona exatamente uma dependência
  (`qrcode`/equivalente), justificada e restrita à geração local, com proibição explícita
  de serviço web de terceiros na seção "Explicitamente não usar". Nada supérfluo:
  não foi adicionada nenhuma dependência de cliente (o QR é gerado e exibido só pelo
  servidor), preservando a regra "cliente e jogo não têm dependência nenhuma".

## Contratos entre slugs

- `fruit-ninja` — **rota estática `/game/fruit-ninja/`, valor do eixo do gamepad
  virtual, canal de rumble** — **compatível, não afetado**. A feature desta iteração é
  inicialização do servidor (impressão de URLs + QR), não toca `mapping.py`, o protocolo
  WebSocket, nem nenhuma rota usada pelo Fruit Ninja.
- `fruit-ninja` — **KPI-8 do próprio `fruit-ninja` exige "`git diff` de `server/` vazio"
  durante a implementação daquele slug** — **não conflita**: essa exigência é sobre o
  slug `fruit-ninja` não alterar `server/` ao ser implementado; não restringe o
  `wii-controller` de evoluir seu próprio servidor (esta feature é do `wii-controller`,
  não do `fruit-ninja`). Verificado ponto a ponto para evitar a leitura errada de que
  qualquer mudança em `server/` quebraria o Fruit Ninja.
- Não há outros slugs além de `fruit-ninja` e `wii-controller` (`specs/_template` é
  gabarito, não slug).

## Problemas encontrados

Nenhum bloqueante nesta iteração.

`recorrente: não` (primeira rodada desta feature).

## Observações (mesmo com SUCCESS)

- **Redundância consciente e aceitável:** `tools/tooling.md` item 11 e `tests/
  connection-lifecycle.md` C6c descrevem a mesma verificação (nenhuma chamada de rede na
  geração do QR) em dois lugares — um como checagem estática/estrutural, outro como caso
  de teste nomeado. Isso segue o padrão já existente no documento (ex.: checagem estática
  7 de `tooling.md` e o F4.9 correspondente) e não é uma inconsistência, mas fica
  registrado para quem for implementar não duplicar o teste em código.
- **Decisão de formato adiada de propósito:** a spec deixa ASCII-no-terminal vs.
  imagem-em-arquivo como escolha do impl-loop, com critérios de aceite (F1.6–F1.9)
  escritos para valer igualmente nos dois casos. Se o impl-loop escolher o modo imagem,
  o `impl-tester` precisará de uma biblioteca de decodificação de QR de imagem (ex.
  `pyzbar`) como dependência de teste — não listada explicitamente em
  `tools/dependencies.md` porque é ferramenta de verificação, não de produto; vale a
  pena o impl-loop registrá-la em `tools/tooling.md` quando a escolha for feita, para
  manter o inventário de dependências de teste completo.
- **Nenhum risco novo herdado do `implementation-report.md` anterior** — a feature desta
  iteração não interage com o modelo de apontamento, fusão de sensores ou calibração;
  os débitos já registrados na iteração 2 (fonte `synthetic` na suíte headless, deriva de
  `alpha`, etc.) continuam com o mesmo status.
