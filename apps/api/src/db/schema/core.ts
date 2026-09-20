import type { FarmSettings } from "@anka/shared";
import { sql } from "drizzle-orm";
import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "worker", "vet"]);

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const farms = pgTable("farms", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  name: text().notNull(),
  location: text(),
  settings: jsonb().$type<Partial<FarmSettings>>().notNull().default({}),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  farmId: uuid()
    .notNull()
    .references(() => farms.id),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  fullName: text().notNull(),
  role: userRoleEnum().notNull().default("worker"),
  phone: text(),
  active: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
  device: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Farm = typeof farms.$inferSelect;
export type User = typeof users.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
