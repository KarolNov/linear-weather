import * as stylex from "@stylexjs/stylex";
import { useState } from "preact/hooks";
import { Button, Card } from "ui";
import { colors, fonts, media, radii, space } from "ui/tokens.stylex";
import { MAX_URGENCY_WINDOW_DAYS, type Rules } from "./board";
import { entrance } from "./motion";
import type { MutationResult, RuleProblem } from "./mutations";

export interface RulesPanelProps {
  teamName: string;
  rules: Rules;
  /** Saves the rules. On success the board redraws and the panel closes. */
  onSave: (rules: Rules) => Promise<MutationResult>;
  onClose: () => void;
}

const IMPORTANT_FROM: [number, string][] = [
  [1, "Urgent only"],
  [2, "High or higher"],
  [3, "Medium or higher"],
  [4, "Low or higher"],
];

/** A team's sorting rules, as a form. Nothing changes on the board until it's saved. */
export function RulesPanel({ teamName, rules, onSave, onClose }: RulesPanelProps) {
  const [importantFrom, setImportantFrom] = useState(rules.importantFrom);
  // Kept as typed, so clearing the field to retype it doesn't snap back to a number.
  const [windowDays, setWindowDays] = useState(String(rules.urgencyWindowDays));
  const [noDueDate, setNoDueDate] = useState(rules.noDueDate);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; problems: RuleProblem[] } | null>(null);
  const problem = (field: keyof Rules) => failure?.problems.find((p) => p.field === field);
  const windowProblem = problem("urgencyWindowDays");
  const importantProblem = problem("importantFrom");

  const submit = async (event: Event) => {
    event.preventDefault();
    setSaving(true);
    setFailure(null);
    const result = await onSave({
      importantFrom,
      urgencyWindowDays: Number(windowDays),
      noDueDate,
    });
    setSaving(false);
    if (result.ok) onClose();
    else setFailure(result);
  };

  return (
    <Card as="section" xstyle={entrance.reveal}>
      <form aria-labelledby="rules-heading" onSubmit={submit} {...stylex.props(styles.form)}>
        <div>
          <h2 id="rules-heading" {...stylex.props(styles.heading)}>
            How {teamName} sorts issues
          </h2>
          <p {...stylex.props(styles.muted)}>
            Issues placed by hand stay where they are. Everything else moves to follow the rules.
          </p>
        </div>

        <div {...stylex.props(styles.fields)}>
          <label {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.label)}>Important when priority is</span>
            <select
              value={importantFrom}
              onChange={(event) => setImportantFrom(Number(event.currentTarget.value))}
              aria-invalid={importantProblem ? true : undefined}
              aria-describedby={importantProblem ? "rules-important-problem" : undefined}
              {...stylex.props(styles.input)}
            >
              {IMPORTANT_FROM.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span {...stylex.props(styles.hint)}>No priority never counts as important.</span>
            {importantProblem && (
              <span id="rules-important-problem" {...stylex.props(styles.problem)}>
                {importantProblem.message}
              </span>
            )}
          </label>

          <label {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.label)}>Urgent when due within</span>
            <span {...stylex.props(styles.withUnit)}>
              <input
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={MAX_URGENCY_WINDOW_DAYS}
                step={1}
                value={windowDays}
                onInput={(event) => setWindowDays(event.currentTarget.value)}
                aria-invalid={windowProblem ? true : undefined}
                aria-describedby={windowProblem ? "rules-window-problem" : undefined}
                {...stylex.props(styles.input, styles.number)}
              />
              <span>days</span>
            </span>
            <span {...stylex.props(styles.hint)}>Overdue issues are always urgent.</span>
            {windowProblem && (
              <span id="rules-window-problem" {...stylex.props(styles.problem)}>
                {windowProblem.message}
              </span>
            )}
          </label>

          <fieldset {...stylex.props(styles.field, styles.fieldset)}>
            <legend {...stylex.props(styles.label, styles.legend)}>Issues with no due date</legend>
            {(
              [
                ["NOT_URGENT", "Aren't urgent"],
                ["URGENT", "Are urgent"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} {...stylex.props(styles.radio)}>
                <input
                  type="radio"
                  name="noDueDate"
                  value={value}
                  checked={noDueDate === value}
                  onChange={() => setNoDueDate(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>

        {failure && failure.problems.length === 0 && (
          <p role="alert" {...stylex.props(styles.problem)}>
            {failure.message}
          </p>
        )}

        <div {...stylex.props(styles.actions)}>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save rules"}
          </Button>
          {/* Once sent, the save can't be called back, so Cancel waits for it. */}
          <Button variant="quiet" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

const styles = stylex.create({
  form: { display: "flex", flexDirection: "column", gap: space.lg },
  heading: {
    fontFamily: fonts.display,
    fontSize: "1.125rem",
    fontWeight: 700,
    marginBottom: space.xxs,
  },
  muted: { color: colors.inkMuted, fontSize: "0.9375rem" },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
    gap: space.lg,
  },
  field: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  fieldset: { margin: 0, padding: 0, borderWidth: 0 },
  label: { fontWeight: 600, fontSize: "0.9375rem" },
  // A legend ignores flex gap, so it brings its own.
  legend: { padding: 0, marginBottom: space.xxs },
  input: {
    minHeight: { default: "38px", [media.touch]: "44px" },
    paddingBlock: "6px",
    paddingInline: space.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":is([aria-invalid=true])": colors.danger,
    },
    backgroundColor: colors.surfaceStrong,
    color: colors.ink,
    font: "inherit",
    fontSize: "0.9375rem",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
    outlineOffset: "1px",
  },
  number: { width: "6rem", fontVariantNumeric: "tabular-nums" },
  withUnit: { display: "flex", alignItems: "center", gap: space.xs },
  hint: { fontSize: "0.8125rem", color: colors.inkMuted },
  problem: { fontSize: "0.875rem", fontWeight: 600, color: colors.danger },
  radio: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minHeight: { default: "30px", [media.touch]: "44px" },
    fontSize: "0.9375rem",
    cursor: "pointer",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: space.xs },
});
