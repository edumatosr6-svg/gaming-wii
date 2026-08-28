# Code Validation Report — wii-controller

**Veredito: SUCCESS**

## Cobertura de specs

- **F1 — QR code de pareamento**: implementado.
  - `server/qr.py` (novo): `generate_and_print(url, fmt, image_path)` constrói o QR
    localmente via `qrcode.QRCode`, imprime ASCII no terminal (`fmt="ascii"`, formato
    padrão) ou salva imagem (`fmt="image"`, imprimindo o caminho no terminal). Import de
    `qrcode` isolado dentro de `_build_qr`, capturado por `except Exception` amplo em
    `generate_and_print` — qualquer falha (biblioteca ausente, erro de renderização)
    devolve `False`, imprime aviso nomeando a causa e nunca propaga (F1.9).
  - `server/main.py::print_urls` chama `qr.generate_and_print` com a mesma string usada
    para a URL da primeira interface impressa no mesmo `print_urls` (`ips[0]`) — nunca um
    valor derivado/abreviado/cacheado (F1.6/F1.7). Chamada condicionada a
    `config.QR_ENABLED`.
  - `server/config.py`: `QR_ENABLED` (bool, padrão `True`), `QR_FORMAT` (`"ascii"` |
    `"image"`, padrão `"ascii"`), `QR_IMAGE_PATH` (caminho relativo à raiz do projeto,
    usado só quando `QR_FORMAT == "image"`) — batem com a seção Config de
    `software-specs.md:1264-1267`.
  - Sem chamada de rede na geração (F1.8): `qr.py` não importa `socket`, `urllib`,
    `http.client` nem `requests` — só a biblioteca `qrcode`, que roda em processo.
  - Campo de IP manual (F3) intocado: nenhuma mudança em `web/js/main.js` ou
    `web/index.html`.
- **Dependências**: `requirements.txt` ganhou `qrcode[pil]>=7.4` (runtime — o extra
  `[pil]` cobre o modo `image` sem exigir Pillow separado) e `pyzbar>=0.1.9`
  (desenvolvimento/teste, decodificação em C6b). Ambas alinhadas com
  `tools/dependencies.md` (que já previa `qrcode`/equivalente, geração 100% local).

## Contratos com outros slugs

- Nenhum outro slug (`fruit-ninja`, `game-hub`) referencia `server/main.py`,
  `server/config.py` ou `server/qr.py` — busca por `print_urls`/`config.QR`/`server/config`
  nas specs dos outros slugs não encontrou ocorrência. Sem contrato cruzado afetado.

## Problemas encontrados

Nenhum. (Uma primeira versão do diff tinha uma função auxiliar `control_url()` não usada,
duplicando a montagem da URL já feita em `print_urls`; foi removida antes deste veredito.)

## Observações

- `qr.print_ascii(tty=False)` (biblioteca `qrcode`) é chamado sem TTY para não depender de
  cores ANSI do terminal do usuário — trade-off de legibilidade visual vs. portabilidade,
  não coberto explicitamente pela spec; registrado aqui como suposição de implementação.
- A escolha do formato padrão (`QR_FORMAT = "ascii"`) evita exigir Pillow em runtime na
  maioria dos casos (só é importado quando `qr.make_image()` é chamado, isto é, quando
  `QR_FORMAT == "image"`), mesmo com `qrcode[pil]` instalado — decisão de implementação
  compatível com a spec, que deixa a escolha de formato a cargo do impl-loop.
- `pyzbar` (teste) depende de uma DLL nativa (`libzbar`); no Windows a wheel do PyPI já
  embute o binário, testado nesta máquina. Se algum ambiente de CI Linux não tiver
  `libzbar0` do sistema, `pyzbar` pode falhar ao importar — risco de portabilidade a
  observar, não uma falha nesta validação (testes locais rodaram com sucesso, ver
  `testing-report.md`).
