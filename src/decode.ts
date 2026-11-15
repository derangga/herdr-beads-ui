// The boundary for bd's JSON: checked by hand, once. A missing or wrong-typed field is Undecodable with the
// path of the field and the bd version, so a bd that changed its output is named instead of crashing a view.
import type { AgentRef, Bead, BeadDetail, Blocked, BdError, Comment, Edge, Focus, PaneRef, Res, StatusInfo } from "./types.ts";

type Obj = Record<string, unknown>;

// Thrown inside this file only, and turned into a value by `decoder`.
class Bad {
  path: string;
  detail: string;
  constructor(path: string, detail: string) {
    this.path = path;
    this.detail = detail;
  }
}

const bad = (path: string, detail: string): never => {
  throw new Bad(path, detail);
};

function obj(v: unknown, path: string): Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : bad(path, "expected an object");
}
function arr(v: unknown, path: string): unknown[] {
  return Array.isArray(v) ? v : bad(path, "expected an array");
}
function str(o: Obj, k: string, path: string): string {
  const v = o[k];
  return typeof v === "string" ? v : bad(`${path}.${k}`, "expected a string");
}
function num(o: Obj, k: string, path: string): number {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : bad(`${path}.${k}`, "expected a number");
}
// bd leaves out empty fields, so absent and null both mean "none".
function strOpt(o: Obj, k: string, path: string): string | null {
  return o[k] == null ? null : str(o, k, path);
}
function strOr(o: Obj, k: string, path: string): string {
  return strOpt(o, k, path) ?? "";
}
function numOr0(o: Obj, k: string, path: string): number {
  return o[k] == null ? 0 : num(o, k, path);
}
function strings(o: Obj, k: string, path: string): string[] {
  return o[k] == null ? [] : arr(o[k], `${path}.${k}`).map((x, i) => (typeof x === "string" ? x : bad(`${path}.${k}[${i}]`, "expected a string")));
}
const each = <T>(o: Obj, k: string, path: string, item: (v: Obj, p: string) => T): T[] => arr(o[k], `${path}.${k}`).map((x, i) => item(obj(x, `${path}.${k}[${i}]`), `${path}.${k}[${i}]`));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return bad("$", "not JSON");
  }
};

// Runs a decoder over bd's stdout and turns its failure into a value. `parse` is JSON unless the output is JSONL.
function decoder<T>(read: (json: unknown) => T, parse: (text: string) => unknown = parseJson): (text: string, version: string | null) => Res<T> {
  return (text, version) => {
    const fail = (path: string, detail: string): Res<T> => ({ ok: false, error: { _tag: "Undecodable", version, path, detail } satisfies BdError });
    try {
      return { ok: true, value: read(parse(text)) };
    } catch (e) {
      if (e instanceof Bad) {
        return fail(e.path, e.detail);
      }
      throw e;
    }
  };
}

function bead(o: Obj, p: string, parent: string | null): Bead {
  return {
    id: str(o, "id", p),
    title: str(o, "title", p),
    status: str(o, "status", p),
    priority: num(o, "priority", p),
    issue_type: str(o, "issue_type", p),
    assignee: strOpt(o, "assignee", p),
    labels: strings(o, "labels", p),
    created_at: str(o, "created_at", p),
    updated_at: str(o, "updated_at", p),
    closed_at: strOpt(o, "closed_at", p),
    parent,
    dependency_count: numOr0(o, "dependency_count", p),
    dependent_count: numOr0(o, "dependent_count", p),
    comment_count: numOr0(o, "comment_count", p),
  };
}

const top = (json: unknown): Obj => obj(json, "$");

// The mod never decides readiness, so only the ids are kept.
export const decodeReady = decoder((json) => arr(json, "$").map((x, i) => str(obj(x, `$[${i}]`), "id", `$[${i}]`)));

export const decodeBlocked = decoder((json) =>
  arr(json, "$").map((x, i): Blocked => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), blocked_by_count: num(o, "blocked_by_count", p), blocked_by: strings(o, "blocked_by", p) };
  }),
);

// One line per bead; a blank line is kept as undefined so an index still names its line.
const lines = (text: string): unknown[] =>
  text.split("\n").map((line, i) => {
    try {
      return line.trim() === "" ? undefined : JSON.parse(line);
    } catch {
      return bad(`$[${i}]`, "not JSON");
    }
  });

