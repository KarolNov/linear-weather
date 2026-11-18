import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { webTestPlugins } from "./vitest.shared";

// The board as it runs after hydration, in headless Chromium, styled as in the app so a test
// can't click what a PM couldn't. Needs the browser installed once:
// `pnpm --filter web exec playwright install chromium`.
export default defineProject({
  plugins: webTestPlugins({ css: true }),
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
