import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRain } from "./rain";

/** A canvas whose 2D context counts the frames drawn on it. */
function fakeCanvas(width = 800, height = 600) {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    lineCap: "",
    lineWidth: 0,
    strokeStyle: "",
  };
  const canvas = {
    clientWidth: width,
    clientHeight: height,
    width: 0,
    height: 0,
    getContext: () => context,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement & typeof canvas, context };
}

let frames: FrameRequestCallback[];
let observers: { callback: () => void; disconnected: boolean }[];
const frame = (now: number) => frames.shift()?.(now);

beforeEach(() => {
  frames = [];
  observers = [];
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { callback: () => void; disconnected: boolean };
      constructor(callback: () => void) {
        this.entry = { callback, disconnected: false };
        observers.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("rain", () => {
  it("draws every other 60 Hz frame, even when the browser rounds frame times down", () => {
    const { canvas, context } = fakeCanvas();
    startRain(canvas, "rain");
    // 60 Hz frames, rounded to 0.1 ms: two of them measure 33.3 ms, a hair under 1000 / 30.
    for (const now of [1000, 1016.7, 1033.3, 1050, 1066.6, 1083.3, 1100]) frame(now);
    expect(context.clearRect).toHaveBeenCalledTimes(3);
  });

  it("sizes its bitmap to the canvas's box and pixel ratio, and follows both", () => {
    const { canvas, context } = fakeCanvas(800, 600);
    startRain(canvas, "storm");
    expect([canvas.width, canvas.height]).toEqual([800, 600]);

    // A scrollbar appears: the canvas narrows with no window resize.
    canvas.clientWidth = 785;
    observers[0]?.callback();
    expect(canvas.width).toBe(785);

    // Moved to a high-density screen.
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    frame(1000);
    frame(1040);
    expect([canvas.width, canvas.height]).toEqual([1570, 1200]);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("stops drawing when stopped, and leaves the canvas clear", () => {
    const { canvas, context } = fakeCanvas();
    const rain = startRain(canvas, "rain");
    rain.stop();
    expect(frames).toEqual([]);
    expect(observers[0]?.disconnected).toBe(true);
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 800, 600);
  });
});
