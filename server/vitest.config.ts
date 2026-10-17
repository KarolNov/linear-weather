import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

// Tests run inside workerd, the same runtime as production.
export default defineProject({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          LINEAR_CLIENT_ID: "test-client-id",
          LINEAR_CLIENT_SECRET: "test-client-secret",
          LINEAR_WEBHOOK_SECRET: "test-secret",
        },
      },
    }),
  ],
  test: {
    name: "server",
    // workerd's first boot is slow on a cold machine (e.g. CI).
    testTimeout: 20_000,
  },
});
