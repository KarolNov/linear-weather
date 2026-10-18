import SchemaBuilder from "@pothos/core";
import { LinearAuthError, type LinearClient } from "./linear/client";
import { ViewerDocument } from "./linear/generated";

export interface GraphQLContext {
  /** Resolves to null when nobody is signed in. */
  linear: () => Promise<LinearClient | null>;
  /** Forgets the session's tokens, e.g. after Linear rejected them. */
  discardSession: () => Promise<void>;
}

const builder = new SchemaBuilder<{ Context: GraphQLContext }>({});

interface Organization {
  name: string;
  urlKey: string;
}

interface User {
  id: string;
  name: string;
  avatarUrl: string | null;
  organization: Organization;
}

const OrganizationRef = builder.objectRef<Organization>("Organization").implement({
  description: "A Linear workspace.",
  fields: (t) => ({
    name: t.exposeString("name"),
    urlKey: t.exposeString("urlKey"),
  }),
});

const UserRef = builder.objectRef<User>("User").implement({
  description: "A Linear user.",
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
    organization: t.field({ type: OrganizationRef, resolve: (user) => user.organization }),
  }),
});

builder.queryType({
  fields: (t) => ({
    hello: t.string({ resolve: () => "☀️" }),
    viewer: t.field({
      type: UserRef,
      nullable: true,
      description: "The signed-in Linear user, or null when signed out.",
      resolve: async (_root, _args, context) => {
        const linear = await context.linear();
        if (!linear) return null;
        try {
          const { viewer } = await linear.request(ViewerDocument);
          return viewer;
        } catch (error) {
          // A revoked token means signed out, not a server error.
          if (error instanceof LinearAuthError) {
            await context.discardSession();
            return null;
          }
          throw error;
        }
      },
    }),
  }),
});

export const schema = builder.toSchema();
