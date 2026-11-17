import preact from "@preact/preset-vite";
import stylex from "@stylexjs/unplugin";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";

// The board as it runs after hydration, in headless Chromium. Needs the browser installed once:
// `pnpm --filter web exec playwright install chromium`.
// StyleX compiles the components as in vitest.config.ts, and for the same reason leaves out
// the dev CSS endpoint: the tests check behaviour, not looks.
const { configureServer: _, ...stylexCompiler } = stylex.vite();

export default defineProject({
  plugins: [stylexCompiler, preact()],
  test: {
    name: "web-browser",
    include: ["src/**/*.browser.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
