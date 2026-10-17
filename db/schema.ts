import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const inventoryState = sqliteTable("inventory_state", {
 id: text("id").primaryKey(), revision: integer("revision").notNull().default(0), data: text("data").notNull()
});
export const teamMembers=sqliteTable('team_members',{
 email:text('email').primaryKey(),userId:text('user_id'),name:text('name').notNull(),area:text('area').notNull().default(''),role:text('role').notNull().default('staff'),status:text('status').notNull().default('pending'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
});
export const inventoryResetBackups=sqliteTable('inventory_reset_backups',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),resetVersion:text('reset_version').notNull(),revision:integer('revision').notNull(),data:text('data').notNull(),createdAt:text('created_at').notNull()
});
export const inventoryCosts=sqliteTable('inventory_costs',{
 ownerId:text('owner_id').primaryKey(),revision:integer('revision').notNull().default(0),data:text('data').notNull()
});
