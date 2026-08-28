"""Conversão de apontamento/botões → estado do gamepad (módulo puro, sem I/O).

Modelo de apontamento absoluto na pegada VERTICAL (F4): o aparelho é segurado
em pé como um Wii Remote, com um "emissor infravermelho imaginário" no topo.
Onde o topo (a ponta) aponta, a mira está — a amostra de orientação converte
em POSIÇÃO apontada (x, y) ∈ [-1, 1]², função pura da amostra atual +
calibração (mesma inclinação ⇒ mesma posição, independentemente do histórico).

Derivação da direção da ponta (convenção do ``DeviceOrientationEvent``, ordem
intrínseca Z-X'-Y'' com ``alpha`` em torno de Z, ``beta`` de X', ``gamma`` de
Y''; a ponta é o eixo +y do aparelho):

- **Guinada (yaw)** — ângulo horizontal da ponta: girar o pulso para apontar a
  ponta para a direita DIMINUI ``alpha`` (alpha cresce no sentido
  anti-horário visto de cima), logo ``yaw_direita = -(alpha - alpha0)``.
- **Arfagem (pitch)** — elevação da ponta: levantar a ponta AUMENTA ``beta``,
  logo ``pitch_cima = beta - beta0``.
- **Rolagem** — torcer o aparelho no próprio eixo longitudinal é exatamente a
  rotação ``gamma`` (último eixo intrínseco, o próprio eixo da ponta): ela NÃO
  muda a direção da ponta, e por construção não entra no mapeamento (F4.7).

ATENÇÃO: este mapeamento é o da pegada vertical e é DIFERENTE do antigo de
paisagem (que usava gamma→x / beta→y e ignorava alpha) — reaproveitar aquele
produz eixo trocado/invertido (reprovado por M17/M18).

Ordem de aplicação (F4, normativa nesta revisão):
  1. offset de calibração (centro do perfil ativo, F5);
  2. derivação de ``yaw_right``/``pitch_up`` em graus;
  3. **zona morta POR EIXO** (não mais radial);
  4. **normalização pelo limite DA DIREÇÃO em que o eixo está deslocado**
     (não mais um raio único);
  5. curva de sensibilidade por eixo;
  6. saturação suave por eixo;
  7. suavização adaptativa por velocidade (``AdaptiveSmoother``).

POR QUE NÃO HÁ COMBINAÇÃO RADIAL AQUI (proibição normativa, F4 passo 4):
juntar os dois eixos numa hipotenusa antes de normalizar comprime os quatro
alcances medidos pela F12 de volta a um número só. Um alcance por direção não
serve para nada se o mapeamento o desfizer — é exatamente a regressão que
M24/M25 reprovam, e a checagem estática de tooling.md (item 7) proíbe a função
de hipotenusa neste caminho. Zona morta e normalização são estritamente por
eixo, e o limite é o da direção do deslocamento.

Nenhum import de I/O, rede ou driver. As funções de conversão são puras; o
único estado é o filtro de suavização, que é um objeto explícito.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass

from server import config

# Direções do perfil de alcance (F12) — ordem estável para iteração.
RANGE_KEYS: tuple[str, ...] = ("left", "right", "up", "down")


def _sanitize_angle(value: object) -> float | None:
    """Devolve o ângulo como float finito, ou None para entrada inválida."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        result = float(value)
        if math.isnan(result) or math.isinf(result):
            return None
        return result
    return None


def _shape(normalized: float, sensitivity: float) -> float:
    """Curva de sensibilidade + saturação suave sobre magnitude normalizada.

    ``normalized`` em [0, 1] (0 = borda da zona morta, 1 = limite da direção).
    Estritamente crescente em [0, 1), exatamente 1.0 em 1.0, derivada
    contínua (seno de quarto de ciclo — aproximação suave do teto).
    """
    clamped = min(1.0, max(0.0, normalized))
    if sensitivity <= 0:
        sensitivity = 1.0
    curved = clamped ** (1.0 / sensitivity)
    return math.sin(curved * math.pi / 2.0)


def _wrap_180(angle_deg: float) -> float:
    """Normaliza um delta angular para o intervalo (-180, 180].

    Nota de borda: +180° e -180° são o mesmo ponto físico; ambos normalizam
    para +180 (saturando em +1.0 no eixo correspondente — M4/M7).
    """
    wrapped = math.fmod(angle_deg, 360.0)
    if wrapped > 180.0:
        wrapped -= 360.0
    elif wrapped <= -180.0:
        wrapped += 360.0
    return wrapped