const comment = (o: Obj, p: string): Comment => ({ id: str(o, "id", p), author: str(o, "author", p), text: str(o, "text", p), created_at: str(o, "created_at", p) });

// `bd export` prints JSONL. A bead has no `parent` there: it is the target of its own parent-child edge. The edges of every bead
// are returned flat, and the comments stay on their bead.
export const decodeExport = decoder((json) => {
  const beads: BeadDetail[] = [];
  const edges: Edge[] = [];
  (json as unknown[]).forEach((x, i) => {
    if (x === undefined) {
      return;
    }
    const p = `$[${i}]`;
    const o = obj(x, p);
    // Only issues are beads; bd may add other record kinds.
    if (o._type != null && o._type !== "issue") {
      return;
    }
    const own = o.dependencies == null ? [] : each(o, "dependencies", p, (d, dp): Edge => ({ from: str(d, "issue_id", dp), to: str(d, "depends_on_id", dp), type: str(d, "type", dp) }));
    edges.push(...own);
    beads.push({
      ...bead(o, p, own.find((e) => e.type === "parent-child")?.to ?? null),
      description: strOr(o, "description", p),
      design: strOr(o, "design", p),
      acceptance_criteria: strOr(o, "acceptance_criteria", p),
      notes: strOr(o, "notes", p),
      comments: o.comments == null ? [] : each(o, "comments", p, comment),
    });
  });
  return { beads, edges };
}, lines);

// Custom statuses have no icon, built-in ones always do.
const status =
  (icon: (o: Obj, k: string, path: string) => string) =>
  (o: Obj, p: string): StatusInfo => ({ name: str(o, "name", p), icon: icon(o, "icon", p), category: str(o, "category", p) });

export const decodeStatuses = decoder((json) => {
  const o = top(json);
  return [...each(o, "built_in_statuses", "$", status(str)), ...(o.custom_statuses == null ? [] : each(o, "custom_statuses", "$", status(strOr)))];
});

// The host values are not bd's: a wrong shape is "nothing focused", not an error.
export function decodeFocus(v: unknown): Focus | null {
  if (typeof v !== "object" || v === null) {
    return null;
  }
  const o = v as Obj;
  const text = (x: unknown): string | null => (typeof x === "string" ? x : null);
  return { cwd: text(o.cwd), terminal: text(o.terminal), tab: text(o.tab), pane: text(o.pane) };
}

// The props the viewer reads: the folder it was opened for, and the terminal it was opened from.
export function decodeProps(v: unknown): { root: string | null; opener: string | null } {
  const o = typeof v === "object" && v !== null ? (v as Obj) : {};
  const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
  return { root: text(o.root), opener: text(o.opener) };
}

// Host lists: an entry of the wrong shape is left out, since one odd pane must not hide the others.
const records = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => typeof x === "object" && x !== null) : []);
const name = (o: Obj): string => {
  const program = typeof o.program === "object" && o.program !== null ? (o.program as Obj).name : undefined;
  return typeof program === "string" && program !== "" ? program : typeof o.title === "string" ? o.title : "";
};

export function decodePanes(v: unknown): PaneRef[] {
  return records(v).flatMap((o) => (typeof o.pane === "string" && typeof o.tab === "string" ? [{ pane: o.pane, terminal: typeof o.terminal === "string" ? o.terminal : null, tab: o.tab, status: typeof o.status === "string" ? o.status : null, name: name(o) }] : []));
}

export function decodeAgents(v: unknown): AgentRef[] {
  return records(v).flatMap((o) => (typeof o.pane === "string" && typeof o.tab === "string" && typeof o.seq === "number" ? [{ pane: o.pane, tab: o.tab, seq: o.seq, name: name(o) }] : []));
}

// Whether the space holding this tab lives on another machine. Unknown (no tab, no such space) is local.
export function isRemoteTab(spaces: unknown, tab: string | null): boolean {
  return tab !== null && records(spaces).some((o) => typeof o.machine === "string" && o.machine !== "" && records(o.tabs).some((t) => t.id === tab));
}

export const FALLBACK_MONO = "Menlo";

// The terminal's font, for ids; a settings value that is not a name is the fallback.
export function decodeFont(v: unknown): string {
  const family = typeof v === "object" && v !== null ? (v as Obj).font_family : undefined;
  return typeof family === "string" && family !== "" ? family : FALLBACK_MONO;
}
