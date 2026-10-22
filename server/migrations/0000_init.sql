CREATE TABLE `quadrant_override` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`quadrant` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "quadrant_is_known" CHECK("quadrant_override"."quadrant" IN ('do', 'schedule', 'delegate', 'drop'))
);
--> statement-breakpoint
CREATE TABLE `quadrant_rules` (
	`team_id` text PRIMARY KEY NOT NULL,
	`important_from` integer NOT NULL,
	`urgency_window_days` integer NOT NULL,
	`no_due_date` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "important_from_is_a_priority" CHECK(typeof("quadrant_rules"."important_from") = 'integer' AND "quadrant_rules"."important_from" BETWEEN 1 AND 4),
	CONSTRAINT "urgency_window_is_positive" CHECK(typeof("quadrant_rules"."urgency_window_days") = 'integer' AND "quadrant_rules"."urgency_window_days" >= 1),
	CONSTRAINT "no_due_date_is_known" CHECK("quadrant_rules"."no_due_date" IN ('urgent', 'notUrgent'))
);