def _valid_range(value: object) -> float | None:
    """Alcance aceitável (F12): finito, positivo e dentro dos limites."""
    candidate = _sanitize_angle(value)
    if candidate is None or candidate <= 0.0:
        return None
    if candidate < config.RANGE_MIN_DEG or candidate > config.RANGE_MAX_DEG:
        return None
    return candidate


def resolve_ranges(ranges: object) -> dict[str, float]:
    """Normaliza um perfil de alcances para as quatro direções (M26).

    Direção ausente, degenerada, zero, negativa ou fora de
    ``RANGE_MIN_DEG``–``RANGE_MAX_DEG`` cai para ``DEFAULT_RANGE_DEG``
    **daquela direção** — nunca para uma média nem para um valor único
    compartilhado, o que reintroduziria o raio que esta revisão remove. Uma
    entrada parcial (duas direções) mantém as duas medidas e completa as
    outras duas com o padrão.
    """
    resolved = dict.fromkeys(RANGE_KEYS, config.DEFAULT_RANGE_DEG)
    if isinstance(ranges, dict):
        for key in RANGE_KEYS:
            candidate = _valid_range(ranges.get(key))
            if candidate is not None:
                resolved[key] = candidate
    return resolved


def is_valid_range_profile(ranges: object) -> bool:
    """Validação de AUTORIDADE do servidor sobre o perfil recebido (F12).

    Regra: toda direção **presente** precisa estar dentro de
    ``RANGE_MIN_DEG``–``RANGE_MAX_DEG``; perfil que não passa aqui é rejeitado
    com motivo, nunca aceito em silêncio (KPI-14).

    Direção **ausente** não invalida o perfil — ela cai para
    ``DEFAULT_RANGE_DEG``. É o caminho previsto pela F12 para quando o usuário
    esgota as tentativas numa direção e o assistente "oferece usar o padrão
    daquela direção e seguir adiante": o cliente omite a direção em vez de
    inventar o número, porque ``DEFAULT_RANGE_DEG`` é constante do servidor e
    duplicá-la no cliente seria divergência silenciosa esperando acontecer.

    Distinta de :func:`resolve_ranges`, que é a tolerância defensiva do
    mapeamento (M26) e nunca rejeita nada.
    """
    if not isinstance(ranges, dict):
        return False
    present = [key for key in RANGE_KEYS if key in ranges]
    if not present:
        return False
    return all(_valid_range(ranges[key]) is not None for key in present)


def pointing_angles(
    alpha: object,
    beta: object,
    gamma: object,
    offset: tuple[float | None, float, float] = (0.0, 0.0, 0.0),
) -> tuple[float, float] | None:
    """Direção da ponta em graus relativos ao centro calibrado (passos 1–2).

    Devolve ``(yaw_right, pitch_up)`` ou ``None`` quando a amostra não é
    utilizável. Separada de :func:`pointing_to_axes` porque a velocidade do
    filtro adaptativo é estimada sobre o sinal ANGULAR de entrada (os limiares
    são em °/s), não sobre o valor normalizado.
    """
    a = _sanitize_angle(alpha)
    b = _sanitize_angle(beta)
    _sanitize_angle(gamma)  # aceito pelo contrato; não entra na direção da ponta
    if b is None:
        return None

    alpha0 = _sanitize_angle(offset[0])
    beta0 = _sanitize_angle(offset[1]) or 0.0

    if a is None or alpha0 is None:
        yaw_right = 0.0  # sem yaw do sensor: eixo horizontal degrada para 0
    else:
        yaw_right = _wrap_180(-(a - alpha0))
    pitch_up = _wrap_180(b - beta0)
    return (yaw_right, pitch_up)


