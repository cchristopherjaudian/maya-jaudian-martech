#!/bin/sh
# Generates the Prisma client after `npm install`/`npm ci`.
# `prisma generate` only reads prisma/schema.prisma — it never connects to a
# real database — but prisma.config.ts requires DATABASE_URL to be set just to
# load, so we fall back to a placeholder when it isn't.
DATABASE_URL="${DATABASE_URL:-postgresql://x:x@localhost:5432/x}" npx prisma generate && exit 0

cat <<'EOF' >&2

[postinstall] Skipped: `prisma generate` failed.

This is usually an unsupported local Node.js version — Prisma 7 requires
Node ^20.19 || ^22.12 || >=24.0 (see the EBADENGINE warnings above). This
does not affect `docker compose up --build`, which runs on Node 22 inside
the container regardless of your local Node version.

To fix it locally: upgrade Node, then run
  DATABASE_URL="postgresql://x:x@localhost:5432/x" npx prisma generate

EOF
exit 0
