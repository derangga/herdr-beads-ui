# Call graphs: load, and show a bead

Part of the [design](../../DESIGN.md). Each `E:` line is one test, and each test swaps only `Host`.

## Shapes

```
Snapshot = { beads: BeadDetail[], edges: Edge[], ready: Set<id>, locks: Map<id, count> }
```

One load builds all of it. The list, every bead's detail and both dependency trees read from it, so nothing but
a load or a write runs `bd` ([ADR 0002](../../adr/0002-one-bd-export-load-instead-of-a-fetch-per-bead.md)).

## Load

```
-> Refresh                                             triggers: open, Ctrl+R, the refresh button, Retry, the end of a write
  -> update: loading, or error is NoOpener or RemoteSpace
                                                       E: -> dropped, model unchanged, no Cmd
  -> update: loading = true, loads + 1                 many: one in flight
       no snapshot yet (a first load)  -> Cmd.Load and Cmd.WaitLoad { n: loads }
       a snapshot to keep              -> Cmd.Load only, the list stays on screen and only the icon spins
-> run Load                                            R: Host.exec x3 at once, root
  -> bd export                                         JSONL, every bead with its text, comments and edges
  -> bd ready -n 0 --json                              the ids bd calls ready
  -> bd blocked --json                                 id -> blocked_by_count
       each through bd(): once() then classify, BdLocked retried at 300 ms and 900 ms
       each through bdJson(): decode; on Undecodable ask `bd --version` and decode again for the message
                                                       E: BdLocked, after the retries -> BdLocked
                                                       E: BdTimeout -> BdTimeout, not retried
                                                       E: NoDatabase | BdMissing | BdRejected -> that tag
                                                       E: a bad line or field -> Undecodable { version, path, detail }
  -> the first error in the order export, ready, blocked wins
  -> Msg.Loaded { res }
-> update(Loaded)
     E: reload is set (a write finished during this load) -> drop the answer, Cmd.Load once more
     E: res is an error -> keep the snapshot, loading = false, error set, spinner off
     ok -> snapshot replaced, error cleared, loading = false; reselect (below)
-> render                                               pure, thin: rows.visible(model), then view.draw
```

`reselect` keeps the selection when the selected bead is still in the visible rows, and moves it to the first
row when it is not or when nothing was selected. A sort change keeps the selection. A filter that hides the
selected bead moves it to the first row. Lifting a filter from an empty list selects the first row.

The mod never calls `bd list`. It runs three reads with three exits, so a failure in any of them is one
`Loaded` with one error.

### The first-load spinner

```
-> Cmd.WaitLoad { n }                                  R: Host.sleep 150 ms
  -> Msg.Slowed { n }
-> update(Slowed)
     slow = true only if loading, no snapshot, and n equals the model's load number
       E: the load already ended (a fast bd) -> nothing, so a fast load never flashes "Loading beads"
       E: n is an earlier load's -> nothing, so an earlier timer cannot start a later load's spinner
```

A failed first load ends the spinner. A refresh that has a snapshot starts no timer.

## Show a bead (no bd)

```
-> Select | Move | Click | Enter | Jump | Walk          user actions
  -> update: selected / shown / back / forward change   pure, no Cmd
-> shownBead(model)                                    the snapshot's own BeadDetail, by shownId
     E: the id is not in the snapshot -> null, the detail says so, nothing runs
-> depTree(snapshot, id, "down" | "up")                (pure) TreeNode[], in walk order
  -> treeRows(nodes)                                   (pure) TreeRow[] with guide lines
-> draw: header, meta row, text sections, trees, comments
```

- `down` follows what the bead depends on, `up` what depends on it. Every edge type is followed except
  `relates-to`, which is bd's two-way "see also" link and which `bd dep tree` does not follow either.
- Like bd, each id comes out once, in a depth-first walk with one seen set. An edge to an id already emitted,
  the root included, is dropped. A cycle therefore ends. A chain is cut at depth 50.
- An edge to an id the snapshot lacks is skipped. A root it lacks gives no tree.
- A section with no text is absent: description, design, acceptance criteria, notes.
- Sibling order follows edge order and can differ from bd's own, which is not reproduced.
- Criteria stored as `[ ] text` with no list marker become task items (`taskLists`), so they draw as boxes and
  not as literal brackets.

### Selecting and history

```
-> Select { id } | list click | j k                    pick: selected = id, shown = null
-> Jump { id }   an id link in a detail                history grows
     E: the shown bead is the id, or nothing is shown -> unchanged
     back = back + shown, forward = []
     land: the id is in the filtered rows -> pick it (the list selects it, order kept)
           else -> shown = id, the list and its selection stay, the detail says "Hidden by the current filters"
-> Walk { -1 | 1 }   the keys [ and ]
     E: nothing on that side -> unchanged
     moves one id between back, shown and forward, then land
-> BackToList | Esc (narrow only)
     pane = list, shown = null, back = [], forward = []   the history of that visit ends
```

A list action puts the detail back on the selected bead, whatever a link had shown. A click on a row does not
push history. Narrow: a click opens the detail full width, and Esc or `‹ List` goes back to the list with the
last bead shown selected if the list has it, else the previous selection. Wide: the list and detail are side by
side, Enter and Esc leave the list with the keyboard.

### Filter, search, sort

```
-> ToggleReady | SetStatus | SetType | Search | SortBy | Reverse    pure, no Cmd, no bd
  -> rows.visible(model)                               matches(filters, ready) then compare(sort)
```

- The default view is "not closed", sorted by priority. A status the mod does not know counts as not closed.
- `ready` keeps only the ids `bd ready` named. A ready id that is closed stays hidden under "not closed".
- Search matches the id and the title, case-insensitively, as a substring, and combines with each filter.
- Sorts: priority, created, updated, closed, status, id, title, type, assignee, each with reverse. Dates sort
  newest first. Beads never closed sort last in both directions, so do the unassigned. Ids sort naturally
  (`a.9` before `a.10`). Status follows the workflow, then unknown names. Ties fall back to `updated`, newest
  first, then `id`, and reverse leaves the tie-break alone. Choosing a key resets reverse.
- `visible` keeps one entry keyed by the identity of the snapshot, the filters and the sort, so a key that moves
  nothing and a redraw run no filter and no sort. The entry is module scope, so two Viewers can evict each
  other's. That costs a recompute, never a wrong answer. Callers must not mutate the result.

## Tests

Each `E:` line is one test. Also: the happy path (one `Load` runs `bd export`, `ready` and `blocked`, never
`list`, and the snapshot carries all four parts), a refresh during a load is dropped and its reply still ends
that one load, a thousand beads walked to the end land on the last row, and a `Moved` in the narrow detail does
nothing.
