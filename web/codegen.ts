import type { CodegenConfig } from "@graphql-codegen/cli";

// Types the board's operations in src/**/*.graphql against our server's schema, as
// `pnpm --filter server codegen` prints it to server/schema.graphql. Run `pnpm --filter web
// codegen` after changing an operation or the schema; a field renamed or made nullable there then
// fails web's typecheck wherever the board relies on it.
const config: CodegenConfig = {
  schema: "../server/schema.graphql",
  documents: "src/**/*.graphql",
  generates: {
    "src/generated.ts": {
      // As in server/codegen.ts: only the types our operations use, as plain-string documents.
      plugins: ["typescript-operations", "typed-document-node"],
      config: {
        documentMode: "string",
        pureMagicComment: true,
        enumsAsTypes: true,
        useTypeImports: true,
        scalars: {
          Date: "string",
          ID: "string",
        },
      },
    },
  },
};

export default config;
