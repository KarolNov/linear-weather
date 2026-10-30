#!/bin/sh
# Deploys a Worker Preview of this branch, after migrating the staging database every Preview
# shares. Workers Builds runs this as `pnpm run preview` for branches other than main.
set -eu

wrangler d1 migrations apply DB --remote --config wrangler.preview-migrations.jsonc
wrangler preview
