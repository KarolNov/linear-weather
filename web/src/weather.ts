import type { Weather } from "ui";
import type { WeatherKind } from "./board";

/** The icon, and the board's sky, for each kind of weather. */
export const weatherIcon: Record<WeatherKind, Weather> = {
  SUNNY: "sun",
  CLOUDY: "partly",
  RAIN: "rain",
  STORM: "storm",
  FOG: "fog",
};
