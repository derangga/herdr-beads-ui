// Plain data: what bd gives back, decoded, and the errors the runner can name. Field names are bd's own.

export type BdError =
  // The first two are not bd's: the Viewer knows it cannot ask bd, so no bd runs.
  | { _tag: "NoOpener" }
  | { _tag: "RemoteSpace" }
  | { _tag: "NoDatabase"; text: string }
  | { _tag: "BdMissing"; text: string }
  | { _tag: "BdTimeout"; text: string }
  | { _tag: "BdLocked"; text: string }
  | { _tag: "BeadGone"; text: string }
  | { _tag: "BdRejected"; code: number; text: string }
  | { _tag: "Undecodable"; version: string | null; path: string; detail: string };

export type Res<T> = { ok: true; value: T } | { ok: false; error: BdError };

// status is a string because bd allows custom statuses.
export type Bead = {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  parent: string | null;
  dependency_count: number;
  dependent_count: number;
  comment_count: number;
};

// Everything a bead's detail shows. A load reads it for every bead at once, so showing a bead runs no bd.
export type BeadDetail = Bead & {
  description: string;
  design: string;
  acceptance_criteria: string;
  notes: string;
  comments: Comment[];
};

// One edge of bd's dependency graph: `from` depends on `to`. `type` is bd's own, such as "blocks" or "parent-child".
export type Edge = { from: string; to: string; type: string };

export type Blocked = { id: string; blocked_by_count: number; blocked_by: string[] };

// One node of a dependency tree, in the shape `bd dep tree --json` printed: rows.ts builds them from the load's edges.
export type TreeNode = {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  depth: number;
  parent_id: string;
  // null at the root, which has no edge.
  edge_from_parent: string | null;
};

// One row of a dependency tree, depth 0 left out. `guides[i]` says the guide line of ancestor level i + 1 goes on past this row,
// `last` that this row ends its siblings.
export type TreeRow = { id: string; title: string; status: string; edge: string; depth: number; guides: boolean[]; last: boolean };

export type Comment = { id: string; author: string; text: string; created_at: string };

export type StatusInfo = { name: string; icon: string; category: string };

export type Direction = "down" | "up";

// The terminal that was focused when the Viewer opened, and the tab it was in: the Viewer's own tab, which stays fixed.
export type Opener = { terminal: string | null; tab: string | null };

// The fields of panes() and agents() the Send uses. `name` is the program's name, else the terminal's title.
export type PaneRef = { pane: string; terminal: string | null; tab: string; status: string | null; name: string };
export type AgentRef = { pane: string; tab: string; seq: number; name: string };

// A terminal an agent runs in.
export type Target = { terminal: string; name: string };

// Nothing was pasted in any of these.
export type SendError = { _tag: "NoTarget" } | { _tag: "TargetGone" } | { _tag: "SendRejected"; text: string };

export type Focus = { cwd: string | null; terminal: string | null; tab: string | null; pane: string | null };

// What one load builds: every bead with its detail, every dependency edge, the ids `bd ready` named, and id -> blocked_by_count
// from `bd blocked`.
export type Snapshot = { beads: BeadDetail[]; edges: Edge[]; ready: Set<string>; locks: Map<string, number> };

export type SortKey = "priority" | "created" | "updated" | "closed" | "status" | "id" | "title" | "type" | "assignee";

export type Sort = { key: SortKey; reverse: boolean };

// status is "not closed", "all" or one status name; type is "all" or one type.
export type Filters = { ready: boolean; status: string; type: string; search: string };

// Which column holds the keyboard. Narrow shows only that column; wide shows both.
export type Pane = "list" | "detail";

// "pick" is the status picker of the shown bead, "reason" its second step: the optional reason for closing.
export type Menu = "status" | "type" | "sort" | "pick" | "reason";

