import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const projects=sqliteTable('research_projects',{id:text('id').primaryKey(),version:integer('version').notNull().default(1),payload:text('payload').notNull(),updated:text('updated').notNull()});
