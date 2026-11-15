# Shapes

Part of the [design](../DESIGN.md). The code is `src/types.ts`. This file says why each shape is what it is.

```
ids        a bead id (string, bd's own: "raccoon-46u.5")   terminal id ("t7")   pane id   tab id
records    Bead, BeadDetail, Edge, Blocked, Comment, StatusInfo, Snapshot
           TreeNode, TreeRow, Opener, Focus, PaneRef, AgentRef, Target
           Filters, Sort, Model
variants   BdError    NoOpener | RemoteSpace | NoDatabase | BdMissing | BdTimeout | BdLocked
                      | BeadGone | BdRejected { code } | Undecodable { version, path, detail }
           SendError  NoTarget | TargetGone | SendRejected
           Res<T>     { ok: true, value } | { ok: false, error }
           Pane       list | detail
           Menu       status | type | sort | pick | reason
           SortKey    priority | created | updated | closed | status | id | title | type | assignee
           Msg        what happened. Cmd  what to do next
```

## Records

- **Bead** is the fields of one `bd export` line that the list needs. `status` is a `string`, not a union,
  because bd allows custom statuses, and a status the mod does not know is treated as not closed.
- **BeadDetail** is a Bead plus the long text (`description`, `design`, `acceptance_criteria`, `notes`) and its
  comments. A load reads it for every bead, so showing a bead runs no `bd`.
- **Edge** is one dependency: `from` depends on `to`, with bd's own `type` (`blocks`, `parent-child`,
  `relates-to`, and others bd may add). `parent` on a Bead is the `to` of its `parent-child` edge.
- **Snapshot** is what one load builds and the only thing the list and the detail read: `beads`, `edges`,
  `ready` (a `Set` of the ids `bd ready` named) and `locks` (id to `blocked_by_count`). The mod never decides
  readiness itself.
- **TreeNode** has the shape `bd dep tree --json` printed, so `treeRows` reads it unchanged. `depTree` builds it
  from the snapshot's edges.
- **Opener** is `{ terminal, tab }`, fixed when the Viewer opens. The tab is the Viewer's own tab.
- **Target** is the terminal an agent runs in, chosen when Send is clicked and not stored.

## Variants

- `BdError` is one union because `update.ts` reads it once, in one table ([errors](errors.md)). Its first two
  members are not bd's: the Viewer knows it cannot ask bd, so no bd runs. `Undecodable` carries bd's version so
  a changed output is named instead of crashing a view.
- `SendError` is separate from `BdError` because nothing in a send touches bd, and a send's failure only changes
  the button's label.
- `Msg` and `Cmd` are plain data. A `Cmd` is what `update` asks for, a `Msg` is the one answer. The `Write`
  command carries `from` and `to` and the runner picks the bd commands.

## Model

Everything the screen is drawn from, in one object on the instance. The fields that are not obvious:

- `snapshot` is the last good load. A failed load leaves it alone and sets `error`.
- `selected` is the bead the list has selected. `shown` is the bead on display when a link or the history put
  it there instead. `null` means the selected one. The list keeps its filters and selection, so a bead the
  filters hide can still be shown.
- `back` and `forward` are the history. The shown bead is in neither.
- `width` is the Viewer's own width, 0 until measured. The layout (wide at 800 px or more) is derived from it,
  so crossing the line changes no state.
- `loads` and `slow` carry the first-load spinner: `slow` is set by a timer that carries the load number it
  was started for, so an earlier timer cannot show a later load's spinner.
- `writing` maps a bead id to `running` (bd is writing) or `reloading` (written, the list is loading again). A
  bead in it cannot be written again.
- `reload` says a write finished while a load ran, so that load may predate it. Its answer is dropped and one
  more load runs.
- `flash` hands out numbers to the labels that show for a moment (`copied`, `sent`). A timer clears a label
  only if its number is still the latest.
- `sending` says the clipboard is borrowed. Copy does nothing while it is set.

Model is trusted. Nothing is decoded inside it. Decoding happens once, at the edges in
[requirements](requirements.md).
