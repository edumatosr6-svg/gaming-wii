"""Constantes de configuração do wii-controller.

Invariante das specs: nenhum destes valores aparece como número mágico fora
deste módulo (software-specs.md, Data Models / Config).
"""

# Rede
PORT: int = 8443

# Mapeamento de apontamento (F4 — pegada vertical, modelo do "infravermelho")
DEAD_ZONE_DEG: float = 3.0
SENSITIVITY: float = 1.0
# MAX_ANGLE_DEG é parâmetro de ERGONOMIA, não de ganho (F4): define quanto o
# pulso precisa girar para varrer a tela inteira. Com 20°, a varredura completa
# (borda a borda = 2 × 20° = 40°) é executável só com o giro do pulso, sem
# mover o cotovelo (critério manual W22m). Faixa aceitável: 15°–30°.
MAX_ANGLE_DEG: float = 20.0
# Suavização sujeita ao orçamento de resposta (F4.8/KPI-17): com amostras a
# 60 Hz, um degrau atinge 90% do valor final em ≤ 100 ms (≤ 6 amostras).
SMOOTHING_ALPHA: float = 0.2  # 0.0 desliga a suavização

# Cliente
MOTION_SEND_HZ: int = 60

# Ciclo de vida da conexão (F9) — detecção de queda em <= 3 s com os padrões
PING_INTERVAL_S: float = 0.5
PING_TIMEOUT_S: float = 2.0

# Eixo de destino do tilt (ponto de extensão da segunda onda)
TILT_TARGET_AXIS: str = "right"  # "right" | "left"

# Protocolo
MAX_MESSAGE_BYTES: int = 64 * 1024  # mensagens maiores são descartadas (P7)

# Métricas (F11)
METRICS_WINDOW_SIZE: int = 256  # amostras na janela móvel de latência
