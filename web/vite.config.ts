import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import stylex from "@stylexjs/unplugin";
import { defineConfig, type Plugin } from "vite";

// worker.tsx links /assets/stylex.css by name. StyleX writes that file only while the client
// bundle has no other CSS; otherwise it appends its rules to that CSS file instead. Fail the build
// then, rather than ship a page whose stylesheet 404s.
function requireStylexCss(): Plugin {
  return {
    name: "require-stylex-css",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    closeBundle() {
      const { root, build } = this.environment.config;
      if (!existsSync(resolve(root, build.outDir, "assets/stylex.css"))) {
        throw new Error("The client build has no assets/stylex.css; update worker.tsx's link.");
      }
    },
  };
}

export default defineConfig({
  plugins: [
    // Compiles stylex.create() in both the client bundle and the server-rendering Worker, so
    // they agree on class names. With no other CSS in the client bundle, the build writes all
    // rules to assets/stylex.css. devPersistToDisk lets the dev CSS endpoint see the rules the
    // SSR environment collected.
    stylex.vite({ devMode: "css-only", devPersistToDisk: true }),
    requireStylexCss(),
    preact(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Runs the server Worker in the same dev session so the SERVER binding resolves.
      auxiliaryWorkers: [{ configPath: "../server/wrangler.jsonc" }],
      // The dev script applies D1 migrations here (`--persist-to` in package.json); keep the two
      // paths in step, or the dev server reads a database without tables.
      persistState: { path: ".wrangler/state" },
    }),
  ],
  server: {
    // Linear's webhooks reach the dev server through a Cloudflare quick tunnel (see the README).
    // Vite refuses hosts it doesn't know, which guards against DNS rebinding; this lets the
    // tunnel's through without telling the server it's on localhost.
    allowedHosts: [".trycloudflare.com"],
    // The tunnel puts the whole dev server online, /@fs/ included. Vite's own list (the first
    // six, which this replaces) misses the local Workers' secrets and state: .dev.vars, and
    // .wrangler, whose session store holds Linear tokens.
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        ".dev.vars",
        ".dev.vars.*",
        "**/.wrangler/**",
      ],
    },
  },
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
