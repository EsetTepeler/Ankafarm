import type { AccessTokenClaims } from "@anka/shared";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import type { TokenService } from "../auth/tokens";
import type { Realtime } from "../modules/realtime";
import type { Db } from "../db/client";
import type { Env } from "../env";

export interface AppServices {
  db: Db;
  env: Env;
  tokens: TokenService;
  realtime: Realtime | null;
}

export interface Context extends AppServices {
  user: AccessTokenClaims | null;
  req: CreateFastifyContextOptions["req"];
  res: CreateFastifyContextOptions["res"];
}

export function makeContextFactory(services: AppServices) {
  return async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Context> {
    const header = req.headers.authorization;
    let user: AccessTokenClaims | null = null;
    if (header?.startsWith("Bearer ")) {
      user = await services.tokens.verifyAccessToken(header.slice("Bearer ".length));
    }
    return { ...services, user, req, res };
  };
}
