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
