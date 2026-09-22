import { createHash, randomBytes } from "node:crypto";

import { accessTokenClaimsSchema, platformTokenClaimsSchema, type AccessTokenClaims, type PlatformTokenClaims } from "@anka/shared";
import { SignJWT, jwtVerify } from "jose";

export function createTokenService(secret: string, accessTtlMinutes: number) {
  const key = new TextEncoder().encode(secret);

  return {
    async signAccessToken(claims: AccessTokenClaims): Promise<string> {
      return new SignJWT({ farmId: claims.farmId, role: claims.role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(`${accessTtlMinutes}m`)
        .sign(key);
    },

    async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        // Platform tokenı çiftlik uçlarına geçmesin: kind taşıyan token burada reddedilir.
        if (payload.kind) return null;
        const parsed = accessTokenClaimsSchema.safeParse({
          sub: payload.sub,
          farmId: payload.farmId,
          role: payload.role,
        });
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    /** Platform yöneticisi tokenı; `kind` alanı olmayan bir token buradan asla geçmez. */
    async signPlatformToken(claims: PlatformTokenClaims): Promise<string> {
      return new SignJWT({ kind: claims.kind })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(`${accessTtlMinutes}m`)
        .sign(key);
    },

    async verifyPlatformToken(token: string): Promise<PlatformTokenClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        const parsed = platformTokenClaimsSchema.safeParse({ sub: payload.sub, kind: payload.kind });
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },

    /** Refresh token: rastgele 32 bayt, veritabanında sadece sha256 özeti durur. */
    newRefreshToken(): { token: string; hash: string } {
      const token = randomBytes(32).toString("base64url");
      return { token, hash: hashRefreshToken(token) };
    },
  };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type TokenService = ReturnType<typeof createTokenService>;
