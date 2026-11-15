// Filtering, search and sorting of the loaded beads. Pure: bd is never run here.
import type { AgentRef, Bead, BeadDetail, Direction, Filters, Focus, Model, Msg, Opener, PaneRef, SendError, Snapshot, Sort, SortKey, Target, TreeNode, TreeRow } from "./types.ts";

export const NOT_CLOSED = "not closed";
export const ALL = "all";

export const initFilters = (): Filters => ({ ready: false, status: NOT_CLOSED, type: ALL, search: "" });
export const initSort = (): Sort => ({ key: "priority", reverse: false });

const STATUS_ORDER = ["open", "in_progress", "blocked", "deferred", "closed"];
const rank = (status: string): number => {
  const i = STATUS_ORDER.indexOf(status);
  return i < 0 ? STATUS_ORDER.length : i;
};

// A sort is in its natural direction until reversed: P0 first, newest first, A to Z.
const text = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const time = (a: string, b: string): number => Date.parse(b) - Date.parse(a);
const COMPARE: Record<SortKey, (a: Bead, b: Bead) => number> = {
  priority: (a, b) => a.priority - b.priority,
  created: (a, b) => time(a.created_at, b.created_at),
  updated: (a, b) => time(a.updated_at, b.updated_at),
  closed: (a, b) => time(a.closed_at ?? "", b.closed_at ?? ""),
  status: (a, b) => rank(a.status) - rank(b.status) || text(a.status, b.status),
  id: (a, b) => text(a.id, b.id),
  title: (a, b) => text(a.title, b.title),
  type: (a, b) => text(a.issue_type, b.issue_type),
  assignee: (a, b) => text(a.assignee ?? "", b.assignee ?? ""),
};

// A bead without the field sorts last in both directions, so reverse does not lift the unset ones to the top.
const UNSET: Partial<Record<SortKey, (b: Bead) => boolean>> = { closed: (b) => b.closed_at === null, assignee: (b) => b.assignee === null };

// Reverse flips the chosen key only: the tie-break stays updated newest, then id.
export function compare(sort: Sort): (a: Bead, b: Bead) => number {
  const unset = UNSET[sort.key];
  return (a, b) => {
    const [ua, ub] = [unset?.(a) ?? false, unset?.(b) ?? false];
    const side = ua || ub ? Number(ua) - Number(ub) : sort.reverse ? -COMPARE[sort.key](a, b) : COMPARE[sort.key](a, b);
    return side || time(a.updated_at, b.updated_at) || COMPARE.id(a, b);
  };
}

export function matches(b: Bead, f: Filters, ready: Set<string>): boolean {
  const needle = f.search.trim().toLowerCase();
  return (f.status === ALL || (f.status === NOT_CLOSED ? b.status !== "closed" : b.status === f.status)) && (f.type === ALL || b.issue_type === f.type) && (!f.ready || ready.has(b.id)) && (needle === "" || b.id.toLowerCase().includes(needle) || b.title.toLowerCase().includes(needle));
}

// The rows again only when what they are built from changed (the reducer keeps the same objects until they do), so a key that moves nothing
// and a redraw run no filter and sort. Callers must not mutate the result. Two Viewers share the module and may evict each other's entry:
// that costs a recompute, never a wrong answer.
let last: { snapshot: Model["snapshot"]; filters: Model["filters"]; sort: Model["sort"]; rows: Bead[] } | null = null;

export function visible(m: Model): Bead[] {
  if (last === null || last.snapshot !== m.snapshot || last.filters !== m.filters || last.sort !== m.sort) {
    const s = m.snapshot;
    last = { snapshot: s, filters: m.filters, sort: m.sort, rows: s === null ? [] : s.beads.filter((b) => matches(b, m.filters, s.ready)).sort(compare(m.sort)) };
  }
  return last.rows;
}

// The selected bead stays while it is still shown, else the first row takes over.
export function reselect(m: Model): Model {
  const rows = visible(m);
  return rows.some((b) => b.id === m.selected) ? m : { ...m, selected: rows[0]?.id ?? null };
}

// The bead whose detail is on screen: the one a link put there, else the selected one, beside the list or once opened when the
// detail fills the Viewer.
export const shownId = (m: Pick<Model, "selected" | "shown" | "width" | "pane">): string | null => (isWide(m) || m.pane === "detail" ? (m.shown ?? m.selected) : null);

// The shown bead is not in the filtered list, which happens when it was reached by a link or the filters changed under it.
export const hiddenByFilters = (m: Pick<Model, "selected" | "shown" | "width" | "pane">, rows: Bead[]): boolean => {
  const id = shownId(m);
  return id !== null && !rows.some((b) => b.id === id);
};

