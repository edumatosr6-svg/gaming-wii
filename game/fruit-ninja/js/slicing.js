// Detecção de corte — módulo PURO (X7). O corte é intersecção
// SEGMENTO x CÍRCULO entre dois passos, não teste de posição no passo atual:
// testar só a posição passa nos testes e falha no jogo (tunneling), que é
// justamente o caso de uso principal deste jogo.

/** Distância mínima da origem ao segmento A→B. */
export function segmentOriginDistance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { distance: Math.hypot(ax, ay), t: 0 };
  let t = -(ax * dx + ay * dy) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { distance: Math.hypot(cx, cy), t };
}

/** Velocidade do gesto, medida na tela e por passo fixo (F4, medida única). */
export function bladeSpeed(bladePrev, bladeCurr, dtS) {
  if (!(dtS > 0)) return 0;
  return Math.hypot(bladeCurr.x - bladePrev.x, bladeCurr.y - bladePrev.y) / dtS;
}

/**
 * Cortes de um passo fixo.
 *
 * `entities` são candidatos `{ id, radiusCss, prevPos, pos, state }`. O
 * segmento é avaliado no REFERENCIAL DA ENTIDADE (A = bladePrev - entPrev,
 * B = bladeCurr - entCurr): isso impede tunneling tanto por lâmina rápida
 * quanto por fruta rápida. Já a velocidade mínima é medida no referencial da
 * TELA, porque é o gesto do jogador que qualifica o corte.
 *
 * Devolve `SliceResult[]` ordenado por `entityId` crescente (F4.8).
 */
export function detectSlices(bladePrev, bladeCurr, entities, dtS, config) {
  if (!(dtS > 0)) return [];
  const speed = bladeSpeed(bladePrev, bladeCurr, dtS);
  // Comparação inclusiva: exatamente no limiar corta (F4, regra de borda).
  if (speed < config.minSliceSpeedCssPerS) return [];

  const dirRad = Math.atan2(bladeCurr.y - bladePrev.y, bladeCurr.x - bladePrev.x);
  const results = [];

  for (const entity of entities) {
    if (entity.state !== 'active') continue; // cortada/perdida nunca volta a ser testada
    const ax = bladePrev.x - entity.prevPos.x;
    const ay = bladePrev.y - entity.prevPos.y;
    const bx = bladeCurr.x - entity.pos.x;
    const by = bladeCurr.y - entity.pos.y;
    const closest = segmentOriginDistance(ax, ay, bx, by);
    // Inclusiva: tangência conta como corte.
    if (closest.distance > entity.radiusCss) continue;
    const relX = ax + (bx - ax) * closest.t;
    const relY = ay + (by - ay) * closest.t;
    results.push({
      entityId: entity.id,
      point: { x: entity.pos.x + relX, y: entity.pos.y + relY },
      dirRad,
    });
  }

  results.sort((left, right) => left.entityId - right.entityId);
  return results;
}
