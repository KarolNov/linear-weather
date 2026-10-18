import preact from "@preact/preset-vite";
import stylex from "@stylexjs/unplugin";
import { defineProject } from "vitest/config";

// StyleX must compile the components here too: stylex.create() throws if it runs uncompiled.
// Tests only need the compiler, not the dev CSS endpoint, whose polling timer is cleared only
// when an HTTP server closes. Vitest has none, so the timer would keep it from exiting.
const { configureServer: _, ...stylexCompiler } = stylex.vite();

export default defineProject({
  plugins: [stylexCompiler, preact()],
  test: { name: "web", environment: "node" },
});
