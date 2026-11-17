import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { TeamPicker } from "./TeamPicker";

const avengers = { id: "t-avg", name: "Avengers", key: "AVG" };
const ops = { id: "t-ops", name: "S.H.I.E.L.D. Ops", key: "OPS" };

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
  render(
    <>
      <TeamPicker teams={[avengers, ops]} selected={avengers} />
      <p>Somewhere else on the page</p>
    </>,
    root,
  );
});
afterEach(() => {
  render(null, root);
  root.remove();
});

const menu = () => root.querySelector("details");
const summary = () => root.querySelector("summary") as HTMLElement;

/** Opens the menu, and waits for the picker to know it's open, as a PM's next move would. */
async function open() {
  await userEvent.click(page.elementLocator(summary()));
  await expect.poll(() => menu()?.open).toBe(true);
  // The listeners that close it go on once the toggle has rendered.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
}

describe("the team picker", () => {
  it("closes on Escape, handing the keyboard back to its trigger", async () => {
    await open();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => menu()?.open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  it("closes on a click outside it", async () => {
    await open();
    await userEvent.click(page.getByText("Somewhere else on the page"));
    await expect.poll(() => menu()?.open).toBe(false);
  });

  it("stays open on a click inside it", async () => {
    await open();
    await userEvent.click(page.getByText("Switch team", { exact: true }));
    expect(menu()?.open).toBe(true);
  });
});
