# Paddock

Terms for Paddock, the layout and mods in `src/paddock/`. Paddock uses Herdr's own words. The beads mod has its own
terms in [../beads/CONTEXT.md](../beads/CONTEXT.md), and the two do not share any.

## Language

**Paddock**:
The layout `paddock.json` (preview `paddock.svg`) and the six mods it names. It draws the sidebar, the tab bar and the
terminal as separate rounded cards on a dark canvas, in Catppuccin Macchiato colors.

**Layout**:
A herdr-app JSON file of nested `row`, `column` and `block` nodes. A `block` names the mod that draws it in
`content.mod`. Paddock's layout is cloned from Herdr's `main` layout 0.1.16.

**Mod** (Paddock mod):
A folder `mods/paddock-<folder>/` with a `main.js` built from `src/paddock/<folder>/main.ts`. Each one is a clone of a
Herdr mod, changed for Paddock. Its `glass:` and `nix:` notes at the top of `main.ts` say what changed.

**Clone**:
A Herdr mod copied into this repo and edited. The original is Apache-2.0, so each clone keeps its changes listed in
`src/paddock/NOTICE`.

**herdr-glass**:
The community layout Paddock was first cloned from, by Noah Chen (MIT). Paddock's lineage is herdr-glass, then
`derangga/nix` `modules/herdr-glass`, then this repo. `NOTICE` lists the changes at each step.

## Relationships

- A **Layout** names its **Mods** by folder name. The name in `paddock.json`, in `openOverlay({ mod: ... })` and in an
  asset path must equal `paddock-<folder>`, because the build gives the folder that name.
- Every **Mod** is a **Clone** of one Herdr mod: `tabs`, `pane`, `workspace-chrome`, `spaces`, `agents` or `toast`.
