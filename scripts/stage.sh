#!/usr/bin/env bash
# Builds, then copies herdr-app/ into ${HERDR_APP_HOME:-~/.config/herdr-app} and runs herdr-app check on each mod.
# Saving any file in a mod folder reloads the mod, so each mod's main.js goes last.
set -euo pipefail

cd "$(dirname "$0")/.."
app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

bash scripts/build-dist.sh
mkdir -p "$app/layouts"
cp herdr-app/layouts/paddock.svg "$app/layouts/"
for dir in herdr-app/mods/*/; do
  name=$(basename "$dir")
  dest="$app/mods/$name"
  mkdir -p "$dest"
  for entry in "$dir"*; do
    [ "$(basename "$entry")" = main.js ] && continue
    rm -rf "$dest/$(basename "$entry")"
    cp -R "$entry" "$dest/"
  done
  cp "$dir/main.js" "$dest/main.js"
  herdr-app check "$dest"
done
# The layout last, once every mod it names is in place.
cp herdr-app/layouts/paddock.json "$app/layouts/"
