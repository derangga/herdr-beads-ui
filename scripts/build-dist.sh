#!/usr/bin/env bash
# Bundles the mod into dist/: main.js and mod.json. dist/ is committed.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
mkdir -p dist
npx esbuild src/main.ts --bundle --format=esm --target=es2022 --external:gpui-kit --external:gpui-base --external:herdr --outfile=dist/main.js
echo '{ "place": "none", "focusable": true }' > dist/mod.json
