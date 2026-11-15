// src/main.ts
import { View, div as div2 } from "gpui-kit";
import { InputState, VirtualListScrollHandle } from "gpui-base";

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
  return (text2, version) => {
    const fail2 = (path, detail2) => ({ ok: false, error: { _tag: "Undecodable", version, path, detail: detail2 } });
    let json;
    try {
      json = JSON.parse(text2);
    } catch {
      return fail2("$", "not JSON");
    }
    try {
      return { ok: true, value: read(json) };
    } catch (e) {
      if (e instanceof Bad) {
        return fail2(e.path, e.detail);
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
function decodeProps(v) {
  const root = typeof v === "object" && v !== null ? v.root : void 0;
  return { root: typeof root === "string" && root !== "" ? root : null };
}
var FALLBACK_MONO = "Menlo";
function decodeFont(v) {
  const family = typeof v === "object" && v !== null ? v.font_family : void 0;
  return typeof family === "string" && family !== "" ? family : FALLBACK_MONO;
}

// src/host.ts
import { agents, exec, focused, nextCommand, panes, props, run, settings, spaces, theme } from "herdr";
var realHost = (cx) => ({
  exec: (command, args, options) => exec(command, args, options),
  sleep: (ms) => cx.sleep(ms),
  run: (name, args) => run(name, args),
  focused: () => focused(),
  panes: () => panes(),
  agents: () => agents(),
  spaces: () => spaces(),
  props: () => props(),
  settings: () => settings(),
  nextCommand: () => nextCommand(),
  // The setters want `#${string}` and theme() says string: the one cast.
  theme: () => theme(),
  readClipboard: () => cx.read_from_clipboard(),
  writeClipboard: (text2) => cx.write_to_clipboard(text2)
});

// src/rows.ts
var NOT_CLOSED = "not closed";
var ALL = "all";
var initFilters = () => ({ ready: false, status: NOT_CLOSED, type: ALL, search: "" });
var initSort = () => ({ key: "priority", reverse: false });
var STATUS_ORDER = ["open", "in_progress", "blocked", "deferred", "closed"];
var rank = (status) => {
  const i = STATUS_ORDER.indexOf(status);
  return i < 0 ? STATUS_ORDER.length : i;
};
var text = (a, b) => a.localeCompare(b, void 0, { numeric: true, sensitivity: "base" });
var time = (a, b) => Date.parse(b) - Date.parse(a);
var COMPARE = {
  priority: (a, b) => a.priority - b.priority,
  created: (a, b) => time(a.created_at, b.created_at),
  updated: (a, b) => time(a.updated_at, b.updated_at),
  closed: (a, b) => time(a.closed_at ?? "", b.closed_at ?? ""),
  status: (a, b) => rank(a.status) - rank(b.status) || text(a.status, b.status),
  id: (a, b) => text(a.id, b.id),
  title: (a, b) => text(a.title, b.title),
  type: (a, b) => text(a.issue_type, b.issue_type),
  assignee: (a, b) => text(a.assignee ?? "", b.assignee ?? "")
};
var UNSET = { closed: (b) => b.closed_at === null, assignee: (b) => b.assignee === null };
function compare(sort) {
  const unset = UNSET[sort.key];
  return (a, b) => {
    const [ua, ub] = [unset?.(a) ?? false, unset?.(b) ?? false];
    const side = ua || ub ? Number(ua) - Number(ub) : sort.reverse ? -COMPARE[sort.key](a, b) : COMPARE[sort.key](a, b);
    return side || time(a.updated_at, b.updated_at) || COMPARE.id(a, b);
  };
}
function matches(b, f, ready) {
  const needle = f.search.trim().toLowerCase();
  return (f.status === ALL || (f.status === NOT_CLOSED ? b.status !== "closed" : b.status === f.status)) && (f.type === ALL || b.issue_type === f.type) && (!f.ready || ready.has(b.id)) && (needle === "" || b.id.toLowerCase().includes(needle) || b.title.toLowerCase().includes(needle));
}
function visible(m) {
  const s = m.snapshot;
  return s === null ? [] : s.beads.filter((b) => matches(b, m.filters, s.ready)).sort(compare(m.sort));
}
function reselect(m) {
  const rows = visible(m);
  return rows.some((b) => b.id === m.selected) ? m : { ...m, selected: rows[0]?.id ?? null };
}
var shownId = (m) => isWide(m) || m.pane === "detail" ? m.shown ?? m.selected : null;
var hiddenByFilters = (m, rows) => {
  const id = shownId(m);
  return id !== null && !rows.some((b) => b.id === id);
};
function treeRows(nodes) {
  const kids = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (n.depth > 0) {
      kids.set(n.parent_id, [...kids.get(n.parent_id) ?? [], n]);
    }
  }
  const roots = nodes.filter((n) => n.depth === 0);
  const seen = new Set(roots.map((n) => n.id));
  const rows = [];
  const walk = (parent, guides) => {
    const list = kids.get(parent) ?? [];
    list.forEach((n, i) => {
      const [last, repeat] = [i === list.length - 1, seen.has(n.id)];
      seen.add(n.id);
      rows.push({ id: n.id, title: n.title, status: n.status, edge: n.edge_from_parent ?? "", depth: guides.length + 1, guides, last, repeat });
      if (!repeat) {
        walk(n.id, [...guides, !last]);
      }
    });
  };
  roots.forEach((r) => walk(r.id, []));
  return rows;
}
var textSections = (d) => [
  ["Description", d.description],
  ["Design", d.design],
  ["Acceptance criteria", d.acceptance_criteria],
  ["Notes", d.notes]
].filter(([, text2]) => text2.trim() !== "");
var WIDE_AT = 800;
var NO_AGE_BELOW = 480;
var ROW_H = 28;
var isWide = (m) => m.width >= WIDE_AT;
var listWidth = (width) => Math.max(360, Math.round(width * 0.42));
var SORT_KEYS = ["priority", "created", "updated", "closed", "status", "id", "title", "type", "assignee"];
var BUILT_IN_STATUSES = ["open", "in_progress", "blocked", "deferred", "closed"];
function statusOptions(m) {
  const custom = new Set((m.snapshot?.beads ?? []).map((b) => b.status).filter((s) => !BUILT_IN_STATUSES.includes(s)));
  return [NOT_CLOSED, ALL, ...BUILT_IN_STATUSES, ...[...custom].sort()];
}
function typeOptions(m) {
  return [ALL, ...[...new Set((m.snapshot?.beads ?? []).map((b) => b.issue_type))].sort()];
}
function fullDate(iso) {
  const d = new Date(iso);
  const two = (n) => String(n).padStart(2, "0");
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
var UNITS = [
  ["y", 365 * 864e5],
  ["w", 7 * 864e5],
  ["d", 864e5],
  ["h", 36e5],
  ["m", 6e4]
];
function age(iso, now) {
  const ms = now - Date.parse(iso);
  const unit = UNITS.find(([, size]) => ms >= size);
  return unit === void 0 ? "now" : `${Math.floor(ms / unit[1])}${unit[0]}`;
}
var idChars = (rows) => Math.min(
  rows.reduce((n, b) => Math.max(n, b.id.length), 0),
  20
);
function keyFor(m, keystroke) {
  if (keystroke === "escape") {
    return { _tag: "Escape" };
  }
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
    case "[":
      return { _tag: "Walk", delta: -1 };
    case "]":
      return { _tag: "Walk", delta: 1 };
    case "?":
    case "shift-/":
    case "shift-?":
      return { _tag: "ToggleHelp" };
    default:
      return null;
  }
}

// src/runner.ts
var BD_TIMEOUT_MS = 15e3;
var RETRY_DELAYS_MS = [300, 900];
var WAIT_MS = { fetch: 120, loading: 150 };
var fail = (error) => ({ ok: false, error });
function errorText({ stdout, stderr }) {
  let out = stdout.trim();
  try {
    const message = JSON.parse(stdout).error;
    out = typeof message === "string" ? message : out;
  } catch {
  }
  return [stderr.trim(), out].filter((part) => part !== "").join("\n");
}
function classify(result) {
  const text2 = errorText(result);
  if (text2.includes("no beads database found")) {
    return { _tag: "NoDatabase", text: text2 };
  }
  if (text2.includes("maintenance operation is running")) {
    return { _tag: "BdLocked", text: text2 };
  }
  if (/^Issue \S+ not found/m.test(text2) || /no issues? found matching/.test(text2)) {
    return { _tag: "BeadGone", text: text2 };
  }
  return { _tag: "BdRejected", code: result.code, text: text2 };
}
async function rejection(host, text2) {
  if (/took longer than .* and was stopped/.test(text2)) {
    return { _tag: "BdTimeout", text: text2 };
  }
  if (!text2.includes("cannot run ")) {
    return { _tag: "BdRejected", code: -1, text: text2 };
  }
  const bdStarts = await host.exec("bd", ["--version"], { timeout: BD_TIMEOUT_MS }).then(
    () => true,
    () => false
  );
  return bdStarts ? { _tag: "BdRejected", code: -1, text: text2 } : { _tag: "BdMissing", text: text2 };
}
async function once(host, root, args) {
  let result;
  try {
    result = await host.exec("bd", args, { cwd: root, timeout: BD_TIMEOUT_MS });
  } catch (e) {
    return fail(await rejection(host, e instanceof Error ? e.message : String(e)));
  }
  return result.code === 0 ? { ok: true, value: result.stdout } : fail(classify(result));
}
async function bd(host, root, args) {
  let res = await once(host, root, args);
  for (const delay of RETRY_DELAYS_MS) {
    if (res.ok || res.error._tag !== "BdLocked" && res.error._tag !== "BdTimeout") {
      break;
    }
    await host.sleep(delay);
    res = await once(host, root, args);
  }
  return res;
}
async function bdVersion(host, root) {
  const res = await once(host, root, ["--version"]);
  return res.ok ? res.value.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null : null;
}
async function bdJson(host, root, args, decode) {
  const out = await bd(host, root, args);
  if (!out.ok) {
    return out;
  }
  const res = decode(out.value, null);
  if (res.ok || res.error._tag !== "Undecodable") {
    return res;
  }
  return decode(out.value, await bdVersion(host, root));
}
var listBeads = (host, root) => bdJson(host, root, ["list", "--all", "-n", "0", "--brief", "--json"], decodeList);
var readyIds = (host, root) => bdJson(host, root, ["ready", "-n", "0", "--json"], decodeReady);
var blockedBeads = (host, root) => bdJson(host, root, ["blocked", "--json"], decodeBlocked);
var showBead = (host, root, id) => bdJson(host, root, ["show", id, "--json"], decodeShow);
var depTree = (host, root, id, direction) => bdJson(host, root, ["dep", "tree", id, `--direction=${direction}`, "--json"], decodeTree);
var beadComments = (host, root, id) => bdJson(host, root, ["comments", id, "--json"], decodeComments);
async function run2(host, root, cmd) {
  switch (cmd._tag) {
    case "Load": {
      const [beads, ready, blocked] = await Promise.all([listBeads(host, root), readyIds(host, root), blockedBeads(host, root)]);
      if (!beads.ok) {
        return { _tag: "Loaded", res: beads };
      }
      if (!ready.ok) {
        return { _tag: "Loaded", res: ready };
      }
      if (!blocked.ok) {
        return { _tag: "Loaded", res: blocked };
      }
      const locks = new Map(blocked.value.map((b) => [b.id, b.blocked_by_count]));
      return { _tag: "Loaded", res: { ok: true, value: { beads: beads.value, ready: new Set(ready.value), locks } } };
    }
    case "Fetch":
      switch (cmd.part) {
        case "show":
          return { _tag: "Shown", id: cmd.id, gen: cmd.gen, res: await showBead(host, root, cmd.id) };
        case "down":
        case "up":
          return { _tag: "Tree", id: cmd.id, gen: cmd.gen, direction: cmd.part, res: await depTree(host, root, cmd.id, cmd.part) };
        case "comments":
          return { _tag: "Discussed", id: cmd.id, gen: cmd.gen, res: await beadComments(host, root, cmd.id) };
      }
    case "Wait":
      await host.sleep(WAIT_MS[cmd.timer]);
      return { _tag: "Waited", id: cmd.id, gen: cmd.gen, timer: cmd.timer };
  }
}

// src/update.ts
var initModel = () => ({ snapshot: null, loading: false, error: null, filters: initFilters(), sort: initSort(), selected: null, shown: null, back: [], forward: [], details: /* @__PURE__ */ new Map(), gen: 0, width: 0, pane: "list", searching: false, menu: null, help: false });
function update(m, msg) {
  const [next, cmds] = step(m, msg);
  const [settled, more] = settle(next);
  return [settled, more.length === 0 ? cmds : [...cmds, ...more]];
}
var PARTS = ["show", "down", "up", "comments"];
var toPart = (res) => res.ok ? { _tag: "Ready", value: res.value } : { _tag: "Failed", error: res.error };
var prevOf = (p) => p?._tag === "Ready" ? p.value : p?._tag === "Loading" ? p.prev : null;
var isLoading = (d) => PARTS.some((p) => d[p]._tag === "Loading");
var fetch = (id, part, gen) => ({ _tag: "Fetch", id, part, gen });
var wait = (id, gen, timer) => ({ _tag: "Wait", id, gen, timer });
function begin(id, gen, old, debounce) {
  const loading = (p) => ({ _tag: "Loading", prev: prevOf(p), gen });
  const detail2 = { show: loading(old?.show), down: loading(old?.down), up: loading(old?.up), comments: loading(old?.comments), slow: false };
  return [detail2, [...debounce ? [wait(id, gen, "fetch")] : PARTS.map((part) => fetch(id, part, gen)), wait(id, gen, "loading")]];
}
function waiting(m, id, part, gen) {
  const d = m.details.get(id);
  const p = d?.[part];
  return d !== void 0 && id === shownId(m) && p?._tag === "Loading" && p.gen === gen ? d : void 0;
}
function patch(m, id, part, gen, change) {
  const d = waiting(m, id, part, gen);
  return d === void 0 ? m : { ...m, details: new Map(m.details).set(id, { ...d, ...change }) };
}
function settle(m) {
  const id = shownId(m);
  const keep = [...m.details].filter(([k, d2]) => k === id || !isLoading(d2));
  if (keep.length === m.details.size && (id === null || m.details.has(id))) {
    return [m, []];
  }
  const details = new Map(keep);
  if (id === null || details.has(id)) {
    return [{ ...m, details }, []];
  }
  const gen = m.gen + 1;
  const [d, cmds] = begin(id, gen, void 0, true);
  return [{ ...m, gen, details: details.set(id, d) }, cmds];
}
var pick = (m, id) => ({ ...m, selected: id, shown: null });
var land = (m, id) => visible(m).some((b) => b.id === id) ? pick(m, id) : { ...m, shown: id };
var toList = (m) => ({ ...m, pane: "list", shown: null, back: [], forward: [] });
function step(m, msg) {
  switch (msg._tag) {
    case "Refresh":
      return m.loading ? [m, []] : [{ ...m, loading: true }, [{ _tag: "Load" }]];
    case "Loaded": {
      if (!msg.res.ok) {
        return [{ ...m, loading: false, error: msg.res.error }, []];
      }
      const next = reselect({ ...m, loading: false, error: null, snapshot: msg.res.value });
      const id = shownId(next);
      if (id === null) {
        return [{ ...next, details: /* @__PURE__ */ new Map() }, []];
      }
      const gen = m.gen + 1;
      const [d, cmds] = begin(id, gen, m.details.get(id), false);
      return [{ ...next, gen, details: /* @__PURE__ */ new Map([[id, d]]) }, cmds];
    }
    case "ToggleReady":
      return [reselect({ ...m, filters: { ...m.filters, ready: !m.filters.ready } }), []];
    case "SetStatus":
      return [reselect({ ...m, menu: null, filters: { ...m.filters, status: msg.status } }), []];
    case "SetType":
      return [reselect({ ...m, menu: null, filters: { ...m.filters, type: msg.type } }), []];
    case "Search":
      return [msg.text === m.filters.search ? m : reselect({ ...m, filters: { ...m.filters, search: msg.text } }), []];
    case "SortBy":
      return [{ ...m, menu: null, sort: { key: msg.key, reverse: false } }, []];
    case "Reverse":
      return [{ ...m, sort: { ...m.sort, reverse: !m.sort.reverse } }, []];
    case "Select":
      return [pick(m, msg.id), []];
    case "Move":
      return [m.pane === "list" && !m.help ? move(m, msg.delta) : m, []];
    case "Click":
      return [{ ...pick(m, msg.id), menu: null, searching: false, pane: isWide(m) ? "list" : "detail" }, []];
    case "Enter":
      if (m.searching) {
        return [{ ...m, searching: false }, []];
      }
      return [m.selected === null || m.help ? m : { ...m, pane: "detail" }, []];
    case "Escape":
      return [escape(m), []];
    case "Tab":
      return [isWide(m) && !m.help ? { ...m, pane: m.pane === "list" ? "detail" : "list" } : m, []];
    case "BackToList":
      return [{ ...toList(m), help: false }, []];
    case "Jump": {
      const cur = shownId(m);
      return cur === null || cur === msg.id ? [m, []] : [land({ ...m, back: [...m.back, cur], forward: [] }, msg.id), []];
    }
    case "Walk": {
      const cur = shownId(m);
      const id = (msg.delta < 0 ? m.back : m.forward).at(-1);
      if (cur === null || id === void 0 || m.help) {
        return [m, []];
      }
      return [land({ ...m, ...msg.delta < 0 ? { back: m.back.slice(0, -1), forward: [...m.forward, cur] } : { back: [...m.back, cur], forward: m.forward.slice(0, -1) } }, id), []];
    }
    case "Resized":
      return [msg.width === m.width ? m : { ...m, width: msg.width }, []];
    case "FocusSearch":
      return [{ ...m, searching: true, menu: null, help: false, pane: "list" }, []];
    case "SearchFocused":
      return [msg.on === m.searching ? m : { ...m, searching: msg.on }, []];
    case "ToggleMenu":
      return [{ ...m, menu: m.menu === msg.menu ? null : msg.menu }, []];
    case "ToggleHelp":
      return [{ ...m, help: !m.help, menu: null }, []];
    case "Shown":
      return [patch(m, msg.id, "show", msg.gen, { show: toPart(msg.res) }), []];
    case "Tree":
      return [patch(m, msg.id, msg.direction, msg.gen, msg.direction === "down" ? { down: toPart(msg.res) } : { up: toPart(msg.res) }), []];
    case "Discussed":
      return [patch(m, msg.id, "comments", msg.gen, { comments: toPart(msg.res) }), []];
    case "Waited":
      if (msg.timer === "loading") {
        return [patch(m, msg.id, "show", msg.gen, { slow: true }), []];
      }
      return [m, waiting(m, msg.id, "show", msg.gen) === void 0 ? [] : PARTS.map((part) => fetch(msg.id, part, msg.gen))];
    case "Retry": {
      const id = shownId(m);
      const d = id === null ? void 0 : m.details.get(id);
      if (id === null || d === void 0) {
        return [m, []];
      }
      const gen = m.gen + 1;
      const again = { ...d, slow: msg.part === "show" ? false : d.slow };
      again[msg.part] = { _tag: "Loading", prev: null, gen };
      return [{ ...m, gen, details: new Map(m.details).set(id, again) }, msg.part === "show" ? [fetch(id, "show", gen), wait(id, gen, "loading")] : [fetch(id, msg.part, gen)]];
    }
  }
}
function move(m, delta) {
  const rows = visible(m);
  const at = rows.findIndex((b) => b.id === m.selected);
  const next = rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + delta))];
  return next === void 0 || next.id === m.selected && m.shown === null ? m : pick(m, next.id);
}
function escape(m) {
  if (m.menu !== null) {
    return { ...m, menu: null };
  }
  if (m.help) {
    return { ...m, help: false };
  }
  if (m.searching) {
    return reselect({ ...m, searching: false, filters: { ...m.filters, search: "" } });
  }
  return m.pane === "detail" && !isWide(m) ? toList(m) : m;
}

