CREATE TABLE `research_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`updated` text NOT NULL
);
