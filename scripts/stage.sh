#!/usr/bin/env bash
# Builds, copies dist/ to ${HERDR_APP_HOME:-~/.config/herdr-app}/mods/beads and checks it.
# Saving any file in the mod folder reloads the mod, so main.js goes last.
set -euo pipefail

cd "$(dirname "$0")/.."
dest="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/beads"

bash scripts/build-dist.sh
mkdir -p "$dest"
cp dist/mod.json "$dest/"
cp dist/main.js "$dest/main.js"
herdr-app check "$dest"
