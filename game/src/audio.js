// Every sound is synthesised with WebAudio — no audio files, no network.
// The context is created on the first user gesture, so browsers that need
// one never block the game, and every call is guarded so sound can never
// break the loop (headless runs included).
export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenLfo = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, volume, when) {
    if (!ensure()) return;
    try {
      const t0 = context.currentTime + (when || 0);
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(volume || 0.2, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, volume, lowFreq) {
    if (!ensure()) return;
    try {
      const t0 = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowFreq || 1200;
      const gain = context.createGain();
      gain.gain.value = volume || 0.3;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(t0);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    /** Call from a user gesture so the context is allowed to start. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** A continuous engine hum whose pitch follows the car's speed (0..1). */
    engine(speed01) {
      if (!ensure()) return;
      try {
        if (!engineOsc) {
          engineOsc = context.createOscillator();
          engineOsc.type = 'sawtooth';
          engineGain = context.createGain();
          engineGain.gain.value = 0;
          const filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 900;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, context.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0, context.currentTime, 0.1);
      } catch {
        // Sound is garnish: never let it break the game.
      }
    },
    /** The two-tone police siren, on while the player is wanted. */
    siren(on) {
      if (!ensure()) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = context.createOscillator();
          sirenOsc.type = 'triangle';
          sirenOsc.frequency.value = 750;
          sirenLfo = context.createOscillator();
          sirenLfo.type = 'square';
          sirenLfo.frequency.value = 1.6;
          const lfoGain = context.createGain();
          lfoGain.gain.value = 180;
          sirenLfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          sirenGain = context.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenLfo.start();
        } else if (!on && sirenOsc) {
          const osc = sirenOsc;
          const lfo = sirenLfo;
          const gain = sirenGain;
          sirenOsc = null;
          sirenLfo = null;
          sirenGain = null;
          gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
          window.setTimeout(() => {
            try {
              osc.stop();
              lfo.stop();
              gain.disconnect();
            } catch {
              // Already stopped.
            }
          }, 300);
        }
      } catch {
        // Sound is garnish: never let it break the game.
      }
    },
    shot() {
      noise(0.12, 0.4, 2400);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.22, 0);
      tone(990, 0.14, 'sine', 0.22, 0.08);
    },
    crash() {
      tone(130, 0.25, 'sine', 0.35, 0);
      tone(70, 0.3, 'sine', 0.3, 0.02);
      noise(0.2, 0.3, 700);
    },
    jingle() {
      tone(523, 0.12, 'triangle', 0.25, 0);
      tone(659, 0.12, 'triangle', 0.25, 0.11);
      tone(784, 0.12, 'triangle', 0.25, 0.22);
      tone(1047, 0.22, 'triangle', 0.25, 0.33);
    },
    busted() {
      tone(392, 0.16, 'triangle', 0.25, 0);
      tone(330, 0.16, 'triangle', 0.25, 0.15);
      tone(262, 0.3, 'triangle', 0.25, 0.3);
    },
    click() {
      tone(440, 0.05, 'square', 0.12, 0);
    },
  };
}
