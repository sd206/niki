FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN yarn install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN yarn workspace @niki/shared build
RUN yarn workspace @niki/api build

# ─── Production image ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json

EXPOSE 8080
CMD ["node", "dist/index.js"]