// src/store.ts
var Store = class {
  model = initModel();
  closed = false;
  host;
  root;
  spawn;
  changed;
  constructor(host, root, spawn, changed) {
    this.host = host;
    this.root = root;
    this.spawn = spawn;
    this.changed = changed;
  }
  dispatch(msg) {
    if (this.closed) {
      return;
    }
    const before = this.model;
    const [model, cmds] = update(before, msg);
    this.model = model;
    if (model !== before) {
      this.changed(before, model, msg);
    }
    const root = this.root;
    if (root !== null) {
      for (const cmd of cmds) {
        this.spawn(async () => this.dispatch(await run2(this.host, root, cmd)));
      }
    }
  }
  close() {
    this.closed = true;
  }
};

// src/view.ts
import { div, svg, uniform_list } from "gpui-kit";
import { h_flex, Input, Popup, Scrollbar, TextView, v_flex } from "gpui-base";
var icon = (name) => `mods/beads/icons/${name}.svg`;
var pick2 = (t, ...keys) => {
  const found = keys.find((k) => t[k] !== void 0);
  return t[found ?? "muted"] ?? t.foreground;
};
function peach(t) {
  if (t.peach !== void 0) {
    return t.peach;
  }
  const [a, b] = [pick2(t, "ansi1"), pick2(t, "ansi3")];
  const mix = (i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? `#${mix(1)}${mix(3)}${mix(5)}` : b;
}
function priorityColor(p, t) {
  return p <= 0 ? pick2(t, "red", "ansi1") : p === 1 ? peach(t) : p === 2 ? pick2(t, "yellow", "ansi3") : p === 3 ? pick2(t, "blue", "ansi4") : t.muted;
}
var STATUS_COLOR = { open: ["green", "ansi2"], in_progress: ["blue", "ansi4"], blocked: ["red", "ansi1"] };
var statusColor = (status, t) => {
  const names = STATUS_COLOR[status];
  return names === void 0 ? t.muted : pick2(t, ...names);
};
var STATUS_LABEL = { open: "OPEN", in_progress: "IN PROG", blocked: "BLOCKED", deferred: "DEFER", closed: "CLOSED" };
var statusLabel = (status) => STATUS_LABEL[status] ?? status.toUpperCase().slice(0, 8);
var TYPE_ICON = /* @__PURE__ */ new Set(["task", "bug", "feature", "epic", "chore"]);
function button(id, label, on, t, click, chevron = false) {
  return h_flex().id(id).h(26).px(8).gap(4).flex_none().items_center().rounded(6).border_1().border_color(on ? t.accent : t.border).text_size(12).text_color(on ? t.foreground : t.muted).when(on, (e) => e.bg(t.selected)).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
    cx.stop_propagation();
    click();
  }).child(label).when(chevron, (e) => e.child(svg(icon("chevron-down")).size(12).flex_none()));
}
function iconButton(id, name, tip, t, click, spin = false) {
  return div().id(id).w(26).h(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).tooltip(tip).accessibility_label(tip).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
    cx.stop_propagation();
    click();
  }).child(
    svg(icon(name)).size(14).flex_none().when(spin, (e) => e.spin(900))
  );
}
function walkButton(id, glyph, tip, on, t, click) {
  return div().id(id).w(26).h(26).flex_none().flex().items_center().justify_center().rounded(6).text_size(16).text_color(t.muted).opacity(on ? 1 : 0.35).when(
    on,
    (e) => e.tooltip(tip).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
      cx.stop_propagation();
      click();
    })
  ).accessibility_label(tip).child(glyph);
}
var SORT_LABEL = (key) => key.charAt(0).toUpperCase() + key.slice(1);
function searchBox(ui) {
  return div().id("search").flex_1().min_w(120).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(ui.search).h(26).w_full().text_size(12));
}
function picker(m, name, label, on, t, dispatch) {
  const options = name === "status" ? statusOptions(m).map((s) => ({ label: s, on: m.filters.status === s, msg: { _tag: "SetStatus", status: s } })) : name === "type" ? typeOptions(m).map((s) => ({ label: s, on: m.filters.type === s, msg: { _tag: "SetType", type: s } })) : SORT_KEYS.map((k) => ({ label: SORT_LABEL(k), on: m.sort.key === k, msg: { _tag: "SortBy", key: k } }));
  return Popup.new(
    `menu-${name}`,
    button(name, label, on || m.menu === name, t, () => dispatch({ _tag: "ToggleMenu", menu: name }), true)
  ).anchor("bottom_left").flex_none().when(
    m.menu === name,
    (e) => e.content(
      v_flex().min_w(140).py(4).rounded(8).border_1().border_color(t.border).bg(t.popover).children(
        options.map(
          (o) => h_flex().id(`option-${name}-${o.label}`).h(26).px(10).gap(8).items_center().text_size(12).text_color(o.on ? t.accent : t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
            cx.stop_propagation();
            dispatch(o.msg);
          }).child(o.label)
        )
      )
    )
  );
}
function filters(m, t, dispatch, narrow) {
  const f = m.filters;
  return [
    button("ready", "Ready", f.ready, t, () => dispatch({ _tag: "ToggleReady" })),
    picker(m, "status", f.status === NOT_CLOSED ? "Status" : `Status: ${f.status}`, f.status !== NOT_CLOSED, t, dispatch),
    picker(m, "type", f.type === ALL ? "Type" : `Type: ${f.type}`, f.type !== ALL, t, dispatch),
    div().flex_1(),
    picker(m, "sort", narrow ? "Sort" : `Sort: ${SORT_LABEL(m.sort.key)}`, false, t, dispatch),
    iconButton("reverse", m.sort.reverse ? "arrow-up" : "arrow-down", "Reverse the sort", t, () => dispatch({ _tag: "Reverse" }))
  ];
}
function topBar(m, t, dispatch, ui, wide) {
  const refresh = iconButton("refresh", "refresh", "Refresh (Ctrl+R)", t, () => dispatch({ _tag: "Refresh" }), m.loading);
  return v_flex().flex_none().border_b(1).border_color(t.border).child(
    h_flex().px(8).py(6).gap(6).items_center().child(searchBox(ui)).when(wide, (e) => e.children(filters(m, t, dispatch, false))).child(refresh)
  ).when(
    !wide,
    (e) => e.child(
      h_flex().px(8).pb(6).gap(6).items_center().children(filters(m, t, dispatch, true))
    )
  );
}
function row(b, m, t, narrow, now, idW, mono) {
  const closed = b.status === "closed";
  const selected = b.id === (shownId(m) ?? m.selected);
  const dim = (c) => closed ? t.muted : c;
  const locks = m.snapshot?.locks.get(b.id) ?? 0;
  const status = statusColor(b.status, t);
  return h_flex().id(b.id).w_full().h(ROW_H).flex_none().pr(10).gap(6).items_center().text_size(12).cursor_pointer().text_color(closed ? t.muted : t.foreground).when(selected, (e) => e.bg(pick2(t, "surface0", "raised"))).hover((s) => s.bg(t.hover)).child(
    div().w(2).h_full().flex_none().when(selected, (e) => e.bg(t.accent))
  ).when(
    !narrow,
    (e) => e.child(
      svg(icon(TYPE_ICON.has(b.issue_type) ? b.issue_type : "task")).size(14).flex_none().text_color(closed ? t.muted : t.dim)
    )
  ).child(
    div().w(16).flex_none().text_size(11).font_semibold().text_color(dim(priorityColor(b.priority, t))).child(`P${b.priority}`)
  ).child(narrow ? div().w(8).h(8).flex_none().rounded(4).bg(dim(status)) : div().w(56).flex_none().text_size(10).font_semibold().text_color(dim(status)).child(statusLabel(b.status))).child(
    div().w(idW * 7).flex_none().truncate().font_family(mono).text_size(11).text_color(t.muted).child(b.id)
  ).child(div().flex_1().min_w(0).truncate().child(b.title)).when(
    locks > 0,
    (e) => e.child(
      h_flex().gap(2).flex_none().items_center().text_size(11).text_color(closed ? t.muted : peach(t)).child(svg(icon("lock")).size(11)).child(`${locks}`)
    )
  ).when(m.width >= NO_AGE_BELOW, (e) => e.child(div().w(26).flex_none().text_size(11).text_color(t.muted).text_right().child(age(b.created_at, now))));
}
function listColumn(m, rows, t, dispatch, ui, narrow, now) {
  const idW = idChars(rows);
  return div().flex_1().min_h(0).relative().child(
    rows.length === 0 ? div().p(14).text_color(t.muted).child(m.snapshot === null ? m.loading ? "Loading beads..." : "" : "No beads match") : (
      // Only the rows on screen are built, so a thousand beads cost what twenty do.
      uniform_list(
        "beads-list",
        rows.length,
        (i) => rows[i]?.id ?? `row:${i}`,
        (range) => {
          ui.seen(range.start, range.end);
          return rows.slice(range.start, range.end).map((b) => row(b, m, t, narrow, now, idW, ui.mono));
        }
      ).absolute().inset_0().track_scroll(ui.scroll).on_item_click((id) => dispatch({ _tag: "Click", id }))
    )
  ).child(Scrollbar.vertical("beads-list").absolute().inset_0());
}
var KEYS = [
  ["j k  \u2193 \u2191", "Move the selection"],
  ["\u21B5", "Open the detail (narrow) or focus it (wide)"],
  ["Esc", "Back to the list (narrow), clear the search, close a menu"],
  ["Tab", "Switch focus between list and detail (wide)"],
  ["[ ]", "Back and forward in the history"],
  ["/", "Search"],
  ["Ctrl+R", "Refresh"],
  ["?", "Show or hide these keys"]
];
function keysPanel(t, mono) {
  return v_flex().flex_1().min_h(0).p(14).gap(6).text_size(12).child(div().font_semibold().child("Keys")).children(KEYS.map(([k, what]) => h_flex().gap(12).child(div().w(90).flex_none().font_family(mono).text_size(11).text_color(t.accent).child(k)).child(div().flex_1().min_w(0).text_color(t.muted).child(what))));
}
var bdText = (e) => "text" in e ? e.text : `bd ${e.version ?? "(version unknown)"} gave output this viewer does not understand: ${e.path} ${e.detail}`;
var heading = (label, t) => div().text_size(11).font_semibold().text_color(t.muted).child(label.toUpperCase());
var section = (label, t, ...body) => v_flex().gap(4).flex_none().child(heading(label, t)).children(body);
var markdown = (id, text2) => TextView.markdown(id, text2).selectable(true).scrollable(false).w_full().min_w(0);
var red = (t) => pick2(t, "red", "ansi1");
function failed(label, error, part, t, dispatch) {
  return section(label, t, div().text_size(12).text_color(red(t)).child(bdText(error)), h_flex().child(button(`retry-${part}`, "Retry", false, t, () => dispatch({ _tag: "Retry", part }))));
}
var GUIDE = 14;
function treeRow(r, key, t, dispatch, mono) {
  const line = (e) => e.border_l(1).border_color(t.border);
  const own = r.last ? div().w(GUIDE).h(ROW_H).flex_none().child(
    line(
      div().w(10).h(ROW_H / 2)
    ).border_b(1)
  ) : line(div().w(GUIDE).h(ROW_H).flex_none()).child(
    div().w(10).h(ROW_H / 2).border_b(1).border_color(t.border)
  );
  return h_flex().h(ROW_H).flex_none().gap(6).items_center().text_size(12).opacity(r.repeat ? 0.5 : 1).child(
    h_flex().flex_none().children([...r.guides.map((on) => on ? line(div().w(GUIDE).h(ROW_H).flex_none()) : div().w(GUIDE).h(ROW_H).flex_none()), own])
  ).child(div().w(8).h(8).flex_none().rounded(4).bg(statusColor(r.status, t))).child(
    div().id(key).flex_none().font_family(mono).text_size(11).text_color(t.accent).cursor_pointer().hover((s) => s.underline()).on_click((_e, cx) => {
      cx.stop_propagation();
      dispatch({ _tag: "Jump", id: r.id });
    }).child(r.id)
  ).child(div().flex_1().min_w(0).truncate().child(r.title)).child(div().flex_none().text_size(11).text_color(t.muted).child(r.edge));
}
function tree(label, part, p, empty, t, dispatch, mono) {
  if (p._tag === "Failed") {
    return [failed(label, p.error, part, t, dispatch)];
  }
  const nodes = p._tag === "Ready" ? p.value : p.prev;
  if (nodes === null) {
    return [];
  }
  const rows = treeRows(nodes);
  return [section(`${label} (${rows.length})`, t, ...rows.length === 0 ? [div().text_size(12).text_color(t.muted).child(empty)] : rows.map((r, i) => treeRow(r, `${part}-${i}`, t, dispatch, mono)))];
}
function metaRow(b, t, ui, now) {
  const status = statusColor(b.status, t);
  const ago = age(b.created_at, now);
  return h_flex().flex_wrap().gap_x(10).gap_y(4).items_center().text_size(12).child(div().font_family(ui.mono).text_size(12).text_color(t.muted).child(b.id)).child(div().px(6).rounded(4).border_1().border_color(status).text_size(10).font_semibold().text_color(status).child(statusLabel(b.status))).child(div().text_size(11).font_semibold().text_color(priorityColor(b.priority, t)).child(`P${b.priority}`)).when(b.assignee !== null, (e) => e.child(div().text_color(t.muted).child(`@${b.assignee}`))).child(
    div().id("age").text_color(t.muted).tooltip(`Created ${fullDate(b.created_at)}`).child(ago === "now" ? ago : `${ago} ago`)
  );
}
function beadBody(d, e, hidden, t, dispatch, ui, now) {
  const comments = e.comments._tag === "Ready" ? e.comments.value : e.comments._tag === "Loading" ? e.comments.prev ?? [] : [];
  const sorted = [...comments].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [
    h_flex().gap(8).items_start().flex_none().child(
      svg(icon(TYPE_ICON.has(d.issue_type) ? d.issue_type : "task")).size(18).flex_none().text_color(t.dim)
    ).child(div().flex_1().min_w(0).max_h(40).overflow_hidden().text_size(16).line_height(1.25).font_semibold().child(d.title)),
    ...hidden ? [div().flex_none().text_size(12).text_color(t.muted).child("Hidden by the current filters")] : [],
    metaRow(d, t, ui, now),
    ...d.labels.length === 0 ? [] : [
      h_flex().flex_wrap().gap(4).flex_none().children(
        d.labels.map(
          (l) => div().px(6).py(1).rounded(4).bg(pick2(t, "surface0", "raised")).text_size(11).text_color(t.muted).child(l)
        )
      )
    ],
    ...textSections(d).map(([label, text2]) => section(label, t, markdown(`md-${d.id}-${label}`, text2))),
    ...tree("Blocked by", "down", e.down, "Nothing blocks this bead.", t, dispatch, ui.mono),
    ...tree("Blocks", "up", e.up, "This bead blocks nothing.", t, dispatch, ui.mono),
    ...e.comments._tag === "Failed" ? [failed("Comments", e.comments.error, "comments", t, dispatch)] : [],
    ...sorted.length === 0 ? [] : [
      section(
        `Comments (${sorted.length})`,
        t,
        ...sorted.map(
          (c) => v_flex().gap(2).flex_none().child(
            h_flex().gap(8).items_center().text_size(12).child(div().font_semibold().child(c.author)).child(div().id(`comment-age-${c.id}`).text_size(11).text_color(t.muted).tooltip(fullDate(c.created_at)).child(age(c.created_at, now)))
          ).child(markdown(`md-${d.id}-c-${c.id}`, c.text))
        )
      )
    ]
  ];
}
function detailBody(m, rows, t, dispatch, ui, now) {
  const id = shownId(m);
  const note = (text2, color = t.muted) => div().flex_none().text_size(12).text_color(color).child(text2);
  if (id === null) {
    return [note("Select a bead")];
  }
  const entry = m.details.get(id);
  if (entry === void 0) {
    return [];
  }
  const show = entry.show;
  if (show._tag === "Failed") {
    return show.error._tag === "BeadGone" ? [
      note(`${id} no longer exists`),
      h_flex().flex_none().child(button("refresh-gone", "Refresh", false, t, () => dispatch({ _tag: "Refresh" })))
    ] : [
      note(bdText(show.error), red(t)),
      h_flex().flex_none().child(button("retry-show", "Retry", false, t, () => dispatch({ _tag: "Retry", part: "show" })))
    ];
  }
  const bead2 = show._tag === "Ready" ? show.value : show.prev;
  if (bead2 === null) {
    return entry.slow ? [note("Loading")] : [];
  }
  return beadBody(bead2, entry, hiddenByFilters(m, rows), t, dispatch, ui, now);
}
function detailPane(m, rows, t, dispatch, ui, narrow, now) {
  const scroll = `detail-${shownId(m) ?? "none"}`;
  return v_flex().flex_1().min_w(0).min_h(0).when(!narrow, (e) => e.border_l(2).border_color(m.pane === "detail" ? t.accent : t.border)).child(
    h_flex().h(36).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border).when(
      narrow,
      (e) => e.child(
        h_flex().id("back").h(26).pl(4).pr(8).gap(2).items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "BackToList" });
        }).child(svg(icon("chevron-left")).size(14).flex_none()).child("List")
      )
    ).child(walkButton("history-back", "\u2039", "Back ([)", m.back.length > 0, t, () => dispatch({ _tag: "Walk", delta: -1 }))).child(walkButton("history-forward", "\u203A", "Forward (])", m.forward.length > 0, t, () => dispatch({ _tag: "Walk", delta: 1 })))
  ).child(
    m.help ? keysPanel(t, ui.mono) : div().flex_1().min_h(0).relative().child(
      v_flex().id(scroll).absolute().inset_0().overflow_y_scroll().p(14).gap(10).children(detailBody(m, rows, t, dispatch, ui, now))
    ).child(Scrollbar.vertical(scroll).absolute().inset_0())
  );
}
function footer(m, rows, t, wide) {
  const s = m.snapshot;
  const counts = s === null ? "" : wide ? `${rows.length} of ${s.beads.length} \xB7 ${s.ready.size} ready` : `${rows.length} of ${s.beads.length}`;
  return h_flex().h(26).flex_none().px(12).gap(12).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.muted).child(div().flex_1().min_w(0).truncate().child(counts)).child(
    div().flex_none().child(wide ? "/ search \xB7 \u21B5 open \xB7 ? keys" : "\u21B5 open")
  );
}
var errorText2 = (m) => m.error === null ? null : bdText(m.error);
function draw(m, rows, t, dispatch, ui, now) {
  const wide = isWide(m);
  const detailFull = !wide && m.pane === "detail";
  const error = errorText2(m);
  return v_flex().id("beads").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13).track_focus(ui.nav).on_size_change((size) => dispatch({ _tag: "Resized", width: Math.round(size.width) })).on_key_down((ev, cx) => {
    const msg = keyFor(m, ev.keystroke);
    if (msg !== null) {
      dispatch(msg);
      cx.stop_propagation();
    }
  }).when(detailFull, (e) => e.child(detailPane(m, rows, t, dispatch, ui, true, now))).when(
    !detailFull,
    (e) => e.child(topBar(m, t, dispatch, ui, wide)).when(
      error !== null,
      (x) => x.child(
        div().px(12).py(6).flex_none().text_size(12).text_color(pick2(t, "red", "ansi1")).child(error ?? "")
      )
    ).child(
      m.help ? keysPanel(t, ui.mono) : wide ? h_flex().flex_1().min_h(0).child(
        v_flex().w(listWidth(m.width)).h_full().flex_none().child(listColumn(m, rows, t, dispatch, ui, false, now))
      ).child(detailPane(m, rows, t, dispatch, ui, false, now)) : listColumn(m, rows, t, dispatch, ui, true, now)
    ).child(footer(m, rows, t, wide))
  );
}

