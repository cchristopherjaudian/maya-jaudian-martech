# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall (see package.json) runs `prisma generate` as part of this — it only
# reads the schema, but prisma.config.ts requires DATABASE_URL to be set to load at all,
# so postinstall falls back to a placeholder when it isn't.
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install all deps including devDependencies so ts-node is available for the seed script
COPY package*.json ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall (see package.json) generates the Prisma client for this platform
RUN npm ci

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Run migrations, seed, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
