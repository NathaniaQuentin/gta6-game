// Keyboard and pointer input. Held keys give the move and drive axes; one-shot
// presses (start, pause, enter a car, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never
// counted twice. Space is both shoot (held) and confirm: the loop only reads
// confirm on the screens where it applies.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);
const SHOOT = new Set(['Space']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;

  function press(event) {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    }
    if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    }
    if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    }
    if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || RUN.has(event.code) || CONFIRM.has(event.code) || PAUSE.has(event.code)
      || ENTER.has(event.code) || MUTE.has(event.code) || SHOOT.has(event.code)) {
      held.add(event.code);
      press(event);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: drop everything.
  window.addEventListener('blur', () => {
    held.clear();
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function hasAny(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** The move axes for this frame: mx, my in -1..1, run, throttle, steer. */
    axes() {
      const mx = (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0);
      const my = (hasAny(DOWN) ? 1 : 0) - (hasAny(UP) ? 1 : 0);
      return {
        mx,
        my,
        run: hasAny(RUN),
        throttle: (hasAny(UP) ? 1 : 0) - (hasAny(DOWN) ? 1 : 0),
        steer: (hasAny(RIGHT) ? 1 : 0) - (hasAny(LEFT) ? 1 : 0),
        shoot: hasAny(SHOOT),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drop every held key (used when a screen starts, so a held Space fires nothing). */
    clearHeld() {
      held.clear();
      actions = 0;
    },
  };
}
