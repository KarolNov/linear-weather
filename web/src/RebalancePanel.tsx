import * as stylex from "@stylexjs/stylex";
import { Avatar, Button, Card, VisuallyHidden, WeatherIcon, weatherLabels } from "ui";
import { colors, fonts, radii, space } from "ui/tokens.stylex";
import { describeDay, type Person, type Rebalance, type Suggestion } from "./board";
import { entrance } from "./motion";
import { quadrantFill, quadrantInfo } from "./quadrants";
import { weatherIcon } from "./weather";

export interface RebalancePanelProps extends Rebalance {
  teamName: string;
  onClose: () => void;
}

/**
 * Who could hand which issue to whom: for today's storms, and for the ones the forecast sees
 * coming. Only suggestions: nothing changes until someone reassigns the issue.
 */
export function RebalancePanel({
  teamName,
  rebalanceNow,
  rebalanceForecast,
  onClose,
}: RebalancePanelProps) {
  return (
    <Card as="section" xstyle={entrance.reveal}>
      <div {...stylex.props(styles.panel)}>
        <div>
          <h2 id="rebalance-heading" {...stylex.props(styles.heading)}>
            Rebalancing {teamName}
          </h2>
          <p {...stylex.props(styles.muted)}>
            The busiest person hands the least busy one issue at a time, until nobody is under rain
            or in a storm. Overdue work stays where it is, and nobody running late takes more.
          </p>
        </div>
        <div {...stylex.props(styles.horizons)}>
          <Horizon
            id="rebalance-now"
            title="Now"
            lead="Urgent work to hand over today."
            empty="Nothing to move: nobody's urgent load is far above the average, or no one move would help."
            suggestions={rebalanceNow}
          />
          <Horizon
            id="rebalance-forecast"
            title="Before the storm"
            lead="Work to hand over before it turns urgent, in the next 4 weeks."
            empty="Nothing to move ahead of time: no storm is coming that one move would head off."
            suggestions={rebalanceForecast}
          />
        </div>
        <div>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Horizon({
  id,
  title,
  lead,
  empty,
  suggestions,
}: {
  id: string;
  title: string;
  lead: string;
  empty: string;
  suggestions: Suggestion[];
}) {
  return (
    <section aria-labelledby={id} {...stylex.props(styles.horizon)}>
      <div>
        <h3 id={id} {...stylex.props(styles.subheading)}>
          {title}
        </h3>
        <p {...stylex.props(styles.muted)}>{lead}</p>
      </div>
      {suggestions.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{empty}</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {suggestions.map((suggestion) => (
            <SuggestionItem key={suggestion.issue.id} suggestion={suggestion} />
          ))}
        </ol>
      )}
    </section>
  );
}

function SuggestionItem({
  suggestion: { issue, from, to, week, toWeather, reason },
}: {
  suggestion: Suggestion;
}) {
  const quadrant = issue.quadrant.toLowerCase() as keyof typeof quadrantInfo;
  const icon = weatherIcon[toWeather];
  const when = week === null ? "now" : `in week ${week}`;
  return (
    <li {...stylex.props(styles.item)}>
      <div {...stylex.props(styles.issueLine)}>
        <a href={issue.url} target="_blank" rel="noreferrer" {...stylex.props(styles.identifier)}>
          {issue.identifier}
        </a>
        <span {...stylex.props(styles.title)} title={issue.title}>
          {issue.title}
        </span>
      </div>
      <div {...stylex.props(styles.moveLine)}>
        <span {...stylex.props(styles.quadrant, quadrantFill[quadrant])}>
          {quadrantInfo[quadrant].name}
        </span>
        {week !== null && issue.becomesUrgentOn && (
          <span {...stylex.props(styles.muted)}>urgent {describeDay(issue.becomesUrgentOn)}</span>
        )}
      </div>
      <div {...stylex.props(styles.moveLine)}>
        <VisuallyHidden>Move from</VisuallyHidden>
        <Who person={from} />
        <span aria-hidden="true" {...stylex.props(styles.arrow)}>
          →
        </span>
        <VisuallyHidden>to</VisuallyHidden>
        <Who person={to} />
        <span {...stylex.props(styles.after)}>
          <WeatherIcon
            weather={icon}
            size={22}
            label={`${to.name} would be: ${weatherLabels[icon]} ${when}.`}
          />
          <span aria-hidden="true">{when}</span>
        </span>
      </div>
      <p {...stylex.props(styles.reason)}>{reason}</p>
    </li>
  );
}

function Who({ person }: { person: Person }) {
  return (
    <span {...stylex.props(styles.who)}>
      <Avatar name={person.name} src={person.avatarUrl} size={22} />
      {person.name}
    </span>
  );
}

const styles = stylex.create({
  panel: { display: "flex", flexDirection: "column", gap: space.lg },
  heading: {
    fontFamily: fonts.display,
    fontSize: "1.125rem",
    fontWeight: 700,
    marginBottom: space.xxs,
  },
  subheading: { fontFamily: fonts.display, fontSize: "1rem", fontWeight: 700 },
  muted: { color: colors.inkMuted, fontSize: "0.9375rem" },
  horizons: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
    gap: space.lg,
    alignItems: "start",
  },
  horizon: { display: "flex", flexDirection: "column", gap: space.sm, minWidth: 0 },
  empty: {
    padding: space.md,
    borderRadius: radii.md,
    border: `1px dashed ${colors.border}`,
    color: colors.inkMuted,
    fontSize: "0.9375rem",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.xs,
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    padding: space.sm,
    borderRadius: radii.md,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surfaceStrong,
    minWidth: 0,
  },
  issueLine: { display: "flex", alignItems: "baseline", gap: space.xs, minWidth: 0 },
  identifier: {
    flexShrink: 0,
    fontWeight: 700,
    fontSize: "0.875rem",
    color: colors.ink,
    textDecoration: { default: "none", ":hover": "underline" },
  },
  title: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "0.9375rem",
  },
  moveLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.xs,
    fontSize: "0.875rem",
  },
  quadrant: {
    paddingInline: space.xs,
    paddingBlock: "1px",
    borderRadius: radii.pill,
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  who: { display: "inline-flex", alignItems: "center", gap: space.xxs, fontWeight: 600 },
  arrow: { color: colors.inkMuted },
  after: { display: "inline-flex", alignItems: "center", gap: space.xxs, color: colors.inkMuted },
  reason: { fontSize: "0.8125rem", color: colors.inkMuted, lineHeight: 1.4 },
});
