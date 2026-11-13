PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_quadrant_rules` (
	`team_id` text PRIMARY KEY NOT NULL,
	`important_from` integer NOT NULL,
	`urgency_window_days` integer NOT NULL,
	`no_due_date` text NOT NULL,
	`drop_alert_percent` integer DEFAULT 40 NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "important_from_is_a_priority" CHECK(typeof("__new_quadrant_rules"."important_from") = 'integer' AND "__new_quadrant_rules"."important_from" BETWEEN 1 AND 4),
	CONSTRAINT "urgency_window_in_range" CHECK(typeof("__new_quadrant_rules"."urgency_window_days") = 'integer' AND "__new_quadrant_rules"."urgency_window_days" BETWEEN 1 AND 365),
	CONSTRAINT "no_due_date_is_known" CHECK("__new_quadrant_rules"."no_due_date" IN ('urgent', 'notUrgent')),
	CONSTRAINT "drop_alert_in_range" CHECK(typeof("__new_quadrant_rules"."drop_alert_percent") = 'integer' AND "__new_quadrant_rules"."drop_alert_percent" BETWEEN 1 AND 99)
);
--> statement-breakpoint
-- Edited by hand: the old table has no drop_alert_percent, so its rows take the default.
INSERT INTO `__new_quadrant_rules`("team_id", "important_from", "urgency_window_days", "no_due_date", "updated_at") SELECT "team_id", "important_from", "urgency_window_days", "no_due_date", "updated_at" FROM `quadrant_rules`;--> statement-breakpoint
DROP TABLE `quadrant_rules`;--> statement-breakpoint
ALTER TABLE `__new_quadrant_rules` RENAME TO `quadrant_rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;