import { z } from "zod";

export const speciesSchema = z.enum(["sheep", "goat"]);
export type Species = z.infer<typeof speciesSchema>;

export const userRoleSchema = z.enum(["owner", "worker", "vet"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Çiftlik ayarları, farms.settings jsonb alanı. */
export const farmSettingsSchema = z.object({
  gestationDays: z.object({ sheep: z.number().int(), goat: z.number().int() }).default({ sheep: 150, goat: 150 }),
  currency: z.string().default("TRY"),
  timezone: z.string().default("Europe/Istanbul"),
});
export type FarmSettings = z.infer<typeof farmSettingsSchema>;