// src/main.ts
function viewedRepo(host) {
  return decodeProps(host.props()).root ?? decodeFocus(host.focused())?.cwd ?? null;
}
function rowsCache() {
  let last = null;
  return (m) => {
    if (last === null || last.snapshot !== m.snapshot || last.filters !== m.filters || last.sort !== m.sort) {
      last = { snapshot: m.snapshot, filters: m.filters, sort: m.sort, rows: visible(m) };
    }
    return last.rows;
  };
}
var BeadsView = class extends View {
  store;
  root = null;
  host;
  cx;
  nav;
  search;
  scroll;
  rows = rowsCache();
  // The rows the list drew last, [start, end): what is on screen, which the model does not know.
  seen = null;
  mono = "";
  init(_props, cx) {
    this.cx = cx;
    this.host = realHost(cx);
    this.root = viewedRepo(this.host);
    this.store = new Store(
      this.host,
      this.root,
      (job) => cx.spawn(job),
      (before, model, msg) => {
        this.sync(before, model, msg);
        this.cx.notify();
      }
    );
    this.mono = decodeFont(this.host.settings());
    this.nav = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.search = InputState.new({ placeholder: "Search (/)" });
    this.search.on("change", () => this.dispatch({ _tag: "Search", text: this.search.value() }));
    this.search.on("submit", () => this.dispatch({ _tag: "Enter" }));
    this.search.on("focus", () => this.dispatch({ _tag: "SearchFocused", on: true }));
    this.search.on("blur", () => this.dispatch({ _tag: "SearchFocused", on: false }));
    cx.spawn(() => this.listen());
    if (this.root !== null) {
      this.dispatch({ _tag: "Refresh" });
    }
  }
  // pane.go gives a shown copy the keyboard by sending "focus".
  async listen() {
    while (!this.store.closed) {
      try {
        if (await this.host.nextCommand() === "focus" && !this.store.closed) {
          this.nav.focus();
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  dispatch(msg) {
    this.store.dispatch(msg);
  }
  // What the model decided that the view's own state must follow: the box's text and focus, and the list's scroll.
  sync(before, model, msg) {
    if (model.filters.search !== this.search.value()) {
      this.search.set_value(model.filters.search);
    }
    if (msg._tag === "FocusSearch") {
      this.search.focus();
    } else if (before.searching && !model.searching && msg._tag !== "SearchFocused") {
      this.nav.focus();
    }
    if (before.pane === "detail" && model.pane === "list") {
      this.seen = null;
    }
    const at = this.rows(model).findIndex((b) => b.id === model.selected);
    if (at >= 0 && (this.seen === null || at < this.seen[0] || at >= this.seen[1])) {
      this.scroll.scroll_to_item(at);
    }
  }
  render(_cx) {
    const t = this.host.theme();
    if (this.root === null) {
      return div2().size_full().p(14).bg(t.background).text_color(t.muted).child("Open from a terminal");
    }
    const ui = { nav: this.nav, search: this.search, scroll: this.scroll, mono: this.mono, seen: (start, end) => this.seen = [start, end] };
    return draw(this.store.model, this.rows(this.store.model), t, (msg) => this.dispatch(msg), ui, Date.now());
  }
  // Bounded: set the flag and let the replies in flight be dropped.
  close(_cx) {
    this.store.close();
    this.search.release();
    this.scroll.release();
  }
};
export {
  BeadsView as default
};
