// src/main.ts
import { View, div } from "gpui-kit";

// src/decode.ts
var Bad = class {
  path;
  detail;
  constructor(path, detail2) {
    this.path = path;
    this.detail = detail2;
  }
};
var bad = (path, detail2) => {
  throw new Bad(path, detail2);
};
function obj(v, path) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : bad(path, "expected an object");
}
function arr(v, path) {
  return Array.isArray(v) ? v : bad(path, "expected an array");
}
function str(o, k, path) {
  const v = o[k];
  return typeof v === "string" ? v : bad(`${path}.${k}`, "expected a string");
}
function num(o, k, path) {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : bad(`${path}.${k}`, "expected a number");
}
function strOpt(o, k, path) {
  return o[k] == null ? null : str(o, k, path);
}
function strOr(o, k, path) {
  return strOpt(o, k, path) ?? "";
}
function numOr0(o, k, path) {
  return o[k] == null ? 0 : num(o, k, path);
}
function strings(o, k, path) {
  return o[k] == null ? [] : arr(o[k], `${path}.${k}`).map((x, i) => typeof x === "string" ? x : bad(`${path}.${k}[${i}]`, "expected a string"));
}
var each = (o, k, path, item) => arr(o[k], `${path}.${k}`).map((x, i) => item(obj(x, `${path}.${k}[${i}]`), `${path}.${k}[${i}]`));
function decoder(read) {
  return (text, version) => {
    const fail = (path, detail2) => ({ ok: false, error: { _tag: "Undecodable", version, path, detail: detail2 } });
    let json;
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
function bead(o, p) {
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
    comment_count: numOr0(o, "comment_count", p)
  };
}
var link = (o, p) => ({
  id: str(o, "id", p),
  title: str(o, "title", p),
  status: str(o, "status", p),
  priority: num(o, "priority", p),
  issue_type: str(o, "issue_type", p),
  dependency_type: str(o, "dependency_type", p)
});
var detail = (o, p) => ({
  ...bead(o, p),
  description: strOr(o, "description", p),
  design: strOr(o, "design", p),
  acceptance_criteria: strOr(o, "acceptance_criteria", p),
  notes: strOr(o, "notes", p),
  dependencies: o.dependencies == null ? [] : each(o, "dependencies", p, link)
});
var node = (o, p) => ({
  id: str(o, "id", p),
  title: str(o, "title", p),
  status: str(o, "status", p),
  priority: num(o, "priority", p),
  issue_type: str(o, "issue_type", p),
  depth: num(o, "depth", p),
  parent_id: strOr(o, "parent_id", p),
  edge_from_parent: strOpt(o, "edge_from_parent", p)
});
var top = (json) => obj(json, "$");
var decodeList = decoder((json) => arr(json, "$").map((x, i) => bead(obj(x, `$[${i}]`), `$[${i}]`)));
var decodeReady = decoder((json) => arr(json, "$").map((x, i) => str(obj(x, `$[${i}]`), "id", `$[${i}]`)));
var decodeBlocked = decoder(
  (json) => arr(json, "$").map((x, i) => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), blocked_by_count: num(o, "blocked_by_count", p), blocked_by: strings(o, "blocked_by", p) };
  })
);
var decodeShow = decoder((json) => {
  const first = arr(json, "$")[0];
  return first === void 0 ? bad("$[0]", "expected a bead") : detail(obj(first, "$[0]"), "$[0]");
});
var decodeTree = decoder((json) => arr(json, "$").map((x, i) => node(obj(x, `$[${i}]`), `$[${i}]`)));
var decodeComments = decoder(
  (json) => arr(json, "$").map((x, i) => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), author: str(o, "author", p), text: str(o, "text", p), created_at: str(o, "created_at", p) };
  })
);
var decodeStatuses = decoder((json) => each(top(json), "built_in_statuses", "$", (o, p) => ({ name: str(o, "name", p), icon: str(o, "icon", p), category: str(o, "category", p) })));
function decodeFocus(v) {
  if (typeof v !== "object" || v === null) {
    return null;
  }
  const o = v;
  return { cwd: typeof o.cwd === "string" ? o.cwd : null, terminal: typeof o.terminal === "string" ? o.terminal : null };
}

// src/host.ts
import { agents, exec, focused, panes, props, run, spaces, theme } from "herdr";
var realHost = (cx) => ({
  exec: (command, args, options) => exec(command, args, options),
  sleep: (ms) => cx.sleep(ms),
  run: (name, args) => run(name, args),
  focused: () => focused(),
  panes: () => panes(),
  agents: () => agents(),
  spaces: () => spaces(),
  props: () => props(),
  // The setters want `#${string}` and theme() says string: the one cast.
  theme: () => theme(),
  readClipboard: () => cx.read_from_clipboard(),
  writeClipboard: (text) => cx.write_to_clipboard(text)
});

// src/main.ts
var BeadsView = class extends View {
  host = null;
  root = null;
  init(_props, cx) {
    this.host = realHost(cx);
    this.root = decodeFocus(this.host.focused())?.cwd ?? null;
  }
  render(_cx) {
    const colors = this.host?.theme() ?? {};
    return div().size_full().p(12).bg(colors.background).text_color(colors.foreground).child(this.root ?? "Open from a terminal");
  }
};
export {
  BeadsView as default
};
