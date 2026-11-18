import { configDefaults, defineProject } from "vitest/config";
import { webTestPlugins } from "./vitest.shared";

export default defineProject({
  plugins: webTestPlugins({ css: false }),
  // *.browser.test.tsx run in Chromium instead, under vitest.browser.config.ts.
  test: {
    name: "web",
    environment: "node",
    exclude: [...configDefaults.exclude, "**/*.browser.test.tsx"],
  },
});
