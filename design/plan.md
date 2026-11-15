# Plan: the beads Viewer mod

> **Historical.** This was the plan the mod was built from. The design now lives in [DESIGN.md](../DESIGN.md) and
> the files it indexes, and where they disagree they win. Known drift: the data load is one `bd export`, not
> `bd list --brief` plus four `bd` calls per shown bead ([ADR 0002](../docs/adr/0002-one-bd-export-load-instead-of-a-fetch-per-bead.md)),
> so the "Partial detail", "Bead deleted on show" and per-section Retry failure modes no longer exist. The `Tab`
> focus switch between list and detail is also gone.

Terms are in [CONTEXT.md](../CONTEXT.md). The look and keys are in [ui.md](ui.md). This plan says how to build it.

## Goal

A herdr-app mod named `beads`. It shows the beads of the Viewed repo in a pane split beside the Opener. You can
filter, sort, search, read a bead, follow its dependencies, change its status, copy its id and send it to an agent.

## Current state

- The repo holds `.prompt`, `CONTEXT.md`, `design/ui.md` and an empty beads database (`bd list --json` prints `[]`).
  There is no code.
- herdr-app 0.1.15, bd 1.3.4, hc and Node are installed. The type files are `~/.config/herdr-app/gpui-kit.d.ts` and
  `herdr.d.ts`. Read on 2026-11-15.
- herdr-review (`../herdr-review-annotate/herdr-app-mod`) is a working mod of the same shape. It has a tab-bar
  button, a split pane, and a pure update loop over a CLI. This plan copies its structure and toolchain.

## Desired behavior

As in `design/ui.md`, decided with the user on 2026-11-15.

## Facts the plan rests on

Each was read or run on 2026-11-15.

| Need | Fact | Source |
| --- | --- | --- |
| The list | `bd list --all -n 0 --brief --json` returns every bead without its long text: 208 beads in 0.43 s in `../raccoon`. Fields include `id`, `title`, `status`, `priority`, `issue_type`, `assignee`, `labels`, `created_at`, `updated_at`, `closed_at`, `dependency_count`, `dependent_count`, `comment_count`, `parent` | ran it |
| Ready | `bd ready -n 0 --json` returns the ready beads | ran it |
| Lock count | `bd blocked --json` returns `blocked_by_count` and `blocked_by` per blocked bead | ran it |
| Detail | `bd show <id> --json` is an array of one bead with `description`, `design`, `acceptance_criteria`, `notes` and `dependencies[]` (each with `dependency_type`) | ran it |
| Trees | `bd dep tree <id> --direction=down\|up --json` is a flat array in walk order. Each node has `depth`, `parent_id` and `edge_from_parent` (`blocks`, `parent-child`). Depth 0 is the bead itself. A node reached twice appears once | ran it, `bd dep tree --help` |
| Comments | `bd comments <id> --json` returns `[{id, author, text, created_at}]` | ran it in `../swingo` |
| Statuses | `bd statuses --json` returns `built_in_statuses[]` with `name`, `icon` and `category`, and may add custom ones | ran it |
| Running bd | `exec(cmd, args, {cwd, timeout})` from `herdr` runs a program in the user's environment | `herdr.d.ts:14`, `AGENTS.md:1008` |
| Opener | Inside a split mod's `init`, `focused()` still names the Opener's terminal and `cwd`. herdr-review relies on this | `herdr-review-annotate/herdr-app-mod/src/runner.ts:233` |
| Agents | `panes()` gives each pane's `terminal`, `cwd`, `tab`, `status` (non-null for an agent) and `focused`. `agents()` gives `seq` (higher means changed more recently) | `herdr.d.ts:183-209` |
| Width | `.on_size_change((size) => …)` reports the element's width | `gpui-kit.d.ts:725`, herdr-review `view.ts:858` |
| Markdown | `TextView.markdown(id, text)` renders markdown | `gpui-kit.d.ts:20710` |
| Pressed state | `.active((el) => …)` styles an element while it is pressed | `gpui-kit.d.ts:1271` |
| Motion | `.transition` and `.loop` animate opacity, width, height, left and top with `linear`, `ease-in`, `ease-out` or `ease-in-out`. `svg(...).spin(ms)` spins an icon | `gpui-kit.d.ts:22009`, `AGENTS.md:922` |
| Clipboard | `cx.write_to_clipboard(text)` | `gpui-kit.d.ts:348`, shipped mods `toast`, `spaces` |
| Typing | `hc send` and `terminal.send` always press Enter. `terminal.keys` presses named keys. `terminal.paste` pastes the clipboard into the terminal that has keyboard focus | `hc send --help`, `hc schema`, `AGENTS.md:592` |
| Toggle | herdr-review's button is a second copy of its mod, placed in the layout with props `role: "toggle"`. It polls `panes()` and runs `pane.split {direction: "right", mod}` or `pane.close {pane}` | herdr-review `main.ts:41-53`, `main.ts:196-200`, `layouts/herdr-review.json:112-125` |
| Key | `cmd-shift-b` is unbound in `~/.config/herdr-app/keys.json` | grep |

