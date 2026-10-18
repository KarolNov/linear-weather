import type { CodegenConfig } from "@graphql-codegen/cli";

// Types every Linear query in src/ against Linear's schema. Run `pnpm --filter server codegen`
// after changing a query; `codegen:schema` refreshes the schema from Linear.
const config: CodegenConfig = {
  schema: "src/linear/schema.graphql",
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
