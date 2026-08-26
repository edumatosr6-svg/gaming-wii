"""Janela móvel de métricas de latência (F11) — módulo puro, sem I/O.

Composição definida da métrica (software-specs.md, F11):
``latency_ms_* = net + proc`` onde ``net`` é RTT/2 do ping/pong e ``proc`` é
o tempo entre a chegada da mensagem `motion` e o retorno da atualização do
gamepad virtual. A latência por amostra é ``net_ms (corrente) + proc_i``;
percentis e jitter são calculados sobre essa série na janela.
"""

from __future__ import annotations

import math
import time
from collections import deque

from server import config


def percentile(samples: list[float], q: float) -> float:
    """Percentil por interpolação linear; 0.0 para lista vazia."""
    if not samples:
        return 0.0
    ordered = sorted(samples)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * q
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    if low == high:
        return ordered[low]
    frac = rank - low
    return ordered[low] * (1.0 - frac) + ordered[high] * frac


class MetricsWindow:
    """Acumula amostras de rede, processamento e taxa de motion.

    Sem custo no caminho crítico além de appends em deque (F11.2): nenhuma
    mensagem adicional é gerada por amostra — a leitura é puxada por
    ``GET /metrics``.
    """

    def __init__(self, window_size: int = config.METRICS_WINDOW_SIZE) -> None:
        self._net_ms: deque[float] = deque(maxlen=window_size)
        self._proc_ms: deque[float] = deque(maxlen=window_size)
        self._motion_times: deque[float] = deque(maxlen=window_size)

    def record_rtt(self, rtt_ms: float) -> None:
        """Registra um RTT do ping/pong; guarda RTT/2 como componente de rede."""
        if rtt_ms >= 0:
            self._net_ms.append(rtt_ms / 2.0)

    def record_processing(self, proc_ms: float) -> None:
        """Registra o tempo de processamento de uma amostra `motion`."""
        if proc_ms >= 0:
            self._proc_ms.append(proc_ms)

    def record_motion(self, now: float | None = None) -> None:
        """Registra a chegada de uma amostra `motion` (para a taxa em Hz)."""
        self._motion_times.append(now if now is not None else time.monotonic())

    def motion_rate_hz(self) -> float:
        """Taxa de amostras na janela (Hz)."""
        if len(self._motion_times) < 2:
            return 0.0
        span = self._motion_times[-1] - self._motion_times[0]
        if span <= 0:
            return 0.0
        return (len(self._motion_times) - 1) / span

    def snapshot(self) -> dict[str, float]:
        """Métricas correntes no formato do endpoint `GET /metrics` (F11.3)."""
        net = percentile(list(self._net_ms), 0.5)
        proc_samples = list(self._proc_ms)
        latency_samples = [net + p for p in proc_samples]
        if latency_samples:
            mean = sum(latency_samples) / len(latency_samples)
            variance = sum((s - mean) ** 2 for s in latency_samples) / len(latency_samples)
            jitter = math.sqrt(variance)
        else:
            jitter = 0.0
        return {
            "latency_ms_p50": percentile(latency_samples, 0.5),
            "latency_ms_p95": percentile(latency_samples, 0.95),
            "motion_rate_hz": self.motion_rate_hz(),
            "jitter_ms": jitter,
            "net_ms": net,
            "proc_ms": percentile(proc_samples, 0.5),
        }
