CREATE TABLE `time_off` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	CONSTRAINT "starts_on_is_a_date" CHECK("time_off"."starts_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "ends_on_is_a_date" CHECK("time_off"."ends_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "ends_after_it_starts" CHECK("time_off"."starts_on" <= "time_off"."ends_on")
);
--> statement-breakpoint
CREATE INDEX `time_off_user_id` ON `time_off` (`user_id`);