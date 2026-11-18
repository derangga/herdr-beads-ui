---
status: accepted
---

# One `bd export` load instead of a fetch per bead

A load runs `bd export`, `bd ready -n 0 --json` and `bd blocked --json` at once. The export carries every bead
with its text, comments and dependency edges. The list, every bead's detail and both dependency trees read from
that one snapshot, so showing a bead runs no `bd`.

The first design loaded a brief list, then ran four `bd` calls per shown bead (`show`, `dep tree` down and up,
`comments`).

## Considered options

- **A list load plus a fetch per bead.** Rejected after it was built. Each `bd` process costs about 0.4 s of
  embedded-Dolt start-up, and the four run together wait on the same lock, so moving between beads with `j` took
  5 s or more. It also needed request numbers, a debounce, Loading timers and a per-section Retry, all gone now.
- **One export for everything.** Chosen. One call of about 0.5 s on a repo of 208 beads. On the three repos
  tried, the trees built from the edges list the same beads as `bd dep tree`.
- **`bd` per filter change.** Rejected for the same reason as before: search runs per keystroke and `bd` takes
  0.4 s. Filtering, searching and sorting happen in `rows.ts` over the snapshot.

## Consequences

- A detail is only as fresh as the last refresh or write. Nothing updates until Ctrl+R, a refresh button or a
  status write. Live refresh with `watchFolder` on `.beads` is the obvious next step and is not built.
- Each load reads every bead's full text. A repo with tens of thousands of beads would make one load slow, and
  then server-side filtering would win.
- The mod builds the trees itself (`depTree`). It follows every edge type but `relates-to` and draws each bead
  once, as bd does. Sibling order follows edge order and can differ from bd's, which is not reproduced.
- The mod follows the export's shape: JSONL, an `issue` record per line, other `_type`s skipped. A change in it
  is `Undecodable` naming the line.
- `docs/beads/design/plan.md` describes the first design and is superseded on this point.
