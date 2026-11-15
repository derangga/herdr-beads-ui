#!/usr/bin/env bash
# Builds, copies herdr-app/mods/beads/ to ${HERDR_APP_HOME:-~/.config/herdr-app}/mods/beads and checks it.
# Saving any file in the mod folder reloads the mod, so main.js goes last.
set -euo pipefail

cd "$(dirname "$0")/.."
dest="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/beads"

bash scripts/build-dist.sh
mkdir -p "$dest"
cp herdr-app/mods/beads/mod.json "$dest/"
rm -rf "$dest/icons"
cp -R herdr-app/mods/beads/icons "$dest/icons"
cp herdr-app/mods/beads/main.js "$dest/main.js"
herdr-app check "$dest"
