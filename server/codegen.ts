import type { CodegenConfig } from "@graphql-codegen/cli";

// Types every Linear query in src/**/*.graphql against Linear's schema. Run
// `pnpm --filter server codegen` after changing a query.
//
// The schema comes from Linear's SDK repo, pinned to a commit so codegen is reproducible. To pick
// up schema changes, bump the commit to the latest one touching packages/sdk/src/schema.graphql.
const LINEAR_SCHEMA_COMMIT = "9dd2ed80f93ae596f4f7fa21aa7cf80895c58514";

const config: CodegenConfig = {
  schema: `https://raw.githubusercontent.com/linear/linear/${LINEAR_SCHEMA_COMMIT}/packages/sdk/src/schema.graphql`,
  // Queries live in .graphql files and code imports the generated documents (`ViewerDocument`).
  // Unlike the client preset's graphql() tag, that needs no lookup table of every query string,
  // so bundles only carry the queries they import, once each.
  documents: "src/**/*.graphql",
  generates: {
    "src/linear/generated.ts": {
      // No `typescript` plugin: it would emit every type in Linear's schema (~9k lines), while
      // typescript-operations on its own emits only what our operations use.
      plugins: ["typescript-operations", "typed-document-node"],
      config: {
        // Plain strings over the wire: no graphql-js parsing in the Worker.
        documentMode: "string",
        // Lets bundlers drop documents nobody imports, like standalone fragments.
        pureMagicComment: true,
        enumsAsTypes: true,
        useTypeImports: true,
        scalars: {
          DateTime: "string",
          TimelessDate: "string",
          ID: "string",
        },
      },
    },
  },
};

export default config;
