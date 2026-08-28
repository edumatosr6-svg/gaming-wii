"""Constantes de configuração do wii-controller (servidor).

Invariante das specs: nenhum destes valores aparece como número mágico fora
deste módulo (software-specs.md, Data Models / Config).

DIVISÃO DE DONO (software-specs.md, "Divisão do processamento"): este módulo é
dono das constantes de MAPEAMENTO (zona morta, sensibilidade, alcances,
suavização). As constantes de CAPTURA e do ASSISTENTE (janela de calibração,
estabilidade, retries, orçamento) são do cliente e moram em `web/js/config.js`
— não têm cópia aqui. A única duplicação permitida entre os dois lados é
``RANGE_MIN_DEG``/``RANGE_MAX_DEG`` (aqui é a AUTORIDADE; o cliente apenas
pré-valida para evitar uma ida ao servidor só para receber um "não").
"""

# Rede
PORT: int = 8443

# --------------------------------------------------------------------------
# QR code de pareamento (F1) — mesma URL do controle impressa nas URLs
# --------------------------------------------------------------------------
# Falha na geração (biblioteca ausente, erro de renderização) nunca desliga o
# resto do F1: degrada para as URLs impressas normalmente (F1.9).
QR_ENABLED: bool = True
# "ascii" (impresso direto no terminal, sem arquivo) ou "image" (arquivo local
# em QR_IMAGE_PATH, regenerado a cada start, caminho impresso no terminal).
QR_FORMAT: str = "ascii"
# Caminho relativo à raiz do projeto, usado apenas quando QR_FORMAT == "image".
QR_IMAGE_PATH: str = "server/qr-pairing.png"

# --------------------------------------------------------------------------
# Mapeamento de apontamento (F4 — pegada vertical, modelo do "infravermelho")
# --------------------------------------------------------------------------
# ZONA MORTA POR EIXO (substitui a zona morta radial única). A assimetria tem
# sinal definido e justificativa física: o yaw carrega o ruído e a deriva da
# referência magnética, enquanto o pitch vem de acelerômetro + giroscópio, que
# é sinal estável. Com um raio único, ou o horizontal treme, ou o vertical fica
# grudento perto do centro — não existe valor que sirva para os dois.
# Invariante: DEAD_ZONE_YAW_DEG >= DEAD_ZONE_PITCH_DEG.
DEAD_ZONE_YAW_DEG: float = 3.0  # faixa aceitável 2–5°
DEAD_ZONE_PITCH_DEG: float = 1.5  # faixa aceitável 1–3°

# Sensibilidade por eixo: existem para permitir tuning de um eixo sem mexer no
# código nem arrastar o outro junto.
SENSITIVITY_YAW: float = 1.0
SENSITIVITY_PITCH: float = 1.0

# DEFAULT_RANGE_DEG (substitui MAX_ANGLE_DEG) é o alcance PADRÃO DE CADA UMA
# DAS QUATRO DIREÇÕES, usado enquanto não houver calibração guiada (F12) ou
# quando ela for pulada. É parâmetro de ERGONOMIA, não de ganho: define quanto
# o pulso precisa girar para varrer a tela. Com 20°, a varredura completa
# (borda a borda = range.left + range.right = 40°) é executável só com o giro
# do pulso, sem mover o cotovelo (critério manual W22m). Faixa aceitável:
# 15°–30°.
DEFAULT_RANGE_DEG: float = 20.0

# Limites de ACEITAÇÃO do alcance medido pelo assistente (F12): abaixo do
# mínimo o usuário não se moveu e a mira ficaria hipersensível; acima do máximo
# a varredura deixa de caber no giro do pulso e o valor provavelmente veio de
# um salto de ângulo. O servidor é a autoridade desta validação.
RANGE_MIN_DEG: float = 10.0
RANGE_MAX_DEG: float = 45.0

# --------------------------------------------------------------------------
# Suavização adaptativa por velocidade (F4)
# --------------------------------------------------------------------------
# Um fator ÚNICO obriga a escolher entre mira estável parada (KPI-7) e resposta
# rápida em movimento (KPI-17): as duas metas brigavam por construção. O fator
# passa a ser função da velocidade do movimento, por eixo.
ADAPTIVE_SMOOTHING_ENABLED: bool = True

# A velocidade é o DESLOCAMENTO LÍQUIDO do sinal de entrada ao longo desta
# janela, dividido pela duração dela — nunca a diferença entre amostras
# consecutivas. Ruído de média zero produz diferenças instantâneas grandes e
# deslocamento líquido pequeno: estimar por amostra consecutiva faria o tremor
# ser lido como movimento rápido e DESLIGARIA o filtro exatamente quando ele é
# necessário, invertendo o efeito pretendido.
SMOOTH_SPEED_WINDOW_MS: float = 100.0
SMOOTH_SPEED_LOW_DPS: float = 10.0  # abaixo disso: filtra forte (mata o tremor)
SMOOTH_SPEED_HIGH_DPS: float = 80.0  # acima disso: praticamente desligado
SMOOTH_ALPHA_STILL: float = 0.85  # retenção com o aparelho parado
SMOOTH_ALPHA_FAST: float = 0.0  # retenção em gesto rápido (preserva a resposta)

# Fator fixo do modo DESLIGADO (F15, frente 2): preservado como caminho de
# comparação, para que uma regressão de precisão possa ser atribuída a esta
# frente em vez de caçada entre quatro mudanças simultâneas.
SMOOTHING_ALPHA: float = 0.2  # 0.0 desliga a suavização

# Salto de `t` acima do qual o timestamp do cliente é considerado não confiável
# e o servidor cai para o tempo de chegada como base do dt (F4).
MOTION_DT_MAX_JUMP_MS: float = 1000.0

# Cliente
MOTION_SEND_HZ: int = 60

# Ciclo de vida da conexão (F9) — detecção de queda em <= 3 s com os padrões
PING_INTERVAL_S: float = 0.5
PING_TIMEOUT_S: float = 2.0

# Eixo de destino do tilt (ponto de extensão da segunda onda)
TILT_TARGET_AXIS: str = "right"  # "right" | "left"

# Protocolo
MAX_MESSAGE_BYTES: int = 64 * 1024  # mensagens maiores são descartadas (P7)

# Fontes de orientação válidas no `status` (F13): os QUATRO degraus da escada
# mais a fonte de diagnóstico `synthetic`, que nunca é escolhida pela detecção
# automática e só aparece quando forçada.
SOURCE_LADDER: tuple[str, ...] = (
    "fusion_mag",
    "fusion_nomag",
    "sensor_api",
    "deviceorientation",
)
DIAGNOSTIC_SOURCE: str = "synthetic"

# Métricas (F11)
METRICS_WINDOW_SIZE: int = 256  # amostras na janela móvel de latência
