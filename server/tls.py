"""Certificado autoassinado: gerado no primeiro start, reutilizado depois (F1).

Gera um certificado cobrindo `localhost` e os IPs locais da máquina; o
usuário aceita o aviso do navegador uma única vez por aparelho.
"""

from __future__ import annotations

import datetime
import ipaddress
import logging
import socket
from pathlib import Path

logger = logging.getLogger(__name__)

CERT_DIR = Path(__file__).resolve().parent / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"


def get_local_ips() -> list[str]:
    """Descobre os IPs de rede local da máquina (para as URLs e o SAN)."""
    ips: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 80))  # não envia pacote (UDP)
            ips.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addr = info[4][0]
            if addr not in ips and not addr.startswith("127."):
                ips.append(addr)
    except OSError:
        pass
    return ips or ["127.0.0.1"]


def ensure_certificate() -> tuple[Path, Path]:
    """Garante cert.pem/key.pem em ``server/certs/`` e devolve os caminhos.

    Reutiliza os arquivos existentes (mesmo fingerprint entre execuções —
    critério F1.2); gera com a lib `cryptography` na primeira execução.
    """
    if CERT_FILE.exists() and KEY_FILE.exists():
        return CERT_FILE, KEY_FILE

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    logger.info("Gerando certificado autoassinado em %s", CERT_DIR)
    CERT_DIR.mkdir(parents=True, exist_ok=True)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "wii-controller")])
    san_entries: list[x509.GeneralName] = [x509.DNSName("localhost")]
    for ip in {*get_local_ips(), "127.0.0.1"}:
        san_entries.append(x509.IPAddress(ipaddress.ip_address(ip)))

    now = datetime.datetime.now(datetime.UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san_entries), critical=False)
        .sign(key, hashes.SHA256())
    )

    KEY_FILE.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return CERT_FILE, KEY_FILE
