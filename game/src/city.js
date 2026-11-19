// The city of Meridian Bay, built once from a seed: a road grid, blocks of
// buildings, a park, a hospital, a police station and the harbour docks. The
// same seed always builds the same city, so every run and every screenshot
// shows the same streets. Only data and geometry here — no drawing.
import { PALETTE, ROAD_WIDTH, ROAD_X, ROAD_Y, WATER_Y, WORLD } from './config.js';
import { randomInt, randomPick } from './random.js';

const ROOFS = [
  { roof: PALETTE.buildingRoof, side: PALETTE.buildingSide },
  { roof: PALETTE.buildingRoof2, side: PALETTE.buildingSide2 },
  { roof: PALETTE.buildingRoof3, side: PALETTE.buildingSide3 },
];

/** The blocks between the roads, as [x0, y0, x1, y1] in world units. A block runs from the far edge of the road on one side to the near edge of the road on the other, so no building ever stands on a road: the old bounds ran to the far edge of each neighbouring road, and lots laid out across that overlap put building corners on the road centre line, where cars wedged. */
function blockRects() {
  const rights = [...ROAD_X.map((x) => x - ROAD_WIDTH / 2), WORLD.width];
  const bottoms = [...ROAD_Y.map((y) => y - ROAD_WIDTH / 2), WATER_Y];
  const lefts = [0, ...ROAD_X.map((x) => x + ROAD_WIDTH / 2)];
  const tops = [0, ...ROAD_Y.map((y) => y + ROAD_WIDTH / 2)];
  const rects = [];
  for (let row = 0; row < tops.length; row += 1) {
    for (let col = 0; col < lefts.length; col += 1) {
      rects.push({ x0: lefts[col], y0: tops[row], x1: rights[col], y1: bottoms[row], col, row });
    }
  }
  return rects;
}

/** A point is on a road when it sits within half a road width of a road line. */
export function isRoad(x, y) {
  if (y >= WATER_Y) return false;
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= ROAD_WIDTH / 2) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= ROAD_WIDTH / 2) return true;
  return false;
}

