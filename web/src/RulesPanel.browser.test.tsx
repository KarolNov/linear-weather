import { render } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Rules } from "./board";
import type { MutationResult } from "./mutations";
import { RulesPanel } from "./RulesPanel";

const defaults: Rules = {
  importantFrom: 3,
  urgencyWindowDays: 14,
  noDueDate: "NOT_URGENT",
  dropAlertPercent: 40,
  awayStatuses: [],
  blockersAreImportant: false,
};

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement("div");
  document.body.append(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
});

/** The panel for `rules`, saving with `answer`. */
function panel(rules: Rules, answer: MutationResult = { ok: true, team: null }) {
  const onSave = vi.fn(async (_rules: Rules) => answer);
  const onClose = vi.fn();
  render(<RulesPanel teamName="Avengers" rules={rules} onSave={onSave} onClose={onClose} />, root);
  return { onSave, onClose };
}

const awayField = () => page.getByRole("textbox", { name: /^Away when their Linear status is/ });

describe("the rules panel's away statuses", () => {
  it("shows the team's saved statuses, one a line", async () => {
    panel({ ...defaults, awayStatuses: ["🌴🏖️", "On vacation, abroad"] });
    await expect.element(awayField()).toHaveValue("🌴🏖️\nOn vacation, abroad");
  });

  it("saves what's typed, a status a line, for the server to tidy", async () => {
    const { onSave, onClose } = panel(defaults);

    // Filled, not typed: typing sends an emoji's two UTF-16 halves as separate keys.
    await userEvent.fill(awayField(), "🌴🏖️\n\n  out sick ");
    await userEvent.click(page.getByRole("button", { name: "Save rules" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith({ ...defaults, awayStatuses: ["🌴🏖️", "", "  out sick "] });
  });

  it("saves an empty field as one blank line, which the server drops", async () => {
    const { onSave } = panel({ ...defaults, awayStatuses: ["🌴"] });

    await userEvent.clear(awayField());
    await userEvent.click(page.getByRole("button", { name: "Save rules" }));

    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ ...defaults, awayStatuses: [""] }),
    );
  });

  it("marks the field with the server's problem, and stays open", async () => {
    const message = "List at most 10 away statuses.";
    const { onClose } = panel(defaults, {
      ok: false,
      message,
      problems: [{ field: "awayStatuses", message }],
    });

    await userEvent.type(awayField(), "a lot");
    await userEvent.click(page.getByRole("button", { name: "Save rules" }));

    await expect.element(awayField()).toHaveAttribute("aria-invalid", "true");
    await expect.element(awayField()).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("the rules panel's blockers rule", () => {
  const box = () => page.getByRole("checkbox", { name: "Are always important" });

  it("shows whether the team counts blockers as important, and saves the change", async () => {
    const { onSave, onClose } = panel(defaults);
    await expect.element(box()).not.toBeChecked();

    await userEvent.click(box());
    await userEvent.click(page.getByRole("button", { name: "Save rules" }));

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    // The empty away field goes as one blank line, which the server drops.
    expect(onSave).toHaveBeenCalledWith({
      ...defaults,
      awayStatuses: [""],
      blockersAreImportant: true,
    });
  });

  it("starts checked when the team already counts them", async () => {
    panel({ ...defaults, blockersAreImportant: true });
    await expect.element(box()).toBeChecked();
  });
});
