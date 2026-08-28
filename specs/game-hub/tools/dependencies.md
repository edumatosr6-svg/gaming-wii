# game-hub — Dependências

## Runtime

Nenhuma. O hub é HTML, CSS e JavaScript ES puro, consistente com a restrição de todo o
projeto webgaming (ver `specs/wii-controller/coding-directives.md` — "Sem dependências no
cliente", "Sem framework de frontend e sem etapa de build").

- Sem CDN, sem biblioteca de UI, sem router de SPA — a "navegação" entre hub e jogos é
  navegação real de páginas (`<a href>`), que o navegador já resolve nativamente.
- Sem dependência de build (bundler, transpilador). Os arquivos do hub são servidos
  estaticamente pelo mesmo servidor HTTP que já serve `game/` hoje.

## Por que nenhuma dependência é necessária

O escopo do hub (F1–F4) é: renderizar uma lista a partir de um array de dados e criar links.
Isso não justifica nenhuma biblioteca — introduzir uma violaria a restrição "sem framework de
frontend" herdada do projeto e aumentaria superfície sem necessidade real.
