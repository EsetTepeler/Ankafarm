# Bağlam: repo kökü. Vite web çıktısını nginx ile servis eder.
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN corepack pnpm install --frozen-lockfile --filter @anka/web...
COPY packages/shared packages/shared
COPY apps/api/src apps/api/src
COPY apps/web apps/web
RUN corepack pnpm --filter @anka/web build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/entrypoint.sh /docker-entrypoint.d/40-anka-config.sh
RUN chmod +x /docker-entrypoint.d/40-anka-config.sh
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
