# sorting/hand-placement

## Purpose
Let a PM put an issue in a quadrant by hand, overriding the team's rules, or hand it back to the rules, while its due date still decides when it turns urgent.

## Requirements

### Requirement: Place an issue by hand
Placing an issue in a quadrant by hand SHALL put it there whatever the rules say, mark it as placed by hand, and keep it there for every later request.

- **Scenario: Move a Do issue to Drop** <!-- accepted -->
  - **GIVEN** an Urgent priority issue due in 1 day sits in Do by the rules
  - **WHEN** a PM places it in Drop
  - **THEN** it is in Drop with `quadrantSource` OVERRIDE, and later requests still show it in Drop
- **Scenario: Answer carries the matrix after the move** <!-- accepted -->
  - **GIVEN** the issue's assignee has Do 9 and Drop 1
  - **WHEN** a PM places one of their Do issues in Drop
  - **THEN** the answer carries the issue's team, where that person now has Do 8 and Drop 2
- **Scenario: Placing in the rules' own quadrant pins it** <!-- amended -->
  - **GIVEN** an issue sits in Schedule by the rules
  - **WHEN** a client places it in Schedule through the API
  - **THEN** it is pinned there: marked placed by hand, and it stays in Schedule when the rules would move it

### Requirement: Placement reason names the rules' quadrant
An issue placed by hand SHALL give its reason as "Placed by hand; the rules say <quadrant> (<the rules' reason>)".

- **Scenario: Reason after a hand placement** <!-- accepted -->
  - **WHEN** a PM places an Urgent priority issue due in 1 day in Drop
  - **THEN** its reason is "Placed by hand; the rules say Do (Urgent priority, due in 1 day)"
- **Scenario: Reason counts the team's opt-in rules** <!-- accepted -->
  - **GIVEN** the team counts blockers as important
  - **WHEN** a PM places a Low priority blocker due in 3 days in Drop
  - **THEN** its reason is "Placed by hand; the rules say Do (Low priority, blocks other issues, due in 3 days)"

### Requirement: Hand it back to the rules
Handing an issue back SHALL forget its hand placement so the rules place it again, and MUST succeed on an issue that was never placed by hand.

- **Scenario: Back with the rules** <!-- accepted -->
  - **GIVEN** an issue the rules put in Do was placed in Drop by hand
  - **WHEN** a PM hands it back to the rules
  - **THEN** it is in Do with `quadrantSource` RULE and the reason "Urgent priority, due in 1 day"
- **Scenario: Clearing an issue never placed by hand** <!-- accepted -->
  - **WHEN** a PM hands back an issue that was never placed by hand
  - **THEN** the answer is a success and the issue stays where the rules put it

### Requirement: Due date still drives urgency
A hand placement MUST only move the issue: the first day it turns urgent SHALL still follow its due date and the team's rules.

- **Scenario: Day it turns urgent is unchanged** <!-- accepted -->
  - **GIVEN** today is 2026-10-18 and a High priority issue due 2026-11-30 turns urgent on 2026-11-17
  - **WHEN** a PM places it in Drop
  - **THEN** it still turns urgent on 2026-11-17

### Requirement: Hand placements outlast other changes
A hand placement MUST stay when the team's rules change and when the issue is handed to someone else.

- **Scenario: Rules change around a hand-placed issue** <!-- accepted -->
  - **GIVEN** an issue was placed in Drop by hand
  - **WHEN** a PM saves new rules for its team
  - **THEN** the issue stays in Drop while the rule-placed issues move
- **Scenario: Reassigned issue keeps its placement** <!-- accepted -->
  - **GIVEN** an issue was placed in Drop by hand
  - **WHEN** it is handed to someone else on the team
  - **THEN** it is still in Drop, placed by hand

### Requirement: Who may place issues
Only a signed-in viewer, or a demo visitor, who can see the issue in Linear SHALL be able to place it or hand it back; otherwise the answer MUST say why and save nothing.

- **Scenario: Issue not visible** <!-- accepted -->
  - **WHEN** a PM places an issue id they can't see
  - **THEN** the answer is IssueNotFound with "There's no such issue, or you can't see it." and no placement is saved
- **Scenario: Signed out placement** <!-- accepted -->
  - **WHEN** a signed-out visitor places an issue
  - **THEN** the answer is Unauthorized with "Sign in with Linear first."

### Requirement: Store unavailable shows no hand placements
When the app's database can't be read, the board SHALL still load, with every issue placed by the rules.

- **Scenario: Database down** <!-- accepted -->
  - **GIVEN** an issue was placed in Drop by hand
  - **WHEN** the board loads while the app's database can't be read
  - **THEN** the board loads without an error and the issue is where the rules put it

### Requirement: Move menu on each issue card
Each issue card on the board SHALL offer a "Move to" menu listing the four quadrants with its current one disabled and marked "Here", plus "Let the rules place it" only for an issue placed by hand, and a hand-placed card SHALL show a "By hand" badge carrying its reason.

- **Scenario: Menu for a rule-placed issue** <!-- accepted -->
  - **GIVEN** an issue in Schedule by the rules
  - **WHEN** a PM opens its move menu
  - **THEN** Do, Delegate and Drop can be picked, Schedule is disabled and marked "Here", and there is no "Let the rules place it"
- **Scenario: Moving announces the result** <!-- accepted -->
  - **WHEN** a PM moves AVG-1 to Drop from its menu
  - **THEN** the card is busy until the answer comes, the board redraws from the answer, screen readers hear "Moved AVG-1 to Drop.", and the keyboard returns to the card's move button in its new quadrant
- **Scenario: Handing back from the menu**
  - **WHEN** a PM picks "Let the rules place it" on AVG-1
  - **THEN** screen readers hear "AVG-1 is back with the rules."
- **Scenario: Failed move**
  - **WHEN** a move fails
  - **THEN** the board shows "Couldn't move <identifier>. <reason>" above the board and takes the keyboard there
