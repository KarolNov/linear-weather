# Linear Weather

A team-load "weather report" for [Linear](https://linear.app), built on its GraphQL API.

Each developer's assigned issues are sorted into an **Eisenhower matrix** (Do / Schedule / Delegate / Drop). A PM can then see at a glance who is overloaded **now** and who is about to be.

## The idea

- **Quadrants from rules.** Default rules (configurable per team):
  - *Important*: Linear priority Medium or higher
  - *Urgent*: due within 14 days, or overdue
  - Issues with no due date count as not urgent

  A PM can still override any issue by hand.
- **Backlog rot.** When more than 40% of a team's open issues (configurable per team) sit in Drop, the board's header flags it: a backlog filling with work nobody means to do.
- **Weather (now).** Each person's current urgent load compared with their fair share: the team average, scaled by how much of a full-time week they work (their **capacity**, set on the board). ☀️ ⛅ 🌧️ ⛈️ Someone on **time off** (added on the board) is 🌙 away: out of the average, and any urgent work they still hold storms the team.
- **Forecast (next weeks).** Due dates show when each issue will turn urgent, so the app can project load week by week: `☀️ ☀️ 🌧️ ⛈️`, with why ("3 High-priority issues become urgent"). Undated work shows up as 🌫️ fog.
- **Rebalance.** The app suggests reassignments to fix today's storm or the one coming in week 3, and applies them in Linear with one click.

## Why GraphQL

This is a learning project. It consumes Linear's GraphQL API and exposes its own GraphQL server that extends Linear's types with derived fields (`quadrant`, `weather`, `forecast(weeks:)`). Along the way it covers DataLoader, mutations with typed errors, and subscriptions driven by Linear webhooks.

## Tech stack

Everything deploys to Cloudflare Workers.

| | |
|---|---|
| Workspace | [pnpm](https://pnpm.io) workspaces: `server/`, `web/` and `ui/` (shared Preact components) |
| Server | [Hono](https://hono.dev) Worker hosting [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) with a code-first [Pothos](https://pothos-graphql.dev) schema |
| Storage | [D1](https://developers.cloudflare.com/d1/) (Cloudflare's SQLite) for team rules, hand-placed issues, and people's capacity and time off, through [Drizzle ORM](https://orm.drizzle.team). Linear tokens live in KV |
| Web | [Preact](https://preactjs.com) server-rendered by a Hono Worker, hydrated in the browser; built with [Vite](https://vite.dev) and the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) |
| Styling | [StyleX](https://stylexjs.com), compiled at build time by `@stylexjs/unplugin`. Theme tokens (sky gradients, weather colours) live in `ui/src/tokens.stylex.ts` |
| Tests | [Vitest](https://vitest.dev); server tests run inside workerd via [`@cloudflare/vitest-plugin`](https://developers.cloudflare.com/workers/testing/vitest-integration/); the board's client behaviour (`*.browser.test.tsx`) runs in headless Chromium via [Vitest browser mode](https://vitest.dev/guide/browser/) |
| Lint/format | [Biome](https://biomejs.dev) |

## Development

Needs Node 24 (`.nvmrc`) and pnpm via Corepack (`corepack enable`).

```bash
pnpm install
cp server/.env.example server/.env   # then fill in the Linear OAuth app, see below
pnpm dev:web      # http://localhost:5173, runs the server Worker alongside
```

`pnpm dev:server` runs the server alone on http://localhost:8787 (GraphiQL at `/graphql`).

Both dev commands apply pending D1 migrations to the local database first.

The browser tests need Playwright's Chromium, installed once with `pnpm --filter web exec playwright install chromium`.

Checks (same as CI): `pnpm typecheck`, `pnpm codegen:check`, `pnpm lint`, `pnpm test`, `pnpm build`. `pnpm format` fixes formatting.

After changing a `wrangler.jsonc`, run `pnpm --filter server cf-typegen` to regenerate `worker-configuration.d.ts`.

## Querying Linear

Queries to Linear live in `.graphql` files under `server/src/` (e.g. `server/src/linear/team-issues.graphql`). [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) checks them against [Linear's schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql) and generates `server/src/linear/generated.ts`: one typed document per query (`OpenIssuesDocument`) plus its result and variable types. Code imports only the documents it uses, so the bundle carries just those queries, once each. We skip the client preset's `graphql()` tag because it bundles a lookup table of every query.

Linear also publishes a ready-made, typed SDK ([`@linear/sdk`](https://github.com/linear/linear/tree/master/packages/sdk)), generated from that same schema. We don't use it, because writing the queries and running codegen ourselves is part of what this project is for. It's also a fair trade on cost: our own queries fetch exactly the fields we need, and Linear's rate-limiting guide recommends custom queries over the SDK for fetching many issues.

- After adding or changing a query, run `pnpm --filter server codegen` and commit what it generates. `pnpm codegen:check` fails if the committed output is stale.
- The same command prints our own schema to `server/schema.graphql`. After changing `server/src/schema.ts` or the board's operations in `web/src/*.graphql`, run it and then `pnpm --filter web codegen`, and commit both.
- The schema is fetched from Linear's SDK repo at a pinned commit (`LINEAR_SCHEMA_COMMIT` in `server/codegen.ts`). To pick up schema changes, bump the commit and rerun codegen.

Linear limits each user to 5,000 requests and 2,000,000 [complexity points](https://linear.app/developers/rate-limiting) an hour, and rejects any single query over 10,000 points. These limits shaped the open-issues query:

- **Only the fields the matrix needs** (the `IssueCard` fragment). Each field costs 0.1 points and each nested object costs 1, multiplied by the page size.
- **`nodes` instead of `edges { node cursor }`**, which saves an object per issue. `pageInfo.endCursor` is the only cursor needed.
- **Pages of 250**, Linear's maximum. A full page should cost about 1,300 points, which leaves plenty of room under the cap and keeps the request count low.
- **Filtering on the server**: only issues that aren't completed or canceled, in the teams asked for. One query covers several teams, and each issue carries its `team { id }` so they can be split up again.

The client reads Linear's rate-limit headers after each request and remembers what each query cost. Linear's budget refills continuously, so before sending a query the client waits until the remaining budget covers one more request at that cost. When Linear still answers `RATELIMITED`, it retries up to 3 times, waiting at least 0.25s, 0.5s, then 1s. If the budget would take more than 5s to refill, or the retries run out, it gives up with the time the budget resets.

## Our schema

The server's own schema (`server/src/schema.ts`, code-first with Pothos) mirrors the slice of Linear's `Issue`, `User` and `Team` the board needs, and extends them with fields derived by the pure rules engine in `server/src/domain/`:

```graphql
enum Quadrant { DO SCHEDULE DELEGATE DROP }
enum QuadrantSource { RULE OVERRIDE }

type Issue {          # id, identifier, title, url, dueDate, priority, estimate, state, assignee, plus:
  quadrant: Quadrant!
  quadrantSource: QuadrantSource!
  placementReason: String!   # "High priority, due in 3 days"
  becomesUrgentOn: Date      # today if already urgent, null if it never will be
}

type Matrix {         # each list most pressing first
  do: [Issue!]!  schedule: [Issue!]!  delegate: [Issue!]!  drop: [Issue!]!
  counts: QuadrantCounts!  points: QuadrantPoints!
}

enum WeatherKind { SUNNY CLOUDY RAIN STORM FOG AWAY }   # AWAY: a person off all of the period, never a team
enum LoadMetric { POINTS ISSUES }
type Weather { kind: WeatherKind!  metric: LoadMetric!  load: Float  teamAverage: Float  overdue: Int!  reason: String! }
type ForecastWeek {   # the urgent load expected by the week's last day
  startsOn: Date!  endsOn: Date!  weather: Weather!
  turningUrgent: [Issue!]!  summary: String!   # "3 High-priority issues become urgent"
}
type TeamForecast { weeks: [ForecastWeek!]!  worst: ForecastWeek! }
enum Horizon { NOW FORECAST }
type Suggestion {     # "Move AVG-11 (Delegate) from Tony → Wanda (☀️ now)"
  issue: Issue!  from: User!  to: User!
  week: Int           # FORECAST: the week it heads a storm off in
  fromWeather: WeatherKind!  toWeather: WeatherKind!  reason: String!
}

type User {           # teamId defaults to the team it was reached through
  capacity: Float!    # share of a full-time week, 0.5 = half time; the same on every team
  timeOff: [TimeOff!]!   # not over yet, soonest first; the same on every team
  matrix(teamId: ID): Matrix!
  weather(teamId: ID, metric: LoadMetric): Weather!   # urgent load vs teamAverage × capacity
  forecast(teamId: ID, weeks: Int! = 4, metric: LoadMetric): [ForecastWeek!]!   # 1 to 12 weeks
}
type TimeOff { id: ID!  startsOn: Date!  endsOn: Date! }   # both days included
type BacklogRot { drop: Int!  total: Int!  share: Float!  alertPercent: Int!  rotting: Boolean!  reason: String! }
type Team {
  rules: QuadrantRules!  people: [User!]!  unassigned: Matrix!
  backlogRot: BacklogRot!                 # Drop's share of all open issues, against rules.dropAlertPercent
  loadMetric: LoadMetric!                 # POINTS if every urgent issue is estimated, else ISSUES
  weather(metric: LoadMetric): Weather!   # how evenly urgent load is spread
  forecast(weeks: Int! = 4, metric: LoadMetric): TeamForecast!   # worst: the team's score
  rebalanceSuggestions(horizon: Horizon!, weeks: Int! = 4, metric: LoadMetric): [Suggestion!]!
}
type Query { today: Date!  viewer: User  teams: [Team]  team(id: ID): Team }

type Mutation {
  updateQuadrantRules(teamId: ID!, input: QuadrantRulesInput!): UpdateRulesResult!
  overrideQuadrant(issueId: ID!, quadrant: Quadrant!): OverrideResult!
  clearOverride(issueId: ID!): OverrideResult!
  reassignIssue(issueId: ID!, userId: ID!): ReassignResult!   # writes to Linear
  setCapacity(teamId: ID!, userId: ID!, factor: Float!): SetCapacityResult!   # answers with that team
  addTimeOff(teamId: ID!, userId: ID!, startsOn: Date!, endsOn: Date!): TimeOffResult!
  removeTimeOff(teamId: ID!, userId: ID!, timeOffId: ID!): TimeOffResult!
}
union UpdateRulesResult = UpdateRulesSuccess | InvalidRules | TeamNotFound | Unauthorized | LinearRateLimited
union OverrideResult = OverrideSuccess | IssueNotFound | Unauthorized | LinearRateLimited
union ReassignResult = ReassignSuccess | IssueNotFound | Unauthorized | LinearRateLimited
union SetCapacityResult = SetCapacitySuccess | InvalidCapacity | TeamNotFound | UserNotFound | Unauthorized | LinearRateLimited
union TimeOffResult = TimeOffSuccess | InvalidTimeOff | TimeOffNotFound | TeamNotFound | UserNotFound | Unauthorized | LinearRateLimited
interface Error { message: String! }   # every failure above implements it
```

### Fair share

Weather compares each person with their **fair share** of the team's urgent load, not the plain average. `teamAverage` is the team's load per full-time person, `Σload / Σcapacity` over everyone whose load can be measured, and a person's fair share is `teamAverage × capacity`. So someone at half time with 6 urgent issues on a team averaging 6 per full-time person reads "6 urgent issues at half time, 2.0× their share". With everyone at full time it's the mean, as before. It depends only on totals, so handing an issue from one person to another doesn't move it, which rebalancing relies on.

### Time off

Someone off all of today is **away** (`AWAY`, "Away until Nov 20, holding 3 urgent issues"). They're left out of `Σload / Σcapacity`, so the others' shares cover their absence. Urgent work they still hold is work nobody is doing, so the team turns stormy ("Natasha is away with 4 urgent issues") and rebalancing moves that work first. Stretches that meet, overlap or have only a weekend between them read as one, so "until" names the day before they're back.

### The forecast

`forecast(weeks:)` takes a field argument, so one query can ask for 4 weeks on the board and 12 somewhere else, each with its own alias. (A REST API would need a query string or another endpoint.) Each week projects every matrix to the week's last day (`server/src/domain/forecast.ts`) and reads the weather as it is now, against that week's fair share. The projection assumes:

- **Issues turn urgent when their due dates say** (`becomesUrgentOn`), and issues placed by hand stay where they were put.
- **Work is done by its due date**, so it leaves the load once that's passed. Work that's already overdue has missed its date, so it stays, and keeps the weather stormy, until it's done.
- **Load is counted in points only if every issue urgent in any week is estimated** (unless `metric` says otherwise), so an unestimated issue arriving later doesn't fog a week.
- **Undated work never turns urgent.** Someone holding it with nothing urgent projected is 🌫️ fog, a nudge to set dates.
- **Time off lowers a week's capacity** by the working days missed: `capacity × days present / 5`, so a full-timer off two days reads "at 60% time (2 days off)". Off all five, they're away that week.

The team's `worst` week is the most lopsided one (storm, then rain, then fog, then cloudy), the earliest of equals.

### Rebalancing

`Team.rebalanceSuggestions(horizon:)` lists moves that would bring everyone's urgent load within the weather's thresholds, in the order to make them (`server/src/domain/rebalance.ts`). It's greedy: while someone is under rain or in a storm by load, the busiest person for their capacity hands the least busy one issue, the one that evens the two out most (lowers `load² / capacity` summed over both the most; with everyone full time, the one that leaves them closest), and the weather is read again.

- **`NOW`** moves work that is urgent today.
- **`FORECAST`** heads storms off before they arrive, starting from the board as the `NOW` moves leave it. It settles the weeks in order, each before the next, moving work that isn't urgent yet but will be by that week's end. An issue weighs on every week from when it turns urgent until it's due, so a move has to even out the giver's and taker's load across all those weeks together (their sum of squares has to drop). Otherwise, easing week 3 could bury the taker in week 2, and the next round would send the issue back.
- **Away first:** urgent work held by someone away (today, or in the week it turns urgent) moves before anything else, overdue or not, most pressing first, each issue to whoever is least busy then. Nobody takes on work for a week they're away.
- **What doesn't move:** otherwise, overdue work, since moving it only moves the storm. Nobody running late takes on more, and nobody whose load can't be measured does either. Each issue moves at most once, and only if it narrows the gap, so the list always ends.

So the two lists read as one plan: make today's moves, then each week's in turn. The forecast list never repeats today's moves.

### Mutations and their errors

Each mutation answers with a union: what it did, or one of the failures a client is expected to handle (bad rules, an id the viewer can't see, signed out, Linear's rate limit). They're ordinary types with fields of their own, like `InvalidRules.problems` (one per input field, for a settings form) or `LinearRateLimited.resetAt`, so clients see them in the schema and switch on `__typename`. Each implements `Error`, so `... on Error { message }` catches any a client doesn't single out. Top-level `errors` are left for the unexpected, like the database failing.

- **Checked against Linear first.** A team must be one the viewer can see, and so must an issue, so nobody changes rules or places issues in workspaces they aren't in. Whoever takes a reassigned issue must be a member of its team; anyone else, including someone who holds the team's issues from elsewhere, is a top-level `BAD_USER_INPUT` error, since the board never suggests them.
- **Reassigning writes to Linear.** `reassignIssue` calls Linear's `issueUpdate` with the new assignee, which needs the OAuth `write` scope. Linear refusing the change (`FORBIDDEN`, e.g. a token without `write`) answers `Unauthorized`, like a revoked session.
- **The demo's changes stay in the visitor's browser.** Anyone can open `?demo=true`, so its mutations never reach D1: rules, overrides, reassigned issues, capacities and time off go in a compact `lw_demo` cookie (`server/src/db/demo-store.ts`, format in `demo-cookie.ts`), which every `?demo=true` request reads and any that changes something sets again. A cookie rather than localStorage, because the board renders on the server. The client still calls `/graphql?demo=true`, and sends mutations one at a time, since two in flight start from the same cookie and the last response wins. Clearing site data resets the demo.
- **Derived fields follow on their own.** A success hands back the team (and, for overrides and reassignments, the issue), and everything on them is derived when read. After `updateQuadrantRules`, `team { people { matrix { counts } } }` in the same response is already sorted by the new rules, with no code written for it. Writes go through the request's `Placements`, and a reassignment drops the team's cached Linear work, so nothing later in the response reads what was cached before.

The web Worker loads a page with one query (`Board` in `web/src/board.graphql`), and the board's mutations live beside it (`web/src/mutations.graphql`). `pnpm --filter server codegen` prints our schema to `server/schema.graphql`, and `pnpm --filter web codegen` types those operations against it into `web/src/generated.ts`, so a field the board reads that's renamed or made nullable in `schema.ts` fails web's codegen or typecheck. A server test also runs each of them against the schema, to check what they load. Each asks for the team's board back through the same `TeamBoard` fragment the page loads with, so after a rules change or a move the browser redraws from the answer and never works out a quadrant itself. Within a request each team's members and issues are fetched from Linear once and shared by every resolver that needs them (`server/src/workspace.ts`). Two per-request [DataLoaders](https://github.com/graphql/dataloader) batch the lookups, one for team members and one for open issues, so every team resolved in the same tick shares one Linear query of each kind.

### N+1, measured

Resolvers don't fetch anything themselves. They ask the `Workspace` for a team's work: `Team.people` and `Team.unassigned` ask once each, and so does every person's `User.matrix`. The counts below come from the demo workspace (Avengers: 7 people plus unassigned issues; S.H.I.E.L.D. Ops: 4). Tests in `server/src/schema.test.ts` pin the "after" column.

| Query | Team lookups by resolvers | If each lookup fetched (2 requests) | Per-team cache (#8) | + DataLoader (#9) |
|---|---|---|---|---|
| `BOARD_QUERY`, one team | 9 | 20 | 4 | 4 |
| Every team's people and matrices, 2 teams | 15 | 31 | 5 | 3 |
| … with *T* teams | | ~2 × lookups + 1 | 1 + 2*T* | 2 + ⌈*T*/10⌉ |

The per-team cache removed the per-person N+1. That left one per team: each team cost a members query and an issues query of its own. DataLoader removes that too. Requests no longer grow with the number of people or teams, only with the number of issues (one more page per 250).

Measured against a real workspace (2 teams, 5 open issues) through Linear's `x-complexity` header:

| Linear query | Complexity |
|---|---|
| `Viewer` | 3 |
| `Teams` | 376 |
| `TeamsMembers`, 1 team / 2 teams | 327 / 653 |
| `OpenIssues`, 1 team / 2 teams | 8 / 8 |

- `TeamsMembers` grows by ~327 points a team, as [Linear's rules](https://linear.app/developers/rate-limiting) predict (250 members at 1.3 points each). Batches stop at 10 teams (~3,300 points), well under the 10,000 cap on one query. `OpenIssues` takes every team at once.
- `OpenIssues` cost the same for 1 issue and for 5. The ~1,300 a full page of 250 would cost by those rules is an estimate; no workspace we've tried has that many open issues.

Errors stay next to the field that failed: `teams` and `team` are nullable, so a rate-limited board still returns the `viewer`. Linear's rate limit comes back as `extensions: { code: "RATE_LIMITED", resetAt }` and a revoked token as `UNAUTHENTICATED`. Any other error is masked.

## Our own data

Linear holds the issues. What only this app knows lives in a D1 database (binding `DB`), defined in `server/src/db/tables.ts`:

- **`quadrant_rules`**: one row per team that changed its rules. Teams without a row use the defaults above, so a new team needs no setup.
- **`quadrant_override`**: issues a PM placed by hand, keyed by Linear's issue id, so an override follows the issue if it moves teams. An overridden issue reports `quadrantSource: OVERRIDE`, and its `placementReason` still says where the rules would put it. `becomesUrgentOn` keeps following the due date.
- **`member_capacity`**: how much of a full-time week someone works, more than 0 up to 1, keyed by Linear's user id so it's the same on every team. Only people who aren't full time have a row. Someone split across two teams counts at their full capacity on each, so both boards overestimate them.
- **`time_off`**: stretches someone is away, `starts_on` to `ends_on` as calendar dates with both days included, keyed by Linear's user id. Rows stay once they're over; the board only reads what isn't. Each person can have at most 8 stretches coming up.

CHECK constraints keep values the board can't use out of the database, including non-integer rules that GraphQL's `Int` couldn't send.

Within a request, rules, overrides, capacities and time off are read through DataLoaders (`server/src/placements.ts`), so every team and person resolved in the same tick shares one query for each. The ids go in as a single JSON parameter (`IN (SELECT value FROM json_each(?))`), because D1 binds at most 100 parameters per statement and a team can have thousands of open issues. If D1 fails, the board still loads, using the default rules, no hand placements and everyone full time and present, and the error is logged.

### Migrations

[Drizzle Kit](https://orm.drizzle.team/docs/kit-overview) writes SQL migrations from the tables, and Wrangler applies them with [D1's own migrations](https://developers.cloudflare.com/d1/reference/migrations/), which record what has run in a `d1_migrations` table.

- After changing `tables.ts`, run `pnpm --filter server db:generate` and commit the new file in `server/migrations/`.
- Local dev applies them for you. To apply them by hand, run `pnpm --filter server db:migrate:local`.
- Tests apply every migration to an empty database in workerd (`server/test/apply-migrations.ts`) and empty the tables after each test.
- In production, `pnpm --filter server deploy` (`server/scripts/deploy.sh`, the server's Workers Builds deploy command) applies migrations, then deploys. A migration runs while the previous code is still live, so it should add rather than rename or drop.
- The production database and session namespace are pinned by id in `server/wrangler.jsonc`. Without ids, Wrangler works out on each deploy which ones the live Worker uses, and when it couldn't, it tried to create them again and the deploy failed on the taken name.
- **Deploy the server before the web.** The two Workers deploy on their own, and the web's queries and mutations are checked against the server's schema. A web Worker that's ahead asks for fields the live server doesn't have yet, like `reassignIssue`, and those requests fail until the server catches up. A server that's behind also rewrites the demo's `lw_demo` cookie without the parts it doesn't know, such as reassigned issues.
- [Worker Previews](https://developers.cloudflare.com/workers/previews/) of other branches use a shared staging database, `linear-weather-preview`, and their own session store (the `previews` block in `server/wrangler.jsonc`). `pnpm --filter server preview` (`server/scripts/preview.sh`, the server's Workers Builds preview command) migrates that database, then deploys the Preview.

### Previews

Every branch gets a Preview of each Worker, with its URL posted on the pull request. Previews don't inherit production settings, so each `wrangler.jsonc` lists its bindings again under `previews`, and secrets are set with `wrangler preview base-config secret put <NAME>`.

- **Try changes in the demo.** Linear's OAuth app only redirects back to the production URL, so signing in doesn't work on a Preview. Add `?demo=true`.
- **A web Preview talks to the production server.** Service bindings from a Preview reach the bound Worker's production deployment. To try a branch's server changes, use the server Preview's own URL: GraphiQL at `/graphql?demo=true`.

## Signing in with Linear

People sign in with their own Linear account through OAuth, so the app sees exactly the workspaces and teams they can see in Linear.

```mermaid
sequenceDiagram
  participant B as Browser
  participant W as web Worker
  participant S as server Worker
  participant L as Linear
  B->>W: GET /auth/login
  W->>S: (service binding)
  S-->>B: 302 to linear.app/oauth/authorize (state + PKCE)
  B->>L: approve
  L-->>B: 302 to /auth/callback?code
  B->>W: GET /auth/callback
  W->>S: (service binding)
  S->>L: exchange code for tokens
  S-->>B: session cookie, 302 to /
```

- The browser only talks to the **web** Worker. It passes `/auth/*` and `/graphql` through to the **server** Worker over a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), so the session cookie is first-party. (Separate `*.workers.dev` subdomains couldn't share a cookie.)
- Linear tokens stay on the server, in the `SESSIONS` KV namespace, keyed by a hash of the session cookie. Access tokens last about 24 hours and are refreshed automatically. Signing out revokes them.
- Scopes are `read,write`. `write` is for reassigning issues (#16), requested up front so nobody has to approve twice.

### Register the OAuth app

1. In Linear: **Settings → API → OAuth applications → New**. Any workspace you're an admin of will do. The app works for users in other workspaces too.
2. **Callback URLs**, one per line:
   - `http://localhost:5173/auth/callback` for local dev
   - `https://<your web Worker's domain>/auth/callback` for production
3. Copy the client ID and secret into `server/.env` as `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET`. For production run `wrangler secret put LINEAR_CLIENT_ID` (and `LINEAR_CLIENT_SECRET`) in `server/`.
4. To let people outside your workspace sign in, turn on **Public** in the app's settings.

### Dev shortcut: personal API key

If you just want data without setting up OAuth, put a personal API key in `server/.env` as `LINEAR_API_KEY`. It's used only when nobody is signed in and only for requests to `localhost`, so it can't leak through a deployed Worker. Leave it empty to test the real login.

### The demo workspace

No Linear account? Open `/?demo=true` to see the board as Nick Fury, PM of a mocked Avengers team. The web Worker passes the flag on to `/graphql?demo=true`, which answers from `server/src/linear/demo.ts` instead of Linear, whoever is signed in. The demo answers the same typed queries as Linear (through the `LinearSource` interface), with due dates counted from today, so tests can use it too: `new DemoLinear({ today: "2026-10-18" })`.

## Status

🌦️ Board: pick a team and see each person's issues sorted into Do / Schedule / Delegate / Drop by its team's rules or by hand, served by our GraphQL schema. **Sorting rules** edits the team's rules, including when to flag backlog rot (too much in Drop), which the header then shows; each issue's menu moves it to another quadrant or hands it back to the rules, and cards placed by hand say so. Both work in the demo too. Each person shows their weather now and a strip of the next 4 weeks; hover or press a week to see why. **Rebalance** suggests who should hand which issue to whom, now and before the storms the forecast sees; **Hand over** makes a move in Linear in one click, and **Make all of today's moves** makes the Now list's moves in order after a yes, stopping at the first that fails.
# linear-weather
Eisenhower-matrix team load weather &amp; forecast for Linear, built with GraphQL