def _axis_value(
    angle_deg: float,
    dead_zone_deg: float,
    range_negative_deg: float,
    range_positive_deg: float,
    sensitivity: float,
) -> float:
    """Um eixo: zona morta própria, limite da DIREÇÃO do deslocamento, curva.

    ``range_negative_deg`` vale quando ``angle_deg < 0`` e
    ``range_positive_deg`` quando ``angle_deg > 0`` — é o passo 4 do pipeline,
    e é o que preserva a assimetria medida pelo assistente (F12.4/M25). Os dois
    lados nunca são combinados nem promediados.
    """
    magnitude = abs(angle_deg)
    if magnitude <= dead_zone_deg:
        return 0.0
    limit = range_positive_deg if angle_deg > 0 else range_negative_deg
    usable = limit - dead_zone_deg
    if usable <= 0:
        # Limite degenerado (menor que a própria zona morta): satura em vez de
        # dividir por zero (M26).
        return math.copysign(1.0, angle_deg)
    normalized = (magnitude - dead_zone_deg) / usable
    scaled = _shape(normalized, sensitivity)
    return math.copysign(min(1.0, scaled), angle_deg)


def pointing_to_axes(
    alpha: object,
    beta: object,
    gamma: object,
    offset: tuple[float | None, float, float] = (0.0, 0.0, 0.0),
    ranges: object = None,
    dead_zone_yaw_deg: float = config.DEAD_ZONE_YAW_DEG,
    dead_zone_pitch_deg: float = config.DEAD_ZONE_PITCH_DEG,
    sensitivity_yaw: float = config.SENSITIVITY_YAW,
    sensitivity_pitch: float = config.SENSITIVITY_PITCH,
) -> tuple[float, float]:
    """Converte a orientação (graus) na posição apontada (x, y) ∈ [-1, 1]².

    Sentido normativo (F4.6): ponta para a DIREITA ⇒ x > 0; LEVANTAR a ponta
    ⇒ y > 0. ``gamma`` (rolagem) é aceito pelo contrato do protocolo, mas não
    altera a direção da ponta (F4.7) — ver docstring do módulo.

    ``offset`` é a orientação de calibração ``(alpha0, beta0, gamma0)``; o
    centro calibrado vira (0, 0) e absorve o zero arbitrário de alpha (F5).
    ``ranges`` é o perfil de alcances por direção (F12); ausente ⇒
    ``DEFAULT_RANGE_DEG`` nas quatro.

    Função PURA da amostra atual + calibração: nenhum estado, nenhuma
    dependência do que veio antes (F4.3/M19) — a propriedade que a
    implementação por velocidade viola.

    Degradação documentada (M8b/F4.4): com ``alpha`` nulo/inválido (sensor sem
    yaw) — na amostra ou na calibração — o eixo horizontal fica em 0.0 e o
    vertical continua funcional. ``beta`` inválido produz saída neutra (0, 0).
    Nunca exceção nem valor fora de [-1, 1].
    """
    angles = pointing_angles(alpha, beta, gamma, offset)
    if angles is None:
        return (0.0, 0.0)
    yaw_right, pitch_up = angles
    limits = resolve_ranges(ranges)

    x = _axis_value(
        yaw_right,
        dead_zone_yaw_deg,
        limits["left"],
        limits["right"],
        sensitivity_yaw,
    )
    y = _axis_value(
        pitch_up,
        dead_zone_pitch_deg,
        limits["down"],
        limits["up"],
        sensitivity_pitch,
    )
    return (min(1.0, max(-1.0, x)), min(1.0, max(-1.0, y)))


@dataclass(frozen=True)
class SmoothingResult:
    """Saída observável do filtro (F4 "Observabilidade obrigatória", M22b).

    Sem estes campos, "o filtro está adaptando?" só teria resposta lendo estado
    interno da implementação — e a regressão mais provável desta frente
    (estimar velocidade de um jeito que o ruído aciona) seria invisível para a
    suíte, porque a saída sozinha não a denuncia.

    São valores de DIAGNÓSTICO: não trafegam no protocolo.
    """

    axes: tuple[float, float]
    alpha_x: float
    alpha_y: float
    speed_x_dps: float
    speed_y_dps: float


