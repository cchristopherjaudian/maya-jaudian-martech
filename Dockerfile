# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma generate only reads the schema — DATABASE_URL is not used but required by prisma.config.ts at load time
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# Install all deps including devDependencies so ts-node is available for the seed script
COPY package*.json ./
RUN npm ci

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./

# Generate the Prisma client for this platform
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

EXPOSE 3000

# Run migrations, seed, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
