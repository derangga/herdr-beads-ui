# Design: herdr-beads-ui

A herdr-app mod named `beads`. It shows the beads of the Viewed repo in a pane split beside the Opener. You can
filter, sort, search, read a bead, follow its dependencies, change its status, copy its id and send it to an
agent. Terms are in [CONTEXT.md](CONTEXT.md). Decisions are in [docs/adr/](docs/adr/).

The mod holds no bead logic of its own. It runs `bd`, decodes what comes back and draws it. What counts as
ready, what a status means and where the data lives stay in `bd`, once.

## Reading order

| Read | When |
|---|---|
| [method](design/method.md) | Reading a graph for the first time: how Effect's `A`, `E` and `R` map onto this TypeScript, and the notation |
| [shapes](design/shapes.md) | Adding a type, or asking why something is a union and not a flag |
| [requirements](design/requirements.md) | Deciding what a function receives as parameters, and what a test swaps |
| [errors](design/errors.md) | Deciding where a new failure is handled and what the user sees |
| [tests](design/tests.md) | Writing a test, and asking what to swap for it |
| [ui](design/ui.md) | Changing what the Viewer draws, its widths, its motion or its keys |
| [herdr-app-facts](design/herdr-app-facts.md) | Before assuming what herdr-app or bd does. It has what was run and what is still unknown |

## Call graphs

One file per group of operations. An `E:` line in a graph is one test.

| File | Operations |
|---|---|
| [open](design/graphs/open.md) | The three copies of the mod (Viewer, Beads button, keys dialog): opening, finding the Viewed repo and the Opener, the keyboard, closing |
| [load](design/graphs/load.md) | The load of the snapshot, single flight, the first-load spinner, and showing a bead, its trees and its history without running `bd` |
| [status](design/graphs/status.md) | The status picker, the reason step, the write, the reload after it |
| [send](design/graphs/send.md) | Copy the id, and Send to agent: choosing the target, the clipboard, focus and paste |

A new operation is a graph in one of these files, its failures in `errors.md`, and its tests in `tests.md`. A
graph that exists in only one of those places is drift.

## Layout

```
package.json  tsconfig.json  .oxlintrc.json  .oxfmtrc.json
src/
  types.ts         Model, Msg, Cmd, BdError and the other shapes. No code
  decode.ts        the boundary: bd's JSON and JSONL, and the host values
  host.ts          Host: the only importer of "herdr"
  runner.ts        bd calls, retry on lock, the status write, Send. Returns a value
  update.ts        (Model, Msg) -> [Model, Cmd[]], pure. Single flight
  rows.ts          filter, search, sort, trees, layout, target picking: pure
  store.ts         the dispatch loop: update, tell the owner, run each Cmd, feed the reply back
  states.ts        start(host), the empty screens, bd's text: pure
  toggle-state.ts  what the tab-bar button knows and does: pure
  toggle.ts        the button's drawing
  view.ts          GPUI drawing. No logic
  main.ts          the View class: init, render, close, the keyboard, the search box
test/*.test.ts  test/fake-host.ts  test/fixtures/
scripts/build-dist.sh  scripts/stage.sh
herdr-app/         committed, what a user installs: RECIPE.md, preview.png, keys.json, mods/beads/{main.js,mod.json,icons/}
```

Toolchain: Node 22 or newer for `node --test` with type stripping, `esbuild` to bundle `src/main.ts` with
`gpui-kit`, `gpui-base` and `herdr` left out (herdr-app provides them), `typescript` for the local typecheck,
`oxlint` and `oxfmt`. No runtime dependency. The two declaration files `gpui-kit.d.ts` and `herdr.d.ts` are not in
the repo. `npm run setup-types` copies them in from herdr-app, git-ignored.

Dependencies on the outside, each behind `Host`: `bd` on the user's `PATH`, herdr-app's mod runtime, the
clipboard.
