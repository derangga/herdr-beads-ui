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

## Docs

Each project keeps its terms and design in its own folder under `docs/`. Read only the folder of the project you are
changing.

- `docs/beads/`: start with `DESIGN.md`. It says when to read each file, so load the two or three the task needs and
  not the directory. `CONTEXT.md` defines the terms, `design/graphs/` has one call graph per group of operations,
  `design/errors.md` says where each failure is handled, `design/herdr-app-facts.md` says what herdr-app and `bd` were
  seen to do, and `adr/` explains choices that look odd.
- `docs/paddock/`: `CONTEXT.md` has the terms and `DESIGN.md` has the mods, the rules for editing them and how to
  check a change.

If a doc and what you find disagree, update the doc in the same change.

## Check your work

- `npm test`, `npm run lint`, `npm run typecheck` (run `npm run setup-types` once first, and again after a herdr-app
  update).
- `bash scripts/stage.sh` rebuilds `herdr-app/`, copies it into `~/.config/herdr-app` (each mod's `main.js` last,
  because saving it reloads the mod) and runs `herdr-app check` on every mod. Rebuild whenever `src/` changes. CI
  fails when the committed `herdr-app/` differs from a fresh build.
- Then look for `*.error` files in `~/.config/herdr-app`. `view.ts` and Paddock have no unit tests: take a
  `herdr-app shot` and say what you looked at.

## Tracking

Work is tracked in beads. `bd ready`, then `bd show <id>` and `bd update <id> --status in_progress`. A bead is done
when every line of its acceptance criteria is true. Work found along the way becomes
`bd create "<title>" --deps discovered-from:<id>`. Bead ids stay inside `bd`: never write one in a code comment or
a commit message.
