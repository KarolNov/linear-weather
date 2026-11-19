import { describe, expect, it } from "vitest";
import { CURRENT_DOCUMENT_IDS, TRUSTED_DOCUMENTS } from "../../server/src/trusted-documents";
import { DOCUMENT_IDS } from "./document-ids";
import { operations } from "./operations";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return `sha256:${hex.join("")}`;
}

// Catches a .graphql change committed without `pnpm --filter web codegen`, which would send an
// id whose stored text lacks the new fields.
describe("trusted-document ids", () => {
  it.each(Object.entries(operations()))("match %s as generated", async (name, text) => {
    const id = await sha256(text);
    expect(DOCUMENT_IDS).toHaveProperty(name, id);
    expect(CURRENT_DOCUMENT_IDS).toHaveProperty(name, id);
    expect(TRUSTED_DOCUMENTS[id]).toBe(text);
  });

  it("name every operation and nothing else", () => {
    expect(Object.keys(DOCUMENT_IDS)).toEqual(Object.keys(operations()));
  });
});