## Approach

### Structure (copied from herdr-review)

```
package.json, tsconfig.json, .oxlintrc.json
src/
  types.ts    Model, Msg, Cmd: plain data
  decode.ts   hand-written checks for bd JSON and host values (effect's Schema does not load: herdr-app-facts §2)
  update.ts   (Model, Msg) -> [Model, Cmd[]], pure
  rows.ts     filtering, search, sorting, trees, layout width: pure
  runner.ts   runs a Cmd: exec bd, run app commands. Returns a Msg
  host.ts     the herdr functions behind one interface, so tests use a fake
  view.ts     draws a Model. No state
  toggle.ts   the tab-bar button
  main.ts     the View class: init, render, close. Wires dispatch to update and runner
test/*.test.ts, test/fixtures/*.json   (real bd output, trimmed)
scripts/build-dist.sh   esbuild -> dist/main.js, plus mod.json and icons
scripts/stage.sh        copies dist/ to ~/.config/herdr-app/mods/beads and runs herdr-app check
dist/                   committed, as herdr-review does
```

The code follows Effect's A/E/R split without the Effect library (decided 2026-11-15: Schema does not load in a
mod, and the runtime adds 210 KB). Errors are tagged values in a union (`NoOpener`, `RemoteSpace`, `NoDatabase`,
`BdMissing`, `BdTimeout`, `BdLocked`, `BdRejected`, `BeadGone`, `Undecodable`, `TargetGone`), never strings or
throws. `runner.ts` returns a tagged Msg for success and for each error. `update.ts` decides retry, escape or error
state per tag. The retry policy wraps the bd call in `runner.ts`, outside the graph. Every herdr function is reached
through `Host`, so tests swap only `Host` for `FakeHost`.

The toolchain matches herdr-review's `package.json`: esbuild 0.28.2, typescript 7.0.2, oxlint, oxfmt, and
`node --test` with type stripping. `npm run setup-types` copies the two `.d.ts` files in (gitignored).

### Data: load the whole list once, then filter in the mod

One load, at open and on every refresh, runs three bd commands at once, each with `cwd` set to the Viewed repo:
`bd list --all -n 0 --brief --json`, `bd ready -n 0 --json` and `bd blocked --json`. The result is a list of beads,
a set of ready ids and a map from id to lock count. Filtering, search and sorting then happen in `rows.ts` on every
keystroke, without running bd.

- Ready is the set from `bd ready`. The mod never decides readiness itself (CONTEXT: Ready bead).
- The default view is "not closed", sorted by priority.
- Sorts: priority, created, updated, closed, status, id, title, type and assignee, with reverse. Ties fall back to
  `updated_at`, newest first, then `id`.

