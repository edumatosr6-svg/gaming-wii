// Mira absoluta (F10.7–F10.9, contrato com F4): a posição da mira é FUNÇÃO
// PURA da leitura atual do eixo (já normalizado pela camada de input) e da
// geometria da tela — nunca da posição anterior da mira. É proibido integrar
// o eixo como velocidade (`pos += eixo × ganho × dt`): mesma leitura ⇒ mesma
// posição, independentemente do histórico (KPI-16).

// Convenção do eixo de entrada (interna, F4): x positivo = direita,
// y positivo = CIMA. Coordenadas de tela do Canvas crescem para baixo, então
// y positivo do eixo produz y de tela MENOR que o centro (F10.9).
// (0, 0) ⇒ centro da área de jogo; ±1 ⇒ bordas correspondentes.
export function crosshairFromAxes(axisX, axisY, width, height) {
  const nx = Math.min(1, Math.max(-1, axisX));
  const ny = Math.min(1, Math.max(-1, axisY));
  return {
    x: ((nx + 1) / 2) * width,
    y: ((1 - ny) / 2) * height,
  };
}
