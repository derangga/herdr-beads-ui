# Call graphs: change a bead's status

Part of the [design](../../DESIGN.md). Each `E:` line is one test, and each test swaps only `Host`. The
status is the only field the Viewer changes. `bd` owns the database, and the Viewer reloads afterwards and never
edits a bead locally.

## Read the statuses

```
-> ReadStatuses                                        once per Viewer, right after the first Refresh
  -> bd statuses --json                                R: Host.exec, root
    -> decodeStatuses                                  built-in and custom; a custom one has no icon
  -> Msg.StatusesRead
       ok and not empty -> model.statuses = the names, in bd's order
       E: BdError, or an empty list -> escape: model.statuses stays the built-in five, no message
```

The picker lists `model.statuses`, plus the bead's own status when it holds one bd does not list
(`pickOptions`).

## Pick a status

```
-> key s | the status pill                             ToggleMenu "pick"
     E: nothing is shown, or the shown bead is writing -> unchanged, nothing opens
     writeError cleared
-> Pick { status }                                     a row of the picker
     E: nothing shown, the bead is writing, or the status is its current one -> picker closes, no Cmd
     status is "closed" -> menu = "reason"             asks for an optional reason, the box takes the keyboard
       -> Esc                                          E: -> menu closes, no write
       -> Enter | CloseWith { reason }                 reason trimmed; empty means none
            E: nothing shown, writing, or already closed -> menu closes, no Cmd
     otherwise -> write
-> write: writing[id] = "running", menu closed, writeError cleared
     Cmd.Write { id, from, to, reason }
```

## Write

```
-> run Write { id, from, to, reason }                  R: Host.exec x1 or x2, root
     to is "closed"                 -> bd close <id> [--reason <r>]       the reason only when not empty
     from is not "closed"           -> bd update <id> --status <to>
     from is "closed"               -> bd reopen <id>
                                         E: reopen failed -> stop there, error is of the first step
                                         to is "open" -> done
                                         else -> bd update <id> --status <to>
                                            E: update failed -> error with second = true
       each call through bd(): BdLocked retried at 300 ms and 900 ms
  -> Msg.Written { id, to, error, second }
```

`bd close` and `bd reopen` own the closed state, so entering or leaving `closed` is theirs and every other move is
`bd update`. Leaving `closed` for anything but `open` takes two calls, and `second` says which one an error is
of.

## After the write

```
-> update(Written)
     E: error and not second -> nothing changed in bd: writing[id] removed (the pill goes back),
        writeError { id, error, second: null } shown under the meta row
     done, or second failed -> writing[id] = "reloading": the pill keeps its spinner until the load lands
        second failed -> writeError { id, error, second: to }: "bd reopen worked, but bd update --status <to> failed: ..."
        a load is running -> reload = true: that load may predate the write, so its answer is dropped and one
                             more load runs (load.md)
        no load running -> Refresh
-> Loaded: writing keeps only the "running" entries, so the pill shows the new status, and with it the detail
```

- The picker is disabled for a bead while its write runs. A write of another bead does not free this one.
- A failed write's error stays until the next action: another bead shown (by a link as well as the list), or a
  new picker or write.
- A failed reload after a write keeps the old list and frees the picker.
- If `bd reopen` worked and `bd update` failed, the reload shows the bead as open and the error says the second
  step failed.

## Tests

Each `E:` line is one test. Also: open to `in_progress` is one write and marks the bead as writing, closed to
`in_progress` is one write that the runner splits into reopen and update, and the argv of each bd call is
`update <id> --status <s>`, `close <id>`, `close <id> --reason <r>` and `reopen <id>` with `cwd` the Viewed repo.
