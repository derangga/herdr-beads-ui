# Requirements (R) and the boundary

Part of the [design](../DESIGN.md).

## What each node needs

One interface, `Host`, is the only door to the outside. One object per copy of the mod. Only `host.ts` imports
`herdr`.

| Name | Production | Tests |
|---|---|---|
| `exec` | `herdr.exec`, which runs a program in the user's environment. Rejects when the program cannot start or the timeout passes | `fakeHost(exec)`: a function from the recorded call to an `ExecResult` or an `Error`. Every call is recorded with its `cwd` and `timeout` |
| `sleep` | `cx.sleep`. Mods have no `setTimeout` | Instant, and the milliseconds are recorded |
| `run` | `herdr.run`: app commands such as `pane.split`, `pane.close`, `pane.focus`, `terminal.paste` | Records `run <name> <args>` into `events` |
| `openOverlay`, `closeOverlay` | herdr's dialog overlay, used for the keys | Records, and answers `o1` |
| `focused`, `panes`, `agents`, `spaces`, `props`, `settings` | The herdr values. Untrusted | Return what the test sets, default empty |
| `nextCommand` | Waits for a command sent to this mod, such as `focus` | Never resolves, unless a test sets it |
| `theme` | `herdr.theme()`, cast once to `#${string}` | `{}` |
| `readClipboard`, `writeClipboard` | `cx.read_from_clipboard`, `cx.write_to_clipboard` | Read answers `undefined`. Write records into `events` |

`root`, the Viewed repo's folder, is the other parameter. Every `bd` call passes it as `cwd`, so `bd` finds the
database the way it does for a person in that folder, searching upward.

```
Host        the only door to the outside
runner      R: Host, root.   Runs a Cmd and answers with a Msg. Returns, never throws
update      R: nothing.      (Model, Msg) -> [Model, Cmd[]]. Holds the single-flight flags and the error table
rows        R: nothing.      filter, search, sort, trees, layout widths, target picking
states      R: Host.props, focused, panes, spaces (start only). The rest is pure
store       R: Host, root.   Runs update, then each Cmd through runner, and feeds the Msg back. Drops replies after close
view        R: Model, theme, target, dispatch, handles. Draws. Holds no logic and calls no Host method
main        R: the real Host. Wires init, render, close, the keyboard poll, the search and reason boxes, and looks up
            the theme and the Send target on every draw, since agents come and go without the Viewer being told
```

## Boundary

Untrusted: the stdout of `bd export`, `bd ready`, `bd blocked` and `bd statuses`, and the host values
(`props`, `focused`, `panes`, `agents`, `spaces`, `settings`). Each is decoded once, in `decode.ts`, by a
hand-written check of the fields the mod reads.

```
decodeExport(text, version)    JSONL, one bead per line      -> Res<{ beads, edges }>   Undecodable { path } on a bad line
decodeReady / decodeBlocked    JSON                          -> Res<...>                Undecodable { path }
decodeStatuses                 JSON                          -> Res<StatusInfo[]>       custom statuses have no icon
decodeFocus, decodePanes,
decodeAgents, decodeProps      host values                   -> value or null, never throws: a wrong shape is "nothing there"
decodeFont                     settings                      -> family, else Menlo
```

- bd leaves out empty fields, so an absent and a `null` field both mean none (`strOpt`, `strOr`, `numOr0`).
- Blank lines in the export and records with an `_type` other than `issue` are skipped. bd may add other kinds.
- A bd field of the wrong type is `Undecodable` with the path (`$[3].title`), the detail, and bd's version. The
  version is asked for with a second call only after a decode fails, so the good path costs one bd call.
- Inside the mod the types are trusted. There is no schema library. Effect's `Schema` does not load in the mod
  runtime ([ADR 0001](../adr/0001-plain-typescript-with-effect-s-three-channels.md)).
- bd 1.3.4 exits 1 for every failure, so `classify` reads the text of **both** stdout and stderr: `--json` moves
  some errors to stdout as JSON and leaves stderr empty, and a warning can sit on stderr beside an error on
  stdout.

## Behavior wrappers

- `bd()` retries `BdLocked` twice, after 300 ms and 900 ms. Every bd call goes through it, so no caller repeats
  it. A status write is the same call again, so it is covered too.
- Every `exec` has a 15 s timeout. A timeout is `BdTimeout` and is not retried: 15 s already means bd is
  stuck, and a retry would hold the spinner for about 46 s.
- Single flight lives in `update.ts`, not in a wrapper, because it is state and not a side effect.

Neither wrapper appears inside a handler.

## Scope

Per copy of the mod, released in `close(cx)`, which is bounded: cancel the poll, set `closed`, release the
search box, the reason box and the list's scroll handle. `bd` calls still running have their replies dropped by
`Store.dispatch`, which checks `closed` first. The toggle copy only cancels its poll. The keys copy only
decrements `keysOpen`.
