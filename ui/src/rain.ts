// Rain drawn on a canvas, loaded only once a sky turns wet. Drops fall in three layers: far ones
// short, faint and slow, near ones long, bright and fast, which gives the rain depth a repeating
// CSS tile can't. Each layer is one path, so a frame is three strokes however many drops fall.

export type RainIntensity = "rain" | "storm";

export interface Rain {
  setIntensity(intensity: RainIntensity): void;
  stop(): void;
}

interface Layer {
  /** Share of the drops. */
  share: number;
  length: [number, number];
  /** Pixels a second. */
  speed: [number, number];
  width: number;
  alpha: number;
}

const LAYERS: Layer[] = [
  { share: 0.5, length: [8, 14], speed: [380, 480], width: 1, alpha: 0.22 },
  { share: 0.32, length: [14, 22], speed: [560, 700], width: 1.2, alpha: 0.32 },
  { share: 0.18, length: [22, 34], speed: [780, 960], width: 1.5, alpha: 0.42 },
];

// Drops per million CSS pixels of sky, and how much faster a storm falls.
const DENSITY: Record<RainIntensity, number> = { rain: 120, storm: 210 };
const STORM_SPEED = 1.3;
// The rain sky is light grey, where faint drops vanish; the storm's dark sky shows them as is.
const BRIGHTNESS: Record<RainIntensity, number> = { rain: 1.9, storm: 1 };
const MAX_DROPS = 450;
// Horizontal drift per pixel fallen: a light wind from the right.
const SLANT = -0.16;
// A background doesn't need 60 frames a second; half that saves battery on a board left open.
const FRAME_MS = 1000 / 30;
// After a hidden tab or a long frame, step as if only this much time passed, not all of it.
const MAX_STEP_MS = 50;

interface Drop {
  x: number;
  y: number;
  length: number;
  speed: number;
}

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

/** Starts rain on `canvas`, sized to its own box. Stops when asked, leaving the canvas clear. */
export function startRain(canvas: HTMLCanvasElement, intensity: RainIntensity): Rain {
  const context = canvas.getContext("2d");
  if (!context) return { setIntensity() {}, stop() {} };
  const ctx = context;
  let width = 0;
  let height = 0;
  let speedUp = 1;
  let brightness = 1;
  const layers: Drop[][] = LAYERS.map(() => []);
  let targets: number[] = LAYERS.map(() => 0);

  const spawn = (layer: Layer, anywhere: boolean): Drop => {
    const length = between(layer.length);
    return {
      // Wide enough that the slant still covers the right edge.
      x: Math.random() * (width + height * -SLANT),
      y: anywhere ? Math.random() * height : -length - Math.random() * height * 0.2,
      length,
      speed: between(layer.speed),
    };
  };

  const fill = (anywhere: boolean) => {
    LAYERS.forEach((layer, i) => {
      const drops = layers[i] as Drop[];
      while (drops.length < (targets[i] as number)) drops.push(spawn(layer, anywhere));
    });
  };

  const setIntensity = (next: RainIntensity) => {
    speedUp = next === "storm" ? STORM_SPEED : 1;
    brightness = BRIGHTNESS[next];
    const total = Math.min(MAX_DROPS, Math.round((width * height * DENSITY[next]) / 1_000_000));
    targets = LAYERS.map((layer) => Math.round(total * layer.share));
    // New drops start above the sky, so a storm builds rather than appearing at once.
    fill(false);
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
  };

  const step = (ms: number) => {
    const seconds = (Math.min(ms, MAX_STEP_MS) / 1000) * speedUp;
    ctx.clearRect(0, 0, width, height);
    LAYERS.forEach((layer, i) => {
      const drops = layers[i] as Drop[];
      const target = targets[i] as number;
      ctx.beginPath();
      for (let d = drops.length - 1; d >= 0; d--) {
        const drop = drops[d] as Drop;
        const fallen = drop.speed * seconds;
        drop.y += fallen;
        drop.x += fallen * SLANT;
        if (drop.y - drop.length > height) {
          // Gone past the bottom: back to the top, unless the rain is easing off.
          if (drops.length > target) drops.splice(d, 1);
          else drops[d] = spawn(layer, false);
          continue;
        }
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * SLANT, drop.y - drop.length);
      }
      ctx.lineWidth = layer.width;
      ctx.strokeStyle = `rgba(242, 245, 255, ${Math.min(1, layer.alpha * brightness)})`;
      ctx.stroke();
    });
  };

  let frame = 0;
  let last = 0;
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    if (last === 0) last = now;
    if (now - last < FRAME_MS) return;
    step(now - last);
    last = now;
  };

  resize();
  setIntensity(intensity);
  // The page opens mid-shower, like the clouds open mid-drift.
  for (const drops of layers) drops.length = 0;
  fill(true);
  window.addEventListener("resize", onResize);
  frame = requestAnimationFrame(tick);

  function onResize() {
    resize();
    setIntensity(speedUp === 1 ? "rain" : "storm");
  }

  return {
    setIntensity,
    stop() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      ctx.clearRect(0, 0, width, height);
    },
  };
}
