#!/bin/bash
set -e

node scripts/build-library.mjs
pnpm --dir www run build-search-index
pnpm --dir www run copy-dist

echo ""
echo "✓ AAC library updated."
