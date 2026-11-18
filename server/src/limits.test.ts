import { type DocumentNode, parse, specifiedRules, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { LIST_LENGTH, limitQueries, MAX_COST, MAX_DEPTH, sizeOf } from "./limits";
import { schema } from "./schema";
import { TRUSTED_DOCUMENTS } from "./trusted-documents";

/** The depth and cost of a document's one operation, from a validation pass. */
function size(document: DocumentNode) {
  let measured = { depth: 0, cost: 0 };
  validate(schema, document, [
    (context) => ({
      OperationDefinition(operation) {
        const root = schema.getRootType(operation.operation);
        if (root) measured = sizeOf(context, operation.selectionSet, root);
      },
    }),
  ]);
  return measured;
}

const errorsFor = (source: string, limits?: { maxDepth?: number; maxCost?: number }) =>
  validate(schema, parse(source), [...specifiedRules, limitQueries(limits)]);

describe("query limits", () => {
  it.each(Object.entries(TRUSTED_DOCUMENTS))("let the board's %s through", (_id, source) => {
    const { depth, cost } = size(parse(source));
    expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
    expect(cost).toBeLessThanOrEqual(MAX_COST);
    // Only the limits: an old id's document may ask for fields the schema has since dropped.
    expect(validate(schema, parse(source), [limitQueries()])).toEqual([]);
  });

  it("count scalars as 0.1, objects as 1 and lists as LIST_LENGTH items", () => {
    expect(size(parse("{ today }"))).toEqual({ depth: 1, cost: 0.1 });
    expect(size(parse("{ viewer { name } }"))).toEqual({ depth: 2, cost: 1.1 });
    expect(size(parse("{ teams { id name } }"))).toEqual({
      depth: 2,
      cost: LIST_LENGTH * 1.2,
    });
  });

  it("measure fragments where they're spread", () => {
    expect(
      size(parse("{ ...V } fragment V on Query { viewer { ...N } } fragment N on User { name }")),
    ).toEqual({ depth: 2, cost: 1.1 });
    expect(size(parse("{ viewer { ... on User { name } } }"))).toEqual({ depth: 2, cost: 1.1 });
  });

  it("refuse a query nested deeper than the limit", () => {
    const errors = errorsFor("{ viewer { organization { name } } }", { maxDepth: 2 });
    expect(errors.map((e) => e.extensions.code)).toEqual(["QUERY_TOO_DEEP"]);
  });

  it("refuse a query that costs more than the limit", () => {
    const errors = errorsFor("{ teams { id name key } }", { maxCost: 10 });
    expect(errors.map((e) => e.extensions.code)).toEqual(["QUERY_TOO_COSTLY"]);
  });

  it("refuse the schema's cycles followed a few levels down", () => {
    // Each person's issues' assignees' issues' assignees…: every level another team's worth.
    const errors = errorsFor(`{ teams { people { matrix { do { assignee {
      matrix { do { assignee { matrix { do { id } } } } }
    } } } } } }`);
    expect(errors.map((e) => e.extensions.code)).toEqual(["QUERY_TOO_DEEP", "QUERY_TOO_COSTLY"]);
  });

  it("measure a fragment spread many times only once", () => {
    // 20 levels of fragments, each spreading the next 4 times: 4^20 spreads if walked naively.
    const levels = Array.from({ length: 20 }, (_, i) =>
      i === 19
        ? `fragment F${i} on Query { today }`
        : `fragment F${i} on Query { ...F${i + 1} ...F${i + 1} ...F${i + 1} ...F${i + 1} }`,
    );
    const errors = errorsFor(`{ ...F0 } ${levels.join(" ")}`);
    expect(errors.map((e) => e.extensions.code)).toEqual(["QUERY_TOO_COSTLY"]);
  });

  it("don't count introspection, which only GraphiQL sends", () => {
    expect(size(parse("{ __schema { types { name fields { name } } } }"))).toEqual({
      depth: 0,
      cost: 0,
    });
  });
});
