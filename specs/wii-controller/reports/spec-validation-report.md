# Spec Validation Report — wii-controller

**Veredito: SUCCESS**

_Iteração 4 — 2026-08-26 (segunda rodada após o `implementation-report.md`)_

## Pontos verificados
- [x] Completude — F1–F11 cobrem `descriptions.md`, cada uma com critérios de aceite
  verificáveis. A camada de interação do cliente, que o relatório apontou como
  território não especificado, agora tem critérios próprios: F2.5–F2.9 (estados
  visuais, semântica de toque, interceptação, momento do fullscreen), F6.3 (posse do
  toque), F9.5–F9.7 (reconexão automática, estado visível, proibição de falha
  silenciosa) e F7.5 (inicialização com o driver real).
- [x] KPIs — todos rastreados a uma feature e a um procedimento nomeado. KPI-12 a
  KPI-15 fecham as lacunas do relatório: controles acionáveis só por toque (W12–W14),
  produto jogável fim-a-fim (W20), ausência de falha silenciosa (W11/W19) e
  inicialização com o driver real (E10). Nenhum KPI vago; a taxa de acerto segue
  declarada como métrica comparativa, não como meta absoluta.
- [x] Testabilidade — caminho feliz, bordas e falhas cobertos por feature nos 7
  arquivos de `tests/`. A faixa de integração em navegador headless (W11–W19, W2b) é
  obrigatória na suíte padrão e cada caso mapeia para um critério de aceite. Os casos
  manuais declaram o que o operador deve **observar** (E10, E11, C8, W4–W10, W20), e
  não apenas o que executar — sem isso não seriam capazes de reprovar nada.
- [x] Consistência interna — as 2 contradições da iteração 3 foram corrigidas:
  1. F2 (primeiro bullet) não define mais o momento do fullscreen por conta própria;
     delega ao bullet "Momento do modo imersivo" e remove a referência ao toque em
     "Conectar", que o fluxo feliz não tem. Definição única, sem leitura dupla.
  2. P2 passo 1 agora declara `conectando` como estado inicial do fluxo feliz,
     alinhado à tabela de transições de `ClientViewState` e ao invariante de uma única
     tela visível; `pareamento` só é inicial no caminho de exceção da F3.3.
  Busca por referências obsoletas ("toca em Conectar", "botão de reconectar",
  "informa/confirma o IP") não retorna ocorrências. Features, P1–P5 e data models
  concordam entre si.
- [x] **Consistência com `implementation-report.md`** — os 5 problemas relatados estão
  endereçados, cada um com critério de aceite e caso de teste:

  | Problema do relatório | Onde a spec passou a definir | Como reprova |
  |---|---|---|
  | 1. Integração com o driver não especificada além da presença | F7 (contrato), F7.5, P1 passo 3, data model "Contrato do gamepad virtual" | E10 (manual, observável), KPI-15 |
  | 2. Troca de telas sem comportamento especificado | F2 (máquina de estados), F2.5, data model `ClientViewState` (estados, transições, invariantes), P5 | W11 |
  | 3. Falha silenciosa / estado da conexão invisível | F9.5, F9.6, F9.7, `ClientViewState` invariantes 3 e 4 | W18, W19, C8, KPI-14 |
  | 4a. `click` não existe no controle | F2.6, F2.9 | W12, W13, W16, checagem estática 5 |
  | 4b. Elementos decorativos capturam o toque | F2.7 | W14, checagem estática 6 |
  | 4c. Fullscreen cancela o toque em andamento | F2 ("Momento do modo imersivo"), F2.8, P2 passo 3 | W15 |
  | 5. Testes não cobrem a camada de interação | `tests/client-controller.md` faixa 2 (obrigatória), `tools/tooling.md` (Playwright, proibição de pular) | a própria suíte falha se o navegador não estiver instalado |

  As correções já aplicadas no código durante a revisão manual estão todas ratificadas
  por spec, inclusive a de `controls.js`: F6 passou a definir a **posse do toque** pelo
  controle de origem (com W2b cobrindo o arrasto entre botões), débito que a iteração 3
  havia registrado como observação.
- [x] Consistência com `references/` — contexto seguro via HTTPS autoassinado,
  XInput/ViGEmBus/vgamepad, Gamepad API como único canal de input do jogo (exceção de
  rumble isolada e documentada), Duck Hunt como referência de mecânica e não de
  conteúdo.
- [x] Tools — dependências mínimas e justificadas; `playwright` entra como dependência
  de desenvolvimento com justificativa concreta (a faixa que ela cobre concentrou 100%
  dos defeitos que chegaram ao usuário) e sem violar "cliente vanilla, sem npm".
  Comando único `pytest -q` preservado. Nada especulativo.

## Problemas encontrados
Nenhum.

## Observações
- **O gate desta entrega não é a suíte automatizada.** KPI-13 (W20, partida completa só
  com o celular) e KPI-15 (E10, servidor sobe com o driver real) exigem hardware e são
  invisíveis ao `impl-tester`. Foi exatamente a ausência desse gate que permitiu
  declarar sucesso com 52 testes verdes e produto inutilizável. `tools/tooling.md` já
  proíbe declarar `SUCCESS` apoiado em faixa adiada para procedimento manual não
  executado — o `impl-loop` deve respeitar isso ao fechar o ciclo.
- **Fricção nova aceita conscientemente:** `playwright install chromium` como passo de
  setup, e a suíte falhando (em vez de pular) quando o navegador está ausente. Pular em
  silêncio era o modo de falha que deixou os defeitos passarem.
- KPI-1 (p95 < 30 ms) segue ambicioso. A alternativa de formato binário para `motion`
  continua prevista nos Data Models, com decisão adiada até haver medição — débito
  consciente, não bloqueia a implementação.
- A latência driver→jogo dentro do SO permanece fora da métrica do overlay por
  definição; `--direct-metrics` existe para estimá-la por diferença. Suposição mantida.
- O código já contém as correções manuais da revisão. Elas são **estado de partida**, e
  agora estão cobertas por spec e por casos de teste; o `impl-loop` deve tratá-las como
  comportamento exigido, não como solução a preservar tal como está.
