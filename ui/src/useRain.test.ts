import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rain } from "./rain";
import { rainControl } from "./useRain";

const FADE_MS = 1600;
const canvas = {} as HTMLCanvasElement;

/** A control whose rain is a stub, so the test sees each start, change and stop. */
function control(load?: () => Promise<never>) {
  const rain = { setIntensity: vi.fn<Rain["setIntensity"]>(), stop: vi.fn<Rain["stop"]>() };
  const startRain = vi.fn((_canvas: HTMLCanvasElement, _intensity: "rain" | "storm") => rain);
  const loaded = { startRain };
  const sky = rainControl(() => canvas, FADE_MS, load ?? (async () => loaded));
  return { sky, rain, startRain };
}

// Lets the import's promise settle.
const loaded = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe("rain control", () => {
  it("starts once the code loads, and stops only after the sky has faded dry", async () => {
    const { sky, rain, startRain } = control();
    sky.set("rain");
    await loaded();
    expect(startRain).toHaveBeenCalledWith(canvas, "rain");

    sky.set(null);
    await vi.advanceTimersByTimeAsync(FADE_MS - 1);
    expect(rain.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rain.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps the same rain when the sky turns wet again before it has faded", async () => {
    const { sky, rain, startRain } = control();
    sky.set("rain");
    await loaded();
    sky.set(null);
    await vi.advanceTimersByTimeAsync(FADE_MS / 2);
    sky.set("storm");
    await vi.advanceTimersByTimeAsync(FADE_MS);
    expect(rain.setIntensity).toHaveBeenCalledWith("storm");
    expect(rain.stop).not.toHaveBeenCalled();
    expect(startRain).toHaveBeenCalledTimes(1);
  });

  it("starts nothing when the sky dries before the code arrives", async () => {
    const { sky, startRain } = control();
    sky.set("rain");
    sky.set(null);
    await loaded();
    expect(startRain).not.toHaveBeenCalled();
  });

  it("starts the latest intensity, once, however often it changed while loading", async () => {
    const { sky, startRain } = control();
    sky.set("rain");
    sky.set("storm");
    await loaded();
    expect(startRain).toHaveBeenCalledTimes(1);
    expect(startRain).toHaveBeenCalledWith(canvas, "storm");
  });

  it("stops at once when the sky goes away, and starts nothing after", async () => {
    const { sky, rain, startRain } = control();
    sky.set("rain");
    await loaded();
    sky.set(null);
    sky.dispose();
    expect(rain.stop).toHaveBeenCalledTimes(1);

    const late = control();
    late.sky.set("rain");
    late.sky.dispose();
    await loaded();
    expect(late.startRain).not.toHaveBeenCalled();
    expect(startRain).toHaveBeenCalledTimes(1);
  });

  it("logs a failed load instead of leaving it unhandled", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sky } = control(() => Promise.reject(new Error("404")));
    sky.set("rain");
    await loaded();
    expect(error).toHaveBeenCalledWith("Couldn't load the rain: Error: 404");
    error.mockRestore();
  });
});
