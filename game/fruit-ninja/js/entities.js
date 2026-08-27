// Frutas, bombas e metades — módulo PURO (X7). Toda a aleatoriedade vem de um
// PRNG com semente guardada no estado, porque os testes exigem determinismo
// (E1) e porque duas simulações com taxas de quadro diferentes precisam
// produzir os mesmos arremessos (E2/KPI-7).

// ---------------------------------------------------------------- PRNG puro

export function makeRng(seed) {
  return { seed: seed >>> 0 };
}

/** mulberry32: devolve o novo estado do gerador junto com o valor. */
export function nextFloat(rng) {
  const seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { rng: { seed }, value };
}

export function nextRange(rng, lo, hi) {
  const step = nextFloat(rng);
  return { rng: step.rng, value: lo + (hi - lo) * step.value };
}

// ------------------------------------------------------ limites do arremesso

/**
 * Faixa de velocidade vertical (medida na borda inferior do playfield) que
 * mantém o ápice dentro da tela e o tempo de voo acima de `minAirtimeS`.
 *
 * Por que a `launchSpeedRange` do nível é uma FRAÇÃO e não px/s: o ápice
 * admissível depende da altura do playfield, que muda com a janela. Fixar a
 * força em px/s faria F3.4 valer só na resolução em que foi ajustada.
 */
export function launchLimits(playfield, config) {
  const usableHeight = Math.max(playfield.height - config.apexMarginCss, 0);
  const vyBorderMax = Math.sqrt(2 * config.gravityCssPerS2 * usableHeight);
  const vyBorderMin = Math.min((config.gravityCssPerS2 * config.minAirtimeS) / 2, vyBorderMax);
  return { vyBorderMax, vyBorderMin };
}

/**
 * Sorteia posição horizontal, ângulo e força de um arremesso dentro das
 * faixas do nível corrente (F3, E6).
 */
export function computeLaunch(rng, levelParams, playfield, config) {
  const limits = launchLimits(playfield, config);

  const xStep = nextRange(rng, config.spawnXRange[0], config.spawnXRange[1]);
  const x = playfield.x + playfield.width * xStep.value;

  const angleStep = nextRange(
    xStep.rng,
    config.launchAngleRangeRad[0],
    config.launchAngleRangeRad[1],
  );
  const angleRad = angleStep.value;

  const speedStep = nextRange(
    angleStep.rng,
    levelParams.launchSpeedRange[0],
    levelParams.launchSpeedRange[1],
  );
  const speedFraction = speedStep.value;

  let vyBorder = speedFraction * limits.vyBorderMax;
  if (vyBorder < limits.vyBorderMin) vyBorder = limits.vyBorderMin;
  if (vyBorder > limits.vyBorderMax) vyBorder = limits.vyBorderMax;

  // A entidade nasce abaixo da borda: a velocidade no nascimento é maior que
  // a da borda pela energia ganha nesse trecho.
  const vy0 = Math.sqrt(vyBorder * vyBorder + 2 * config.gravityCssPerS2 * config.spawnBelowCss);
  const vx = vyBorder * Math.tan(angleRad);

  return {
    rng: speedStep.rng,
    launch: {
      x,
      angleRad,
      speedFraction,
      vyBorderCssPerS: vyBorder,
      speedCssPerS: Math.hypot(vx, vy0),
      pos: { x, y: playfield.y + playfield.height + config.spawnBelowCss },
      vel: { x: vx, y: -vy0 },
    },
  };
}

// ------------------------------------------------------------------ entidades

function radiusFor(kind, config) {
  return kind === 'bomb' ? config.bombRadiusCss : config.fruitRadiusCss;
}

/** Cria a entidade a partir de um arremesso já sorteado (ou de um teste). */
export function spawnAt(state, kind, pos, vel, config) {
  const id = state.nextEntityId;
  const colorStep = nextFloat(state.rng);
  const entity = {
    id,
    kind,
    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: vel.x, y: vel.y },
    radiusCss: radiusFor(kind, config),
    createdAtS: state.elapsedS,
    state: 'active',
    colorIndex: Math.floor(colorStep.value * config.fruitColors.length) % config.fruitColors.length,
  };
  return {
    state: {
      ...state,
      rng: colorStep.rng,
      nextEntityId: id + 1,
      entities: state.entities.concat([entity]),
      fruitsSpawned: kind === 'fruit' ? state.fruitsSpawned + 1 : state.fruitsSpawned,
    },
    id,
  };
}

export function activeCount(state) {
  return state.entities.filter((entity) => entity.state === 'active').length;
}

