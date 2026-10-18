import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // Compiles stylex.create() in both the client bundle and the server-rendering Worker, so
    // they agree on class names. With no other CSS in the client bundle, the build writes all
    // rules to assets/stylex.css. devPersistToDisk lets the dev CSS endpoint see the rules the
    // SSR environment collected.
    stylex.vite({ devMode: "css-only", devPersistToDisk: true }),
    preact(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Runs the server Worker in the same dev session so the SERVER binding resolves.
      auxiliaryWorkers: [{ configPath: "../server/wrangler.jsonc" }],
    }),
  ],
  environments: {
    client: {
      build: {
        rolldownOptions: {
          input: "src/client.tsx",
          output: { entryFileNames: "assets/client.js" },
        },
      },
    },
  },
});
