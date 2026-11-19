// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot (walk to the nearest car and steal it, then
// drive toward the mission waypoint), so the frame is what a short game
// really looks like and the same seed always gives the same frame.
import { CAR, ROAD_WIDTH, ROAD_X, ROAD_Y, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const DRIVE_SECONDS = 16;
const CHASE_SECONDS = 60;
const MISSION_LIMIT_SECONDS = 120;

const IDLE_INPUT = { mx: 0, my: 0, run: false, throttle: 0, steer: 0, enter: false, shoot: false };

function nearestCar(state) {
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.driver === 'player' || car.driver === 'police') continue;
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return { car: best, dist: bestD };
}

/**
 * True when a car can drive straight from `from` to `to` without touching a
 * building or the water: samples the segment every 40 units. Distance alone
 * does not prove it — the docks sit 500 units from a parking strip across a
 * whole city block, and a straight line there wedges the car on the station.
 */
function directPathClear(city, from, to) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(d / 40));
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    if (city.hitsSolid(x, y, CAR.radius)) return false;
  }
  return true;
}

/**
 * Where to aim the car to reach `goal` without cutting through buildings:
 * follow the road grid (Manhattan routing along the roads), except close to
 * the goal, where the final leg is open ground (docks, park, hideout) and a
 * straight line is safe.
 */
function roadTarget(state, goal) {
  const car = state.player.inCar;
  const city = state.city;
  if (Math.hypot(goal.x - car.x, goal.y - car.y) < 220) return goal;
  const goalRoad = city.nearestRoadPoint(goal.x, goal.y);
  const col = ROAD_X.find((rx) => Math.abs(car.x - rx) < ROAD_WIDTH / 2);
  const row = ROAD_Y.find((ry) => Math.abs(car.y - ry) < ROAD_WIDTH / 2);
  if (col === undefined && row === undefined) {
    // Off the roads in an open area (the park, the docks, the hideout): when
    // the straight line to the goal is clear it is in the same open area,
    // so drive straight at it instead of routing back out to a road.
    if (!city.isRoad(goal.x, goal.y) && directPathClear(city, car, goal)) return goal;
    return city.nearestRoadPoint(car.x, car.y);
  }
  if (col !== undefined && Math.abs(goalRoad.x - col) < 60) return goalRoad;
  if (row !== undefined && Math.abs(goalRoad.y - row) < 60) return goalRoad;
  const nearestRow = ROAD_Y.reduce((a, b) => (Math.abs(b - goalRoad.y) < Math.abs(a - goalRoad.y) ? b : a));
  const nearestCol = ROAD_X.reduce((a, b) => (Math.abs(b - goalRoad.x) < Math.abs(a - goalRoad.x) ? b : a));
  if (col !== undefined && row === undefined) return { x: col, y: nearestRow };
  if (row !== undefined && col === undefined) return { x: nearestCol, y: row };
  // At an intersection: take the leg that shortens the bigger gap.
  if (Math.abs(goalRoad.x - car.x) >= Math.abs(goalRoad.y - car.y)) return { x: nearestCol, y: row };
  return { x: col, y: nearestRow };
}

/**
 * Drive the player toward `target` (or the mission waypoint when none is
 * given): steal the nearest car on foot, then follow the roads toward it,
 * reversing out when stuck against a building.
 */
