import type { AccessTokenClaims, PlatformTokenClaims } from "@anka/shared";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import type { TokenService } from "../auth/tokens";
import type { InsightsClient } from "../modules/insights/client";
import type { Realtime } from "../modules/realtime";
import type { Db } from "../db/client";
import type { Env } from "../env";

export interface AppServices {
  db: Db;
  env: Env;
  tokens: TokenService;
  insights?: InsightsClient;
  realtime: Realtime | null;
}

export interface Context extends AppServices {
  user: AccessTokenClaims | null;
  /** Platform yöneticisi tokenı; çiftlik tokenıyla aynı anda dolu olamaz. */
  admin: PlatformTokenClaims | null;
  req: CreateFastifyContextOptions["req"];
  res: CreateFastifyContextOptions["res"];
}

export function makeContextFactory(services: AppServices) {
  return async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Context> {
    const header = req.headers.authorization;
    let user: AccessTokenClaims | null = null;
    let admin: PlatformTokenClaims | null = null;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length);
      user = await services.tokens.verifyAccessToken(token);
      // Çiftlik tokenı çözülmediyse platform tokenı olabilir; ikisi asla aynı anda geçerli olmaz.
      if (!user) admin = await services.tokens.verifyPlatformToken(token);
    }
    return { ...services, user, admin, req, res };
  };
}
