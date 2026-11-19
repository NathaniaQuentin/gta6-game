// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, busted and wasted. Progress (cash and mission) is kept in
// localStorage between visits.
//
// ?seed=N fixes the city and the traffic. ?shot=start|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, CAR, SAVE_KEY, STEP, WANTED } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED,
  EVENT_CRASH,
  EVENT_CRIME,
  EVENT_MISSION,
  EVENT_PICKUP,
  EVENT_SHOT,
  EVENT_STORY,
  EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { cash: 250, mission: 0, best: 0 };
    const save = JSON.parse(raw);
    return {
      cash: Number.isFinite(save.cash) ? save.cash : 250,
      mission: Number.isFinite(save.mission) ? save.mission : 0,
      best: Number.isFinite(save.best) ? save.best : 0,
    };
  } catch {
    return { cash: 250, mission: 0, best: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let best = Math.max(readBest(), save.best);
  let muted = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the changes.
  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    best = Math.max(best, world.state.player.cash);
    save = { cash: world.state.player.cash, mission: world.state.missions.state.index, best };
    writeSave(save);
    saveBest(best);
  }

  function startGame() {
    world.reset();
    const state = world.state;
    state.player.cash = save.cash;
    if (save.mission > 0 && save.mission < 4) {
      state.missions.state.index = save.mission;
      state.missions.begin(state);
    }
    input.clearHeld();
    audio.unlock();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing in Meridian Bay. Steal a car to start the first job.');
  }

  function respawn(place, fine) {
    const state = world.state;
    const player = state.player;
    if (player.inCar) {
      player.inCar.driver = 'parked';
      player.inCar.speed = 0;
      player.inCar = null;
    }
    player.x = place.x;
    player.y = place.y;
    player.vx = 0;
    player.vy = 0;
    player.health = 100;
    player.bustTimer = 0;
    player.invulnerable = 2;
    player.cash = Math.max(0, player.cash - fine);
    state.wanted = 0;
    state.crimeTimer = 99;
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.missions.begin(state);
    persist();
  }

  function handleEvents(events) {
    const state = world.state;
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) {
      audio.jingle();
      persist();
      announce(state.missions.text());
    }
    if (events & EVENT_STORY) {
      audio.jingle();
      announce('Story complete. Meridian Bay is yours.');
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      respawn(state.city.places.station, WANTED.bustFine);
      screen = SCREEN_BUSTED;
      announce(`Busted. Fine $${WANTED.bustFine}.`);
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      respawn(state.city.places.hospital, WANTED.wastedFine);
      screen = SCREEN_WASTED;
      announce(`Wasted. Hospital bill $${WANTED.wastedFine}.`);
    }
    void EVENT_CRIME;
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) {
      audio.click();
      startGame();
    } else if (actions & ACTION_CONFIRM && (screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      audio.click();
      input.clearHeld();
      screen = SCREEN_PLAY;
      announce('Back on the streets.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step(actions) {
    const state = world.state;
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, run: false, throttle: 0, steer: 0, enter: false, shoot: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const axes = input.axes();
    const events = world.step(STEP, {
      mx: axes.mx,
      my: axes.my,
      run: axes.run,
      throttle: axes.throttle,
      steer: axes.steer,
      enter: Boolean(actions & ACTION_ENTER),
      shoot: axes.shoot,
    }, false);
    handleEvents(events);
    const car = state.player.inCar;
    audio.engine(car ? Math.abs(car.speed) / CAR.topSpeed : 0);
    audio.siren(state.wanted > 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Take the one-shot presses once per frame and share them: the screens
    // handle confirm/pause/mute and the world handles enter-car.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // The one-shot presses belong to the first fixed step only: handing the
      // same enter-car press to every step of a frame would toggle it repeatedly.
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Street Heat, Meridian Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