/** Limite de simultâneas (E10): atingido o teto, o arremesso é adiado. */
export function canSpawn(state, levelParams) {
  return activeCount(state) < levelParams.maxSimultaneous;
}

/** Sorteia o tipo e arremessa uma entidade no nível corrente. */
export function spawnFromLevel(state, levelParams, playfield, config) {
  const kindStep = nextFloat(state.rng);
  const kind = kindStep.value < levelParams.bombChance ? 'bomb' : 'fruit';
  const launchStep = computeLaunch(kindStep.rng, levelParams, playfield, config);
  const withRng = { ...state, rng: launchStep.rng };
  return spawnAt(withRng, kind, launchStep.launch.pos, launchStep.launch.vel, config);
}

function integrate(pos, vel, dtS, gravity) {
  // Integração exata para gravidade constante (p = p0 + v0*t + g*t^2/2): é o
  // que torna o resultado independente do tamanho do passo (E4/E2/KPI-7).
  return {
    pos: { x: pos.x + vel.x * dtS, y: pos.y + vel.y * dtS + 0.5 * gravity * dtS * dtS },
    vel: { x: vel.x, y: vel.y + gravity * dtS },
  };
}

/**
 * Avança um passo fixo de entidades e metades.
 *
 * Ordem: primeiro descarta o que já foi resolvido no passo anterior
 * (`sliced`/`missed`), depois integra, depois marca o que cruzou a borda
 * inferior descendo. Assim uma fruta perdida existe por exatamente um passo
 * no estado — tempo de as regras e o desenho a verem uma única vez (E7).
 */
export function stepEntities(state, dtS, config, playfield) {
  const gravity = config.gravityCssPerS2;
  const bottom = playfield.y + playfield.height;
  const missed = [];

  const entities = [];
  for (const entity of state.entities) {
    if (entity.state !== 'active') continue; // resolvida no passo anterior: sai agora
    const next = integrate(entity.pos, entity.vel, dtS, gravity);
    const moved = {
      ...entity,
      prevPos: { x: entity.pos.x, y: entity.pos.y },
      pos: next.pos,
      vel: next.vel,
    };
    if (moved.vel.y > 0 && moved.pos.y - moved.radiusCss > bottom) {
      moved.state = 'missed';
      missed.push({ id: moved.id, kind: moved.kind });
    }
    entities.push(moved);
  }

  const halves = [];
  for (const half of state.halves) {
    const next = integrate(half.pos, half.vel, dtS, gravity);
    const moved = {
      ...half,
      pos: next.pos,
      vel: next.vel,
      angleRad: half.angleRad + half.angularVelRadPerS * dtS,
    };
    const outside =
      moved.pos.y - moved.radiusCss > bottom ||
      moved.pos.x + moved.radiusCss < playfield.x ||
      moved.pos.x - moved.radiusCss > playfield.x + playfield.width;
    if (!outside) halves.push(moved);
  }

  return { state: { ...state, entities, halves }, missed };
}

/**
 * Substitui a fruta por duas metades (F3.6): elas herdam a velocidade da
 * fruta no instante do corte mais um impulso simétrico perpendicular à
 * direção do corte — a média vetorial das duas é a velocidade da fruta.
 */
export function sliceEntityById(state, entityId, dirRad, config) {
  const target = state.entities.find((entity) => entity.id === entityId);
  if (!target || target.state !== 'active') return state;

  const entities = state.entities.map((entity) =>
    entity.id === entityId ? { ...entity, state: 'sliced' } : entity,
  );

  let halves = state.halves;
  let nextHalfId = state.nextHalfId;
  if (target.kind === 'fruit') {
    const perpX = -Math.sin(dirRad);
    const perpY = Math.cos(dirRad);
    const impulse = config.halfImpulseCssPerS;
    const made = [1, -1].map((sign) => ({
      id: nextHalfId++,
      parentId: target.id,
      pos: { x: target.pos.x, y: target.pos.y },
      vel: { x: target.vel.x + perpX * impulse * sign, y: target.vel.y + perpY * impulse * sign },
      radiusCss: target.radiusCss,
      angleRad: dirRad,
      angularVelRadPerS: config.halfAngularVelRadPerS * sign,
      colorIndex: target.colorIndex,
      side: sign,
    }));
    halves = state.halves.concat(made);
  }

  return { ...state, entities, halves, nextHalfId };
}

/** Visão que `slicing.js` consome: só entidades ainda cortáveis. */
export function sliceCandidates(state) {
  return state.entities.filter((entity) => entity.state === 'active');
}
