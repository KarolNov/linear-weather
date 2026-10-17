import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact(), cloudflare({ viteEnvironment: { name: "ssr" } })],
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