// A dependency tree as rows, depth 0 (the bead itself) left out. Nesting comes from parent_id and siblings keep the nodes' order, so
// only the order within one parent matters. depTree emits each id once, so no row repeats.
// A row's guides say which ancestor levels have a later sibling, `last` that the row ends its siblings.
export function treeRows(nodes: TreeNode[]): TreeRow[] {
  const kids = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (n.depth > 0) {
      const list = kids.get(n.parent_id) ?? [];
      if (list.length === 0) {
        kids.set(n.parent_id, list);
      }
      list.push(n);
    }
  }
  const rows: TreeRow[] = [];
  const walk = (parent: string, guides: boolean[]): void => {
    const list = kids.get(parent) ?? [];
    list.forEach((n, i) => {
      const last = i === list.length - 1;
      rows.push({ id: n.id, title: n.title, status: n.status, edge: n.edge_from_parent ?? "", depth: guides.length + 1, guides, last });
      walk(n.id, [...guides, !last]);
    });
  };
  nodes.filter((n) => n.depth === 0).forEach((r) => walk(r.id, []));
  return rows;
}

// The detail's markdown sections, only those with text.
export const textSections = (d: BeadDetail): [string, string][] =>
  (
    [
      ["Description", d.description],
      ["Design", d.design],
      ["Acceptance criteria", d.acceptance_criteria],
      ["Notes", d.notes],
    ] satisfies [string, string][]
  ).filter(([, text]) => text.trim() !== "");

// --- layout ---

export const WIDE_AT = 800;
export const NO_AGE_BELOW = 480;
export const ROW_H = 28;

export const isWide = (m: Pick<Model, "width">): boolean => m.width >= WIDE_AT;
export const listWidth = (width: number): number => Math.max(360, Math.round(width * 0.42));

export const SORT_KEYS: SortKey[] = ["priority", "created", "updated", "closed", "status", "id", "title", "type", "assignee"];

export const BUILT_IN_STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"];

// The filter's fixed choices, then any status or type the loaded beads use that bd's built-ins do not name.
export function statusOptions(m: Model): string[] {
  const custom = new Set((m.snapshot?.beads ?? []).map((b) => b.status).filter((s) => !BUILT_IN_STATUSES.includes(s)));
  return [NOT_CLOSED, ALL, ...BUILT_IN_STATUSES, ...[...custom].sort()];
}

// One id index per snapshot, built on first use and dropped with the snapshot.
const indexes = new WeakMap<Snapshot, Map<string, BeadDetail>>();
const byIdOf = (s: Snapshot): Map<string, BeadDetail> => {
  const found = indexes.get(s) ?? new Map(s.beads.map((b) => [b.id, b]));
  indexes.set(s, found);
  return found;
};

// The shown bead: the load's own copy, so showing one runs no bd. Null when the id is not in it.
export function shownBead(m: Model): BeadDetail | null {
  const id = shownId(m);
  return id === null || m.snapshot === null ? null : (byIdOf(m.snapshot).get(id) ?? null);
}

const MAX_DEPTH = 50;

// A bead's dependency tree from the load's edges, in the nodes `bd dep tree --json` printed, so treeRows reads it unchanged. "down"
// follows what the bead depends on, "up" what depends on it, every edge type but relates-to, siblings in edge order. Like bd, every id comes
// out once, in a depth-first walk with one seen set: an edge to an id already emitted, the root included, is dropped.
export function depTree(s: Snapshot, id: string, direction: Direction): TreeNode[] {
  const byId = byIdOf(s);
  const root = byId.get(id);
  if (root === undefined) {
    return [];
  }
  const [near, far] = direction === "down" ? (["from", "to"] as const) : (["to", "from"] as const);
  const out = new Map<string, { id: string; type: string }[]>();
  // relates-to is bd's two-way "see also" link, which bd dep tree does not follow either.
  for (const e of s.edges.filter((e) => e.type !== "relates-to")) {
    const list = out.get(e[near]) ?? [];
    if (list.length === 0) {
      out.set(e[near], list);
    }
    list.push({ id: e[far], type: e.type });
  }
  const node = (b: Bead, depth: number, parent_id: string, edge: string | null): TreeNode => ({ id: b.id, title: b.title, status: b.status, priority: b.priority, issue_type: b.issue_type, depth, parent_id, edge_from_parent: edge });
  const nodes = [node(root, 0, "", null)];
  const seen = new Set([id]);
  const walk = (from: string, depth: number): void => {
    for (const e of out.get(from) ?? []) {
      const b = byId.get(e.id);
      if (b !== undefined && !seen.has(e.id)) {
        seen.add(e.id);
        nodes.push(node(b, depth, from, e.type));
        if (depth < MAX_DEPTH) {
          walk(e.id, depth + 1);
        }
      }
    }
  };
  walk(id, 1);
  return nodes;
}

