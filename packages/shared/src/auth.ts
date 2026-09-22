import { z } from "zod";
import { insightThresholdSchema, userRoleSchema } from "./farm";

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
  device: z.string().max(120).optional(),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(20),
});

export const createUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
  fullName: z.string().trim().min(2, "Ad soyad girin").max(120),
  role: userRoleSchema,
  phone: z.string().trim().max(30).optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

/** Sahip başka bir kullanıcının adını, rolünü ve telefonunu düzenler. E-posta değişmez: giriş kimliği. */
export const updateUserInputSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2, "Ad soyad girin").max(120).optional(),
  role: userRoleSchema.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

/** Şifre sıfırlama: e-posta gönderimi yok, sahip yeni şifreyi elden verir. */
export const setUserPasswordInputSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
});
export type SetUserPasswordInput = z.infer<typeof setUserPasswordInputSchema>;

export const updateFarmInputSchema = z.object({
  insights: insightThresholdSchema.optional(),
  name: z.string().trim().min(2).max(120).optional(),
  location: z.string().trim().max(200).nullable().optional(),
});
export type UpdateFarmInput = z.infer<typeof updateFarmInputSchema>;

/** Access token içeriği. */
export const accessTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  farmId: z.string().uuid(),
  role: userRoleSchema,
});
export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

/**
 * Platform yöneticisinin tokenı. `kind` ayrımı kasıtlı: çiftlik tokenı yönetim uçlarına,
 * yönetim tokenı çiftlik uçlarına geçemesin diye iki tür aynı anahtarla imzalansa da karışmaz.
 */
export const platformTokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  kind: z.literal("platform"),
});
export type PlatformTokenClaims = z.infer<typeof platformTokenClaimsSchema>;

export const createFarmInputSchema = z.object({
  name: z.string().trim().min(2, "Çiftlik adı girin").max(120),
  location: z.string().trim().max(200).optional(),
  ownerFullName: z.string().trim().min(2, "Ad soyad girin").max(120),
  ownerEmail: z.string().trim().toLowerCase().email("Geçerli bir e-posta girin"),
  ownerPassword: z.string().min(8, "Şifre en az 8 karakter olmalı"),
});
export type CreateFarmInput = z.infer<typeof createFarmInputSchema>;

export const farmStatusSchema = z.enum(["active", "suspended"]);
export type FarmStatus = z.infer<typeof farmStatusSchema>;
