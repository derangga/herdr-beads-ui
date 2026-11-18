# Viewer UI

The look and behaviour of one Viewer. Terms are in [CONTEXT.md](../CONTEXT.md). Colors come from `theme()`, so the
Viewer follows the user's theme. Names below (`green`, `muted`, `surface0`) are theme keys.

## Two widths

The Viewer measures its own width. At 800 px or more it is **wide**, otherwise it is **narrow**. Crossing the line
switches at once and keeps the selected bead, the filters, the search and the history.

### Wide: list and detail side by side

```
┌ search (/) ──────────────────┐ [Ready] [Status ▾] [Type ▾]   Sort: Priority ▾ ↓   ⟳
├──────────────────────────────────────┬───────────────────────────────────────────────┤
│ ▤ P0 OPEN    rac-e4n.15  Build the… 2d│ ‹ ›  ▤ Start and stop a Collection's Mock…    │
│▌▤ P2 OPEN    rac-46u.5   Start and… 2d│ rac-46u.5 ⧉ · [OPEN ▾] · P2 · @deri · 2d ago  │
│ ◆ P2 BLOCKED rac-46u  🔒3 Mock Serv 2d│ app  ui                  [Send to agent]      │
│ ▤ P2 IN PROG rac-ckc.5   Open an E… 4w│                                               │
│  …                                    │ DESCRIPTION                                   │
│                                       │ Collection menu: Start Mock Server; …         │
│                                       │ ACCEPTANCE CRITERIA                           │
│                                       │ ☐ With MockListening.scripted …               │
│                                       │ BLOCKED BY (1)                                │
│                                       │ ● rac-46u    Mock Server        parent-child  │
│                                       │ BLOCKS (4)                                    │
│                                       │ ● rac-46u.1  Match a mock req…  blocks        │
│                                       │ COMMENTS (2)                                  │
├──────────────────────────────────────┴───────────────────────────────────────────────┤
│ 42 of 208 · 12 ready                                       / search · ↵ open · ? keys │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The list takes 42% of the width, at least 360 px. Detail takes the rest.

### Narrow: list, then detail

The list fills the Viewer. Enter or a click on a row opens that bead's detail, full width. The detail header starts
with `‹ List`. Esc, or `‹ List`, always goes back to the list, however many ids were followed. The list then selects
the bead last shown, scrolled into view. When the filters hide that bead, the list keeps its previous selection.
The list scrolls by the least that shows the selected row whenever that row's position changes: an arrow key, a click,
or a sort, filter or reload that moves it. A reload that leaves the row where it is does not move a list the user
scrolled by hand.
`[` and `]` walk the bead history inside the detail.

```
┌ search (/) ───────────────┐ ⟳
[Ready] [Status ▾] [Type ▾] Sort ▾
├────────────────────────────────┤
│▌P2 ● rac-46u.5  Start and st… │
│ P2 ● rac-46u.4  Remember a C… │
│ P0 ● rac-46u    Mock Server 🔒3│
├────────────────────────────────┤
│ 42 of 208 · ↵ open             │
└────────────────────────────────┘

