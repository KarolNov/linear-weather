import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

// Tests run inside workerd, the same runtime as production.
export default defineProject(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          LINEAR_CLIENT_ID: "test-client-id",
          LINEAR_CLIENT_SECRET: "test-client-secret",
          LINEAR_WEBHOOK_SECRET: "test-secret",
          // Read here in Node, applied inside workerd by test/apply-migrations.ts.
          TEST_MIGRATIONS: await readD1Migrations(
            new URL("./migrations", import.meta.url).pathname,
          ),
        },
      },
    }),
  ],
  test: {
    name: "server",
    setupFiles: ["./test/apply-migrations.ts"],
    // workerd's first boot is slow on a cold machine (e.g. CI).
    testTimeout: 20_000,
  },
}));
