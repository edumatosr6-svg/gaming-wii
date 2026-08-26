# Spec Validation Report — wii-controller

**Veredito: SUCCESS**

_Iteração 2 — 2026-08-26_

## Pontos verificados
- [x] Completude — todas as features de `descriptions.md` cobertas (F1–F11), cada uma
  com critérios de aceite verificáveis; segunda onda e fora de escopo explícitos, com
  pontos de extensão exigidos no MVP nomeados.
- [x] KPIs — os dois problemas da iteração 1 corrigidos: KPI-11 (estabilidade de
  sessão, 30 min / 0 ocorrências, verificado por C10) adicionado; composição do KPI-1
  definida sem ambiguidade (rede = RTT/2 do ping/pong + processamento medido no
  servidor, expostos como `net_ms`/`proc_ms` em `GET /metrics`, com o papel do modo
  `--direct-metrics` delimitado à decomposição da latência do driver). Todos os KPIs
  de `descriptions.md` estão na tabela ou justificados (taxa de acerto como métrica
  comparativa entre versões, com procedimento L12).
- [x] Testabilidade — caminho feliz, bordas e falhas cobertos por feature em 7
  arquivos de `tests/`; casos manuais/hardware marcados com roteiro e critério
  objetivo; testes L1/L4 atualizados para a nova composição da métrica.
- [x] Consistência interna — features, procedures (P1–P4) e data models coerentes;
  conflito recorde local vs. proibição de `localStorage` resolvido explicitamente
  (recorde em memória; persistência fora de escopo).
- [ ] Consistência com implementation-report — N/A (arquivo não existe).
- [x] Consistência com `references/` — contexto seguro (HTTPS autoassinado decidido e
  documentado), XInput/ViGEmBus/vgamepad, Gamepad API como único canal de input do
  jogo, referência de mecânica (não de conteúdo) do Duck Hunt.
- [x] Tools — dependências mínimas justificadas (`websockets`, `vgamepad`,
  `cryptography`), comando único de teste (`pytest -q` englobando a suíte JS),
  verificações estáticas da spec automatizadas; nada especulativo.

## Problemas encontrados
Nenhum.

## Observações
- KPI-1 (p95 < 30 ms) é ambicioso; a spec já prevê a alternativa de formato binário
  para `motion` caso a medição reprove (Data Models) — débito consciente, decisão
  adiada até haver números.
- A latência driver→jogo dentro do SO fica fora da métrica do overlay por definição;
  o modo `--direct-metrics` existe para estimá-la por diferença. Suposição assumida.
- KPI-4, KPI-7, KPI-10 e KPI-11 dependem de procedimento manual no hardware de
  referência (Galaxy A57); aceito porque cada um tem roteiro e critério objetivo de
  aprovação em `tests/`.
- O fallback de rumble via `POST /rumble` é exceção documentada e isolada em um único
  módulo do jogo — risco de suporte irregular do `GamepadHapticActuator` mitigado.
