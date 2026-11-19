// Drawing only: the world's state and the current screen in, pixels out. The
// camera shows a 1280x720 window of the city, scaled to fit the browser
// window; the HUD is drawn in the same 1280x720 space so it reads the same
// at any window size. Flat shapes and canvas text only — no images.
import { FONT, PALETTE, VIEW, WATER_Y, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const MINIMAP = { x: 1044, y: 546, w: 200, h: 150 };
const STAR = '★';

function litWindow(building, col, row) {
  const h = (building.seed + col * 7 + row * 13) % 5;
  return h < 2;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawWorld(state) {
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const cam = state.camera;
    context.setTransform(scale, 0, 0, scale, canvas.width / 2 - cam.x * scale, canvas.height / 2 - cam.y * scale);
    const viewLeft = cam.x - VIEW.width / 2 - 60;
    const viewRight = cam.x + VIEW.width / 2 + 60;
    const viewTop = cam.y - VIEW.height / 2 - 60;
    const viewBottom = cam.y + VIEW.height / 2 + 60;
    const city = state.city;

    // Ground and water.
    context.fillStyle = PALETTE.grass;
    context.fillRect(viewLeft, viewTop, viewRight - viewLeft, viewBottom - viewTop);
    context.fillStyle = PALETTE.water;
    context.fillRect(viewLeft, WATER_Y, viewRight - viewLeft, WORLD.height - WATER_Y);
    context.strokeStyle = PALETTE.waterDeep;
    context.lineWidth = 2;
    for (let y = WATER_Y + 24; y < WORLD.height; y += 48) {
      const wobble = Math.sin(state.time * 1.2 + y * 0.05) * 8;
      context.beginPath();
      context.moveTo(viewLeft, y + wobble);
      context.lineTo(viewRight, y - wobble);
      context.stroke();
    }

    // Park, docks and roads.
    const park = city.places.park;
    context.fillStyle = PALETTE.park;
    context.fillRect(park.x - 260, park.y - 260, 520, 520);
    for (const pier of city.piers) {
      context.fillStyle = PALETTE.dock;
      context.fillRect(pier.x, pier.y, pier.w, pier.h);
    }
    context.fillStyle = PALETTE.road;
    for (const rx of [320, 960, 1600, 2240]) context.fillRect(rx - 48, 0, 96, WATER_Y);
    for (const ry of [320, 960, 1600]) context.fillRect(0, ry - 48, WORLD.width, 96);
    context.strokeStyle = PALETTE.lane;
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    for (const rx of [320, 960, 1600, 2240]) {
      context.beginPath();
      context.moveTo(rx, 0);
      context.lineTo(rx, WATER_Y);
      context.stroke();
    }
    for (const ry of [320, 960, 1600]) {
      context.beginPath();
      context.moveTo(0, ry);
      context.lineTo(WORLD.width, ry);
      context.stroke();
    }
    context.setLineDash([]);

    // Trees.
    for (const tree of city.trees) {
      if (tree.x < viewLeft || tree.x > viewRight || tree.y < viewTop || tree.y > viewBottom) continue;
      context.fillStyle = '#2c6b31';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4c8a4f';
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.7, 0, Math.PI * 2);
      context.fill();
    }

    // Buildings: a darker side offset down-right, then the roof and windows.
    for (const b of city.buildings) {
      if (b.x + b.w < viewLeft || b.x > viewRight || b.y + b.h < viewTop || b.y > viewBottom) continue;
      context.fillStyle = b.side;
      context.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.w, b.h);
      const cellW = b.w / b.cols;
      const cellH = b.h / b.rows;
      for (let row = 0; row < b.rows; row += 1) {
        for (let col = 0; col < b.cols; col += 1) {
          context.fillStyle = litWindow(b, col, row) ? PALETTE.windowLit : PALETTE.windowDark;
          context.fillRect(b.x + 6 + col * cellW, b.y + 6 + row * cellH, cellW - 10, cellH - 10);
        }
      }
      if (b.name === 'hospital') {
        context.fillStyle = '#e5534b';
        context.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 4, 28, 8);
        context.fillRect(b.x + b.w / 2 - 4, b.y + b.h / 2 - 14, 8, 28);
      }
      if (b.name === 'station') {
        context.fillStyle = '#ffffff';
        text('POLICE', b.x + b.w / 2, b.y + b.h / 2 + 6, 20, '#ffffff', 'center', true);
      }
    }

    // Waypoint beacon.
    const waypoint = state.missions.state.waypoint;
    if (waypoint) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      context.save();
      context.translate(waypoint.x, waypoint.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.waypoint;
      const s = 16 * pulse;
      context.fillRect(-s / 2, -s / 2, s, s);
      context.restore();
      context.strokeStyle = 'rgba(255, 210, 63, 0.5)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(waypoint.x, waypoint.y, 34 + Math.sin(state.time * 5) * 6, 0, Math.PI * 2);
      context.stroke();
      text(waypoint.label, waypoint.x, waypoint.y - 44, 18, PALETTE.waypoint, 'center', true);
    }

    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < viewLeft || ped.x > viewRight || ped.y < viewTop || ped.y > viewBottom) continue;
      if (ped.state === 'down') {
        context.fillStyle = '#5d6d7e';
        context.beginPath();
        context.ellipse(ped.x, ped.y, 14, 7, ped.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.fillStyle = ped.kind === 'cop' ? '#1f3a93' : ped.color;
      context.beginPath();
      context.arc(ped.x, ped.y, 11, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ped.x, ped.y, 11, 0, Math.PI * 2);
      context.stroke();
      if (ped.kind === 'cop') {
        context.fillStyle = '#ffffff';
        context.font = font(11, true);
        context.textAlign = 'center';
        context.fillText('P', ped.x, ped.y + 4);
      }
    }

    // Cars.
    for (const car of state.cars) {
      if (car.x < viewLeft || car.x > viewRight || car.y < viewTop || car.y > viewBottom) continue;
      drawCar(car, state);
    }

    // The player on foot.
    const player = state.player;
    if (!player.inCar) {
      if (player.invulnerable <= 0 || Math.floor(state.time * 12) % 2 === 0) {
        context.fillStyle = PALETTE.player;
        context.beginPath();
        context.arc(player.x, player.y, 13, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = PALETTE.playerOutline;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(player.x, player.y, 13, 0, Math.PI * 2);
        context.stroke();
        context.strokeStyle = PALETTE.player;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(player.x, player.y);
        context.lineTo(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20);
        context.stroke();
      }
    }

    // Bullets and particles.
    context.strokeStyle = '#ffd23f';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - Math.cos(b.angle) * 10, b.y - Math.sin(b.angle) * 10);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    context.strokeStyle = '#ff6b5e';
    for (const b of state.copBullets) {
      context.beginPath();
      context.moveTo(b.x - Math.cos(b.angle) * 10, b.y - Math.sin(b.angle) * 10);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
  }

  function drawCar(car, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const isPolice = car.driver === 'police';
    const isPlayer = car.driver === 'player';
    context.fillStyle = isPolice ? '#dfe6ee' : car.color;
    context.fillRect(-27, -13, 54, 26);
    context.fillStyle = 'rgba(20, 28, 40, 0.85)';
    context.fillRect(-8, -11, 18, 22);
    context.fillStyle = isPolice ? '#2f6fd0' : 'rgba(255, 255, 255, 0.25)';
    context.fillRect(8, -11, 12, 22);
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(25, -11, 3, 6);
    context.fillRect(25, 5, 3, 6);
    if (isPolice) {
      const phase = Math.floor(state.time * 6 + (car.sirenPhase || 0)) % 2 === 0;
      context.fillStyle = phase ? '#ff3b30' : '#2f6fd0';
      context.fillRect(-4, -13, 8, 6);
      context.fillStyle = phase ? '#2f6fd0' : '#ff3b30';
      context.fillRect(-4, 7, 8, 6);
    }
    if (isPlayer) {
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 3;
      context.strokeRect(-27, -13, 54, 26);
    }
    context.restore();
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    context.fillStyle = PALETTE.panel;
    context.fillRect(m.x - 6, m.y - 6, m.w + 12, m.h + 12);
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.strokeRect(m.x - 6, m.y - 6, m.w + 12, m.h + 12);
    context.fillStyle = '#22303a';
    context.fillRect(m.x, m.y, m.w, m.h);
    context.fillStyle = '#1d4e6b';
    context.fillRect(m.x, m.y + WATER_Y * sy, m.w, m.h - WATER_Y * sy);
    context.fillStyle = '#3a4149';
    for (const rx of [320, 960, 1600, 2240]) context.fillRect(m.x + rx * sx - 2, m.y, 4, WATER_Y * sy);
    for (const ry of [320, 960, 1600]) context.fillRect(m.x, m.y + ry * sy - 2, m.w, 4);
    context.fillStyle = '#4c8a4f';
    const park = state.city.places.park;
    context.fillRect(m.x + (park.x - 260) * sx, m.y + (park.y - 260) * sy, 520 * sx, 520 * sy);
    const waypoint = state.missions.state.waypoint;
    if (waypoint) {
      context.fillStyle = PALETTE.waypoint;
      context.save();
      context.translate(m.x + waypoint.x * sx, m.y + waypoint.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-5, -5, 10, 10);
      context.restore();
    }
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      context.fillStyle = '#ff3b30';
      context.beginPath();
      context.arc(m.x + car.x * sx, m.y + car.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    const player = state.player;
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.arc(m.x + player.x * sx, m.y + player.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    // The viewport rectangle.
    const cam = state.camera;
    context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    context.lineWidth = 1;
    context.strokeRect(
      m.x + (cam.x - VIEW.width / 2) * sx,
      m.y + (cam.y - VIEW.height / 2) * sy,
      VIEW.width * sx,
      VIEW.height * sy,
    );
    text('MERIDIAN BAY', m.x + m.w / 2, m.y + m.h + 20, 13, PALETTE.muted, 'center', true);
  }

  function drawHud(state, best) {
    const player = state.player;
    const missions = state.missions;
    context.fillStyle = PALETTE.panel;
    context.fillRect(16, 14, 300, 44);
    context.strokeStyle = PALETTE.panelBorder;
    context.strokeRect(16, 14, 300, 44);
    text(`$${player.cash.toLocaleString('en-US')}`, 30, 44, 26, PALETTE.gold, 'left', true);
    const barX = 170;
    const barW = 130;
    context.fillStyle = '#20262f';
    context.fillRect(barX, 26, barW, 14);
    context.fillStyle = player.health > 30 ? PALETTE.health : PALETTE.healthLow;
    context.fillRect(barX, 26, barW * (player.health / 100), 14);
    text('HP', barX - 8, 40, 13, PALETTE.muted, 'right', true);

    // Wanted stars.
    text(STAR.repeat(state.wanted) || '—', VIEW.width - 24, 48, 34, PALETTE.red, 'right', true);
    if (state.wanted > 0) text('WANTED', VIEW.width - 24, 72, 14, PALETTE.red, 'right', true);

    // Mission objective.
    const objective = missions.text();
    context.fillStyle = PALETTE.panel;
    const objW = Math.min(680, 40 + objective.length * 9.5);
    context.fillRect((VIEW.width - objW) / 2, 14, objW, 40);
    context.strokeStyle = PALETTE.panelBorder;
    context.strokeRect((VIEW.width - objW) / 2, 14, objW, 40);
    text(objective, VIEW.width / 2, 41, 19, PALETTE.text, 'center', true);
    const timer = missions.state.timer;
    if (timer > 0 && missions.current()) {
      text(`${Math.ceil(timer)}s`, VIEW.width / 2, 66, 16, timer < 20 ? PALETTE.red : PALETTE.muted, 'center', true);
    }

    // Mission banner, on its own dark panel so it reads over any street.
    const banner = missions.state.banner;
    if (banner && state.elapsed < missions.state.bannerUntil) {
      context.font = font(30, true);
      const banW = Math.min(900, context.measureText(banner).width + 48);
      context.fillStyle = PALETTE.panel;
      context.fillRect((VIEW.width - banW) / 2, 100, banW, 48);
      context.strokeStyle = PALETTE.panelBorder;
      context.strokeRect((VIEW.width - banW) / 2, 100, banW, 48);
      text(banner, VIEW.width / 2, 130, 30, PALETTE.gold, 'center', true);
    }

    // Speed when driving.
    if (player.inCar) {
      const kmh = Math.round(Math.abs(player.inCar.speed) * 0.36);
      text(`${kmh} km/h`, 30, VIEW.height - 24, 26, PALETTE.text, 'left', true);
      text('W/S drive · A/D steer · E exit', 30, VIEW.height - 52, 15, PALETTE.muted, 'left');
    } else {
      text('WASD move · Shift run · E enter car · Space shoot · P pause · M mute', 30, VIEW.height - 24, 15, PALETTE.muted, 'left');
    }
    drawMinimap(state);
    void best;
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 170 + lines.length * 34;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 74, 46, accent || PALETTE.text, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 126 + i * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 36, 22, PALETTE.gold, 'center', true);
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e14';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawWorld(state);
    // HUD space: the same 1280x720 coordinates at any window size.
    context.setTransform(canvas.width / VIEW.width, 0, 0, canvas.height / VIEW.height, 0, 0);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8, 11, 18, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel(
        'STREET HEAT',
        [
          'Meridian Bay — an open-world crime game',
          'Explore the city on foot and by car. Outrun the police. Run the jobs.',
          'WASD move · E steal a car · Space shoot · Shift run · P pause',
          best > 0 ? `Best cash: $${best.toLocaleString('en-US')}` : 'Your first run starts downtown.',
        ],
        'Press Enter or click to start',
        PALETTE.gold,
      );
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city will wait for you.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED!', [`The police caught you. Fine: $${100}.`, 'Your heat is gone — for now.'], 'Press Enter to get out', PALETTE.red);
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`You woke up at St. Meridian Hospital. Bill: $${150}.`, 'Your heat is gone — for now.'], 'Press Enter to get out', PALETTE.red);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
