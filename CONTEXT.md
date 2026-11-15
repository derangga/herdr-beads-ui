# herdr-beads-ui

A herdr-app mod that shows the beads of a repo, beside the terminals and agents working on it.

## Language

**Bead**:
One issue in a beads database, named by its id (for example `raccoon-46u.5`).
_Avoid_: ticket, task (a task is one bead type)

**Beads database**:
The `.beads` folder of a repo, read and written only through the `bd` command.

**Viewed repo**:
The repo whose beads database a viewer shows: the folder of its **Opener** at the moment the viewer opened. It stays fixed for the viewer's lifetime.
_Avoid_: project, workspace

**Viewer**:
One beads pane, split to the right of its Opener. Opened and closed by the Beads button in the tab bar.

**Opener**:
The terminal that was focused when a Viewer was opened. It decides the Viewed repo and is the first choice to receive a sent bead.

**Send to agent**:
Typing a short prompt naming a bead into an agent's terminal, without submitting it. Goes to the Opener when an agent runs there, otherwise to the tab's last focused agent.

**Target**:
The terminal an agent runs in that Send to agent types into. Chosen when Send is clicked and never stored.

**Bead status**:
One of bd's stored statuses: `open`, `in_progress`, `blocked`, `deferred`, `closed`, or a custom one bd lists. The only field the viewer changes.

**Ready bead**:
An open bead with no active blockers, as `bd ready` decides. The viewer never computes readiness itself.

**Lock count**:
How many open blockers a bead has, as `bd blocked` reports. Shown as a lock after the title.

**Snapshot**:
What one load reads from bd: every bead with its text and comments, every dependency edge, the ready ids and the lock counts. The list, every detail and both dependency trees read from it. A failed load leaves the last good snapshot in place.
_Avoid_: cache (a snapshot is replaced whole, never patched)

**Selected bead**:
The bead the list has selected.

**Shown bead**:
The bead on display in the detail. It is the selected bead, except after a link or the history put another one there. The list then keeps its filters and selection, and the detail says when the filters hide the shown bead.

**History**:
The beads shown before the shown bead (back) and the ones left by going back (forward). It lasts for one visit to the detail and ends when the detail closes or a list action picks a bead.

**Beads button**:
The tab-bar button that opens a Viewer in the focused tab, or closes the one there. A copy of the same mod with `role: "toggle"`.

**Keys dialog**:
The overlay that lists the Viewer's keys. A copy of the same mod with `role: "keys"`.

## Relationships

- A **Viewer** has one **Opener** and one **Viewed repo**.
- A **Viewed repo** has zero or one **Beads database**; with none, the viewer shows an empty state.
- A **Bead** has one **Bead status**.
- A **Viewer** holds at most one **Snapshot**, and every **Bead** it shows is in that snapshot.
- **Send to agent** has at most one **Target**, found when it runs: the **Opener** if an agent runs there, else the last-changed agent of the Viewer's tab.

## Flagged ambiguities

- "herdr mod" meant a herdr-app mod (TypeScript GUI panel), not a herdr plugin (a TUI in a pane).
- "Follow the focused space" was replaced: the Viewed repo is fixed by the Opener when the Viewer opens.
