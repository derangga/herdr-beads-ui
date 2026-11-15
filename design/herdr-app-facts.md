# What the design assumes about herdr-app and bd

Part of the [design](../DESIGN.md). Checked on 2026-11-15 with herdr-app 0.1.15, bd 1.3.4, macOS. The herdr-app window was
running. Everything below was run in a scratch tab that I opened (`terminal.open {place: "tab", folder: <scratch folder>}`,
terminal `t2g`), and the tab was closed afterwards. No other terminal was written to. The temporary probe mod was deleted.

## 1. `focused()` in `init` of a split mod names the Opener

Staged the placeholder with `bash scripts/stage.sh` (`herdr-app check` printed `check passed`). With the scratch
terminal focused, ran `herdr-app do pane.split '{"direction":"right","mod":"beads"}'`. The placeholder's `init` set
`this.root = focused()?.cwd`. To read the value without a visible window (see the next paragraph), I staged a copy of the
bundle that also wrote `this.root` to a file; it wrote the scratch terminal's folder (`.../scratchpad/opener-cwd`),
not the cwd of any other terminal. `herdr-app status` listed no errors. I then re-staged the real bundle and confirmed
`dist/main.js` and the staged `main.js` are byte-identical.

**Yes: `focused()` inside `init` still names the Opener terminal and its cwd.** A probe mod split the same way also
logged the whole `focused()` value at init: `terminal: "t2g"` (the Opener), `pane` the Opener's pane, `cwd` the Opener's
cwd. Its `panes()` at init listed the three existing panes and not the new mod pane.

**`herdr-app shot` could not show the window.** The first shot (taken after the split) and the later ones were
byte-identical and showed tab 1 of the user's window, with no scratch tab and no beads pane, although `herdr-app ls`
said the scratch tab was active. So the window was not painting new frames and `shot` returned a stale frame. The
drawing was therefore not seen: only the `init` value above was verified. The placeholder's drawing code type-checks and
`herdr-app check` renders it once without error, but nobody has looked at it.

## 2. `pane.focus {terminal}` then `terminal.paste`

Probe mod (temporary) run in the same scratch tab, with the clipboard text saved at the start and written back at the end
(the user's 116 bytes of text were intact afterwards). It wrote `echo PROBE-A` to the clipboard with
`cx.write_to_clipboard`, ran `run("pane.focus", {terminal: opener})`, then `run("terminal.paste")`.

- **The text is pasted without Enter.** The scratch shell's prompt showed `❯ echo PROBE-A` and no output line under it.
  `hc read t2g` after each paste showed the same. So `terminal.paste` does paste text, and does not submit. The Send
  issue does not need to switch to `hc keys`.
- **`run("pane.focus")` has not taken effect when `run()` returns.** Right after it, `focused()` still named the mod's
  own pane with `terminal: null`. `run()` returns `null`. The plan's step 4 (check `focused().terminal` right after
  `pane.focus`) must wait and poll. With a 5 ms poll, `focused().terminal` became the target about 103 to 108 ms later,
  in all five trials.
- **`terminal.paste` has NOT read the clipboard by the time `run()` returns.** In the first run I wrote
  `echo PROBE-B` to the clipboard immediately after `run("terminal.paste")` returned, and the terminal got `PROBE-B`,
  not `PROBE-A`. So writing the old text back right after `run()` is NOT safe: it would paste the old text instead of
  the prompt.
- **By the time `focused().terminal` shows the target, the paste has read the clipboard.** In a second run of five trials
  I waited until `focused().terminal` equalled the target, then wrote `echo B<n>` to the clipboard, at 0, 20, 60, 150
  and 400 ms after `run("terminal.paste")` (the first three came out at once, about 105 ms, because focus had not
  landed sooner). All five terminals showed `echo A<n>`, the text from before. So the paste read the clipboard no later
  than the moment focus was observed. The margin is small and was measured on one machine, so the Send issue should wait for focus to land and
  then add a further delay of at least 300 ms before it writes the old text back.

## 3. bd 1.3.4 errors

All ran with `rtk proxy bd ...` to see the raw output. Exit code is 1 in every case. `bd list --json` was run too, as the
viewer will use `--json`.