export type Model = {
  // The last good load: a failed load leaves it alone.
  snapshot: Snapshot | null;
  loading: boolean;
  // The load number a first load's 150 ms timer must carry, and whether that load has run long enough for "Loading beads" to show.
  loads: number;
  slow: boolean;
  error: BdError | null;
  filters: Filters;
  sort: Sort;
  selected: string | null;
  // The bead on display when a link or the history put it there instead of the list: null means the selected one. The list keeps
  // its filters and its selection, so a bead the filters hide can still be shown.
  shown: string | null;
  // The beads shown before this one, and the ones left by going back. The shown bead itself is not in either.
  back: string[];
  forward: string[];
  // The Viewer's own width in px, 0 until measured. Layout is derived from it, so crossing a breakpoint changes no state.
  width: number;
  pane: Pane;
  // The search box has the keyboard, so a key types instead of being a command.
  searching: boolean;
  menu: Menu | null;
  // The names the status picker lists: bd's, or the built-in five until bd answers or when it cannot.
  statuses: string[];
  // Beads with a status write in flight. "running" is bd running; "reloading" is the write done and the list loading again, so the
  // pill keeps its spinner instead of showing the old status for a moment. A bead in here cannot be written again.
  writing: Map<string, "running" | "reloading">;
  // The last failed write, shown under the meta row of its bead. `second` is the status of a bd update that failed after bd reopen worked.
  writeError: { id: string; error: BdError; second: string | null } | null;
  // A write finished while a load was running, so that load may predate it: its answer is dropped and one more load runs.
  reload: boolean;
  opener: Opener;
  // The last number handed out to a label that shows for a moment, so an earlier timer cannot clear a later label.
  flash: number;
  // "Copied" shows on the id of this bead.
  copied: { n: number; id: string } | null;
  // A send is running: the clipboard is borrowed until it ends.
  sending: boolean;
  // What the Send button says instead of its name, for a moment.
  sent: { n: number; text: string } | null;
};

export type Msg =
  | { _tag: "Refresh" }
  | { _tag: "Loaded"; res: Res<Snapshot> }
  // The first load of load number `n` is still running 150 ms on.
  | { _tag: "Slowed"; n: number }
  | { _tag: "ToggleReady" }
  | { _tag: "SetStatus"; status: string }
  | { _tag: "SetType"; type: string }
  | { _tag: "Search"; text: string }
  | { _tag: "SortBy"; key: SortKey }
  | { _tag: "Reverse" }
  | { _tag: "Select"; id: string }
  | { _tag: "Move"; delta: number }
  | { _tag: "Click"; id: string }
  | { _tag: "Enter" }
  | { _tag: "Escape" }
  | { _tag: "BackToList" }
  // An id in the detail was clicked.
  | { _tag: "Jump"; id: string }
  // -1 goes back in the history, 1 forward.
  | { _tag: "Walk"; delta: -1 | 1 }
  | { _tag: "Resized"; width: number }
  | { _tag: "FocusSearch" }
  | { _tag: "SearchFocused"; on: boolean }
  | { _tag: "ToggleMenu"; menu: Menu }
  | { _tag: "ShowKeys" }
  | { _tag: "ReadStatuses" }
  | { _tag: "StatusesRead"; res: Res<StatusInfo[]> }
  // A status chosen in the picker for the shown bead; "closed" asks for a reason first.
  | { _tag: "Pick"; status: string }
  // The reason step's answer: closes the shown bead.
  | { _tag: "CloseWith"; reason: string }
  // `error` is null on success. `second`: the failure is of the bd update after bd reopen worked, so the bead is open now.
  | { _tag: "Written"; id: string; to: string; error: BdError | null; second: boolean }
  // The shown bead's id to the clipboard.
  | { _tag: "Copy" }
  // The shown bead typed, without Enter, into the target agent.
  | { _tag: "Send" }
  | { _tag: "Sent"; agent: string }
  | { _tag: "SendFailed"; error: SendError }
  | { _tag: "Faded"; what: "copied" | "sent"; n: number };

// Plain data the runner executes and answers with a Msg.
export type Cmd =
  | { _tag: "Load" }
  | { _tag: "WaitLoad"; n: number }
  | { _tag: "Statuses" }
  // Moves a bead from one status to another: the runner picks the bd commands.
  | { _tag: "Write"; id: string; from: string; to: string; reason: string }
  // Writes the id and holds for as long as "Copied" shows.
  | { _tag: "Copy"; id: string; n: number }
  | { _tag: "Send"; id: string; title: string; opener: Opener }
  | { _tag: "Fade"; what: "copied" | "sent"; n: number };
