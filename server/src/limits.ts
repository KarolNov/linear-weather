// How big a query the server runs. Our schema has cycles (an issue's assignee has a matrix of
// issues, whose assignees have matrices…), so a query a few levels deeper than the board's could
// ask for every team's issues many times over, each a call to Linear. Two limits stop that before
// anything runs, both checked while the query is validated:
//
// - Depth: how many fields deep it nests.
// - Cost: Linear's own model, in points. A scalar or enum field costs 0.1, an object 1, and a
//   list multiplies what's inside it by its length. Linear reads that length from `first`
//   (50 if left out). Our lists don't page, so each counts as LIST_LENGTH items, about a team or
//   a quadrant.
//
// The board's own operations sit well under both (limits.test.ts checks each one).

import {
  type FragmentDefinitionNode,
  type GraphQLCompositeType,
  GraphQLError,
  type GraphQLOutputType,
  getNamedType,
  getNullableType,
  isCompositeType,
  isInterfaceType,
  isListType,
  isObjectType,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";
import type { Plugin } from "graphql-yoga";

/** The most fields deep a query may nest. The board's deepest operation goes 7. */
export const MAX_DEPTH = 10;

/**
 * The most points a query may cost: Linear's own cap on one query. The board's dearest operation
 * costs about 3,000.
 */
export const MAX_COST = 10_000;

/** How many items a list counts as. */
export const LIST_LENGTH = 10;

// Points are counted in tenths, so a sum of 0.1s stays exact.
const SCALAR = 1;
const OBJECT = 10;

/** How deep a selection nests and what it costs, in points. */
export interface Size {
  depth: number;
  cost: number;
}

/** A validation rule that rejects operations deeper than `maxDepth` or dearer than `maxCost`. */
export function limitQueries({
  maxDepth = MAX_DEPTH,
  maxCost = MAX_COST,
}: {
  maxDepth?: number;
  maxCost?: number;
} = {}): ValidationRule {
  return (context) => ({
    OperationDefinition(operation) {
      const root = context.getSchema().getRootType(operation.operation);
      if (!root) return;
      const { depth, cost } = sizeOf(context, operation.selectionSet, root);
      if (depth > maxDepth) {
        context.reportError(
          new GraphQLError(`The query nests ${depth} fields deep; the most is ${maxDepth}.`, {
            nodes: [operation],
            extensions: { code: "QUERY_TOO_DEEP", depth, maxDepth },
          }),
        );
      }
      if (cost > maxCost) {
        context.reportError(
          new GraphQLError(`The query costs ${cost} points; the most is ${maxCost}.`, {
            nodes: [operation],
            extensions: { code: "QUERY_TOO_COSTLY", cost, maxCost },
          }),
        );
      }
    },
  });
}

/** A selection's depth and cost in tenths of a point. */
interface Measured {
  depth: number;
  tenths: number;
}

/** How deep a selection on `type` nests and what it costs. */
export function sizeOf(
  context: Pick<ValidationContext, "getSchema" | "getFragment">,
  selectionSet: SelectionSetNode,
  type: GraphQLCompositeType,
): Size {
  const { depth, tenths } = measure(context, selectionSet, type, new Set(), new Map());
  return { depth, cost: tenths / 10 };
}

function measure(
  context: Pick<ValidationContext, "getSchema" | "getFragment">,
  selectionSet: SelectionSetNode,
  type: GraphQLCompositeType,
  // Fragments being measured, so a cycle (which validation reports anyway) can't recurse forever.
  spreading: Set<string>,
  // Fragments already measured: a fragment spread many times, by fragments spread many times,
  // would otherwise be walked exponentially often.
  measured: Map<string, Measured>,
): Measured {
  let depth = 0;
  let tenths = 0;
  const add = (inner: Measured) => {
    depth = Math.max(depth, inner.depth);
    tenths += inner.tenths;
  };

  for (const selection of selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD: {
        const name = selection.name.value;
        // Introspection is as big as the schema, whatever the query: only GraphiQL sends it.
        if (name === "__schema" || name === "__type") break;
        if (name === "__typename") {
          add({ depth: 1, tenths: SCALAR });
          break;
        }
        const fields = isObjectType(type) || isInterfaceType(type) ? type.getFields() : {};
        const field = fields[name];
        // Not a field of this type: validation reports it.
        if (!field) break;
        const inner = getNamedType(field.type);
        const nested =
          selection.selectionSet && isCompositeType(inner)
            ? measure(context, selection.selectionSet, inner, spreading, measured)
            : { depth: 0, tenths: 0 };
        const each = isCompositeType(inner) ? OBJECT + nested.tenths : SCALAR;
        add({ depth: 1 + nested.depth, tenths: each * lengthOf(field.type) });
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        const on = selection.typeCondition
          ? context.getSchema().getType(selection.typeCondition.name.value)
          : type;
        if (isCompositeType(on)) {
          add(measure(context, selection.selectionSet, on, spreading, measured));
        }
        break;
      }
      case Kind.FRAGMENT_SPREAD: {
        const name = selection.name.value;
        const fragment: FragmentDefinitionNode | null | undefined = context.getFragment(name);
        const known = measured.get(name);
        if (known) {
          add(known);
          break;
        }
        if (!fragment || spreading.has(name)) break;
        const on = context.getSchema().getType(fragment.typeCondition.name.value);
        if (!isCompositeType(on)) break;
        spreading.add(name);
        const size = measure(context, fragment.selectionSet, on, spreading, measured);
        spreading.delete(name);
        measured.set(name, size);
        add(size);
        break;
      }
    }
  }
  return { depth, tenths };
}

/** How many items a field's value counts as: LIST_LENGTH for each level of list. */
function lengthOf(type: GraphQLOutputType): number {
  const nullable = getNullableType(type);
  return isListType(nullable) ? LIST_LENGTH * lengthOf(nullable.ofType) : 1;
}

/** A Yoga plugin that checks every operation against `limitQueries`. */
export function useQueryLimits(options?: { maxDepth?: number; maxCost?: number }): Plugin {
  return {
    onValidate({ addValidationRule }) {
      addValidationRule(limitQueries(options));
    },
  };
}
