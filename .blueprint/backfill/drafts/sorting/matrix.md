# sorting/matrix

## Purpose
Sort each person's open issues in a team, and the team's unassigned ones, into an Eisenhower matrix, most pressing first, with issue counts and estimate points per quadrant, and show it on the board as a 2×2 that narrows the issue list.

## Requirements

### Requirement: One matrix per person per team
Each person on a team, and the team's unassigned issues, SHALL have a matrix holding their open issues in that team, each in the quadrant the team's rules or a hand placement put it.

- **Scenario: People and the unassigned each get a matrix** <!-- accepted -->
  - **WHEN** a client asks for a team's people and its unassigned issues
  - **THEN** each person has a matrix of their open issues in the team, and the unassigned issues have one of their own
- **Scenario: Matrix asked for without a team** <!-- accepted -->
  - **WHEN** a client asks for a user's matrix without a team id, on a user not reached through a team
  - **THEN** that field fails with "Which team? Pass teamId." while the rest of the answer stands

### Requirement: Most pressing first
Within each quadrant, issues SHALL be ordered by due date, soonest first and undated last, then by priority from Urgent to Low, with No priority after Low.

- **Scenario: Order inside Delegate** <!-- accepted -->
  - **GIVEN** today is 2026-10-18 and the default rules
  - **WHEN** Delegate holds a Low priority issue due 2026-10-19, and a Low and a No-priority issue both due 2026-10-20
  - **THEN** the order is the one due 2026-10-19, then the Low one, then the No-priority one
- **Scenario: Hand-placed issues sort among the rest** <!-- accepted -->
  - **GIVEN** a Low priority issue due 2026-10-20 is placed in Do by hand, and Do holds a High priority issue due 2026-10-25 by the rules
  - **WHEN** the matrix is built
  - **THEN** Do lists the hand-placed issue first, then the other

### Requirement: Counts and points per quadrant
Every matrix SHALL report how many issues are in each quadrant and the sum of their estimates, where an unestimated issue counts as an issue but adds no points.

- **Scenario: Tally with fractional and missing estimates** <!-- accepted -->
  - **WHEN** Do holds issues estimated 3 and 0.5, and Drop holds two unestimated issues
  - **THEN** counts are Do 2, Schedule 0, Delegate 0, Drop 2 and points are Do 3.5, Schedule 0, Delegate 0, Drop 0

### Requirement: The 2×2 on the board
Each person's card on the board SHALL show their open-issue total ("Nothing open", "1 open issue" or "N open issues") and a 2×2 of Do, Schedule, Delegate and Drop with each quadrant's count, an empty quadrant's cell disabled.

- **Scenario: Empty quadrant cannot be picked** <!-- accepted -->
  - **GIVEN** a person has no issues in Delegate
  - **WHEN** the board shows their card
  - **THEN** the Delegate cell shows 0 and is disabled
- **Scenario: Issue lists start shut** <!-- accepted -->
  - **WHEN** a PM opens a team's board
  - **THEN** every person's issue list is closed behind a "Show N issues" toggle

### Requirement: Picking a quadrant narrows the list
Picking a quadrant in the 2×2 SHALL open the person's list narrowed to that quadrant, and picking it again SHALL show every quadrant that has issues.

- **Scenario: Pick opens the list narrowed** <!-- accepted -->
  - **GIVEN** a person's list is shut
  - **WHEN** a PM picks their Do cell
  - **THEN** the list opens showing only Do, with the cell pressed and the other cells dimmed
- **Scenario: Pick again shows all** <!-- accepted -->
  - **GIVEN** a person's list is narrowed to Do
  - **WHEN** a PM picks Do again
  - **THEN** every quadrant with issues is listed
- **Scenario: Last issue moved out of the picked quadrant**
  - **GIVEN** a person's list is narrowed to Drop, which holds one issue
  - **WHEN** a PM moves that issue to another quadrant
  - **THEN** the list shows every quadrant again, and stays that way when an issue later returns to Drop

### Requirement: Long lists are capped
In the full list, a quadrant with more than 6 issues SHALL show its first 6 with a "Show N more" button that shows the rest and then reads "Show fewer", while a quadrant picked on its own SHALL show whole.

- **Scenario: Long Do list capped**
  - **GIVEN** a person has 10 issues in Do
  - **WHEN** the PM opens their list
  - **THEN** the first 6 Do issues show with "Show 4 more", and pressing it shows all 10 and reads "Show fewer"
- **Scenario: List that fits has no button**
  - **WHEN** a quadrant holds exactly 6 issues
  - **THEN** all 6 show and no "Show more" button appears
- **Scenario: Next in line fills a capped list**
  - **GIVEN** Do shows 6 of 10 issues
  - **WHEN** the first issue leaves Do
  - **THEN** the next issue in line takes its place and the button reads "Show 3 more"
- **Scenario: Issue moved into a capped list stays in sight**
  - **GIVEN** Do shows 6 of 8 issues
  - **WHEN** an issue is moved into Do and sorts past the cut
  - **THEN** it still shows, and the button reads "Show 2 more"
- **Scenario: Shown-whole list is cut again after it fits**
  - **GIVEN** a PM showed a 10-issue Do list whole
  - **WHEN** Do shrinks to 5 issues and later grows to 9
  - **THEN** only the first 6 show again <!-- verify: a list shown whole is cut again once it has fitted; should the PM's "show more" survive a shrink? -->