class _SpeedWindow:
    """Velocidade angular por DESLOCAMENTO LÍQUIDO numa janela (F4).

    Guarda ``(t_ms, valor_em_graus)`` e estima
    ``|valor_atual - valor_mais_antigo_da_janela| / duração_da_janela``.

    POR QUE NÃO É A DIFERENÇA ENTRE AMOSTRAS CONSECUTIVAS (proibição
    normativa): ruído de média zero produz diferenças instantâneas grandes e
    deslocamento líquido ~nulo. Com o estimador por amostra consecutiva, o
    tremor seria lido como movimento rápido e o filtro se desligaria justamente
    quando é necessário — o efeito exatamente invertido, e o defeito que M22b
    existe para pegar.

    O valor ATUAL entra na conta diretamente (não uma média das últimas
    amostras), para que um degrau seja detectado já na amostra do degrau, como
    M20/M22b exigem.
    """

    def __init__(self, window_ms: float) -> None:
        self._window_ms = max(1.0, float(window_ms))
        self._samples: deque[tuple[float, float]] = deque()

    def push(self, t_ms: float, value_deg: float) -> float:
        """Registra a amostra e devolve a velocidade estimada em °/s."""
        self._samples.append((t_ms, value_deg))
        # Mantém uma amostra ANTERIOR ao início da janela para que a janela
        # esteja sempre coberta; sem isso a base de tempo encolhe a cada
        # descarte e a velocidade estimada infla.
        while len(self._samples) > 2 and (t_ms - self._samples[1][0]) >= self._window_ms:
            self._samples.popleft()
        oldest_t, oldest_value = self._samples[0]
        elapsed_ms = t_ms - oldest_t
        if elapsed_ms <= 0.0:
            # Primeira amostra, timestamp repetido ou regredindo: sem base de
            # tempo utilizável, a velocidade é 0 (regime "parado"), que filtra
            # forte. Nunca divide por zero nem produz NaN (M28).
            return 0.0
        return abs(value_deg - oldest_value) / (elapsed_ms / 1000.0)

    def reset(self) -> None:
        self._samples.clear()


