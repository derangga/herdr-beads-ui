// Filtering, search and sorting of the loaded beads. Pure: bd is never run here.
import type { Bead, Filters, Model, Msg, Sort, SortKey } from "./types.ts";

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

// --- layout ---

export const WIDE_AT = 800;
export const NO_AGE_BELOW = 480;
export const ROW_H = 28;

export const isWide = (m: Pick<Model, "width">): boolean => m.width >= WIDE_AT;
export const listWidth = (width: number): number => Math.max(360, Math.round(width * 0.42));

export const SORT_KEYS: SortKey[] = ["priority", "created", "updated", "closed", "status", "id", "title", "type", "assignee"];

const BUILT_IN_STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"];

// The filter's fixed choices, then any status or type the loaded beads use that bd's built-ins do not name.
export function statusOptions(m: Model): string[] {
  const custom = new Set((m.snapshot?.beads ?? []).map((b) => b.status).filter((s) => !BUILT_IN_STATUSES.includes(s)));
  return [NOT_CLOSED, ALL, ...BUILT_IN_STATUSES, ...[...custom].sort()];
}

export function typeOptions(m: Model): string[] {
  return [ALL, ...[...new Set((m.snapshot?.beads ?? []).map((b) => b.issue_type))].sort()];
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
    case "tab":
      return { _tag: "Tab" };
    case "/":
      return { _tag: "FocusSearch" };
    case "ctrl-r":
      return { _tag: "Refresh" };
    case "?":
    case "shift-/":
    case "shift-?":
      return { _tag: "ToggleHelp" };
    default:
      return null;
  }
}