The detail is loaded when a bead is shown, with four commands at once: `bd show`, `bd dep tree --direction=down`,
`bd dep tree --direction=up` and `bd comments`. Each reply carries its bead id, and a reply for a bead that is no
longer shown is dropped, so holding `j` never shows stale detail. Details are cached by id until the next refresh.

### Opener, Viewed repo and send target

At `init`, a Viewer reads `props().root` and `props().opener` first. Without them it uses `focused()`: its `cwd` is
the Viewed repo, and its `terminal` is the Opener. This is herdr-review's `open()`. If the Opener's space is on
another machine (`spaces()[i].machine`), the Viewer shows `RemoteSpace` and runs no bd. Otherwise bd would run
locally against a folder that only shares the remote path.

Send to agent picks its target when clicked. It takes the Opener if `panes()` shows an agent status there. Otherwise
it takes the agent in the Viewer's tab with the highest `seq` from `agents()`. Then it:

1. reads the clipboard text and keeps it,
2. writes the prompt `Work on bead <id>: <title>` to the clipboard,
3. runs `pane.focus {terminal}`,
4. checks that `focused().terminal` is now the target. If it is not, it stops with `TargetGone` and pastes nothing,
   because `terminal.paste` would paste into whatever has focus,
5. runs `terminal.paste`, which pastes into the terminal that now has focus, without pressing Enter,
6. writes the kept text back to the clipboard (decided 2026-11-15). The API reads text only, so an image on the
   clipboard is not restored.

Focus is left on the agent, as decided.

### Status change

Picking a status runs `bd update <id> --status <s>`. Picking `closed` asks for an optional reason and runs
`bd close <id> [--reason r]`. Leaving `closed` runs `bd reopen <id>`, then `bd update` if the target is not `open`.
On success the Viewer reloads the list and that bead's detail. On failure the pill goes back and bd's stderr shows
under the meta row. If `bd reopen` succeeds and the following `bd update` fails, the Viewer reloads, so the bead
shows as open, and the error says the second step failed. The picker is disabled for a bead while its write runs.
The picker lists `bd statuses --json`, read once per Viewer. If that fails, it lists the five built-in statuses.

### Opening

- `toggle.ts`: the copy with props `role: "toggle"` draws a "Beads" button beside Annotate, lit while the focused
  tab has a beads pane. A click runs `pane.split {direction: "right", mod: "beads"}` or `pane.close {pane}`. It polls
  `panes()` every 500 ms, as herdr-review does, because the types do not say a mod redraws when panes change.
- Key: `"cmd-shift-b": {"command": "pane.split", "args": {"direction": "right", "mod": "beads"}}` under `global`.
- `stage.sh` copies only the mod folder. The layout block and the key are one-time edits to the user's own
  `layouts/herdr-review.json` and `keys.json`. The README gives the exact JSON, and the install bead applies it.

## Options

### Where filtering and sorting run

| | A. In the mod over one load (recommended) | B. bd per change |
| --- | --- | --- |
| Shape | 3 bd calls per load, then `rows.ts` filters, searches and sorts | Every filter, sort or search change runs `bd list` with flags |
| Speed | Instant per keystroke | About 0.4 s per change on 208 beads |
| Correctness | Readiness comes from bd. Sort tie-breaks are the mod's own and can differ from bd's | Always bd's exact semantics |
| Cost | `rows.ts` and its tests. Memory for every bead without text (small) | A loading state on every click. Stale replies to guard against |

A is recommended because search runs per keystroke, which B cannot do at 0.4 s. It would flip if a repo held tens
of thousands of beads, enough that one load became slow. Then B's server-side filtering would win.

### How Send to agent types without Enter

| | A. Clipboard, focus, `terminal.paste` (recommended) | B. `hc keys` one key per character |
| --- | --- | --- |
| Shape | `write_to_clipboard`, `pane.focus`, `terminal.paste` | `exec("hc", ["keys", t, "W", "o", "r", "k", "space", …])` |
| Cost | Replaces what the user had on the clipboard | Waits for about 3 s of quiet. Needs a key name for every character |
| Fit | Focus moves to the agent anyway, as decided | Works without moving focus |

