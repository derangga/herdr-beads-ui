#!/usr/bin/env bash
# Builds every mod and layout into herdr-app/, the committed folder a user's agent or Nix copies into
# ~/.config/herdr-app: mods/beads/, mods/paddock-<name>/ and layouts/paddock.{json,svg}.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci

# The runtime's own modules stay bare imports; herdr-app resolves them when it loads main.js.
bundle() { npx esbuild "$1" --bundle --format=esm --target=es2022 --log-level=warning --external:gpui-kit --external:gpui-base --external:herdr --outfile="$2"; }

out=herdr-app/mods/beads
mkdir -p "$out"
bundle src/beads/main.ts "$out/main.js"
echo '{ "place": "none", "focusable": true }' > "$out/mod.json"
rm -rf "$out/icons"
cp -R src/beads/icons "$out/icons"

for main in src/paddock/*/main.ts; do
  dir=$(dirname "$main")
  name=$(basename "$dir")
  out="herdr-app/mods/paddock-$name"
  rm -rf "$out"
  mkdir -p "$out"
  bundle "$main" "$out/main.js"
  find "$dir" -maxdepth 1 -type f ! -name '*.ts' -exec cp {} "$out/" \;
done
mkdir -p herdr-app/layouts
cp src/paddock/paddock.json src/paddock/paddock.svg herdr-app/layouts/
