# sorting/backlog-rot

## Purpose
Flag a team whose open work sits in Drop beyond the team's alert percent, giving the Drop count and share as the reason, so a PM can prune what nobody means to do.

## Requirements

### Requirement: Drop share across the whole team
A team's backlog rot SHALL count its open issues in Drop and all its open issues, in issues rather than points, across every person's matrix and the unassigned issues, with Drop's share between 0 and 1.

- **Scenario: Adds up every matrix** <!-- accepted -->
  - **GIVEN** one person has Do 1, Schedule 1, Drop 3 and another Schedule 2, Delegate 1, Drop 4
  - **WHEN** the team's backlog rot is read with a 40% alert
  - **THEN** it reports 7 in Drop of 12 open issues
- **Scenario: Unassigned issues count** <!-- accepted -->
  - **GIVEN** some of the team's unassigned issues are in Drop
  - **WHEN** the team's backlog rot is read
  - **THEN** its Drop count is the people's Drop counts plus the unassigned Drop count
- **Scenario: Hand placements count where they were put** <!-- accepted -->
  - **GIVEN** an issue the rules put in Do was placed in Drop by hand
  - **WHEN** the team's backlog rot is read
  - **THEN** that issue counts in Drop

### Requirement: Rotting above the alert, by whole percent
A team MUST be flagged as rotting only when Drop's share, rounded to a whole percent, is above the team's alert percent.

- **Scenario: Exactly at the alert is not rotting**
  - **WHEN** 2 of 5 open issues are in Drop and the alert is 40%
  - **THEN** the team is not rotting, and with a 39% alert it is
- **Scenario: Rounded share decides**
  - **WHEN** 400 of 1001 open issues are in Drop (39.96%) and the alert is 40%
  - **THEN** the team is not rotting, and the reason says "400 of 1001 open issues (40%) are in Drop, within the team's 40% alert"

### Requirement: Reason in plain words
Backlog rot SHALL give a reason "<drop> of <total> open issues (<percent>%) are in Drop, over|within the team's <alert>% alert", in the singular for one issue, and "No open issues" for a team with none.

- **Scenario: Over the alert**
  - **WHEN** 7 of 12 open issues are in Drop and the alert is 40%
  - **THEN** the reason is "7 of 12 open issues (58%) are in Drop, over the team's 40% alert"
- **Scenario: Singular wording**
  - **WHEN** the team's only open issue is in Drop
  - **THEN** the reason is "1 of 1 open issue (100%) is in Drop, over the team's 40% alert"
- **Scenario: Team with no open issues**
  - **WHEN** a team has no open issues
  - **THEN** it reports 0 of 0 with a share of 0, is not rotting, and the reason is "No open issues"

### Requirement: Flag on the board
The board SHALL show a "Backlog rot" flag under the team's name only while the team is rotting, carrying the reason and the advice "Close what nobody will do, or give it a priority or a due date."

- **Scenario: Lowering the alert raises the flag**
  - **GIVEN** 8 of 47 open issues (17%) are in Drop and the team's alert is 40%, so no flag shows
  - **WHEN** a PM saves a 15% alert
  - **THEN** the board shows "Backlog rot: 8 of 47 open issues (17%) are in Drop, over the team's 15% alert. Close what nobody will do, or give it a priority or a due date."
