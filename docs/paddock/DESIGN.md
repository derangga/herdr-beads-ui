# Design: Paddock

A layout (`src/paddock/paddock.json`) and six mods (`src/paddock/<folder>/main.ts`), cloned from Herdr's own mods
through herdr-glass. Terms are in [CONTEXT.md](CONTEXT.md). Paddock has no call graphs, no tests and no ADRs: it
keeps Herdr's own structure and changes its look.

## Mods

| Folder | Built as | Clone of Herdr's |
|---|---|---|
| `tabs` | `paddock-tabs` | `tabs` |
| `pane` | `paddock-pane` | `pane` |
| `chrome` | `paddock-chrome` | `workspace-chrome` |
| `spaces` | `paddock-spaces` | `spaces` |
| `agents` | `paddock-agents` | `agents` |
| `toast` | `paddock-toast` | `toast` |

`scripts/build-dist.sh` bundles each `main.ts` to `herdr-app/mods/paddock-<folder>/main.js` and copies the folder's
other files (icons, `mod.json`) beside it. It copies the layout and its preview to `herdr-app/layouts/`.

## Rules

- `src/paddock/tsconfig.json` sets `strictNullChecks: false`, as herdr-app types its own mods. A View sets its state in
  `init`, and class state is `declare` fields. Shared types live in `src/paddock/types.ts`, imported with
  `import type` only.
- Paddock keeps Herdr's formatting, so `npm run lint` does not run oxfmt on it, and `.oxlintrc.json` exempts it from
  `curly`.
- A mod name or asset path in the code (`mods/paddock-chrome/...`, `openOverlay({ mod: "paddock-agents" })`) must
  match the folder name the build gives it.
- When you change a mod, update `src/paddock/NOTICE` and the `glass:` and `nix:` notes at the top of its `main.ts`.
  Apache-2.0 asks for the list of changes.
- Paddock does not import from `src/beads/`, and beads does not import from Paddock. The layout refers to the beads
  mod by its name `beads` only.

## Checking a change

Paddock has no unit tests. Run `bash scripts/stage.sh`, then take a `herdr-app shot` and say what you looked at.
