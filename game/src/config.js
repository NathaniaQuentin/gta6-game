// Every tuning number, colour and name in one place, so the rest of the game
// reads like the design and the balance can be tuned without touching rules.
// The city is a fixed 2560x1920 map; the renderer shows a 1280x720 window of it.

export const GAME_TITLE = 'Street Heat';
export const CITY_NAME = 'Meridian Bay';

/** The city map, in world units. Roads run on a 640-unit grid. */
export const WORLD = { width: 2560, height: 1920 };
export const ROAD_WIDTH = 96;
export const ROAD_X = [320, 960, 1600, 2240];
export const ROAD_Y = [320, 960, 1600];
/** The harbour water along the south edge; the docks sit on its north bank. */
export const WATER_Y = 1792;

/** The camera's logical view: the renderer scales this to the window. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 340,
  accel: 1800,
  health: 100,
  fireCooldown: 0.28,
  bulletSpeed: 780,
  bulletRange: 520,
};

export const CAR = {
  length: 54,
  width: 26,
  radius: 20,
  topSpeed: 560,
  reverseSpeed: 180,
  accel: 420,
  brake: 700,
  steer: 2.6,
  grip: 3.2,
};

export const TRAFFIC = {
  count: 26,
  speedMin: 140,
  speedMax: 210,
  followGap: 90,
  respawnMargin: 120,
};

export const PED = {
  count: 42,
  walkMin: 38,
  walkMax: 68,
  fleeSpeed: 150,
  radius: 11,
};

export const POLICE = {
  carTopSpeed: 520,
  carAccel: 460,
  maxCars: 5,
  footSpeed: 200,
  bustDistance: 34,
  bustSeconds: 1.5,
  shootAtWanted: 3,
  shootRange: 420,
  shootCooldown: 1.1,
  bulletSpeed: 640,
  bulletDamage: 8,
  ramDamage: 12,
};

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  shootCop: 1,
  shootPed: 1,
  quietSeconds: 15,
  decaySeconds: 14,
  bustFine: 100,
  wastedFine: 150,
};

export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    text: 'Steal a car — walk up to one and press E',
    reward: 100,
    timeLimit: 0,
  },
  {
    id: 'the-drop',
    name: 'The Drop',
    text: 'Drive to the docks marker',
    reward: 250,
    timeLimit: 120,
  },
  {
    id: 'heat',
    name: 'Heat',
    text: 'Lose the heat — get your wanted level to zero',
    reward: 400,
    timeLimit: 0,
  },
  {
    id: 'payday',
    name: 'Payday',
    text: 'Grab the cash at the park, then reach the hideout',
    reward: 600,
    timeLimit: 150,
  },
];

export const START_CASH = 250;

export const PALETTE = {
  grass: '#3f7d44',
  park: '#4c8a4f',
  sidewalk: '#9aa0a8',
  road: '#33373f',
  roadEdge: '#565c66',
  lane: '#c8b45a',
  water: '#1d4e6b',
  waterDeep: '#173f57',
  dock: '#8a6f4d',
  buildingRoof: '#6b5d4f',
  buildingRoof2: '#5d6b7a',
  buildingRoof3: '#7a5d5d',
  buildingSide: '#4a4238',
  buildingSide2: '#424c58',
  buildingSide3: '#584545',
  windowLit: '#f2c94c',
  windowDark: '#2c3440',
  player: '#f2c94c',
  playerOutline: '#8a6d1f',
  cop: '#2f6fd0',
  copLight: '#ff3b30',
  trafficColors: ['#c0392b', '#2874a6', '#7d8a96', '#b9770e', '#6c3483', '#1e8449', '#a93226', '#2e86c1'],
  pedColors: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#e67e22', '#1abc9c'],
  text: '#f2f4f6',
  muted: '#aab2bd',
  gold: '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
  panel: 'rgba(12, 16, 24, 0.78)',
  panelBorder: 'rgba(255, 255, 255, 0.16)',
  waypoint: '#ffd23f',
  health: '#58d68d',
  healthLow: '#e5534b',
  night: 'rgba(10, 14, 26, 0.12)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'street-heat.meridian-bay.save';
export const BEST_KEY = 'street-heat.meridian-bay.best';
