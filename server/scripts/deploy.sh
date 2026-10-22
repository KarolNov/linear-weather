#!/bin/sh
# Deploys the server Worker with its D1 migrations. Workers Builds runs this as `pnpm run deploy`.
set -eu

if wrangler d1 info DB >/dev/null 2>&1; then
  # Migrations first, so new code never meets tables it doesn't have yet. They must keep the
  # code that's still live working until the deploy lands: add, don't rename or drop.
  wrangler d1 migrations apply DB --remote
  wrangler deploy
else
  # First deploy: Wrangler provisions the database while deploying, so it can't be migrated
  # before. Until the tables exist, the board falls back to the default rules.
  wrangler deploy
  wrangler d1 migrations apply DB --remote
fi
