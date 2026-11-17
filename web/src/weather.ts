import type { Glyph, Weather } from "ui";
import type { WeatherKind } from "./board";

/** The icon for each kind of weather. */
export const weatherIcon: Record<WeatherKind, Glyph> = {
  SUNNY: "sun",
  CLOUDY: "partly",
  RAIN: "rain",
  STORM: "storm",
  FOG: "fog",
  AWAY: "away",
};

/** The board's sky for a team's weather. A team is never away; were it, nobody can tell. */
export function skyFor(kind: WeatherKind): Weather {
  const icon = weatherIcon[kind];
  return icon === "away" ? "fog" : icon;
}
