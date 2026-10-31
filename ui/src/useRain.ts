import { useEffect, useRef, useState } from "preact/hooks";
import type { Rain, RainIntensity } from "./rain";

/**
 * Rain on the returned canvas while `intensity` is set. The drawing code loads only then, after
 * the page is up, so a dry sky never fetches it; until it arrives the grey sky says rain alone.
 * With reduced motion, nothing loads, and rain already falling stops.
 */
export function useRain(intensity: RainIntensity | null, fadeMs: number) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const control = useRef<RainControl | null>(null);
  const still = useReducedMotion();
  useEffect(() => {
    const rain = rainControl(() => canvas.current, fadeMs);
    control.current = rain;
    // Off the page entirely, say signing out mid-storm: stop at once.
    return () => rain.dispose();
  }, [fadeMs]);
  useEffect(() => {
    control.current?.set(still ? null : intensity);
  }, [still, intensity]);
  return canvas;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export type RainControl = ReturnType<typeof rainControl>;

/**
 * Starts, changes and stops the rain on `canvas` as the sky's intensity changes. Easing off, it
 * keeps falling for `fadeMs` while its layer fades out; turning wet again before then, the same
 * rain carries on.
 */
export function rainControl(
  canvas: () => HTMLCanvasElement | null,
  fadeMs: number,
  load: () => Promise<typeof import("./rain")> = () => import("./rain"),
) {
  let rain: Rain | null = null;
  let wanted: RainIntensity | null = null;
  let disposed = false;
  let drying: ReturnType<typeof setTimeout> | undefined;
  return {
    set(next: RainIntensity | null) {
      wanted = next;
      clearTimeout(drying);
      if (!next) {
        if (rain) {
          drying = setTimeout(() => {
            rain?.stop();
            rain = null;
          }, fadeMs);
        }
        return;
      }
      if (rain) {
        rain.setIntensity(next);
        return;
      }
      load().then(
        ({ startRain }) => {
          const target = canvas();
          // Dried, gone or already raining by the time the code arrived.
          if (disposed || rain || !wanted || !target) return;
          rain = startRain(target, wanted);
        },
        // Offline, or a deploy since the page loaded replaced the chunk: the grey sky stays.
        (error) => console.error(`Couldn't load the rain: ${error}`),
      );
    },
    dispose() {
      disposed = true;
      clearTimeout(drying);
      rain?.stop();
      rain = null;
    },
  };
}
