import { animalsRouter, breedsRouter, groupsRouter, healthRouter, predictionsRouter } from "./modules/animals/router";
import { auditRouter } from "./modules/audit/router";
import { authRouter } from "./modules/auth/router";
import { farmRouter } from "./modules/farm/router";
import { syncRouter } from "./modules/sync/router";
import { usersRouter } from "./modules/users/router";
import { router } from "./trpc/init";

export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  farm: farmRouter,
  sync: syncRouter,
  animals: animalsRouter,
  breeds: breedsRouter,
  groups: groupsRouter,
  health: healthRouter,
  predictions: predictionsRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
