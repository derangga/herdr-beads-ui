# Tests that the graphs give

Part of the [design](../DESIGN.md).

Each `E:` line in a graph is one test, and each test swaps only what [requirements](requirements.md) lists
under `R:`. They run with `npm test`, which is `node --experimental-strip-types --test 'test/beads/*.test.ts'`.

| Graph | Swapped | File | Tests |
|---|---|---|---|
| Boundary | none, fixtures only | `decode.test.ts` | The export: the parent taken from the `parent-child` edge, every edge, a closed bead, a comment, absent optional fields, blank lines and other `_type`s skipped, and the path naming the line of a bad title, edge, comment or non-JSON line. `ready`, `blocked`, `statuses` (custom ones have no icon). A decode failure with no known version carries `null`. `focus`, `props`, `panes` and `agents` with a wrong shape, `font` |
| bd runner | `fakeHost(exec)`, instant `sleep` | `runner.test.ts` | Every row of the bd table in [errors](errors.md): `NoDatabase`, `BdMissing` (and the same reject when bd starts without the folder is `BdRejected`), `BdTimeout` not retried, `BdLocked` on stdout, on stderr and beside a warning (3 calls, then the error), a lock that clears on the second try, `BeadGone` on either stream, `BdRejected` with its code, `Undecodable` with the version asked for only after the decode fails. Every call runs in the Viewed repo with a timeout |
| Load | `fakeHost(exec)` | `runner.test.ts`, `update.test.ts` | `Load` runs `export`, `ready` and `blocked` at once and never `list`. The snapshot has all four parts. The first error wins in that order. A bad line is `Undecodable` naming it. `WaitLoad` sleeps 150 ms |
| Single flight and states | none, a list of `Msg` | `update.test.ts`, `states.test.ts` | A refresh starts one load, a refresh during a load is dropped and its reply still ends that load, the next refresh runs. A failure keeps the list and records the error, the next good load clears it. `NoOpener` and `RemoteSpace` run no bd and drop a refresh. `NoDatabase` with and without a snapshot, `BdMissing`, `BdRejected` and `Undecodable` keep the list. The spinner shows only for a first load still running 150 ms on, never for a fast one, never from an earlier load's timer. Retry says "Retrying…" |
| Open | `fakeHost` with `props`, `focused`, `panes`, `spaces` set | `states.test.ts`, `send.test.ts` | The props name the folder when nothing is focused. A local space, or one the list does not know, is not remote. The Opener's tab is its pane's, else the focused tab, else none. `takesKeyboard` only while herdr's focus is on the Viewer's pane and no box or menu holds it. `?` leaves the model alone |
| Toggle | `fakeHost` with `panes`, `focused`, `props` set | `toggle.test.ts` | Only `role: "toggle"` makes the button's copy. It is lit only for a beads pane in the focused tab. A click splits right when the tab has none and closes the Viewer when it has. The poll redraws only when the Viewer appears or goes |
| Rows | none | `rows.test.ts` | Default view, status, type, ready, search and their combinations, each sort key with reverse and its tie-break, natural id order, no snapshot gives no rows, the same inputs give the same rows |
| Show a bead | none, a list of `Msg` | `detail.test.ts`, `history.test.ts`, `update.test.ts` | Showing another bead by select, move, click, Enter, jump or walk runs no bd. The detail is the snapshot's bead, absent for an id it lacks, kept across a failed load, replaced by a good one. The hidden-by-filters note. A section with no text is absent. Jump, back, forward, a new jump clearing forward, a hidden bead shown with the list left alone, narrow Esc and the List button. Moves in the narrow detail do nothing. Crossing 800 px changes only the width |
| Trees | none | `tree.test.ts`, `history.test.ts` | `down` and `up` with the root first and the edge type on each node. An id reached twice is dropped. A cycle ends. A chain is cut at depth 50. A missing id is skipped. `relates-to` is not followed. Task lists. `treeRows`: depth 0 skipped, guides, `last`, nesting by `parent_id` in any order |
| Status | `fakeHost(exec)` for the write, none for `update` | `status.test.ts`, `runner.test.ts` | Every `E:` line of [status](graphs/status.md), and the argv of each write |
| Send and copy | `fakeHost` with `panes`, `agents`, `focused`, `readClipboard` set | `send.test.ts` | Every `E:` line of [send](graphs/send.md). `pickTarget`: the Opener when an agent runs there, the tab's last-changed agent for a shell Opener and never one in another tab, none without an agent or when its pane has no terminal. The prompt is pasted once, the old text comes back only after the wait, a title with line breaks is one line |

If a test needs a real `bd`, a real herdr-app or a real clipboard to exercise one of these graphs, the function
has a hidden dependency and the design is wrong. `fixtures/` holds real `bd` output, trimmed. Nothing in the
suite runs `bd`.

The GPUI `view` has no unit test, which is why it holds no logic. It is checked with `herdr-app check` on the
staged mod and a `herdr-app shot` of the running app. A bead that changes it says in its close note what it
looked at. `docs/beads/design/shots/` holds the screenshots taken so far.