┌────────────────────────────────┐
│ ‹ List   ‹ ›                    │
│ ▤ Start and stop a Collection… │
│ rac-46u.5 ⧉ · [OPEN ▾] · P2     │
│ [Send to agent]                 │
│ DESCRIPTION …                   │
└────────────────────────────────┘
```

Narrow rows show the status as a colored dot instead of text and drop the type icon. Below 480 px they also drop
the age.

## The list

- Row height 28 px. Columns: type icon, priority, status, id, title (truncated, takes the slack), age (right aligned,
  tabular digits).
- Priority is text in a color: P0 `red`, P1 `peach`, P2 `yellow`, P3 `blue`, P4 `muted`.
- Status is text in a color: open `green`, in_progress `blue`, blocked `red`, deferred `muted`. A closed bead is shown
  with its whole row in `muted`.
- A bead with open blockers shows a lock and their count after its title, as bv does.
- Ids are in the monospace font, `muted`. Titles are in the regular font.
- The selected row has a `surface0` background and a 2 px `accent` bar on its left edge. A hovered row has `hover`.
- The list is virtual, so loading every bead stays smooth.

## The detail

1. Header row: back and forward (`‹ ›`, dimmed when there is nothing to go to), type icon, title (16 px, semibold,
   wraps to two lines, then truncates).
2. Meta row: id with a copy icon, status pill, priority, assignee, age. Hovering the age shows the full date.
3. Labels as small `surface0` chips, and `Send to agent` on the right of the same row.
4. Sections, each only when it has text: Description, Design, Acceptance criteria, Notes. Headings are 11 px,
   uppercase, `muted`. Bodies render as markdown.
5. Dependencies: `Blocked by (n)` and `Blocks (n)`, each a tree with guide lines. A row is a status dot, the id
   as a link (`accent`, underlined on hover), the title, and the edge type in `muted` on the right. A bead already
   shown higher in the tree is dimmed and not expanded again. An empty side says "Nothing blocks this bead." or
   "This bead blocks nothing."
6. Comments: author, age, body as markdown, oldest first.

A bead hidden by the filters still shows in detail, with a `muted` line under the header: "Hidden by the current
filters".

## Keys

| Key | Does |
| --- | --- |
| `j` `k` / `↓` `↑` | Move the selection |
| `↵` | Narrow: open detail. Wide: nothing, the list keeps the keyboard and the wheel scrolls the detail under the pointer. In the search box: leave it, keeping the text |
| `Esc` | Closes the nearest thing: a menu, then the search box (emptied), then, narrow, the detail |
| `/` | Focus search |
| `[` `]` | Back and forward in the history |
| `s` | Open the status picker for the shown bead |
| `y` | Copy the shown bead's id |
| `Ctrl+R` | Refresh |
| `?` | Show the keys |

## Motion

The Viewer is used dozens of times a day and mostly from the keyboard, so almost nothing moves.

| Interaction | Motion | Why |
| --- | --- | --- |
| Selection, detail swap, list ↔ detail in narrow, history jump | None | Keyboard actions, done hundreds of times a day |
| Row and button hover | Instant color change | Seen constantly. A fade would lag behind the pointer |
| Status picker opening | Opacity 0 → 1, 120 ms, `ease-out`. Closes instantly | Occasional. It needs to appear, not to perform |
| Status change running | The pill shows a spinning icon (`svg.spin`) and dims to 0.6 | Tells the user bd is running without a toast |
| Copy id, Send to agent | The button text crossfades to "Copied" or "Sent to claude" for 1.2 s, 120 ms `ease-out` | Confirms the action where the eye already is |
| Refresh | The ⟳ icon spins while bd runs. The list stays in place | The list never blanks during a reload |
| First load | Nothing for 150 ms, then a spinner with "Loading beads" | Fast loads never flash a spinner |

There is no scale-on-press, because gpui-kit cannot animate transforms. A pressed button uses `.active()` to show
the `selected` background instead.

## States

- No `.beads` in the Viewed repo: a centered message, "No beads database in `<folder>`", and the `bd init` hint.
- `bd` missing or failing: the error text from bd, in `red`, with a Retry button. The last good list stays if
  there is one.
- A failed status change: the pill goes back to the old status, and bd's error shows under the meta row until the
  next action.
- After Send to agent, keyboard focus moves to the agent's pane, so the user can edit the prompt and press Enter.
  The Viewer stays open.
- The Opener's space is on another machine: "Remote spaces aren't supported yet". No bd runs.
- A bead deleted since the list loaded: the detail says "<id> no longer exists" and offers Refresh.
- One detail section failed (a tree or the comments): the rest draws, and that section shows the error and a Retry.
- bd output not understood: the error names bd's version.
- Send to agent whose target vanished: nothing is pasted, and the button says "Agent is gone".
- Send to agent with no target: the button is dimmed, and hovering it says "No agent in this tab".
