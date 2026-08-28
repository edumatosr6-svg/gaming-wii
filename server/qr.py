"""QR code de pareamento (F1): mesma URL impressa, sem serviço externo.

A biblioteca ``qrcode`` calcula e desenha o QR inteiramente em processo — sem
nenhuma chamada de rede a um gerador externo (F1.8). Falha na geração
(biblioteca ausente, erro de renderização) nunca aborta o servidor: degrada
para as URLs impressas, com um aviso no terminal nomeando a causa — "falhar
suave", mesma política do restante do F1 (F1.9).
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from server import config

logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parent.parent


def _build_qr(url: str):
    """Constrói o objeto QR para ``url``. Import local: mantém a dependência
    isolada e opcional (o resto do servidor não precisa de `qrcode`)."""
    import qrcode  # noqa: PLC0415

    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    return qr


def generate_and_print(
    url: str,
    fmt: str | None = None,
    image_path: Path | None = None,
) -> bool:
    """Gera e exibe/salva o QR que codifica ``url`` (a mesma URL impressa).

    Devolve ``True`` em sucesso, ``False`` em falha (já reportada ao usuário
    via terminal — quem chama não precisa tratar o retorno para manter o
    servidor de pé, F1.9).
    """
    fmt = (fmt or config.QR_FORMAT).lower()
    path = image_path or (ROOT_DIR / config.QR_IMAGE_PATH)
    try:
        qr = _build_qr(url)
        if fmt == "image":
            img = qr.make_image()
            img.save(path)
            print(f"  QR de pareamento (imagem): {path}")
        else:
            # Consoles legados do Windows usam uma codepage sem os blocos Unicode
            # do QR ASCII (ex. cp1252) e derrubariam a impressão com
            # UnicodeEncodeError — reconfigurar para UTF-8 evita esse fim de
            # linha específico sem mudar o comportamento em terminais que já são
            # UTF-8 (Linux/macOS).
            if hasattr(sys.stdout, "reconfigure"):
                try:
                    sys.stdout.reconfigure(encoding="utf-8")
                except (ValueError, OSError):
                    pass
            print("  QR de pareamento (aponte a câmera do celular):")
            qr.print_ascii(tty=False)
        return True
    except Exception as exc:  # noqa: BLE001 — falha suave normativa (F1.9)
        logger.warning("Falha ao gerar QR de pareamento: %s", exc)
        print(f"  AVISO: QR de pareamento indisponível ({exc}). Use o campo de IP manual (F3).")
        return False
