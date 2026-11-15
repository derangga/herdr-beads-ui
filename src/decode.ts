// The boundary for bd's JSON: checked by hand, once. A missing or wrong-typed field is Undecodable with the
// path of the field and the bd version, so a bd that changed its output is named instead of crashing a view.
import type { Bead, BeadDetail, BeadLink, Blocked, BdError, Comment, Focus, Res, StatusInfo, TreeNode } from "./types.ts";

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

// Runs a decoder over bd's stdout and turns its failure into a value.
function decoder<T>(read: (json: unknown) => T): (text: string, version: string | null) => Res<T> {
  return (text, version) => {
    const fail = (path: string, detail: string): Res<T> => ({ ok: false, error: { _tag: "Undecodable", version, path, detail } satisfies BdError });
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail("$", "not JSON");
    }
    try {
      return { ok: true, value: read(json) };
    } catch (e) {
      if (e instanceof Bad) {
        return fail(e.path, e.detail);
      }
      throw e;
    }
  };
}

function bead(o: Obj, p: string): Bead {
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
    parent: strOpt(o, "parent", p),
    dependency_count: numOr0(o, "dependency_count", p),
    dependent_count: numOr0(o, "dependent_count", p),
    comment_count: numOr0(o, "comment_count", p),
  };
}

const link = (o: Obj, p: string): BeadLink => ({
  id: str(o, "id", p),
  title: str(o, "title", p),
  status: str(o, "status", p),
  priority: num(o, "priority", p),
  issue_type: str(o, "issue_type", p),
  dependency_type: str(o, "dependency_type", p),
});

const detail = (o: Obj, p: string): BeadDetail => ({
  ...bead(o, p),
  description: strOr(o, "description", p),
  design: strOr(o, "design", p),
  acceptance_criteria: strOr(o, "acceptance_criteria", p),
  notes: strOr(o, "notes", p),
  dependencies: o.dependencies == null ? [] : each(o, "dependencies", p, link),
});

const node = (o: Obj, p: string): TreeNode => ({
  id: str(o, "id", p),
  title: str(o, "title", p),
  status: str(o, "status", p),
  priority: num(o, "priority", p),
  issue_type: str(o, "issue_type", p),
  depth: num(o, "depth", p),
  parent_id: strOr(o, "parent_id", p),
  edge_from_parent: strOpt(o, "edge_from_parent", p),
});

const top = (json: unknown): Obj => obj(json, "$");

export const decodeList = decoder((json) => arr(json, "$").map((x, i) => bead(obj(x, `$[${i}]`), `$[${i}]`)));

// The mod never decides readiness, so only the ids are kept.
export const decodeReady = decoder((json) => arr(json, "$").map((x, i) => str(obj(x, `$[${i}]`), "id", `$[${i}]`)));

export const decodeBlocked = decoder((json) =>
  arr(json, "$").map((x, i): Blocked => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), blocked_by_count: num(o, "blocked_by_count", p), blocked_by: strings(o, "blocked_by", p) };
  }),
);

// `bd show` prints an array of one.
export const decodeShow = decoder((json) => {
  const first = arr(json, "$")[0];
  return first === undefined ? bad("$[0]", "expected a bead") : detail(obj(first, "$[0]"), "$[0]");
});

export const decodeTree = decoder((json) => arr(json, "$").map((x, i) => node(obj(x, `$[${i}]`), `$[${i}]`)));

export const decodeComments = decoder((json) =>
  arr(json, "$").map((x, i): Comment => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), author: str(o, "author", p), text: str(o, "text", p), created_at: str(o, "created_at", p) };
  }),
);

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
  return { cwd: typeof o.cwd === "string" ? o.cwd : null, terminal: typeof o.terminal === "string" ? o.terminal : null };
}

// The one prop the viewer reads: the folder it was opened for.
export function decodeProps(v: unknown): { root: string | null } {
  const root = typeof v === "object" && v !== null ? (v as Obj).root : undefined;
  return { root: typeof root === "string" && root !== "" ? root : null };
}

export const FALLBACK_MONO = "Menlo";

// The terminal's font, for ids; a settings value that is not a name is the fallback.
export function decodeFont(v: unknown): string {
  const family = typeof v === "object" && v !== null ? (v as Obj).font_family : undefined;
  return typeof family === "string" && family !== "" ? family : FALLBACK_MONO;
}
