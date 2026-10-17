import { describe, expect, it } from "vitest";
import { app } from "./worker";

describe("web worker", () => {
  it("server-renders the app", async () => {
    const res = await app.request("/");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<h1>Linear Weather</h1>");
  });
});
