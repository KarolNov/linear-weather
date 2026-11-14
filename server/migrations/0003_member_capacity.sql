CREATE TABLE `member_capacity` (
	`user_id` text PRIMARY KEY NOT NULL,
	`factor` real NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "factor_in_range" CHECK("member_capacity"."factor" > 0 AND "member_capacity"."factor" <= 1)
);
