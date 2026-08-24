# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install all deps (dev included) so ts-node is available for the seed script
COPY package*.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Generate the Prisma client for this platform
RUN npx prisma generate

EXPOSE 3000

# Run migrations, seed, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
