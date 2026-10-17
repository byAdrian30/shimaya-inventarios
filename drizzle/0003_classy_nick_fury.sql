CREATE TABLE `inventory_reset_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`reset_version` text NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
