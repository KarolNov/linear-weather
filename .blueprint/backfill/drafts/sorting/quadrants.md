# sorting/quadrants

## Purpose
Put each open issue in Do, Schedule, Delegate or Drop by its team's sorting rules, say in plain words why it landed there, and say the first day it turns urgent.

## Requirements

### Requirement: Quadrant from importance and urgency
An issue SHALL land in Do when it is important and urgent, Schedule when important and not urgent, Delegate when urgent and not important, and Drop when neither.

- **Scenario: Important and urgent lands in Do** <!-- accepted -->
  - **GIVEN** the default rules and today is 2026-10-18
  - **WHEN** a High priority issue is due 2026-10-21
  - **THEN** it is in Do with the reason "High priority, due in 3 days"
- **Scenario: Neither important nor urgent lands in Drop** <!-- accepted -->
  - **GIVEN** the default rules and today is 2026-10-18
  - **WHEN** a Low priority issue is due 2026-11-30
  - **THEN** it is in Drop with the reason "Low priority, due in 43 days"

### Requirement: Importance by priority threshold
An issue MUST count as important when its Linear priority is set and at or above the team's "important from" priority, and "No priority" MUST never count as important by priority.

- **Scenario: Stricter threshold drops Medium** <!-- accepted -->
  - **GIVEN** the team counts only High or higher as important
  - **WHEN** a Medium priority issue is due in 3 days
  - **THEN** it is in Delegate
- **Scenario: No priority is never important** <!-- accepted -->
  - **WHEN** an issue with No priority is due in 3 days
  - **THEN** it is in Delegate with the reason "No priority, due in 3 days"

### Requirement: Urgency by due date
An issue with a due date MUST count as urgent when it is due in fewer whole calendar days than the team's urgency window, due today, or overdue.

- **Scenario: Edge of the urgency window** <!-- accepted -->
  - **GIVEN** the default 14-day window
  - **WHEN** one important issue is due in 13 days and another in exactly 14
  - **THEN** the first is in Do and the second in Schedule
- **Scenario: Overdue issue is urgent** <!-- accepted -->
  - **WHEN** an important issue was due 2 days ago
  - **THEN** it is in Do with a reason ending "overdue by 2 days"
- **Scenario: Undated issue follows the team's no-due-date choice** <!-- accepted -->
  - **GIVEN** the team's rules say issues with no due date are urgent
  - **WHEN** a High priority issue has no due date
  - **THEN** it is in Do with the reason "High priority, no due date", where by default it would be in Schedule

### Requirement: Opt-in blocker and cycle rules
When a team opts in, an issue that blocks another still-open issue MUST count as important whatever its priority, and an issue in the team's current cycle MUST count as urgent whatever its due date until that cycle's last day has passed.

- **Scenario: Blocker counts as important** <!-- accepted -->
  - **GIVEN** the team counts blockers as important
  - **WHEN** a Low priority issue due in 3 days blocks an open issue
  - **THEN** it is in Do with the reason "Low priority, blocks other issues, due in 3 days"
- **Scenario: Blocking only finished work does not count** <!-- accepted -->
  - **GIVEN** the team counts blockers as important
  - **WHEN** an issue blocks only issues that are already done
  - **THEN** it is placed as if it blocked nothing
- **Scenario: Current cycle counts as urgent until it ends** <!-- accepted -->
  - **GIVEN** the team counts the current cycle as urgent and the cycle's last day is today
  - **WHEN** a Low priority undated issue in the cycle is placed today, and again tomorrow
  - **THEN** today it is in Delegate with the reason "Low priority, no due date, in the current cycle", and tomorrow it is in Drop
- **Scenario: Linear cannot say what is in the cycle** <!-- accepted -->
  - **GIVEN** the team counts the current cycle as urgent
  - **WHEN** Linear fails to answer which issues are in the current cycle
  - **THEN** the board still loads, sorted as if the cycle rule were off

### Requirement: Placement reason
Every placed issue SHALL carry a reason built as its priority label, then "blocks other issues" when that counted, then its due wording ("due today", "due in N days", "overdue by N days" or "no due date", with "1 day" in the singular), then "in the current cycle" when that counted, joined by commas.

- **Scenario: Reason with the cycle** <!-- accepted -->
  - **GIVEN** the team counts the current cycle as urgent
  - **WHEN** a High priority issue due in 43 days is in the current cycle
  - **THEN** its reason is "High priority, due in 43 days, in the current cycle"
- **Scenario: Reason shown on the board** <!-- accepted -->
  - **WHEN** a PM hovers an issue's title on the board
  - **THEN** the reason is shown as its tooltip

### Requirement: Day it turns urgent
Every placed issue SHALL say the first day the rules call it urgent: today when it already is urgent, the day its due date enters the window when that is later, and none when it never will be.

- **Scenario: Turns urgent 13 days before its due date** <!-- accepted -->
  - **GIVEN** the default 14-day window and today is 2026-10-18
  - **WHEN** an issue is due 2026-11-30
  - **THEN** it turns urgent on 2026-11-17
- **Scenario: Overdue issue turns urgent today, not in the past** <!-- accepted -->
  - **WHEN** an issue is overdue
  - **THEN** the day it turns urgent is today
- **Scenario: Undated issue never turns urgent** <!-- accepted -->
  - **GIVEN** the team's rules say issues with no due date aren't urgent
  - **WHEN** an issue has no due date and is not urgent for its cycle
  - **THEN** it has no day it turns urgent

### Requirement: Calendar-day arithmetic
Due dates MUST be counted in whole calendar days against today's date in UTC, unaffected by daylight-saving changes. <!-- verify: "today" is the UTC date, so a PM far from UTC may see placements a day off near midnight; is that acceptable? -->

- **Scenario: Across a daylight-saving change**
  - **WHEN** an issue's due date is a week away across a daylight-saving change
  - **THEN** it is due in 7 days

### Requirement: Quadrant names on the board
The board SHALL name each quadrant with its meaning: Do "Important and urgent", Schedule "Important, not urgent yet", Delegate "Urgent, less important", Drop "Neither, question it", each in its own colour shared by the legend, the matrix and the issue cards.

- **Scenario: Legend explains the quadrants**
  - **WHEN** a PM opens a team's board
  - **THEN** a legend lists Do, Schedule, Delegate and Drop with their meanings
