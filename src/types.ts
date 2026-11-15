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

export type Menu = "status" | "type" | "sort";

export type Model = {
  // The last good load: a failed load leaves it alone.
  snapshot: Snapshot | null;
  loading: boolean;
  error: BdError | null;
  filters: Filters;
  sort: Sort;
  selected: string | null;
  // The Viewer's own width in px, 0 until measured. Layout is derived from it, so crossing a breakpoint changes no state.
  width: number;
  pane: Pane;
  // The search box has the keyboard, so a key types instead of being a command.
  searching: boolean;
  menu: Menu | null;
  help: boolean;
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
  | { _tag: "Resized"; width: number }
  | { _tag: "FocusSearch" }
  | { _tag: "SearchFocused"; on: boolean }
  | { _tag: "ToggleMenu"; menu: Menu }
  | { _tag: "ToggleHelp" };

// Plain data the runner executes and answers with a Msg.
export type Cmd = { _tag: "Load" };
