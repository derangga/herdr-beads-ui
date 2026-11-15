# herdr-beads-ui

A herdr-app mod (TypeScript) that shows the beads of a repo in a pane beside the agent working on it. It reads and
writes beads only through the `bd` command and holds no bead logic of its own, so what "ready" means and where the
data lives stay in `bd`.

## Map

- `src/runner.ts` runs `bd`, returns a value and never throws. `src/update.ts` is the pure reducer and the one
  place that decides what each error does. `src/rows.ts` is pure: filter, sort, trees, target picking.
- `src/host.ts` is the only file that imports `herdr`. Everything else takes a `Host`, so tests pass `fakeHost`.
- `src/view.ts` draws and has no logic. `src/main.ts` wires it. `dist/` is committed build output.
- One mod, three copies, told apart by `props().role`: the Viewer (none), the Beads button (`toggle`), the keys
  dialog (`keys`).

## Check your work

- `npm test`, `npm run lint`, `npm run typecheck` (run `npm run setup-types` once first).
- `bash scripts/stage.sh` rebuilds `dist/`, stages the mod and runs `herdr-app check`. Rebuild `dist/` whenever
  `src/` changes.
- `view.ts` has no unit test. Take a `herdr-app shot` and say in the bead's close note what you looked at.

## Design docs

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
