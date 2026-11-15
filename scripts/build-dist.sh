#!/usr/bin/env bash
# Bundles the mod into herdr-app/mods/beads/: main.js, mod.json and icons/. herdr-app/ is committed: it is the
# folder a user's agent copies from GitHub.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
out=herdr-app/mods/beads
mkdir -p "$out"
npx esbuild src/main.ts --bundle --format=esm --target=es2022 --external:gpui-kit --external:gpui-base --external:herdr --outfile="$out/main.js"
echo '{ "place": "none", "focusable": true }' > "$out/mod.json"
rm -rf "$out/icons"
cp -R icons "$out/icons"
