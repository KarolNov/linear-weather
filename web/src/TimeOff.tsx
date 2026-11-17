import * as stylex from "@stylexjs/stylex";
import { useState } from "preact/hooks";
import { Button, VisuallyHidden } from "ui";
import { colors, radii, space } from "ui/tokens.stylex";
import { type CalendarDate, describeTimeOff, MAX_TIME_OFF, type TimeOff } from "./board";

export interface TimeOffListProps {
  /** Whose time off, for labels. */
  name: string;
  /** Time off not over yet, soonest first. */
  timeOff: TimeOff[];
  today: CalendarDate;
  /** Marks them away; resolves to whether it was saved. Without it, time off is only shown. */
  onAdd?: (startsOn: CalendarDate, endsOn: CalendarDate) => Promise<boolean>;
  onRemove?: (timeOff: TimeOff) => void;
  /** A change to them is on its way to the server. */
  pending?: boolean;
}

/** Someone's time off coming up, to take back one by one, and a form to add more. */
export function TimeOffList({ name, timeOff, today, onAdd, onRemove, pending }: TimeOffListProps) {
  const [adding, setAdding] = useState(false);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  if (timeOff.length === 0 && !onAdd) return null;
  const full = timeOff.length >= MAX_TIME_OFF;

  const submit = async (event: Event) => {
    event.preventDefault();
    if (!onAdd) return;
    if (await onAdd(startsOn, endsOn)) setAdding(false);
  };

  return (
    <div {...stylex.props(styles.root)}>
      {timeOff.length > 0 && (
        <ul aria-label={`${name}'s time off`} {...stylex.props(styles.list)}>
          {timeOff.map((stretch) => {
            const when = describeTimeOff(stretch);
            return (
              <li key={stretch.id} {...stylex.props(styles.chip)}>
                <span>Away {when}</span>
                {onRemove && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onRemove(stretch)}
                    title={`Take back ${name}'s time off, ${when}`}
                    {...stylex.props(styles.remove)}
                  >
                    <span aria-hidden="true">×</span>
                    <VisuallyHidden>{`Take back ${name}'s time off, ${when}`}</VisuallyHidden>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {onAdd && !adding && (
        <button
          type="button"
          disabled={full}
          title={full ? `${MAX_TIME_OFF} stretches is the most; take one back first` : undefined}
          onClick={() => {
            setStartsOn(today);
            setEndsOn(today);
            setAdding(true);
          }}
          {...stylex.props(styles.add)}
        >
          {`Add time off${timeOff.length === 0 ? ` for ${name}` : ""}`}
        </button>
      )}
      {onAdd && adding && (
        <form
          onSubmit={submit}
          aria-label={`Add time off for ${name}`}
          {...stylex.props(styles.form)}
        >
          <label {...stylex.props(styles.field)}>
            <span>From</span>
            <input
              type="date"
              required
              min={today}
              value={startsOn}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setStartsOn(value);
                if (endsOn < value) setEndsOn(value);
              }}
              {...stylex.props(styles.date)}
            />
          </label>
          <label {...stylex.props(styles.field)}>
            <span>To</span>
            <input
              type="date"
              required
              min={startsOn || today}
              value={endsOn}
              onInput={(event) => setEndsOn(event.currentTarget.value)}
              {...stylex.props(styles.date)}
            />
          </label>
          <div {...stylex.props(styles.actions)}>
            <Button type="submit" variant="quiet" disabled={pending}>
              Add
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    fontSize: "0.8125rem",
    color: colors.inkMuted,
  },
  list: { display: "contents", listStyle: "none", margin: 0, padding: 0 },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    paddingBlock: "2px",
    paddingInline: "8px",
    borderRadius: radii.pill,
    backgroundColor: `color-mix(in srgb, ${colors.fog} 22%, transparent)`,
    color: colors.ink,
  },
  remove: {
    font: "inherit",
    lineHeight: 1,
    color: "inherit",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: radii.sm,
    padding: "2px",
    cursor: { default: "pointer", ":disabled": "progress" },
    opacity: { default: 0.6, ":hover": 1, ":focus-visible": 1 },
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
  },
  add: {
    font: "inherit",
    color: "inherit",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: radii.sm,
    padding: 0,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: "3px",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
  },
  // A row for each day, then the buttons: fits the narrowest card.
  form: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: space.xs,
    width: "100%",
  },
  field: { display: "contents" },
  actions: { gridColumn: "1 / -1", display: "flex", gap: space.xs },
  date: {
    font: "inherit",
    color: colors.ink,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingBlock: "2px",
    paddingInline: "6px",
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focus}` },
  },
});
