import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import type { BoardIssue, Matrix, PersonMatrix as Person } from "./board";
import { LIST_CAP, PersonMatrix } from "./PersonMatrix";

const tony = { id: "u-tony", name: "Tony Stark", avatarUrl: null };

/** Tony's issue `n`, due in Do. */
const issue = (n: number): BoardIssue => ({
  id: `i-${n}`,
  identifier: `AVG-${n}`,
  title: `Issue number ${n}`,
  url: `https://linear.app/shield/issue/AVG-${n}`,
  dueDate: "2026-10-20",
  priority: 2,
  estimate: 1,
  state: { name: "Todo" },
  quadrantSource: "RULE",
  placementReason: "High priority, due in 2 days",
});

/** Tony holding `doing` in Do and `later` in Schedule. */
function tonyWith(doing: BoardIssue[], later: BoardIssue[] = []): Person {
  const matrix: Matrix = {
    counts: { do: doing.length, schedule: later.length, delegate: 0, drop: 0 },
    do: doing,
    schedule: later,
    delegate: [],
    drop: [],
  };
  return { assignee: tony, capacity: 1, timeOff: [], matrix, weather: null, forecast: [] };
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => issue(from + i));

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  // A card as wide as it is on the board.
  root.style.width = "320px";
  document.body.append(root);
});
afterEach(async () => {
  render(null, root);
  root.remove();
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "" }],
  });
});

/** Tony's card, open, as the board would draw it for `person`. */
function show(person: Person) {
  render(
    <PersonMatrix person={person} today="2026-10-18" expanded onExpandedChange={() => {}} />,
    root,
  );
}

const cards = () => [...root.querySelectorAll<HTMLElement>("li[data-settle]")];
const doList = () => page.getByRole("region", { name: "Tony Stark: Do" });
/** The element whose height eases as the list changes. */
const settler = () =>
  root.querySelector<HTMLElement>("li[data-settle]")?.closest("ul")?.parentElement?.parentElement
    ?.parentElement as HTMLElement;
const ghosts = () => [...root.querySelectorAll<HTMLElement>("li[aria-hidden='true']")];

describe("a person's issue list", () => {
  it(`shows the first ${LIST_CAP} of a long quadrant, and the rest on asking`, async () => {
    show(tonyWith(range(1, 10)));
    await expect.element(doList()).toBeVisible();
    expect(cards().map((card) => card.dataset.settle)).toEqual(range(1, LIST_CAP).map((i) => i.id));

    const more = page.getByRole("button", { name: "Show 4 more of Tony Stark's Do issues" });
    await expect.element(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(cards()).toHaveLength(10);

    const fewer = page.getByRole("button", { name: "Show fewer of Tony Stark's Do issues" });
    await expect.element(fewer).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(fewer);
    expect(cards()).toHaveLength(LIST_CAP);
  });

  it("offers nothing more for a list that fits", async () => {
    show(tonyWith(range(1, LIST_CAP)));
    await expect.element(doList()).toBeVisible();
    expect(cards()).toHaveLength(LIST_CAP);
    expect(root.textContent).not.toContain("more");
  });

  it("shows the next issue in line when one leaves a capped list", async () => {
    show(tonyWith(range(1, 10)));
    await expect.element(doList()).toBeVisible();
    show(tonyWith(range(2, 10)));
    expect(cards().map((card) => card.dataset.settle)).toEqual(
      range(2, LIST_CAP + 1).map((i) => i.id),
    );
    await expect
      .element(page.getByRole("button", { name: "Show 3 more of Tony Stark's Do issues" }))
      .toBeVisible();
  });

  it("eases into its new height as issues leave, and fades out the ones that left", async () => {
    show(tonyWith(range(1, 4), range(5, 6)));
    await expect.element(doList()).toBeVisible();
    // Done arriving, so nothing but the settling is moving.
    await Promise.all(root.getAnimations({ subtree: true }).map((a) => a.finished));
    const tall = settler().getBoundingClientRect().height;

    // AVG-2 is handed over, and AVG-5 placed in Do by hand.
    show(tonyWith([issue(1), issue(5), issue(3), issue(4)], [issue(6)]));

    // Mid-settle the list is still as tall as it was, the card that left is fading where it
    // was, and the cards that moved glide to where they now sit.
    expect(settler().getBoundingClientRect().height).toBeCloseTo(tall, 0);
    expect(ghosts().map((ghost) => ghost.textContent)).toEqual([expect.stringContaining("AVG-2")]);
    const moving = (id: string) =>
      cards()
        .find((card) => card.dataset.settle === id)
        ?.getAnimations()
        .some((a) => a.playState === "running");
    expect(moving("i-6")).toBe(true);
    expect(moving("i-5")).toBe(true);

    await vi.waitFor(() => {
      expect(ghosts()).toEqual([]);
      expect(settler().getAnimations()).toEqual([]);
    });
    expect(settler().getBoundingClientRect().height).toBeLessThan(tall - 20);
  });

  it("glides the headings and buttons below along with the cards", async () => {
    show(tonyWith(range(1, 10), range(11, 12)));
    await expect.element(doList()).toBeVisible();
    await Promise.all(root.getAnimations({ subtree: true }).map((a) => a.finished));

    await userEvent.click(
      page.getByRole("button", { name: "Show 4 more of Tony Stark's Do issues" }),
    );
    const gliding = (key: string) =>
      root
        .querySelector(`[data-settle="${key}"]`)
        ?.getAnimations()
        .some((a) => a.playState === "running");
    expect(gliding("more-do")).toBe(true);
    expect(gliding("heading-schedule")).toBe(true);
    expect(gliding("i-11")).toBe(true);
  });

  it("changes at once with reduced motion", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    show(tonyWith(range(1, 4)));
    await expect.element(doList()).toBeVisible();
    await Promise.all(root.getAnimations({ subtree: true }).map((a) => a.finished));

    show(tonyWith([issue(1), issue(4)]));
    expect(ghosts()).toEqual([]);
    expect(settler().getAnimations()).toEqual([]);
    expect(
      Math.abs(settler().getBoundingClientRect().height - settler().scrollHeight),
    ).toBeLessThan(1);
  });
});
