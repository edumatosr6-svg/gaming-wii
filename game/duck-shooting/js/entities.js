// Patos: spawn, trajetória e colisão (puro, testável, determinístico).
// Posições são calculadas analiticamente a partir da idade do pato — a
// física é idêntica sob qualquer taxa de quadros (F10.6, G11).

export const DUCK_RADIUS = 28; // raio da hitbox em unidades de mundo (px)
export const WORLD = { width: 960, height: 540 };
export const VEGETATION_BAND = 0.12; // faixa da base onde os patos surgem

// Gerador determinístico (mulberry32) — mesma semente, mesmas trajetórias (G12).
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cria os patos da leva a partir dos parâmetros da rodada (G7).
export function spawnDucks(params, rng, world = WORLD) {
  const ducks = [];
  for (let i = 0; i < params.duckCount; i += 1) {
    const speed = params.speedMin + rng() * (params.speedMax - params.speedMin);
    const startX = world.width * (0.1 + rng() * 0.8);
    const startY = world.height * (1 - VEGETATION_BAND * rng());
    const driftX = (rng() - 0.5) * speed * 0.6;
    ducks.push({
      id: i,
      spawn: { x: startX, y: startY },
      velocity: { x: driftX, y: -speed },
      wobble: {
        amplitude: params.wobbleAmplitude,
        frequency: params.wobbleFrequency * (0.7 + rng() * 0.6),
        phase: rng() * Math.PI * 2,
      },
      age: 0,
      alive: true,
      escaped: false,
    });
  }
  return ducks;
}

// Posição analítica do pato na idade atual (função pura da idade).
export function duckPosition(duck) {
  const { spawn, velocity, wobble, age } = duck;
  return {
    x:
      spawn.x +
      velocity.x * age +
      wobble.amplitude * Math.sin(wobble.frequency * age * Math.PI * 2 + wobble.phase),
    y: spawn.y + velocity.y * age,
  };
}

// Avança a simulação em dt segundos; marca escapes pelo topo (G8).
export function updateDucks(ducks, dt, world = WORLD) {
  return ducks.map((duck) => {
    if (!duck.alive || duck.escaped) {
      return duck;
    }
    const aged = { ...duck, age: duck.age + dt };
    const pos = duckPosition(aged);
    if (pos.y < -DUCK_RADIUS) {
      return { ...aged, escaped: true };
    }
    return aged;
  });
}

// Colisão de tiro (G9, G10): devolve o pato atingido ou null.
// Regra de borda: distância <= DUCK_RADIUS abate (limite INCLUSIVO).
// Sobreposição: abate exatamente um — o mais acima na ordem de desenho,
// isto é, o de MAIOR índice no array (desenhado por último) — determinístico.
export function findHit(ducks, x, y, radius = DUCK_RADIUS) {
  for (let i = ducks.length - 1; i >= 0; i -= 1) {
    const duck = ducks[i];
    if (!duck.alive || duck.escaped) {
      continue;
    }
    const pos = duckPosition(duck);
    const dx = pos.x - x;
    const dy = pos.y - y;
    if (Math.sqrt(dx * dx + dy * dy) <= radius) {
      return duck;
    }
  }
  return null;
}

// Marca um pato como abatido, devolvendo o novo array (imutável).
export function killDuck(ducks, duckId) {
  return ducks.map((duck) => (duck.id === duckId ? { ...duck, alive: false } : duck));
}

// A leva terminou quando nenhum pato segue vivo em voo.
export function waveFinished(ducks) {
  return ducks.every((duck) => !duck.alive || duck.escaped);
}
