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
      {/* Above the picker: its menu drops over whatever is below it. */}
      <p>Somewhere else on the page</p>
      <TeamPicker teams={[avengers, ops]} selected={avengers} />
      <button type="button">Something else</button>
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

/** A frame and a task: long enough for the toggle to render, or a late close to land. */
const settle = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

/** Opens the menu, and waits for the picker to know it's open, as a PM's next move would. */
async function open() {
  await userEvent.click(page.elementLocator(summary()));
  await expect.poll(() => menu()?.open).toBe(true);
  // The listeners that close it go on once the toggle has rendered.
  await settle();
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
    await settle();
    expect(menu()?.open).toBe(true);
  });

  it("closes when the keyboard tabs out of it", async () => {
    await open();
    // Past both teams' links to the button after the picker.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect.element(page.getByRole("button", { name: "Something else" })).toHaveFocus();
    await expect.poll(() => menu()?.open).toBe(false);
  });
});
