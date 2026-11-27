# sorting/team-rules

## Purpose
Let a PM read and change a team's sorting rules, checked field by field before anything is saved, with sensible defaults for a team that never set its own.

## Requirements

### Requirement: Defaults for a team without rules
A team that never saved rules SHALL be sorted by, and report, the defaults: important from Medium, a 14-day urgency window, undated issues not urgent, a 40% Drop alert, no away statuses, and the blocker and current-cycle rules off.

- **Scenario: New team reads the defaults** <!-- accepted -->
  - **GIVEN** a team that never saved rules
  - **WHEN** a client asks for the team's `rules`
  - **THEN** it gets important from 3 (Medium), a 14-day window, NOT_URGENT for no due date, a 40% Drop alert, an empty away list, and both opt-in rules off
- **Scenario: Store unavailable falls back to the defaults** <!-- accepted -->
  - **GIVEN** a team saved its own rules but the app's database can't be read
  - **WHEN** the board loads
  - **THEN** it loads without an error, sorted by the default rules

### Requirement: Saving replaces the team's rules
Saving rules for a team SHALL replace them for every later request, and the answer SHALL carry the team so the client can read the board already sorted by the new rules.

- **Scenario: Matrices follow new rules at once** <!-- accepted -->
  - **GIVEN** a team on the default rules where one person has Do 9, Schedule 1, Delegate 2, Drop 1
  - **WHEN** a PM saves important from Urgent only and a 1-day window
  - **THEN** the answer is a success whose team shows that person with Do 0, Schedule 4, Delegate 2, Drop 7, and the next request reads the same rules

### Requirement: Optional fields keep their saved value
The priority threshold, urgency window and no-due-date choice MUST be given on every save, while the Drop alert, away statuses and the blocker and cycle rules, when left out, MUST keep the team's saved values.

- **Scenario: Drop alert kept when left out** <!-- accepted -->
  - **GIVEN** a team saved a 25% Drop alert
  - **WHEN** a PM saves rules without a Drop alert
  - **THEN** the team's Drop alert is still 25%

### Requirement: Field-by-field validation
Proposed rules MUST be refused, with nothing saved, when any field is out of range, and the refusal MUST list every problem at once, each naming its field and a message, with all messages joined as the overall message.

- **Scenario: Several problems reported together**
  - **WHEN** a PM saves important from 0 and a 0-day window
  - **THEN** the answer is InvalidRules with the problems "Important from must be a priority: 1 (Urgent) to 4 (Low)." on `importantFrom` and "The urgency window must be 1 to 365 whole days." on `urgencyWindowDays`, and the saved rules are unchanged
- **Scenario: Drop alert out of range**
  - **WHEN** a PM saves a Drop alert of 100, 0 or 12.5
  - **THEN** it is refused on `dropAlertPercent` with "The Drop alert must be 1 to 99 whole percent."
- **Scenario: Too many or too long away statuses**
  - **WHEN** a PM saves 11 away statuses, or one of 41 characters
  - **THEN** it is refused on `awayStatuses` with "List at most 10 away statuses." or "An away status is at most 40 characters."
- **Scenario: Extremes are accepted**
  - **WHEN** a PM saves important from 4 (Low), a 365-day window, a 99% Drop alert and ten statuses of up to 40 characters
  - **THEN** the rules are saved as given

### Requirement: Away statuses are tidied
Saved away statuses MUST be trimmed, with blank entries dropped and repeats kept once, ignoring case, before they are checked and stored.

- **Scenario: Tidy on save**
  - **WHEN** a PM saves the away statuses " Vacation ", "", "🌴", "vacation" and "  "
  - **THEN** the team's away statuses are "Vacation" and "🌴"

### Requirement: Who may change rules
Only a signed-in viewer, or a demo visitor, who can see the team in Linear SHALL be able to change its rules; otherwise the answer MUST say why and save nothing. <!-- verify: any viewer who can see the team may change its rules, with no PM or admin role check; intended? -->

- **Scenario: Signed out**
  - **WHEN** a signed-out visitor saves rules
  - **THEN** the answer is Unauthorized with "Sign in with Linear first." and nothing is saved
- **Scenario: Team not visible**
  - **WHEN** a PM saves valid rules for a team id they can't see
  - **THEN** the answer is TeamNotFound with "There's no such team, or you can't see it."
- **Scenario: Invalid rules for an unseen team**
  - **WHEN** a PM saves invalid rules for a team id they can't see
  - **THEN** the answer is InvalidRules, not TeamNotFound <!-- verify: validation is answered before the team is checked; should an unseen team win? -->
- **Scenario: Linear rate limit spent**
  - **WHEN** Linear's rate limit is spent as a PM saves rules
  - **THEN** the answer is LinearRateLimited with "Linear's rate limit is spent for now; try again later." and when the budget is back, if Linear said

### Requirement: Rules panel on the board
The board SHALL offer a "Sorting rules" panel, filled with the team's saved rules, that changes nothing until saved, closes on a successful save, and on a refusal stays open with each problem shown on its field.

- **Scenario: Save closes the panel and announces it**
  - **GIVEN** a PM opened the rules panel
  - **WHEN** they change the urgency window and press "Save rules"
  - **THEN** the panel closes, the board redraws from the answer, and screen readers hear "Rules saved. The board is sorted by them now."
- **Scenario: Refusal marks the field**
  - **WHEN** the server refuses the away statuses
  - **THEN** the panel stays open with the away-status field marked invalid and the server's message beside it
- **Scenario: Away statuses one a line**
  - **GIVEN** the team saved "🌴" and "vacation"
  - **WHEN** a PM opens the panel
  - **THEN** the away-status field shows them one a line, and what is typed is sent line by line for the server to tidy
- **Scenario: Cancel waits for a save in flight**
  - **WHEN** a save is on its way
  - **THEN** the save button reads "Saving…" and Cancel is disabled until the answer comes