// bd stores some criteria as `[ ] text` with no list marker, which markdown draws as literal brackets: only a list item is a task item.
// shortcut: lines inside a fenced code block are rewritten too, upgrade if a bead ever quotes such a line in code.
export const taskLists = (text: string): string => text.replace(/^([ \t]*)\[([ xX])\] /gm, "$1- [$2] ");

// Where Send to agent types: the Opener if an agent runs there, else the agent of the Viewer's tab that changed last.
export function pickTarget(opener: Opener, panes: PaneRef[], agents: AgentRef[]): Target | null {
  const there = panes.find((p) => p.terminal !== null && p.terminal === opener.terminal && p.status !== null);
  if (there?.terminal != null) {
    return { terminal: there.terminal, name: there.name };
  }
  const inTab = agents.filter((a) => a.tab === opener.tab).sort((a, b) => b.seq - a.seq);
  for (const a of inTab) {
    const terminal = panes.find((p) => p.pane === a.pane)?.terminal;
    if (terminal !== null && terminal !== undefined) {
      return { terminal, name: a.name };
    }
  }
  return null;
}

// The terminal focused when the Viewer opened, and its tab, which is the Viewer's own. The Opener's pane is still listed at init; when it
// is not (a mod pane, a prop naming another terminal), the focused tab stands in.
export function openerOf(prop: string | null, focus: Focus | null, panes: PaneRef[]): Opener {
  const terminal = prop ?? focus?.terminal ?? null;
  return { terminal, tab: panes.find((p) => p.terminal === terminal)?.tab ?? focus?.tab ?? null };
}

// What the Send button says for a moment after it ran.
export const sendText = (e: SendError): string => (e._tag === "TargetGone" ? "Agent is gone" : e._tag === "NoTarget" ? "No agent in this tab" : "Send failed");

// The picker's choices: bd's statuses, and the bead's own when it holds one bd does not list.
export const pickOptions = (m: Model, current: string): string[] => (m.statuses.includes(current) ? m.statuses : [...m.statuses, current]);

export function typeOptions(m: Model): string[] {
  return [ALL, ...[...new Set((m.snapshot?.beads ?? []).map((b) => b.issue_type))].sort()];
}

// "2026-11-12 03:49" in the viewer's time zone, for a tooltip; text that does not parse is shown as it came.
export function fullDate(iso: string): string {
  const d = new Date(iso);
  const two = (n: number): string => String(n).padStart(2, "0");
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// "2d", "4w": the largest whole unit since `iso`. A date that does not parse or lies ahead reads as "now".
const UNITS: [string, number][] = [
  ["y", 365 * 86_400_000],
  ["w", 7 * 86_400_000],
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
];
export function age(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  const unit = UNITS.find(([, size]) => ms >= size);
  return unit === undefined ? "now" : `${Math.floor(ms / unit[1])}${unit[0]}`;
}

// The widest id on screen, in characters, capped so one long id does not squeeze every title.
export const idChars = (rows: Bead[]): number =>
  Math.min(
    rows.reduce((n, b) => Math.max(n, b.id.length), 0),
    20,
  );

// --- keys ---

// A key while the Viewer has focus. In the search box a key types, so only Esc is a command (Enter reaches the model as the box's own submit).
export function keyFor(m: Model, keystroke: string): Msg | null {
  if (keystroke === "escape") {
    return { _tag: "Escape" };
  }
  // A chord is never typed text, so refresh works in the box too.
  if (m.searching || m.menu !== null) {
    return keystroke === "ctrl-r" ? { _tag: "Refresh" } : null;
  }
  switch (keystroke) {
    case "j":
    case "down":
      return { _tag: "Move", delta: 1 };
    case "k":
    case "up":
      return { _tag: "Move", delta: -1 };
    case "enter":
      return { _tag: "Enter" };
    case "/":
      return { _tag: "FocusSearch" };
    case "ctrl-r":
      return { _tag: "Refresh" };
    case "s":
      return { _tag: "ToggleMenu", menu: "pick" };
    case "y":
      return { _tag: "Copy" };
    case "[":
      return { _tag: "Walk", delta: -1 };
    case "]":
      return { _tag: "Walk", delta: 1 };
    case "?":
    case "shift-/":
    case "shift-?":
      return { _tag: "ShowKeys" };
    default:
      return null;
  }
}
