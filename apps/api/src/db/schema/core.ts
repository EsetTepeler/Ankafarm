import type { FarmSettings } from "@anka/shared";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "worker", "vet"]);
export const farmStatusEnum = pgEnum("farm_status", ["active", "suspended"]);

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const farms = pgTable("farms", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  /** Transferde hedefi gösteren kısa kod. Çiftlik adı aranabilir değil; bir kiracı diğerlerini listeleyemesin. */
  code: text().notNull().unique(),
  name: text().notNull(),
  status: farmStatusEnum().notNull().default("active"),
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

/**
 * Platform yöneticisi çiftlik kullanıcısı değil, ayrı tabloda durur ve tokenı ayrı tür taşır.
 * Aynı tabloda olsaydı farm_id'si boş bir kullanıcı her çiftlik sorgusunda özel durum olurdu.
 */
export const platformAdmins = pgTable("platform_admins", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  fullName: text().notNull(),
  active: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  /** TOTP gizli anahtarı (base32). Kurulum başlayınca yazılır, doğrulanınca etkinleşir. */
  totpSecret: text(),
  totpEnabled: boolean().notNull().default(false),
  totpConfirmedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

/** Telefon kaybolursa girişi açan tek kullanımlık kodlar; yalnızca özeti saklanır. */
export const platformRecoveryCodes = pgTable(
  "platform_recovery_codes",
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    adminId: uuid()
      .notNull()
      .references(() => platformAdmins.id, { onDelete: "cascade" }),
    codeHash: text().notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_recovery_admin_idx").on(t.adminId)],
);

export const platformRefreshTokens = pgTable("platform_refresh_tokens", {
  id: uuid().primaryKey().default(sql`uuidv7()`),
  adminId: uuid()
    .notNull()
    .references(() => platformAdmins.id, { onDelete: "cascade" }),
  tokenHash: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  revokedAt: timestamp({ withTimezone: true }),
  device: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Farm = typeof farms.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type User = typeof users.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