/** The nearest point on a road centre line to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < bestD) {
      bestD = d;
      best = { x: rx, y: Math.max(0, Math.min(WATER_Y - ROAD_WIDTH, y)) };
    }
  }
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < bestD) {
      bestD = d;
      best = { x: Math.max(0, Math.min(WORLD.width, x)), y: ry };
    }
  }
  return best;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const piers = [];
  const parkedSpots = [];
  const rects = blockRects();

  // Named places, by block (col, row): the park, the hospital, the police
  // station and the docks are fixed so missions can point at them by name.
  const parkBlock = rects.find((r) => r.col === 1 && r.row === 1);
  const hospitalBlock = rects.find((r) => r.col === 3 && r.row === 1);
  const stationBlock = rects.find((r) => r.col === 2 && r.row === 2);
  const docksBlock = rects.find((r) => r.col === 2 && r.row === 3);

  for (const rect of rects) {
    const isPark = rect === parkBlock;
    const isDocks = rect === docksBlock;
    if (isPark) {
      for (let i = 0; i < 26; i += 1) {
        trees.push({
          x: rect.x0 + 30 + random() * (rect.x1 - rect.x0 - 60),
          y: rect.y0 + 30 + random() * (rect.y1 - rect.y0 - 60),
          r: 12 + random() * 10,
        });
      }
      continue;
    }
    if (isDocks) {
      for (let i = 0; i < 4; i += 1) {
        piers.push({ x: rect.x0 + 40 + i * 130, y: rect.y1 - 10, w: 60, h: 90 });
      }
      continue;
    }
    // Ordinary blocks hold a 2x2 lot of buildings, each with its own roof.
    // The margin keeps buildings clear of the parking strip along the road
    // edge (parked cars sit 22 units past the road edge and are 20 in
    // radius): with a 26 margin a building could reach the strip and wedge
    // a car pulling out.
    const margin = 48;
    const lotW = (rect.x1 - rect.x0 - margin * 3) / 2;
    const lotH = (rect.y1 - rect.y0 - margin * 3) / 2;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const lotX = rect.x0 + margin + col * (lotW + margin);
        const lotY = rect.y0 + margin + row * (lotH + margin);
        const w = lotW * (0.62 + random() * 0.26);
        const h = lotH * (0.62 + random() * 0.26);
        const x = lotX + (lotW - w) / 2;
        const y = lotY + (lotH - h) / 2;
        const style = randomPick(random, ROOFS);
        buildings.push({
          x, y, w, h,
          roof: style.roof,
          side: style.side,
          cols: Math.max(2, Math.floor(w / 34)),
          rows: Math.max(2, Math.floor(h / 30)),
          seed: randomInt(random, 0, 100000),
        });
      }
    }
  }

  // The hospital and the police station are big named buildings on their blocks.
  const hospital = {
    x: hospitalBlock.x0 + 90, y: hospitalBlock.y0 + 70,
    w: hospitalBlock.x1 - hospitalBlock.x0 - 180, h: hospitalBlock.y1 - hospitalBlock.y0 - 140,
    roof: '#e8e4da', side: '#b9b4a6', cols: 8, rows: 5, seed: 7, name: 'hospital',
  };
  const station = {
    x: stationBlock.x0 + 90, y: stationBlock.y0 + 70,
    w: stationBlock.x1 - stationBlock.x0 - 180, h: stationBlock.y1 - stationBlock.y0 - 140,
    roof: '#2f6fd0', side: '#234e92', cols: 8, rows: 5, seed: 21, name: 'station',
  };
  buildings.push(hospital, station);

  // Parked cars sit along the road edges, clear of the intersections.
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      if (random() < 0.75) {
        parkedSpots.push({ x: rx + ROAD_WIDTH / 2 + 22, y: ry + 130 + random() * 120, angle: Math.PI / 2 });
      }
      if (random() < 0.75) {
        parkedSpots.push({ x: rx - ROAD_WIDTH / 2 - 22, y: ry - 130 - random() * 120, angle: -Math.PI / 2 });
      }
    }
  }

  const places = {
    park: { x: (parkBlock.x0 + parkBlock.x1) / 2, y: (parkBlock.y0 + parkBlock.y1) / 2, name: 'Meridian Park' },
    docks: { x: (docksBlock.x0 + docksBlock.x1) / 2, y: docksBlock.y1 - 40, name: 'South Docks' },
    hospital: { x: hospital.x + hospital.w / 2, y: hospital.y + hospital.h + 40, name: 'St. Meridian Hospital' },
    station: { x: station.x + station.w / 2, y: station.y + station.h + 40, name: 'Central Police Station' },
    hideout: { x: (parkBlock.x0 + parkBlock.x1) / 2, y: parkBlock.y1 - 60, name: 'Hideout' },
    start: { x: 960, y: 960 + ROAD_WIDTH / 2 + 30, name: 'Downtown' },
  };

  /** Push a circle out of every building and the water; returns true on a hit. */
  function collideCircle(pos, radius) {
    let hit = false;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(pos.y, b.y + b.h));
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        hit = true;
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.y = cy + (dy / d) * radius;
        } else {
          pos.y = b.y - radius;
        }
      }
    }
    if (pos.y > WATER_Y - radius) {
      pos.y = WATER_Y - radius;
      hit = true;
    }
    pos.x = Math.max(radius, Math.min(WORLD.width - radius, pos.x));
    pos.y = Math.max(radius, Math.min(WORLD.height - radius, pos.y));
    return hit;
  }

  /** True when a circle of `radius` at (x, y) touches a building or the water. */
  function hitsSolid(x, y, radius) {
    if (y + radius > WATER_Y) return true;
    for (const b of buildings) {
      if (x + radius > b.x && x - radius < b.x + b.w && y + radius > b.y && y - radius < b.y + b.h) return true;
    }
    return false;
  }

  return {
    width: WORLD.width,
    height: WORLD.height,
    buildings,
    trees,
    piers,
    parkedSpots,
    places,
    isRoad,
    nearestRoadPoint,
    collideCircle,
    hitsSolid,
  };
}
