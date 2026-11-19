// The mission chain: four jobs that take the player across Meridian Bay, then
// free roam. Each mission names its waypoint and its win and fail conditions;
// the world calls update() every step and start hooks when a mission begins.
// Only rules here — the world owns the player, the police and the cash.
import { MISSIONS } from './config.js';

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createMissions(places) {
  const state = {
    index: 0,
    stage: 0,
    timer: 0,
    waypoint: null,
    done: false,
    banner: '',
    bannerUntil: 0,
  };

  function current() {
    return MISSIONS[state.index] || null;
  }

  function setWaypoint(point, label) {
    state.waypoint = point ? { x: point.x, y: point.y, label } : null;
  }

  /** Begin the current mission, including any setup it needs in the world. */
  function begin(world) {
    const mission = current();
    if (!mission) {
      state.done = true;
      state.waypoint = null;
      return;
    }
    state.stage = 0;
    state.timer = mission.timeLimit;
    if (mission.id === 'hot-wheels') {
      setWaypoint(null, '');
    } else if (mission.id === 'the-drop') {
      setWaypoint(places.docks, 'Docks');
    } else if (mission.id === 'heat') {
      world.wanted = Math.max(world.wanted, 2);
      setWaypoint(places.hideout, 'Hideout');
    } else if (mission.id === 'payday') {
      setWaypoint(places.park, 'Cash');
    }
  }

  function complete(world) {
    const mission = current();
    if (!mission) return [];
    world.player.cash += mission.reward;
    state.banner = `${mission.name} complete — +$${mission.reward}`;
    state.bannerUntil = world.elapsed + 3;
    state.index += 1;
    if (state.index >= MISSIONS.length) {
      state.done = true;
      state.waypoint = null;
      return ['mission-complete', 'story-complete'];
    }
    begin(world);
    return ['mission-complete'];
  }

  function fail(world) {
    const mission = current();
    if (!mission) return [];
    state.banner = `${mission.name} failed — try again`;
    state.bannerUntil = world.elapsed + 3;
    begin(world);
    return ['mission-failed'];
  }

  /** Advance the current mission one step; returns event names for the caller. */
  function update(world, dt) {
    const mission = current();
    if (!mission || state.done) return [];
    if (mission.timeLimit > 0) {
      state.timer -= dt;
      if (state.timer <= 0) return fail(world);
    }
    const player = world.player;
    if (mission.id === 'hot-wheels') {
      if (player.inCar) return complete(world);
      return [];
    }
    if (mission.id === 'the-drop') {
      if (distance(player.x, player.y, places.docks.x, places.docks.y) < 80) return complete(world);
      return [];
    }
    if (mission.id === 'heat') {
      if (world.wanted === 0) return complete(world);
      return [];
    }
    if (mission.id === 'payday') {
      if (state.stage === 0) {
        if (distance(player.x, player.y, places.park.x, places.park.y) < 60) {
          state.stage = 1;
          world.player.cash += 200;
          state.banner = 'Cash grabbed — +$200 — now reach the hideout';
          state.bannerUntil = world.elapsed + 3;
          setWaypoint(places.hideout, 'Hideout');
          return ['pickup-collected'];
        }
        return [];
      }
      if (distance(player.x, player.y, places.hideout.x, places.hideout.y) < 80) return complete(world);
      return [];
    }
    return [];
  }

  function text() {
    const mission = current();
    if (!mission) return 'Free roam — Meridian Bay is yours';
    return `${mission.name}: ${mission.text}`;
  }

  function reset() {
    state.index = 0;
    state.stage = 0;
    state.timer = 0;
    state.waypoint = null;
    state.done = false;
    state.banner = '';
    state.bannerUntil = 0;
  }

  return { state, current, begin, update, text, reset };
}
