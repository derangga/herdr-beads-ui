// Plain data: what bd gives back, decoded, and the errors the runner can name. Field names are bd's own.

export type BdError =
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

export type BeadLink = { id: string; title: string; status: string; priority: number; issue_type: string; dependency_type: string };

export type BeadDetail = Bead & {
  description: string;
  design: string;
  acceptance_criteria: string;
  notes: string;
  dependencies: BeadLink[];
};

export type Blocked = { id: string; blocked_by_count: number; blocked_by: string[] };

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
// `last` that this row ends its siblings, `repeat` that the id was already drawn higher up.
export type TreeRow = { id: string; title: string; status: string; edge: string; depth: number; guides: boolean[]; last: boolean; repeat: boolean };

export type Comment = { id: string; author: string; text: string; created_at: string };

export type StatusInfo = { name: string; icon: string; category: string };

export type Direction = "down" | "up";

export type Focus = { cwd: string | null; terminal: string | null };

// What one load builds: every bead, the ids `bd ready` named, and id -> blocked_by_count from `bd blocked`.
export type Snapshot = { beads: Bead[]; ready: Set<string>; locks: Map<string, number> };

export type SortKey = "priority" | "created" | "updated" | "closed" | "status" | "id" | "title" | "type" | "assignee";

export type Sort = { key: SortKey; reverse: boolean };

// status is "not closed", "all" or one status name; type is "all" or one type.
export type Filters = { ready: boolean; status: string; type: string; search: string };

// Which column holds the keyboard. Narrow shows only that column; wide shows both.
export type Pane = "list" | "detail";

// "pick" is the status picker of the shown bead, "reason" its second step: the optional reason for closing.
export type Menu = "status" | "type" | "sort" | "pick" | "reason";

// One bd call of the detail. `gen` names the request: a reply or timer from an earlier request of the same part carries
// another number and is dropped. A reload keeps the old value in `prev` so the shown detail does not blank while it runs.
export type Part<T> = { _tag: "Loading"; prev: T | null; gen: number } | { _tag: "Ready"; value: T } | { _tag: "Failed"; error: BdError };

export type PartName = "show" | "down" | "up" | "comments";

// The four calls made for one shown bead. `slow` turns on 150 ms after they started, which is when "Loading" may appear.
export type Detail = { show: Part<BeadDetail>; down: Part<TreeNode[]>; up: Part<TreeNode[]>; comments: Part<Comment[]>; slow: boolean };

export type Model = {
  // The last good load: a failed load leaves it alone.
  snapshot: Snapshot | null;
  loading: boolean;
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
  // Detail by bead id: the shown bead's calls, and the beads shown before whose calls all finished. A good load empties it.
  details: Map<string, Detail>;
  // The last request number handed out to a detail call.
  gen: number;
  // The Viewer's own width in px, 0 until measured. Layout is derived from it, so crossing a breakpoint changes no state.
  width: number;
  pane: Pane;
  // The search box has the keyboard, so a key types instead of being a command.
  searching: boolean;
  menu: Menu | null;
  help: boolean;
  // The names the status picker lists: bd's, or the built-in five until bd answers or when it cannot.
  statuses: string[];
  // Beads with a status write in flight. "running" is bd running; "reloading" is the write done and the list loading again, so the
  // pill keeps its spinner instead of showing the old status for a moment. A bead in here cannot be written again.
  writing: Map<string, "running" | "reloading">;
  // The last failed write, shown under the meta row of its bead. `second` is the status of a bd update that failed after bd reopen worked.
  writeError: { id: string; error: BdError; second: string | null } | null;
  // A write finished while a load was running, so that load may predate it: its answer is dropped and one more load runs.
  reload: boolean;
};

export type Msg =
  | { _tag: "Refresh" }
  | { _tag: "Loaded"; res: Res<Snapshot> }
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
  | { _tag: "Tab" }
  | { _tag: "BackToList" }
  // An id in the detail was clicked.
  | { _tag: "Jump"; id: string }
  // -1 goes back in the history, 1 forward.
  | { _tag: "Walk"; delta: -1 | 1 }
  | { _tag: "Resized"; width: number }
  | { _tag: "FocusSearch" }
  | { _tag: "SearchFocused"; on: boolean }
  | { _tag: "ToggleMenu"; menu: Menu }
  | { _tag: "ToggleHelp" }
  | { _tag: "Shown"; id: string; gen: number; res: Res<BeadDetail> }
  | { _tag: "Tree"; id: string; gen: number; direction: Direction; res: Res<TreeNode[]> }
  | { _tag: "Discussed"; id: string; gen: number; res: Res<Comment[]> }
  | { _tag: "Waited"; id: string; gen: number; timer: Timer }
  // Reruns one failed call of the shown bead.
  | { _tag: "Retry"; part: PartName }
  | { _tag: "ReadStatuses" }
  | { _tag: "StatusesRead"; res: Res<StatusInfo[]> }
  // A status chosen in the picker for the shown bead; "closed" asks for a reason first.
  | { _tag: "Pick"; status: string }
  // The reason step's answer: closes the shown bead.
  | { _tag: "CloseWith"; reason: string }
  // `error` is null on success. `second`: the failure is of the bd update after bd reopen worked, so the bead is open now.
  | { _tag: "Written"; id: string; to: string; error: BdError | null; second: boolean };

// "fetch": the bead has stayed shown long enough to ask bd. "loading": long enough for a "Loading" line.
export type Timer = "fetch" | "loading";

// Plain data the runner executes and answers with a Msg.
export type Cmd =
  | { _tag: "Load" }
  | { _tag: "Fetch"; id: string; part: PartName; gen: number }
  | { _tag: "Wait"; id: string; gen: number; timer: Timer }
  | { _tag: "Statuses" }
  // Moves a bead from one status to another: the runner picks the bd commands.
  | { _tag: "Write"; id: string; from: string; to: string; reason: string };