**No beads database** (`bd list`, and `bd list --json`, in an empty temp dir). stdout empty, stderr exactly:

```
Error: no beads database found
Hint: run 'bd where' to inspect the resolved workspace, or 'bd init' to create a new database
      or set BEADS_DIR to point to your .beads directory
```

**Unknown id** (`bd show nope-123` in this repo). stdout empty, stderr exactly:

```
Issue nope-123 not found
Hint: this ID may have never existed, or may reference a deleted/purged record with no trace left in the live database — try 'bd history nope-123'
```

With `--json` the same stderr is printed and stdout also holds JSON (`<` is how bd escapes `<`):

```
{
  "error": "no issues found matching the provided IDs",
  "hint": "some IDs may reference deleted/purged records with no trace left in the live database — try 'bd history <id>' to check",
  "schema_version": 1
}
```

**Database locked.** Reproduced only by simulation, in a scratch repo made with `bd init` (never in this repo): another
process held an exclusive `flock` on `.beads/embeddeddolt.gate.lock`, which is what a bd maintenance operation holds. It
is not a real "database locked" from SQLite or Dolt, and I did not find one. Eight `bd create` run in parallel in that
scratch repo all exited 0, so ordinary concurrent writers wait for each other and do not fail. Without `--json`,
`bd list` and `bd update` printed to stderr (stdout empty), on one line, here with the scratch path:

```
Error: a maintenance operation is running on this workspace; retry when it completes: workspacegate: <repo>/.beads/embeddeddolt.gate.lock (shared mode) held by another bd process (no holder info recorded): workspace gate busy
```

With `--json` the message is on **stdout** as JSON and stderr is empty (this differs from the other two cases, where
stderr carries it):

```
{
  "error": "a maintenance operation is running on this workspace; retry when it completes: workspacegate: <repo>/.beads/embeddeddolt.gate.lock (shared mode) held by another bd process (no holder info recorded): workspace gate busy",
  "schema_version": 1
}
```

It failed at once (0 s), with no wait. A decoder that maps errors to tags should match on the substring
`maintenance operation is running` (locked) and `no beads database found` (no database), and read both stdout and
stderr, because `--json` moves some errors to stdout.

## 4. Rejection texts of `exec` and bd's errors for other per-id commands

Checked on 2026-11-15 with herdr-app 0.1.15 and bd 1.3.4. A temporary probe mod (`beads-probe`) ran inside a scratch tab
(opened with `terminal.open {place: "tab"}`, closed afterwards with `tab.close`) and wrote each rejection's `message` to a
file. The probe mod was deleted. `herdr-app check` loads a mod once but does not wait for async work, so a real pane was
needed. Each rejection is an `Error`.

| Call | Rejection message |
| --- | --- |
| `exec("sleep", ["5"], {timeout: 500})` | `` `herdr.exec`: sleep took longer than 0.5 s and was stopped `` |
| `exec("no-such-bin-xyz", [])` | `` `herdr.exec`: cannot run no-such-bin-xyz: No such file or directory (os error 2) `` |
| `exec("bd", ["list"], {cwd: "/no/such/folder"})` | `` `herdr.exec`: cannot run bd: No such file or directory (os error 2) `` |

A missing program and a missing `cwd` give the same text, so the text alone cannot tell them apart. The runner tells
them apart by starting `bd --version` with no `cwd` after a "cannot run" rejection: if that starts, the folder is the
problem (BdRejected), otherwise bd is missing (BdMissing).

Other per-id commands with an unknown id, run with `--json` in this repo. All exit 1 and print nothing to stderr; the
text is JSON on stdout (unlike `bd show`, which also prints `Issue <id> not found` to stderr):

- `bd dep tree nope-123 --json` and `bd dep tree nope-123 --direction=up --json`:
  `{"error": "resolving issue ID nope-123: no issue found matching \"nope-123\"", "schema_version": 1}`
- `bd comments nope-123 --json`:
  `{"error": "resolving nope-123: no issue found matching \"nope-123\"", "schema_version": 1}`

`show` says "no issue**s** found matching", these say "no issue found matching". The runner matches both as BeadGone.