A is recommended. The first bead checks that it pastes text and not just images. If it does not, use B.

## Failure modes, migration, compatibility

- **bd missing or failing.** `exec` rejects or exits nonzero. The Viewer shows bd's stderr and a Retry button, and
  keeps the last good list.
- **No `.beads`.** bd exits nonzero with a "no beads database" message. The Viewer shows the empty state with the
  folder and the `bd init` hint. A folder without `.beads` whose parent has one is fine, because bd searches upward.
- **No Opener.** If `focused()` has no `cwd` and props are empty, the Viewer shows "Open from a terminal".
- **bd locked or slow.** An agent running bd at the same moment can lock the database. `BdLocked` is retried
  twice, 300 ms then 900 ms, for reads and for status writes (a write of the same status is idempotent), then
  shows as an error with Retry. `BdTimeout` is not retried: 15 s already means bd is stuck, so it shows at once
  with Retry.
- **bd output not understood.** A missing or wrong-typed field is `Undecodable`, shown with bd's version. It is a
  compatibility bug, so it is not retried.
- **Bead deleted.** `bd show` on an id that no longer exists is `BeadGone`: the detail says so and offers Refresh.
- **Partial detail.** If `bd show` succeeds but a tree or the comments fail, the detail draws what arrived. The
  failed section shows its error and a Retry for that section only.
- **Send target gone.** Covered by the focus check in Send to agent: nothing is pasted.
- **Replies after close.** bd calls still running when the Viewer closes have their replies dropped, using a
  `closed` flag as herdr-review does. The toggle's timer stops on `close`.
- **Refresh during a refresh.** The second one is dropped.
- **The Opener closes.** The Viewed repo stays, because it was read at open. Send to agent falls back to the tab's
  last agent.
- **An agent changes beads while the Viewer is open.** Nothing updates until Ctrl+R. This is the user's decision.
- **Concurrent writes.** A status change goes through bd, which owns the database. The Viewer reloads afterwards
  and never edits locally.
- **Migration and compatibility.** None: this is a new mod with no stored state. It writes nothing under
  `~/.config/herdr-app/data`. The layout and key edits are additive. If herdr-review rewrites its layout file, the
  Beads button is lost and must be added again (noted in the README).

## Not covered

- Live refresh with `watchFolder` on `.beads`. The user left it out of v1, and it is the obvious next step.
- bv's graph metrics, alerts and triage (`bv --robot-*`). The user chose bd only.
- Editing anything but status: priority, assignee, labels, comments, creating beads.
- Label and assignee filters, which bd supports. The user picked Ready, Status and Type.
- Remote machines. `exec` takes `on: machine`, but v1 runs bd locally. A space on another machine shows the
  "no beads database" state.
- A herdr plugin or an agent skill. The user chose mod only.
- Remembering filters and sort between Viewers. The default view is fixed.
- Publishing to herdr.dev/mods.

## Risks and open questions

- `terminal.paste` with text on the clipboard is documented only next to images. The first bead runs it on a
  scratch terminal before Send is built on it. It also checks that the paste has read the clipboard before the old
  text is written back. If it hasn't, the old text would be pasted instead.
- The text of bd's "locked" and "no beads database" errors is matched in stderr. The first bead records the exact
  messages from bd 1.3.4.
- `focused()` in `init` naming the Opener is herdr-review's experience on herdr-app 0.1.14. It is rechecked in the
  first bead on 0.1.15.
- `bd dep tree --direction=up` on an epic lists its children through `parent-child` edges, so the Blocks tree of an
  epic is long. It is shown as bd returns it.
- Polling `panes()` for the toggle costs a redraw only when the state changes, but a timer still runs. This is
  herdr-review's accepted shortcut.
