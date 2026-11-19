// The game's rules and state, with no drawing and no browser in it: the player
// on foot and in cars, traffic, pedestrians, police, the wanted level, health,
// cash and missions. step() advances one fixed step and returns what happened
// as bit flags, so the caller can react (sounds, screens, saves) without the
// world knowing about screens or sound. Nothing here allocates after
// createWorld returns, except the small particle and bullet pools' reuse.
import { CAR, PED, PLAYER, POLICE, ROAD_WIDTH, ROAD_X, ROAD_Y, START_CASH, TRAFFIC, WANTED, WORLD } from './config.js';
import { createCity } from './city.js';
import { createMissions } from './missions.js';
import { randomPick } from './random.js';

export const EVENT_PICKUP = 1;
export const EVENT_CRIME = 2;
export const EVENT_CRASH = 4;
export const EVENT_SHOT = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_MISSION = 64;
export const EVENT_STORY = 128;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * Math.min(1, t);
}

export function createWorld(random) {
  const city = createCity(random);
  const missions = createMissions(city.places);

  const player = {
    x: 0, y: 0, angle: 0, vx: 0, vy: 0,
    health: PLAYER.health, cash: START_CASH,
    inCar: null, fireCooldown: 0, bustTimer: 0, invulnerable: 0,
  };
  const cars = [];
  const peds = [];
  const bullets = [];
  const copBullets = [];
  const particles = [];

  const state = {
    city,
    missions,
    player,
    cars,
    peds,
    bullets,
    copBullets,
    particles,
    wanted: 0,
    crimeTimer: 99,
    decayTimer: 0,
    elapsed: 0,
    time: 0,
    camera: { x: 0, y: 0 },
  };

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const sp = speed * (0.4 + random() * 0.8);
      particles.push({
        x, y,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        life: 0.4 + random() * 0.4,
        maxLife: 0.8,
        color,
        size: 2 + random() * 3,
      });
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
  }

  function makeTrafficCar() {
    const vertical = random() < 0.5;
    const dir = random() < 0.5 ? 1 : -1;
    let x;
    let y;
    let angle;
    if (vertical) {
      const rx = randomPick(random, ROAD_X);
      x = rx + dir * (ROAD_WIDTH / 4);
      y = dir === 1 ? -40 : WORLD.height + 40;
      angle = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = randomPick(random, ROAD_Y);
      y = ry + dir * (ROAD_WIDTH / 4);
      x = dir === 1 ? -40 : WORLD.width + 40;
      angle = dir === 1 ? 0 : Math.PI;
    }
    return {
      x, y, angle,
      speed: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      targetSpeed: 0,
      color: randomPick(random, ['#c0392b', '#2874a6', '#7d8a96', '#b9770e', '#6c3483', '#1e8449', '#a93226', '#2e86c1']),
      driver: 'traffic',
      vertical, dir,
      turnCooldown: 1 + random() * 2,
    };
  }

  function makePed() {
    const x = 60 + random() * (WORLD.width - 120);
    const y = 60 + random() * (WORLD.height - 120);
    return {
      x, y,
      angle: random() * Math.PI * 2,
      speed: PED.walkMin + random() * (PED.walkMax - PED.walkMin),
      color: randomPick(random, ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#e67e22', '#1abc9c']),
      kind: 'ped',
      state: 'walk',
      stateTimer: 1 + random() * 3,
      downTimer: 0,
    };
  }

  function makeCopCar() {
    const spot = city.nearestRoadPoint(
      player.x + (random() - 0.5) * 1200,
      player.y + (random() - 0.5) * 1200,
    );
    return {
      x: clamp(spot.x, 60, WORLD.width - 60),
      y: clamp(spot.y, 60, WORLD.height - 60),
      angle: 0,
      speed: 0,
      targetSpeed: 0,
      color: '#2f6fd0',
      driver: 'police',
      vertical: false,
      dir: 1,
      turnCooldown: 0,
      sirenPhase: random() * Math.PI * 2,
    };
  }

  function makeFootCop() {
    const angle = random() * Math.PI * 2;
    const d = 240 + random() * 120;
    return {
      x: clamp(player.x + Math.cos(angle) * d, 40, WORLD.width - 40),
      y: clamp(player.y + Math.sin(angle) * d, 40, WORLD.height - 40),
      angle: 0,
      speed: POLICE.footSpeed,
      shootTimer: 1 + random(),
      kind: 'cop',
    };
  }

  function addWanted(amount) {
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.crimeTimer = 0;
    state.decayTimer = 0;
  }

  function damagePlayer(amount) {
    if (player.invulnerable > 0) return false;
    player.health -= amount;
    player.invulnerable = 0.6;
    if (player.health <= 0) {
      player.health = 0;
      return true;
    }
    return false;
  }

  function nearestCar(maxDist, policeOk) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.driver === 'player') continue;
      if (car.driver === 'police' && !policeOk) continue;
      const d = dist(player.x, player.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function reset() {
    const start = city.places.start;
    player.x = start.x;
    player.y = start.y;
    player.angle = -Math.PI / 2;
    player.vx = 0;
    player.vy = 0;
    player.health = PLAYER.health;
    player.cash = START_CASH;
    player.inCar = null;
    player.fireCooldown = 0;
    player.bustTimer = 0;
    player.invulnerable = 0;
    cars.length = 0;
    peds.length = 0;
    bullets.length = 0;
    copBullets.length = 0;
    particles.length = 0;
    state.wanted = 0;
    state.crimeTimer = 99;
    state.decayTimer = 0;
    state.elapsed = 0;
    state.time = 0;
    for (let i = 0; i < TRAFFIC.count; i += 1) cars.push(makeTrafficCar());
    for (const spot of city.parkedSpots) {
      cars.push({
        x: spot.x, y: spot.y, angle: spot.angle, speed: 0, targetSpeed: 0,
        color: randomPick(random, ['#c0392b', '#2874a6', '#7d8a96', '#b9770e', '#6c3483', '#1e8449']),
        driver: 'parked', vertical: false, dir: 1, turnCooldown: 0,
      });
    }
    for (let i = 0; i < PED.count; i += 1) peds.push(makePed());
    missions.reset();
    missions.begin(state);
    state.camera.x = player.x;
    state.camera.y = player.y;
  }

  function stepTraffic(dt) {
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      if (car.driver !== 'traffic') continue;
      car.turnCooldown -= dt;
      const ahead = car.vertical ? car.y + car.dir * TRAFFIC.followGap : car.x + car.dir * TRAFFIC.followGap;
      let blocked = false;
      for (const other of cars) {
        if (other === car || other.driver === 'parked') continue;
        const d = car.vertical
          ? Math.abs(other.x - car.x) < 30 && (other.y - car.y) * car.dir > 0 && (other.y - car.y) * car.dir < TRAFFIC.followGap
          : Math.abs(other.y - car.y) < 30 && (other.x - car.x) * car.dir > 0 && (other.x - car.x) * car.dir < TRAFFIC.followGap;
        if (d) {
          blocked = true;
          break;
        }
      }
      const speed = blocked ? 0 : car.speed;
      if (car.vertical) {
        car.y += car.dir * speed * dt;
        if (car.turnCooldown <= 0) {
          for (const ry of ROAD_Y) {
            if (Math.abs(car.y - ry) < 8 && random() < 0.06) {
              car.vertical = false;
              car.y = ry + (random() < 0.5 ? 1 : -1) * (ROAD_WIDTH / 4);
              car.dir = random() < 0.5 ? 1 : -1;
              car.angle = car.dir === 1 ? 0 : Math.PI;
              car.turnCooldown = 2;
              break;
            }
          }
        }
        if (car.y < -80 || car.y > WORLD.height + 80) cars[i] = makeTrafficCar();
      } else {
        car.x += car.dir * speed * dt;
        if (car.turnCooldown <= 0) {
          for (const rx of ROAD_X) {
            if (Math.abs(car.x - rx) < 8 && random() < 0.06) {
              car.vertical = true;
              car.x = rx + (random() < 0.5 ? 1 : -1) * (ROAD_WIDTH / 4);
              car.dir = random() < 0.5 ? 1 : -1;
              car.angle = car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
              car.turnCooldown = 2;
              break;
            }
          }
        }
        if (car.x < -80 || car.x > WORLD.width + 80) cars[i] = makeTrafficCar();
      }
      void ahead;
    }
  }

  function stepPeds(dt) {
    for (const ped of peds) {
      // Foot police move in stepPolice, not here.
      if (ped.kind === 'cop') continue;
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          ped.state = 'flee';
          ped.stateTimer = 3;
        }
        continue;
      }
      const fleeing = ped.state === 'flee';
      const speed = fleeing ? PED.fleeSpeed : ped.speed;
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) {
        ped.stateTimer = 1.5 + random() * 2.5;
        if (fleeing) {
          ped.state = 'walk';
        } else {
          ped.angle = random() * Math.PI * 2;
        }
      }
      if (fleeing) {
        ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);
      }
      const nx = ped.x + Math.cos(ped.angle) * speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * speed * dt;
      if (!city.hitsSolid(nx, ny, PED.radius)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.angle += Math.PI / 2;
      }
      ped.x = clamp(ped.x, 20, WORLD.width - 20);
      ped.y = clamp(ped.y, 20, WORLD.height - 20);
    }
  }

  function stepPolice(dt) {
    const wantCars = Math.min(state.wanted, POLICE.maxCars);
    let copCars = 0;
    for (const car of cars) if (car.driver === 'police') copCars += 1;
    while (copCars < wantCars) {
      cars.push(makeCopCar());
      copCars += 1;
    }
    const wantFoot = state.wanted >= 2 ? state.wanted - 1 : 0;
    let foot = 0;
    for (const ped of peds) if (ped.kind === 'cop') foot += 1;
    while (foot < wantFoot) {
      peds.push(makeFootCop());
      foot += 1;
    }
    // Prune the force as the heat dies down, furthest first.
    if (copCars > wantCars) {
      let removed = 0;
      for (let i = cars.length - 1; i >= 0 && removed < copCars - wantCars; i -= 1) {
        if (cars[i].driver === 'police') {
          cars.splice(i, 1);
          removed += 1;
        }
      }
    }
    if (foot > wantFoot) {
      let removed = 0;
      for (let i = peds.length - 1; i >= 0 && removed < foot - wantFoot; i -= 1) {
        if (peds[i].kind === 'cop') {
          peds.splice(i, 1);
          removed += 1;
        }
      }
    }

    for (const car of cars) {
      if (car.driver !== 'police') continue;
      car.sirenPhase += dt * 6;
      const target = Math.atan2(player.y - car.y, player.x - car.x);
      car.angle = angleLerp(car.angle, target, 2.4 * dt);
      const d = dist(car.x, car.y, player.x, player.y);
      car.speed = d > 70 ? Math.min(POLICE.carTopSpeed, car.speed + POLICE.carAccel * dt) : Math.max(0, car.speed - 500 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      const pos = { x: car.x, y: car.y };
      if (city.collideCircle(pos, CAR.radius)) {
        car.x = pos.x;
        car.y = pos.y;
        car.speed *= 0.4;
      }
      car.x = clamp(car.x, 30, WORLD.width - 30);
      car.y = clamp(car.y, 30, WORLD.height - 30);
    }

    for (const ped of peds) {
      if (ped.kind !== 'cop') continue;
      const d = dist(ped.x, ped.y, player.x, player.y);
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      if (d > POLICE.bustDistance) {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        const pos = { x: ped.x, y: ped.y };
        city.collideCircle(pos, PED.radius);
        ped.x = pos.x;
        ped.y = pos.y;
      }
      ped.shootTimer -= dt;
      if (state.wanted >= POLICE.shootAtWanted && d < POLICE.shootRange && ped.shootTimer <= 0 && !player.inCar) {
        ped.shootTimer = POLICE.shootCooldown + random() * 0.6;
        const spread = (random() - 0.5) * 0.3;
        copBullets.push({
          x: ped.x, y: ped.y,
          angle: ped.angle + spread,
          dist: 0,
        });
      }
    }
  }

  function stepBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += Math.cos(b.angle) * PLAYER.bulletSpeed * dt;
      b.y += Math.sin(b.angle) * PLAYER.bulletSpeed * dt;
      b.dist += PLAYER.bulletSpeed * dt;
      let dead = b.dist > PLAYER.bulletRange;
      if (!dead) {
        for (const ped of peds) {
          if (ped.state === 'down') continue;
          if (dist(b.x, b.y, ped.x, ped.y) < PED.radius + 4) {
            spawnParticles(b.x, b.y, '#e5534b', 8, 120);
            ped.state = 'down';
            ped.downTimer = 6;
            if (ped.kind === 'cop') addWanted(WANTED.shootCop);
            else addWanted(WANTED.shootPed);
            dead = true;
            break;
          }
        }
      }
      if (!dead && city.hitsSolid(b.x, b.y, 2)) {
        spawnParticles(b.x, b.y, '#c8b45a', 5, 100);
        dead = true;
      }
      if (dead) bullets.splice(i, 1);
    }
    for (let i = copBullets.length - 1; i >= 0; i -= 1) {
      const b = copBullets[i];
      b.x += Math.cos(b.angle) * POLICE.bulletSpeed * dt;
      b.y += Math.sin(b.angle) * POLICE.bulletSpeed * dt;
      b.dist += POLICE.bulletSpeed * dt;
      let dead = b.dist > 600;
      if (!dead && dist(b.x, b.y, player.x, player.y) < PLAYER.radius + 4 && !player.inCar) {
        if (damagePlayer(POLICE.bulletDamage)) return 'wasted';
        spawnParticles(b.x, b.y, '#e5534b', 6, 100);
        dead = true;
      }
      if (!dead && city.hitsSolid(b.x, b.y, 2)) dead = true;
      if (dead) copBullets.splice(i, 1);
    }
    return null;
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function stepPlayer(dt, input) {
    const car = player.inCar;
    if (car) {
      const forward = Math.cos(car.angle);
      const right = Math.sin(car.angle);
      const speedAlong = car.speed;
      if (input.throttle > 0) car.speed = Math.min(CAR.topSpeed, car.speed + CAR.accel * dt);
      else if (input.throttle < 0) {
        car.speed = car.speed > 20 ? Math.max(0, car.speed - CAR.brake * dt) : Math.max(-CAR.reverseSpeed, car.speed - CAR.accel * 0.6 * dt);
      } else {
        car.speed *= Math.max(0, 1 - 0.5 * dt);
        if (Math.abs(car.speed) < 4) car.speed = 0;
      }
      const steerAmount = input.steer * CAR.steer * clamp(Math.abs(car.speed) / 200, 0, 1) * (car.speed < 0 ? -1 : 1);
      car.angle += steerAmount * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const pos = { x: nx, y: ny };
      const hitWall = city.collideCircle(pos, CAR.radius);
      if (hitWall && Math.abs(car.speed) > 260) {
        spawnParticles(car.x, car.y, '#f2c94c', 10, 160);
        if (damagePlayer(10)) return EVENT_WASTED;
      }
      if (hitWall) car.speed *= -0.25;
      car.x = pos.x;
      car.y = pos.y;
      void forward;
      void right;
      void speedAlong;
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Running over a pedestrian in a car is a crime.
      for (const ped of peds) {
        if (ped.state === 'down' || ped.kind === 'cop') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < CAR.radius + PED.radius) {
          ped.state = 'down';
          ped.downTimer = 6;
          spawnParticles(ped.x, ped.y, '#e5534b', 10, 140);
          addWanted(WANTED.hitPed);
        }
      }
      // Bumping other cars.
      for (const other of cars) {
        if (other === car || other.driver === 'parked') continue;
        if (dist(car.x, car.y, other.x, other.y) < CAR.radius + CAR.radius - 6) {
          const rel = Math.abs(car.speed - other.speed);
          if (rel > 120) {
            spawnParticles((car.x + other.x) / 2, (car.y + other.y) / 2, '#f2c94c', 12, 180);
            if (other.driver === 'police' && damagePlayer(POLICE.ramDamage)) return EVENT_WASTED;
            if (rel > 260) {
              other.speed = car.speed * 0.4;
              car.speed *= 0.5;
            }
          }
          const push = (CAR.radius * 2 - dist(car.x, car.y, other.x, other.y)) / 2;
          const away = Math.atan2(car.y - other.y, car.x - other.x);
          car.x += Math.cos(away) * push;
          car.y += Math.sin(away) * push;
        }
      }
      return 0;
    }

    // On foot: accelerate toward the move direction, face it, collide with walls.
    const mx = input.mx;
    const my = input.my;
    const moving = mx !== 0 || my !== 0;
    const targetSpeed = moving ? (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
    const len = Math.sqrt(mx * mx + my * my) || 1;
    const wantVx = (mx / len) * targetSpeed;
    const wantVy = (my / len) * targetSpeed;
    player.vx += clamp(wantVx - player.vx, -PLAYER.accel * dt, PLAYER.accel * dt);
    player.vy += clamp(wantVy - player.vy, -PLAYER.accel * dt, PLAYER.accel * dt);
    if (moving) player.angle = Math.atan2(player.vy, player.vx);
    const pos = { x: player.x + player.vx * dt, y: player.y + player.vy * dt };
    city.collideCircle(pos, PLAYER.radius);
    player.x = pos.x;
    player.y = pos.y;
    if (player.invulnerable > 0) player.invulnerable -= dt;

    // Shooting on foot.
    player.fireCooldown -= dt;
    if (input.shoot && player.fireCooldown <= 0) {
      player.fireCooldown = PLAYER.fireCooldown;
      bullets.push({ x: player.x + Math.cos(player.angle) * 18, y: player.y + Math.sin(player.angle) * 18, angle: player.angle, dist: 0 });
      spawnParticles(player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22, '#ffd23f', 4, 90);
      return EVENT_SHOT;
    }
    return 0;
  }

  /**
   * One fixed step. `input` carries the move direction, driving and one-shot
   * presses; with `attract` set the world idles as a title-screen backdrop
   * (traffic and pedestrians move, nobody commits crimes, no police).
   */
  function step(dt, input, attract) {
    let events = 0;
    state.elapsed += dt;
    state.time += dt;
    stepTraffic(dt);
    stepPeds(dt);
    stepParticles(dt);
    if (attract) {
      state.camera.x += 26 * dt;
      if (state.camera.x > WORLD.width - 700) state.camera.x = 700;
      state.camera.y = 960;
      return 0;
    }

    state.crimeTimer += dt;
    if (state.wanted > 0 && state.crimeTimer > WANTED.quietSeconds) {
      state.decayTimer += dt;
      if (state.decayTimer >= WANTED.decaySeconds) {
        state.decayTimer = 0;
        state.wanted -= 1;
      }
    }

    // Entering and leaving cars.
    if (input.enter) {
      if (player.inCar) {
        const car = player.inCar;
        car.driver = 'parked';
        car.speed = 0;
        player.inCar = null;
        const side = { x: car.x + Math.cos(car.angle + Math.PI / 2) * 34, y: car.y + Math.sin(car.angle + Math.PI / 2) * 34 };
        if (!city.hitsSolid(side.x, side.y, PLAYER.radius)) {
          player.x = side.x;
          player.y = side.y;
        } else {
          player.x = car.x - Math.cos(car.angle + Math.PI / 2) * 34;
          player.y = car.y - Math.sin(car.angle + Math.PI / 2) * 34;
        }
        player.vx = 0;
        player.vy = 0;
      } else {
        const car = nearestCar(64, false);
        if (car) {
          car.driver = 'player';
          player.inCar = car;
          player.x = car.x;
          player.y = car.y;
          // Taking any car that is not yours is a theft, parked or not.
          addWanted(WANTED.stealCar);
          events |= EVENT_CRIME;
        }
      }
    }

    const playerEvents = stepPlayer(dt, input);
    if (playerEvents & EVENT_WASTED) return EVENT_WASTED;
    events |= playerEvents;

    const bulletResult = stepBullets(dt);
    if (bulletResult === 'wasted') return EVENT_WASTED;

    stepPolice(dt);

    // A foot cop close by for long enough busts the player.
    let copNear = false;
    for (const ped of peds) {
      if (ped.kind !== 'cop' || ped.state === 'down') continue;
      if (!player.inCar && dist(ped.x, ped.y, player.x, player.y) < POLICE.bustDistance) copNear = true;
    }
    if (copNear) {
      player.bustTimer += dt;
      if (player.bustTimer >= POLICE.bustSeconds) return EVENT_BUSTED;
    } else {
      player.bustTimer = 0;
    }

    const missionEvents = missions.update(state, dt);
    for (const name of missionEvents) {
      if (name === 'mission-complete') events |= EVENT_MISSION;
      else if (name === 'story-complete') events |= EVENT_STORY;
      else if (name === 'pickup-collected') events |= EVENT_PICKUP;
      else if (name === 'mission-failed') events |= EVENT_MISSION;
    }

    // The camera eases after the player (or their car).
    const tx = player.x;
    const ty = player.y;
    state.camera.x += (tx - state.camera.x) * Math.min(1, 4 * dt);
    state.camera.y += (ty - state.camera.y) * Math.min(1, 4 * dt);
    return events;
  }

  reset();
  return { state, city, missions, reset, step };
}