class AdaptiveSmoother:
    """Filtro exponencial com fator ADAPTATIVO por velocidade (F4, M20–M22b).

    Um fator único obriga a escolher entre mira estável parada (KPI-7) e
    resposta rápida em movimento (KPI-17). Aqui o fator é função da velocidade
    do sinal ANGULAR de entrada, por eixo:

    - abaixo de ``SMOOTH_SPEED_LOW_DPS``  ⇒ ``SMOOTH_ALPHA_STILL`` (filtra forte);
    - acima de ``SMOOTH_SPEED_HIGH_DPS``  ⇒ ``SMOOTH_ALPHA_FAST`` (quase desligado);
    - entre os dois limiares ⇒ interpolação linear.

    A suavização é TRANSIENTE e não altera o modelo absoluto: com a entrada
    constante a saída converge para o valor não suavizado, de modo que "mesma
    orientação ⇒ mesma posição" (KPI-16/M22) continua valendo em regime.

    Com ``adaptive=False`` o filtro volta ao fator fixo ``SMOOTHING_ALPHA``,
    que é o desligamento isolado da frente 2 (F15/M27).
    """

    def __init__(
        self,
        alpha: float = config.SMOOTHING_ALPHA,
        adaptive: bool = config.ADAPTIVE_SMOOTHING_ENABLED,
        speed_window_ms: float = config.SMOOTH_SPEED_WINDOW_MS,
        speed_low_dps: float = config.SMOOTH_SPEED_LOW_DPS,
        speed_high_dps: float = config.SMOOTH_SPEED_HIGH_DPS,
        alpha_still: float = config.SMOOTH_ALPHA_STILL,
        alpha_fast: float = config.SMOOTH_ALPHA_FAST,
    ) -> None:
        self._fixed_alpha = min(0.999, max(0.0, float(alpha)))
        self._adaptive = bool(adaptive)
        self._speed_low = float(speed_low_dps)
        self._speed_high = float(speed_high_dps)
        self._alpha_still = min(0.999, max(0.0, float(alpha_still)))
        self._alpha_fast = min(0.999, max(0.0, float(alpha_fast)))
        self._state: tuple[float, float] | None = None
        self._window_x = _SpeedWindow(speed_window_ms)
        self._window_y = _SpeedWindow(speed_window_ms)
        self._last_t_ms: float | None = None

    def _alpha_for(self, speed_dps: float) -> float:
        """Fator de retenção para a velocidade estimada (interpolação linear)."""
        if not self._adaptive:
            return self._fixed_alpha
        if speed_dps <= self._speed_low:
            return self._alpha_still
        if speed_dps >= self._speed_high:
            return self._alpha_fast
        span = self._speed_high - self._speed_low
        if span <= 0:
            return self._alpha_fast
        ratio = (speed_dps - self._speed_low) / span
        return self._alpha_still + (self._alpha_fast - self._alpha_still) * ratio

    def _timebase(self, t_ms: float | None, arrival_ms: float | None) -> float:
        """Base de tempo confiável para a janela de velocidade (M28).

        Usa ``t`` da mensagem `motion` quando ele é utilizável; cai para o
        tempo de CHEGADA quando ``t`` está ausente, não é monotônico ou salta
        mais que ``MOTION_DT_MAX_JUMP_MS`` — sem exceção e sem congelar o
        filtro.
        """
        fallback = arrival_ms if arrival_ms is not None else (self._last_t_ms or 0.0) + 1.0
        candidate = _sanitize_angle(t_ms)
        if candidate is None:
            chosen = fallback
        elif self._last_t_ms is not None and (
            candidate <= self._last_t_ms
            or (candidate - self._last_t_ms) > config.MOTION_DT_MAX_JUMP_MS
        ):
            chosen = fallback
        else:
            chosen = candidate
        if self._last_t_ms is not None and chosen <= self._last_t_ms:
            # Nem o fallback é monotônico (relógio de chegada repetido): avança
            # o mínimo para não zerar a base de tempo da janela.
            chosen = self._last_t_ms + 1.0
        self._last_t_ms = chosen
        return chosen

    def apply(
        self,
        axes: tuple[float, float],
        angles_deg: tuple[float, float] | None = None,
        t_ms: float | None = None,
        arrival_ms: float | None = None,
    ) -> SmoothingResult:
        """Aplica o filtro e devolve o par suavizado + fator e velocidade.

        ``angles_deg`` é o sinal de entrada em GRAUS (``yaw_right``,
        ``pitch_up``), usado só para estimar a velocidade — os limiares são em
        °/s. Sem ele, o filtro opera com o fator de "parado".
        """
        timestamp = self._timebase(t_ms, arrival_ms)
        if angles_deg is None:
            speed_x = speed_y = 0.0
        else:
            speed_x = self._window_x.push(timestamp, angles_deg[0])
            speed_y = self._window_y.push(timestamp, angles_deg[1])

        alpha_x = self._alpha_for(speed_x)
        alpha_y = self._alpha_for(speed_y)

        if self._state is None:
            self._state = axes
            return SmoothingResult(axes, alpha_x, alpha_y, speed_x, speed_y)

        prev_x, prev_y = self._state
        x = alpha_x * prev_x + (1.0 - alpha_x) * axes[0]
        y = alpha_y * prev_y + (1.0 - alpha_y) * axes[1]
        self._state = (x, y)
        return SmoothingResult((x, y), alpha_x, alpha_y, speed_x, speed_y)

    def reset(self) -> None:
        """Descarta o estado (recalibração/reconexão) — sem arrasto (M16c)."""
        self._state = None
        self._window_x.reset()
        self._window_y.reset()
        self._last_t_ms = None


# Nome preservado para compatibilidade com os consumidores existentes: o filtro
# continua sendo uma média exponencial, o que mudou é o fator ser adaptativo.
ExponentialSmoother = AdaptiveSmoother


def combine_rumble(low: float, high: float) -> float:
    """Combina os dois motores XInput em uma intensidade única [0, 1] (F8).

    Fórmula: máximo dos dois motores, saturados individualmente. Monotônica
    em cada motor; (0,0)→0.0 e (1,1)→1.0 (M13).
    """
    safe_low = min(1.0, max(0.0, _sanitize_angle(low) or 0.0))
    safe_high = min(1.0, max(0.0, _sanitize_angle(high) or 0.0))
    return max(safe_low, safe_high)


def clamp_rumble(intensity: object, duration_ms: object) -> tuple[float, int]:
    """Satura intensidade para [0, 1] e duração para >= 0 sem exceção (M14)."""
    safe_intensity = _sanitize_angle(intensity)
    if safe_intensity is None:
        safe_intensity = 0.0
    safe_duration = _sanitize_angle(duration_ms)
    if safe_duration is None:
        safe_duration = 0.0
    return (min(1.0, max(0.0, safe_intensity)), max(0, int(safe_duration)))
