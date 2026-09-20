import { z } from "zod";
import { userRoleSchema } from "./farm";

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

export const updateFarmInputSchema = z.object({
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
