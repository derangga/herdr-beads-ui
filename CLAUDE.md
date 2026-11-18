# herdr-mods

Herdr customisations, one folder each, with no imports between them, so one can be split out with `git filter-repo`:

- `beads` (`src/beads/`, `test/beads/`): a herdr-app mod (TypeScript) that shows the beads of a repo in a pane beside
  the agent working on it. It reads and writes beads only through the `bd` command and holds no bead logic of its
  own, so what "ready" means and where the data lives stay in `bd`. Layouts refer to it by the name `beads`.
- `paddock` (`src/paddock/`): a layout (`paddock.json`) and six mods (`paddock-<folder>`), cloned from Herdr's own
  mods through herdr-glass. `src/paddock/NOTICE` lists what changed; keep it and each `main.ts`'s `glass:` and `nix:`
  notes current (Apache-2.0 asks for that).

`herdr-app/` is the committed build that users and Nix copy into `~/.config/herdr-app`: `layouts/paddock.*`,
`mods/beads/` and `mods/paddock-*/`. `scripts/build-dist.sh` writes it.

## Map of beads

- `src/beads/runner.ts` runs `bd`, returns a value and never throws. `src/beads/update.ts` is the pure reducer and the
  one place that decides what each error does. `src/beads/rows.ts` is pure: filter, sort, trees, target picking.
- `src/beads/host.ts` is the only file that imports `herdr`. Everything else takes a `Host`, so tests pass `fakeHost`.
- `src/beads/view.ts` draws and has no logic. `src/beads/main.ts` wires it.
- One mod, three copies, told apart by `props().role`: the Viewer (none), the Beads button (`toggle`), the keys
  dialog (`keys`).

## Paddock

- Typed by `src/paddock/tsconfig.json` with `strictNullChecks: false`, as herdr-app types its own mods: a View sets
  its state in `init`. Class state is `declare` fields. Shared types live in `src/paddock/types.ts`, imported with
  `import type` only.
- It keeps Herdr's formatting, so it is not run through oxfmt and is exempt from `curly` (see `.oxlintrc.json`).
- A mod name or asset path in the code (`mods/paddock-chrome/…`, `openOverlay({ mod: "paddock-agents" })`) must
  match the folder name the build gives it.

## Check your work

- `npm test`, `npm run lint`, `npm run typecheck` (run `npm run setup-types` once first, and again after a herdr-app
  update).
- `bash scripts/stage.sh` rebuilds `herdr-app/`, copies it into `~/.config/herdr-app` (each mod's `main.js` last,
  because saving it reloads the mod) and runs `herdr-app check` on every mod. Rebuild whenever `src/` changes. CI
  fails when the committed `herdr-app/` differs from a fresh build.
- Then look for `*.error` files in `~/.config/herdr-app`. `view.ts` and Paddock have no unit tests: take a
  `herdr-app shot` and say what you looked at.

## Design docs (beads)

Start with `DESIGN.md`. It says when to read each file, so load the two or three the task needs and not the
directory. Before writing a function, read its graph in `design/graphs/` and `design/errors.md`. A graph's `E:`
lines are its test list, one test per line. What herdr-app and bd were seen to do is in
`design/herdr-app-facts.md`. `docs/adr/` explains choices that look odd. `CONTEXT.md` defines the terms.

If the design and what you find disagree, update the `design/` file in the same change.

## Tracking

Work is tracked in beads. `bd ready`, then `bd show <id>` and `bd update <id> --status in_progress`. A bead is done
when every line of its acceptance criteria is true. Work found along the way becomes
`bd create "<title>" --deps discovered-from:<id>`. Bead ids stay inside `bd`: never write one in a code comment or
a commit message.
