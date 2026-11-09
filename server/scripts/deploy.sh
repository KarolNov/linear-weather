#!/bin/sh
# Deploys the server Worker with its D1 migrations. Workers Builds runs this as `pnpm run deploy`.
set -eu

# Migrations first, so new code never meets tables it doesn't have yet. They must keep the code
# that's still live working until the deploy lands: add, don't rename or drop.
wrangler d1 migrations apply DB --remote
wrangler deploy