export function autopilot(state, target, stuck) {
  const player = state.player;
  if (!player.inCar) {
    const found = nearestCar(state);
    if (!found.car) return { ...IDLE_INPUT };
    const dx = found.car.x - player.x;
    const dy = found.car.y - player.y;
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    return {
      ...IDLE_INPUT,
      mx: dx / d,
      my: dy / d,
      run: true,
      enter: found.dist < 56,
    };
  }
  const car = player.inCar;
  const goal = target || state.missions.state.waypoint || { x: 1600, y: 960 };
  const aim = roadTarget(state, goal);
  const want = Math.atan2(aim.y - car.y, aim.x - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Backing out of a wedge: reverse straight, no steering, for a short burst.
  if (stuck.reversing > 0) {
    stuck.reversing -= STEP;
    return { ...IDLE_INPUT, throttle: -1, steer: 0 };
  }
  if (Math.abs(car.speed) < 25) {
    stuck.time += STEP;
  } else {
    stuck.time = 0;
  }
  if (stuck.time > 1.2) {
    stuck.time = 0;
    stuck.reversing = 0.9;
    return { ...IDLE_INPUT, throttle: -1, steer: 0 };
  }
  // Off the roads and far from an open-area goal: drive straight ahead until
  // back on a road — but only when a road is close (a parked car sits in the
  // strip just past the road edge, so straight ahead reaches the next
  // cross-road; in the docks the car faces the water and straight ahead just
  // presses it against the harbour). Otherwise route back out to a road.
  if (!state.city.isRoad(car.x, car.y)
    && !(directPathClear(state.city, car, goal) && !state.city.isRoad(goal.x, goal.y))) {
    const road = state.city.nearestRoadPoint(car.x, car.y);
    if (Math.hypot(road.x - car.x, road.y - car.y) < 100) {
      return { ...IDLE_INPUT, throttle: 1, steer: 0 };
    }
  }
  // Slow for the turn: at full speed a 90-degree turn overshoots the road
  // and wedges the car on the far building corner. Only where that matters —
  // on a road or close to one. In open ground (the park, the docks) a wide
  // turn at speed is harmless, and braking there just leaves the car too
  // slow to catch the pedestrians fleeing at 150.
  const speed = Math.abs(car.speed);
  let throttle = 1;
  const road = state.city.nearestRoadPoint(car.x, car.y);
  const nearRoad = state.city.isRoad(car.x, car.y)
    || Math.hypot(road.x - car.x, road.y - car.y) < 100;
  if (nearRoad && Math.abs(diff) > 0.6 && speed > 150) throttle = -1;
  else if (nearRoad && Math.abs(diff) > 0.35 && speed > 320) throttle = 0;
  // Slow for the intersection ahead: the aim point switches to the next leg
  // only once the car reaches it, so without this the car arrives at full
  // speed, overshoots the turn and ends up in the blocks past the corner.
  if (nearRoad && speed > 220) {
    for (const rx of ROAD_X) {
      for (const ry of ROAD_Y) {
        if (Math.hypot(rx - car.x, ry - car.y) < 280) throttle = -1;
      }
    }
  }
  return {
    ...IDLE_INPUT,
    throttle,
    steer: diff > 0.12 ? 1 : diff < -0.12 ? -1 : 0,
  };
}

/**
 * Set `world` to the named scene (start, drive, chase or mission; any other
 * name is start) and return the screen to draw over it and the cash to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const stuck = { time: 0, reversing: 0 };
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, IDLE_INPUT, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'drive') {
    for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state, null, stuck), false);
    }
    return { screen: SCREEN_PLAY, best: state.player.cash };
  }
  if (name === 'mission') {
    for (let i = 0; i < MISSION_LIMIT_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state, null, stuck), false);
      // Stop the moment the drop is delivered, while its banner still shows.
      if (state.missions.state.index >= 2) break;
    }
    return { screen: SCREEN_PLAY, best: state.player.cash };
  }
  // Chase: steal a car and run the mission route, which crosses the city at
  // speed and through the crowds — the steal and the pedestrians it clips
  // raise the heat, and the police pile on behind. (Driving the park
  // corners directly was tried: the car either orbited the centre too
  // slowly to catch a fleeing pedestrian or overshot the park altogether.)
  // Stop once the chase is properly hot and the car is moving, but not
  // before 25 s, so this frame is a later moment than the drive scene's.
  for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
    world.step(STEP, autopilot(state, null, stuck), false);
    const elapsed = i * STEP;
    const car = state.player.inCar;
    if (elapsed >= 25 && state.wanted >= 3 && car && Math.abs(car.speed) > 300) break;
  }
  return { screen: SCREEN_PLAY, best: state.player.cash };
}
