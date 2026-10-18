import type { CodegenConfig } from "@graphql-codegen/cli";

// Types every Linear query in src/ against Linear's schema. Run `pnpm --filter server codegen`
// after changing a query.
//
// The schema comes from Linear's SDK repo, pinned to a commit so codegen is reproducible. To pick
// up schema changes, bump the commit to the latest one touching packages/sdk/src/schema.graphql.
const LINEAR_SCHEMA_COMMIT = "9dd2ed80f93ae596f4f7fa21aa7cf80895c58514";

const config: CodegenConfig = {
  schema: `https://raw.githubusercontent.com/linear/linear/${LINEAR_SCHEMA_COMMIT}/packages/sdk/src/schema.graphql`,
  documents: ["src/**/*.ts", "!src/**/*.test.ts", "!src/linear/generated/**"],
  ignoreNoDocuments: false,
  generates: {
    "src/linear/generated/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        // Plain strings over the wire: no graphql-js parsing in the Worker.
        documentMode: "string",
        // Only the types our operations touch, not all of Linear's ~1 MB schema.
        onlyOperationTypes: true,
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
