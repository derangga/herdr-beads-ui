// Filtering, search and sorting of the loaded beads. Pure: bd is never run here.
import type { Bead, Filters, Model, Sort, SortKey } from "./types.ts";

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

export function visible(m: Model): Bead[] {
  const s = m.snapshot;
  return s === null ? [] : s.beads.filter((b) => matches(b, m.filters, s.ready)).sort(compare(m.sort));
}

// The selected bead stays while it is still shown, else the first row takes over.
export function reselect(m: Model): Model {
  const rows = visible(m);
  return rows.some((b) => b.id === m.selected) ? m : { ...m, selected: rows[0]?.id ?? null };
}
