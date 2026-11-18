// src/main.ts
import { View } from "gpui-kit";
import { InputState, VirtualListScrollHandle } from "gpui-base";

// src/decode.ts
var Bad = class {
  path;
  detail;
  constructor(path, detail) {
    this.path = path;
    this.detail = detail;
  }
};
var bad = (path, detail) => {
  throw new Bad(path, detail);
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
var parseJson = (text3) => {
  try {
    return JSON.parse(text3);
  } catch {
    return bad("$", "not JSON");
  }
};
function decoder(read, parse = parseJson) {
  return (text3, version) => {
    const fail2 = (path, detail) => ({ ok: false, error: { _tag: "Undecodable", version, path, detail } });
    try {
      return { ok: true, value: read(parse(text3)) };
    } catch (e) {
      if (e instanceof Bad) {
        return fail2(e.path, e.detail);
      }
      throw e;
    }
  };
}
function bead(o, p, parent) {
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
    comment_count: numOr0(o, "comment_count", p)
  };
}
var top = (json) => obj(json, "$");
var decodeReady = decoder((json) => arr(json, "$").map((x, i) => str(obj(x, `$[${i}]`), "id", `$[${i}]`)));
var decodeBlocked = decoder(
  (json) => arr(json, "$").map((x, i) => {
    const p = `$[${i}]`;
    const o = obj(x, p);
    return { id: str(o, "id", p), blocked_by_count: num(o, "blocked_by_count", p), blocked_by: strings(o, "blocked_by", p) };
  })
);
var lines = (text3) => text3.split("\n").map((line, i) => {
  try {
    return line.trim() === "" ? void 0 : JSON.parse(line);
  } catch {
    return bad(`$[${i}]`, "not JSON");
  }
});
var comment = (o, p) => ({ id: str(o, "id", p), author: str(o, "author", p), text: str(o, "text", p), created_at: str(o, "created_at", p) });
var decodeExport = decoder((json) => {
  const beads = [];
  const edges = [];
  json.forEach((x, i) => {
    if (x === void 0) {
      return;
    }
    const p = `$[${i}]`;
    const o = obj(x, p);
    if (o._type != null && o._type !== "issue") {
      return;
    }
    const own = o.dependencies == null ? [] : each(o, "dependencies", p, (d, dp) => ({ from: str(d, "issue_id", dp), to: str(d, "depends_on_id", dp), type: str(d, "type", dp) }));
    edges.push(...own);
    beads.push({
      ...bead(o, p, own.find((e) => e.type === "parent-child")?.to ?? null),
      description: strOr(o, "description", p),
      design: strOr(o, "design", p),
      acceptance_criteria: strOr(o, "acceptance_criteria", p),
      notes: strOr(o, "notes", p),
      comments: o.comments == null ? [] : each(o, "comments", p, comment)
    });
  });
  return { beads, edges };
}, lines);
var status = (icon2) => (o, p) => ({ name: str(o, "name", p), icon: icon2(o, "icon", p), category: str(o, "category", p) });
var decodeStatuses = decoder((json) => {
  const o = top(json);
  return [...each(o, "built_in_statuses", "$", status(str)), ...o.custom_statuses == null ? [] : each(o, "custom_statuses", "$", status(strOr))];
});
function decodeFocus(v) {
  if (typeof v !== "object" || v === null) {
    return null;
  }
  const o = v;
  const text3 = (x) => typeof x === "string" ? x : null;
  return { cwd: text3(o.cwd), terminal: text3(o.terminal), tab: text3(o.tab), pane: text3(o.pane) };
}
function decodeProps(v) {
  const o = typeof v === "object" && v !== null ? v : {};
  const text3 = (x) => typeof x === "string" && x !== "" ? x : null;
  return { root: text3(o.root), opener: text3(o.opener) };
}
var records = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : [];
var name = (o) => {
  const program = typeof o.program === "object" && o.program !== null ? o.program.name : void 0;
  return typeof program === "string" && program !== "" ? program : typeof o.title === "string" ? o.title : "";
};
function decodePanes(v) {
  return records(v).flatMap((o) => typeof o.pane === "string" && typeof o.tab === "string" ? [{ pane: o.pane, terminal: typeof o.terminal === "string" ? o.terminal : null, tab: o.tab, status: typeof o.status === "string" ? o.status : null, name: name(o) }] : []);
}
function decodeAgents(v) {
  return records(v).flatMap((o) => typeof o.pane === "string" && typeof o.tab === "string" && typeof o.seq === "number" ? [{ pane: o.pane, tab: o.tab, seq: o.seq, name: name(o) }] : []);
}
function isRemoteTab(spaces2, tab) {
  return tab !== null && records(spaces2).some((o) => typeof o.machine === "string" && o.machine !== "" && records(o.tabs).some((t) => t.id === tab));
}
var FALLBACK_MONO = "Menlo";
function decodeFont(v) {
  const family = typeof v === "object" && v !== null ? v.font_family : void 0;
  return typeof family === "string" && family !== "" ? family : FALLBACK_MONO;
}

// src/host.ts
import { agents, closeOverlay, exec, focused, nextCommand, openOverlay, panes, props, run, settings, spaces, theme } from "herdr";
var realHost = (cx) => ({
  exec: (command, args, options) => exec(command, args, options),
  sleep: (ms) => cx.sleep(ms),
  run: (name2, args) => run(name2, args),
  openOverlay: (spec) => openOverlay(spec),
  closeOverlay: (id) => closeOverlay(id),
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
  writeClipboard: (text3) => cx.write_to_clipboard(text3)
});

// src/rows.ts
var NOT_CLOSED = "not closed";
var ALL = "all";
var initFilters = () => ({ ready: false, status: NOT_CLOSED, type: ALL, search: "" });
var initSort = () => ({ key: "priority", reverse: false });
var STATUS_ORDER = ["open", "in_progress", "blocked", "deferred", "closed"];
var rank = (status2) => {
  const i = STATUS_ORDER.indexOf(status2);
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
var last = null;
function visible(m) {
  if (last === null || last.snapshot !== m.snapshot || last.filters !== m.filters || last.sort !== m.sort) {
    const s = m.snapshot;
    last = { snapshot: s, filters: m.filters, sort: m.sort, rows: s === null ? [] : s.beads.filter((b) => matches(b, m.filters, s.ready)).sort(compare(m.sort)) };
  }
  return last.rows;
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
      const list2 = kids.get(n.parent_id) ?? [];
      if (list2.length === 0) {
        kids.set(n.parent_id, list2);
      }
      list2.push(n);
    }
  }
  const rows = [];
  const walk = (parent, guides) => {
    const list2 = kids.get(parent) ?? [];
    list2.forEach((n, i) => {
      const last2 = i === list2.length - 1;
      rows.push({ id: n.id, title: n.title, status: n.status, edge: n.edge_from_parent ?? "", depth: guides.length + 1, guides, last: last2 });
      walk(n.id, [...guides, !last2]);
    });
  };
  nodes.filter((n) => n.depth === 0).forEach((r) => walk(r.id, []));
  return rows;
}
var textSections = (d) => [
  ["Description", d.description],
  ["Design", d.design],
  ["Acceptance criteria", d.acceptance_criteria],
  ["Notes", d.notes]
].filter(([, text3]) => text3.trim() !== "");
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
var indexes = /* @__PURE__ */ new WeakMap();
var byIdOf = (s) => {
  const found = indexes.get(s) ?? new Map(s.beads.map((b) => [b.id, b]));
  indexes.set(s, found);
  return found;
};
function shownBead(m) {
  const id = shownId(m);
  return id === null || m.snapshot === null ? null : byIdOf(m.snapshot).get(id) ?? null;
}
var MAX_DEPTH = 50;
function depTree(s, id, direction) {
  const byId = byIdOf(s);
  const root = byId.get(id);
  if (root === void 0) {
    return [];
  }
  const [near, far] = direction === "down" ? ["from", "to"] : ["to", "from"];
  const out = /* @__PURE__ */ new Map();
  for (const e of s.edges.filter((e2) => e2.type !== "relates-to")) {
    const list2 = out.get(e[near]) ?? [];
    if (list2.length === 0) {
      out.set(e[near], list2);
    }
    list2.push({ id: e[far], type: e.type });
  }
  const node = (b, depth, parent_id, edge) => ({ id: b.id, title: b.title, status: b.status, priority: b.priority, issue_type: b.issue_type, depth, parent_id, edge_from_parent: edge });
  const nodes = [node(root, 0, "", null)];
  const seen = /* @__PURE__ */ new Set([id]);
  const walk = (from, depth) => {
    for (const e of out.get(from) ?? []) {
      const b = byId.get(e.id);
      if (b !== void 0 && !seen.has(e.id)) {
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
var taskLists = (text3) => text3.replace(/^([ \t]*)\[([ xX])\] /gm, "$1- [$2] ");
function pickTarget(opener, panes2, agents2) {
  const there = panes2.find((p) => p.terminal !== null && p.terminal === opener.terminal && p.status !== null);
  if (there?.terminal != null) {
    return { terminal: there.terminal, name: there.name };
  }
  const inTab = agents2.filter((a) => a.tab === opener.tab).sort((a, b) => b.seq - a.seq);
  for (const a of inTab) {
    const terminal = panes2.find((p) => p.pane === a.pane)?.terminal;
    if (terminal !== null && terminal !== void 0) {
      return { terminal, name: a.name };
    }
  }
  return null;
}
function openerOf(prop, focus, panes2) {
  const terminal = prop ?? focus?.terminal ?? null;
  return { terminal, tab: panes2.find((p) => p.terminal === terminal)?.tab ?? focus?.tab ?? null };
}
var sendText = (e) => e._tag === "TargetGone" ? "Agent is gone" : e._tag === "NoTarget" ? "No agent in this tab" : "Send failed";
var pickOptions = (m, current) => m.statuses.includes(current) ? m.statuses : [...m.statuses, current];
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

// src/update.ts
var initModel = (opener = { terminal: null, tab: null }) => ({
  snapshot: null,
  loading: false,
  loads: 0,
  slow: false,
  error: null,
  filters: initFilters(),
  sort: initSort(),
  selected: null,
  shown: null,
  back: [],
  forward: [],
  width: 0,
  pane: "list",
  searching: false,
  menu: null,
  statuses: BUILT_IN_STATUSES,
  writing: /* @__PURE__ */ new Map(),
  writeError: null,
  reload: false,
  opener,
  flash: 0,
  copied: null,
  sending: false,
  sent: null
});
function update(m, msg) {
  const [next, cmds] = step(m, msg);
  return [next.writeError !== null && next.writeError.id !== shownId(next) ? { ...next, writeError: null } : next, cmds];
}
var pick = (m, id) => ({ ...m, selected: id, shown: null });
var land = (m, id) => visible(m).some((b) => b.id === id) ? pick(m, id) : { ...m, shown: id };
var toList = (m) => ({ ...m, pane: "list", shown: null, back: [], forward: [] });
function step(m, msg) {
  switch (msg._tag) {
    case "Refresh": {
      if (m.loading || m.error?._tag === "NoOpener" || m.error?._tag === "RemoteSpace") {
        return [m, []];
      }
      const loads = m.loads + 1;
      return [{ ...m, loading: true, loads, slow: false }, m.snapshot === null ? [{ _tag: "Load" }, { _tag: "WaitLoad", n: loads }] : [{ _tag: "Load" }]];
    }
    case "Slowed":
      return [m.loading && m.snapshot === null && msg.n === m.loads ? { ...m, slow: true } : m, []];
    case "Loaded": {
      if (m.reload) {
        return [{ ...m, reload: false }, [{ _tag: "Load" }]];
      }
      const writing = new Map([...m.writing].filter(([, s]) => s === "running"));
      if (!msg.res.ok) {
        return [{ ...m, loading: false, slow: false, error: msg.res.error, writing }, []];
      }
      return [reselect({ ...m, loading: false, slow: false, error: null, snapshot: msg.res.value, writing }), []];
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
      return [m.pane === "list" ? move(m, msg.delta) : m, []];
    case "Click":
      return [{ ...pick(m, msg.id), menu: null, searching: false, pane: isWide(m) ? "list" : "detail" }, []];
    case "Enter":
      if (m.searching) {
        return [{ ...m, searching: false }, []];
      }
      return [m.selected === null || isWide(m) ? m : { ...m, pane: "detail" }, []];
    case "Escape":
      return [escape(m), []];
    case "BackToList":
      return [toList(m), []];
    case "Jump": {
      const cur = shownId(m);
      return cur === null || cur === msg.id ? [m, []] : [land({ ...m, back: [...m.back, cur], forward: [] }, msg.id), []];
    }
    case "Walk": {
      const cur = shownId(m);
      const id = (msg.delta < 0 ? m.back : m.forward).at(-1);
      if (cur === null || id === void 0) {
        return [m, []];
      }
      return [land({ ...m, ...msg.delta < 0 ? { back: m.back.slice(0, -1), forward: [...m.forward, cur] } : { back: [...m.back, cur], forward: m.forward.slice(0, -1) } }, id), []];
    }
    case "Resized":
      return [msg.width === m.width ? m : { ...m, width: msg.width }, []];
    case "FocusSearch":
      return [{ ...m, searching: true, menu: null, pane: "list" }, []];
    case "SearchFocused":
      return [msg.on === m.searching ? m : { ...m, searching: msg.on }, []];
    case "ToggleMenu": {
      if (msg.menu === "pick") {
        const b = shownBead(m);
        if (b === null || m.writing.has(b.id)) {
          return [m, []];
        }
        return [{ ...m, menu: m.menu === "pick" || m.menu === "reason" ? null : "pick", writeError: null }, []];
      }
      return [{ ...m, menu: m.menu === msg.menu ? null : msg.menu }, []];
    }
    case "ShowKeys":
      return [m, []];
    case "ReadStatuses":
      return [m, [{ _tag: "Statuses" }]];
    case "StatusesRead":
      return [msg.res.ok && msg.res.value.length > 0 ? { ...m, statuses: msg.res.value.map((s) => s.name) } : m, []];
    case "Pick": {
      const b = shownBead(m);
      if (b === null || m.writing.has(b.id) || msg.status === b.status) {
        return [{ ...m, menu: null }, []];
      }
      return msg.status === "closed" ? [{ ...m, menu: "reason" }, []] : write(m, b.id, b.status, msg.status, "");
    }
    case "CloseWith": {
      const b = shownBead(m);
      return b === null || m.writing.has(b.id) || b.status === "closed" ? [{ ...m, menu: null }, []] : write(m, b.id, b.status, "closed", msg.reason.trim());
    }
    case "Written": {
      const writing = new Map(m.writing);
      if (msg.error !== null && !msg.second) {
        writing.delete(msg.id);
        return [{ ...m, writing, writeError: { id: msg.id, error: msg.error, second: null } }, []];
      }
      writing.set(msg.id, "reloading");
      const writeError = msg.error === null ? m.writeError : { id: msg.id, error: msg.error, second: msg.to };
      return m.loading ? [{ ...m, writing, writeError, reload: true }, []] : step({ ...m, writing, writeError }, { _tag: "Refresh" });
    }
    case "Copy": {
      const b = shownBead(m);
      if (b === null || m.sending) {
        return [m, []];
      }
      const n = m.flash + 1;
      return [{ ...m, flash: n, copied: { n, id: b.id } }, [{ _tag: "Copy", id: b.id, n }]];
    }
    case "Send": {
      const b = shownBead(m);
      return b === null || m.sending ? [m, []] : [{ ...m, sending: true }, [{ _tag: "Send", id: b.id, title: b.title, opener: m.opener }]];
    }
    case "Sent":
      return flash({ ...m, sending: false }, `Sent to ${msg.agent}`);
    case "SendFailed":
      return flash({ ...m, sending: false }, sendText(msg.error));
    case "Faded":
      return [msg.what === "copied" ? m.copied?.n === msg.n ? { ...m, copied: null } : m : m.sent?.n === msg.n ? { ...m, sent: null } : m, []];
  }
}
function flash(m, text3) {
  const n = m.flash + 1;
  return [{ ...m, flash: n, sent: { n, text: text3 } }, [{ _tag: "Fade", what: "sent", n }]];
}
function write(m, id, from, to, reason) {
  return [{ ...m, menu: null, writeError: null, writing: new Map(m.writing).set(id, "running") }, [{ _tag: "Write", id, from, to, reason }]];
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
  if (m.searching) {
    return reselect({ ...m, searching: false, filters: { ...m.filters, search: "" } });
  }
  return m.pane === "detail" && !isWide(m) ? toList(m) : m;
}

// src/states.ts
var takesKeyboard = (own, focusedPane, hasKeyboard, m) => own !== null && focusedPane === own && !hasKeyboard && !m.searching && m.menu === null;
function start(host) {
  const props2 = decodeProps(host.props());
  const focus = decodeFocus(host.focused());
  const folder = props2.root ?? focus?.cwd ?? null;
  const opener = openerOf(props2.opener, focus, decodePanes(host.panes()));
  const model = initModel(opener);
  if (folder === null) {
    return { root: null, model: { ...model, error: { _tag: "NoOpener" } } };
  }
  return isRemoteTab(host.spaces(), opener.tab) ? { root: null, model: { ...model, error: { _tag: "RemoteSpace" } } } : { root: folder, model };
}
function emptyState(m, root) {
  switch (m.error?._tag) {
    case "NoOpener":
      return { title: "Open from a terminal", hint: null, retry: false };
    case "RemoteSpace":
      return { title: "Remote spaces aren't supported yet", hint: null, retry: false };
    case "NoDatabase":
      return m.snapshot === null ? { title: `No beads database in ${root ?? "this folder"}`, hint: "Run bd init in that folder to create one.", retry: true } : null;
    default:
      return null;
  }
}
var retryLabel = (loading) => loading ? "Retrying\u2026" : "Retry";
var bdText = (e) => e._tag === "Undecodable" ? `bd ${e.version ?? "(version unknown)"} gave output this viewer does not understand: ${e.path} ${e.detail}` : "text" in e ? e.text : e._tag;

// src/runner.ts
var BD_TIMEOUT_MS = 15e3;
var RETRY_DELAYS_MS = [300, 900];
var WAIT_LOAD_MS = 150;
var FADE_MS = 1200;
var FOCUS_POLL_MS = 50;
var FOCUS_POLLS = 30;
var PASTE_MS = 300;
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
  const text3 = errorText(result);
  if (text3.includes("no beads database found")) {
    return { _tag: "NoDatabase", text: text3 };
  }
  if (text3.includes("maintenance operation is running")) {
    return { _tag: "BdLocked", text: text3 };
  }
  if (/^Issue \S+ not found/m.test(text3) || /no issues? found matching/.test(text3)) {
    return { _tag: "BeadGone", text: text3 };
  }
  return { _tag: "BdRejected", code: result.code, text: text3 };
}
async function rejection(host, text3) {
  if (/took longer than .* and was stopped/.test(text3)) {
    return { _tag: "BdTimeout", text: text3 };
  }
  if (!text3.includes("cannot run ")) {
    return { _tag: "BdRejected", code: -1, text: text3 };
  }
  const bdStarts = await host.exec("bd", ["--version"], { timeout: BD_TIMEOUT_MS }).then(
    () => true,
    () => false
  );
  return bdStarts ? { _tag: "BdRejected", code: -1, text: text3 } : { _tag: "BdMissing", text: text3 };
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
    if (res.ok || res.error._tag !== "BdLocked") {
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
var exportBeads = (host, root) => bdJson(host, root, ["export"], decodeExport);
var readyIds = (host, root) => bdJson(host, root, ["ready", "-n", "0", "--json"], decodeReady);
var blockedBeads = (host, root) => bdJson(host, root, ["blocked", "--json"], decodeBlocked);
var statuses = (host, root) => bdJson(host, root, ["statuses", "--json"], decodeStatuses);
var updateStatus = (host, root, id, status2) => bd(host, root, ["update", id, "--status", status2]);
var closeBead = (host, root, id, reason) => bd(host, root, ["close", id, ...reason === "" ? [] : ["--reason", reason]]);
var reopenBead = (host, root, id) => bd(host, root, ["reopen", id]);
async function write2(host, root, { id, from, to, reason }) {
  const done = (res, second) => ({ _tag: "Written", id, to, error: res.ok ? null : res.error, second });
  if (to === "closed") {
    return done(await closeBead(host, root, id, reason), false);
  }
  if (from !== "closed") {
    return done(await updateStatus(host, root, id, to), false);
  }
  const reopened = await reopenBead(host, root, id);
  return !reopened.ok || to === "open" ? done(reopened, false) : done(await updateStatus(host, root, id, to), true);
}
async function send(host, { id, title, opener }) {
  const target = pickTarget(opener, decodePanes(host.panes()), decodeAgents(host.agents()));
  if (target === null) {
    return { _tag: "SendFailed", error: { _tag: "NoTarget" } };
  }
  const kept = host.readClipboard();
  const restore = () => {
    if (kept !== void 0) {
      host.writeClipboard(kept);
    }
  };
  try {
    host.writeClipboard(`Work on bead ${id}: ${title.replace(/\s+/g, " ").trim()}`);
    host.run("pane.focus", { terminal: target.terminal });
    for (let i = 0; decodeFocus(host.focused())?.terminal !== target.terminal; i++) {
      if (i === FOCUS_POLLS) {
        restore();
        return { _tag: "SendFailed", error: { _tag: "TargetGone" } };
      }
      await host.sleep(FOCUS_POLL_MS);
    }
    host.run("terminal.paste");
    await host.sleep(PASTE_MS);
    restore();
    return { _tag: "Sent", agent: target.name };
  } catch (e) {
    restore();
    return { _tag: "SendFailed", error: { _tag: "SendRejected", text: e instanceof Error ? e.message : String(e) } };
  }
}
async function run2(host, root, cmd) {
  switch (cmd._tag) {
    case "Load": {
      const [exported, ready, blocked] = await Promise.all([exportBeads(host, root), readyIds(host, root), blockedBeads(host, root)]);
      if (!exported.ok) {
        return { _tag: "Loaded", res: exported };
      }
      if (!ready.ok) {
        return { _tag: "Loaded", res: ready };
      }
      if (!blocked.ok) {
        return { _tag: "Loaded", res: blocked };
      }
      const locks = new Map(blocked.value.map((b) => [b.id, b.blocked_by_count]));
      return { _tag: "Loaded", res: { ok: true, value: { ...exported.value, ready: new Set(ready.value), locks } } };
    }
    case "WaitLoad":
      await host.sleep(WAIT_LOAD_MS);
      return { _tag: "Slowed", n: cmd.n };
    case "Statuses":
      return { _tag: "StatusesRead", res: await statuses(host, root) };
    case "Write":
      return write2(host, root, cmd);
    case "Copy":
      host.writeClipboard(cmd.id);
      await host.sleep(FADE_MS);
      return { _tag: "Faded", what: "copied", n: cmd.n };
    case "Send":
      return send(host, cmd);
    case "Fade":
      await host.sleep(FADE_MS);
      return { _tag: "Faded", what: cmd.what, n: cmd.n };
  }
}

// src/store.ts
var Store = class {
  model;
  closed = false;
  host;
  root;
  spawn;
  changed;
  constructor(host, root, spawn, changed, model = initModel()) {
    this.model = model;
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

// src/toggle.ts
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
function drawToggle(on, t, click, underline = true) {
  return h_flex().size_full().pr(10).items_center().bg(t.chrome).when(underline, (el) => el.border_b(1).border_color(t.border)).child(
    h_flex().id("toggle-beads").h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(click).child(svg("mods/beads/icons/task.svg").size(14)).child("Beads")
  );
}

// src/toggle-state.ts
var TOGGLE_MS = 500;
var text2 = (x) => typeof x === "string" && x !== "" ? x : null;
var field = (o, key) => typeof o === "object" && o !== null ? o[key] : void 0;
var isToggle = (props2) => field(props2, "role") === "toggle";
var hasUnderline = (props2) => field(props2, "underline") !== false;
var isKeys = (props2) => field(props2, "role") === "keys";
var overlayOf = (props2) => text2(field(props2, "overlay"));
function beadsPane(panes2, focus) {
  const tab = text2(field(focus, "tab"));
  if (tab === null || !Array.isArray(panes2)) {
    return null;
  }
  return text2(
    field(
      panes2.find((p) => field(p, "mod") === "beads" && field(p, "tab") === tab),
      "pane"
    )
  );
}
function clickToggle(host) {
  const pane = beadsPane(host.panes(), host.focused());
  if (pane === null) {
    host.run("pane.split", { direction: "right", mod: "beads" });
  } else {
    host.run("pane.close", { pane });
  }
}
function watchToggle(cx, host, state) {
  return cx.timer.every(TOGGLE_MS, () => {
    const now = beadsPane(host.panes(), host.focused());
    if (now !== state.pane) {
      state.pane = now;
      cx.notify();
    }
  });
}

// src/view.ts
import { div, svg as svg2 } from "gpui-kit";
import { h_flex as h_flex2, Input, Popover, Scrollbar, TextView, v_flex, v_virtual_list } from "gpui-base";
var icon = (name2) => `mods/beads/icons/${name2}.svg`;
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
var statusColor = (status2, t) => {
  const names = STATUS_COLOR[status2];
  return names === void 0 ? t.muted : pick2(t, ...names);
};
var STATUS_LABEL = { open: "OPEN", in_progress: "IN PROG", blocked: "BLOCKED", deferred: "DEFER", closed: "CLOSED" };
var statusLabel = (status2) => STATUS_LABEL[status2] ?? status2.toUpperCase().slice(0, 8);
var TYPE_ICON = /* @__PURE__ */ new Set(["task", "bug", "feature", "epic", "chore"]);
function button(id, label, on, t, click, chevron = false) {
  return h_flex2().id(id).h(26).px(8).gap(4).flex_none().items_center().rounded(6).border_1().border_color(on ? t.accent : t.border).text_size(12).text_color(on ? t.foreground : t.muted).when(on, (e) => e.bg(t.selected)).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).when(
    click !== null,
    (e) => e.on_click((_e, cx) => {
      cx.stop_propagation();
      click?.();
    })
  ).child(label).when(chevron, (e) => e.child(svg2(icon("chevron-down")).size(12).flex_none()));
}
function iconButton(id, name2, tip, t, click, spin = false) {
  return div().id(id).w(26).h(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).tooltip(tip).accessibility_label(tip).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
    cx.stop_propagation();
    click();
  }).child(
    svg2(icon(name2)).size(14).flex_none().when(spin, (e) => e.spin(900))
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
function searchBox(m, rows, t, dispatch, ui) {
  const count = m.snapshot === null ? "" : `${rows.length}/${m.snapshot.beads.length}`;
  return h_flex2().id("search").flex_1().min_w(120).h(30).px(8).gap(6).items_center().rounded(7).border_1().border_color(m.searching ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => dispatch({ _tag: "FocusSearch" })).child(div().flex_1().min_w(0).child(Input.new(ui.search).h_full().w_full().text_size(12))).child(div().flex_none().text_size(10).text_color(t.dim).child(count));
}
var panel = (t) => v_flex().min_w(140).py(4).rounded(8).border_1().border_color(t.border).bg(t.popover);
var option = (id, label, on, t, click) => h_flex2().id(id).h(26).px(10).gap(8).items_center().text_size(12).text_color(on ? t.accent : t.foreground).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
  cx.stop_propagation();
  click();
}).child(label);
function picker(m, name2, label, on, t, dispatch, ui) {
  const options = name2 === "status" ? statusOptions(m).map((s) => ({ label: s, on: m.filters.status === s, msg: { _tag: "SetStatus", status: s } })) : name2 === "type" ? typeOptions(m).map((s) => ({ label: s, on: m.filters.type === s, msg: { _tag: "SetType", type: s } })) : SORT_KEYS.map((k) => ({ label: SORT_LABEL(k), on: m.sort.key === k, msg: { _tag: "SortBy", key: k } }));
  return Popover.new(`menu-${name2}`).open(m.menu === name2).anchor("bottom_left").track_focus(ui.nav).flex_none().on_open_change((open) => {
    if (open !== (m.menu === name2)) {
      dispatch({ _tag: "ToggleMenu", menu: name2 });
    }
  }).trigger(button(name2, label, on || m.menu === name2, t, null, true)).content(panel(t).children(options.map((o) => option(`option-${name2}-${o.label}`, o.label, o.on, t, () => dispatch(o.msg)))));
}
function filters(m, t, dispatch, ui, narrow) {
  const f = m.filters;
  return [
    button("ready", "Ready", f.ready, t, () => dispatch({ _tag: "ToggleReady" })),
    picker(m, "status", f.status === NOT_CLOSED ? "Status" : `Status: ${f.status}`, f.status !== NOT_CLOSED, t, dispatch, ui),
    picker(m, "type", f.type === ALL ? "Type" : `Type: ${f.type}`, f.type !== ALL, t, dispatch, ui),
    div().flex_1(),
    picker(m, "sort", narrow ? "Sort" : `Sort: ${SORT_LABEL(m.sort.key)}`, false, t, dispatch, ui),
    iconButton("reverse", m.sort.reverse ? "arrow-up" : "arrow-down", "Reverse the sort", t, () => dispatch({ _tag: "Reverse" }))
  ];
}
function topBar(m, rows, t, dispatch, ui, short) {
  const refresh = iconButton("refresh", "refresh", "Refresh (Ctrl+R)", t, () => dispatch({ _tag: "Refresh" }), m.loading);
  return v_flex().flex_none().px(8).pt(8).pb(6).gap(6).border_b(1).border_color(t.border).child(
    h_flex2().gap(6).items_center().child(searchBox(m, rows, t, dispatch, ui)).child(refresh)
  ).child(
    h_flex2().gap(6).items_center().children(filters(m, t, dispatch, ui, short))
  );
}
function row(b, m, t, narrow, now, idW, mono) {
  const closed = b.status === "closed";
  const selected = b.id === (shownId(m) ?? m.selected);
  const dim = (c) => closed ? t.muted : c;
  const locks = m.snapshot?.locks.get(b.id) ?? 0;
  const status2 = statusColor(b.status, t);
  return h_flex2().id(b.id).w_full().h(ROW_H).flex_none().pr(10).gap(6).items_center().text_size(12).cursor_pointer().text_color(closed ? t.muted : t.foreground).when(selected, (e) => e.bg(pick2(t, "surface0", "raised"))).hover((s) => s.bg(t.hover)).child(
    div().w(2).h_full().flex_none().when(selected, (e) => e.bg(t.accent))
  ).when(
    !narrow,
    (e) => e.child(
      svg2(icon(TYPE_ICON.has(b.issue_type) ? b.issue_type : "task")).size(14).flex_none().text_color(closed ? t.muted : t.dim)
    )
  ).child(
    div().w(16).flex_none().text_size(11).font_semibold().text_color(dim(priorityColor(b.priority, t))).child(`P${b.priority}`)
  ).child(narrow ? div().w(8).h(8).flex_none().rounded(4).bg(dim(status2)) : div().w(56).flex_none().text_size(10).font_semibold().text_color(dim(status2)).child(statusLabel(b.status))).child(
    div().w(idW * 7).flex_none().truncate().font_family(mono).text_size(11).text_color(t.muted).child(b.id)
  ).child(div().flex_1().min_w(0).truncate().child(b.title)).when(
    locks > 0,
    (e) => e.child(
      h_flex2().gap(2).flex_none().items_center().text_size(11).text_color(closed ? t.muted : peach(t)).child(svg2(icon("lock")).size(11)).child(`${locks}`)
    )
  ).when(m.width >= NO_AGE_BELOW, (e) => e.child(div().w(26).flex_none().text_size(11).text_color(t.muted).text_right().child(age(b.created_at, now))));
}
function listColumn(m, rows, t, dispatch, ui, narrow, now) {
  const idW = idChars(rows);
  return div().flex_1().min_h(0).relative().child(
    rows.length === 0 ? div().p(14).text_color(t.muted).child(
      m.snapshot === null ? m.slow ? h_flex2().gap(8).items_center().child(svg2(icon("refresh")).size(14).flex_none().spin(900)).child("Loading beads") : "" : "No beads match"
    ) : (
      // Only the rows on screen are built, so a thousand beads cost what twenty do.
      v_virtual_list(
        "beads-list",
        rows.length,
        ROW_H,
        (i) => rows[i]?.id ?? `row:${i}`,
        (range) => rows.slice(range.start, range.end).map((b) => row(b, m, t, narrow, now, idW, ui.mono))
      ).absolute().inset_0().track_scroll(ui.scroll).on_item_click((id) => dispatch({ _tag: "Click", id }))
    )
  ).child(Scrollbar.vertical("beads-list").absolute().inset_0());
}
var KEYS = [
  ["j k  \u2193 \u2191", "Move the selection"],
  ["\u21B5", "Open the detail (narrow)"],
  ["Esc", "Back to the list (narrow), clear the search, close a menu"],
  ["[ ]", "Back and forward in the history"],
  ["s", "Change the status of the shown bead"],
  ["y", "Copy the shown bead's id"],
  ["/", "Search"],
  ["Ctrl+R", "Refresh"],
  ["?", "Show these keys"]
];
function keysDialog(t, mono, nav, close) {
  return v_flex().id("keys").size_full().p(16).gap(8).track_focus(nav).on_key_down((ev, cx) => {
    if (["escape", "?", "shift-/", "shift-?"].includes(ev.keystroke)) {
      cx.stop_propagation();
      close();
    }
  }).text_size(12).text_color(t.foreground).child(h_flex2().pb(4).items_center().child(div().flex_1().font_semibold().child("Keys")).child(div().text_size(11).text_color(t.dim).child("Esc to close"))).children(KEYS.map(([k, what]) => h_flex2().gap(12).child(div().w(90).flex_none().font_family(mono).text_size(11).text_color(t.accent).child(k)).child(div().flex_1().min_w(0).text_color(t.muted).child(what))));
}
var heading = (label, t) => div().text_size(11).font_semibold().text_color(t.muted).child(label.toUpperCase());
var section = (label, t, ...body) => v_flex().gap(4).flex_none().child(heading(label, t)).children(body);
var markdown = (id, text3) => TextView.markdown(id, taskLists(text3)).selectable(true).scrollable(false).w_full().min_w(0);
var red = (t) => pick2(t, "red", "ansi1");
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
  return h_flex2().h(ROW_H).flex_none().gap(6).items_center().text_size(12).child(
    h_flex2().flex_none().children([...r.guides.map((on) => on ? line(div().w(GUIDE).h(ROW_H).flex_none()) : div().w(GUIDE).h(ROW_H).flex_none()), own])
  ).child(div().w(8).h(8).flex_none().rounded(4).bg(statusColor(r.status, t))).child(
    div().id(key).flex_none().font_family(mono).text_size(11).text_color(t.accent).cursor_pointer().hover((s) => s.underline()).on_click((_e, cx) => {
      cx.stop_propagation();
      dispatch({ _tag: "Jump", id: r.id });
    }).child(r.id)
  ).child(div().flex_1().min_w(0).truncate().child(r.title)).child(div().flex_none().text_size(11).text_color(t.muted).child(r.edge));
}
function tree(label, part, nodes, empty, t, dispatch, mono) {
  const rows = treeRows(nodes);
  return [section(`${label} (${rows.length})`, t, ...rows.length === 0 ? [div().text_size(12).text_color(t.muted).child(empty)] : rows.map((r, i) => treeRow(r, `${part}-${i}`, t, dispatch, mono)))];
}
function statusPill(b, m, t, dispatch, ui) {
  const color = statusColor(b.status, t);
  const busy = m.writing.has(b.id);
  const pill = h_flex2().id("status-pill").gap(3).px(6).items_center().rounded(4).border_1().border_color(color).text_size(10).font_semibold().text_color(color).opacity(busy ? 0.6 : 1).when(busy, (e) => e.child(svg2(icon("refresh")).size(10).flex_none().spin(900))).child(statusLabel(b.status)).when(
    !busy,
    (e) => e.child(svg2(icon("chevron-down")).size(10).flex_none()).tooltip("Change status (s)").cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected))
  );
  const shown = !busy && (m.menu === "pick" || m.menu === "reason");
  return Popover.new("menu-pick").open(shown).anchor("bottom_left").track_focus(ui.nav).flex_none().on_open_change((open) => {
    if (open !== shown) {
      dispatch({ _tag: "ToggleMenu", menu: "pick" });
    }
  }).trigger(pill).when(!busy && m.menu === "pick", (e) => e.content(panel(t).children(pickOptions(m, b.status).map((s) => option(`option-pick-${s}`, s, s === b.status, t, () => dispatch({ _tag: "Pick", status: s })))))).when(
    !busy && m.menu === "reason",
    (e) => e.content(
      panel(t).w(240).p(8).gap(6).child(div().text_size(11).text_color(t.muted).child("Reason for closing (optional)")).child(
        div().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(ui.reason).h(26).w_full().text_size(12))
      ).child(
        h_flex2().gap(6).justify_end().child(button("close-cancel", "Cancel", false, t, () => dispatch({ _tag: "Escape" }))).child(button("close-confirm", "Close bead", true, t, () => dispatch({ _tag: "CloseWith", reason: ui.reason.value() })))
      )
    )
  );
}
var FADE = { duration: 120, easing: "ease-out" };
function crossfade(a, b, showB, colorB) {
  const layer = (text3, on, color) => {
    const e = div().absolute().inset_0().flex().items_center().justify_center().whitespace_nowrap().opacity(on ? 1 : 0).transition("opacity", FADE);
    return (color === void 0 ? e : e.text_color(color)).child(text3);
  };
  return div().relative().flex_none().child(
    div().opacity(0).whitespace_nowrap().child(b.length > a.length ? b : a)
  ).child(layer(a, !showB)).child(layer(b, showB, colorB));
}
function copyButton(b, m, t, dispatch) {
  const copied = m.copied?.id === b.id;
  return div().id("copy-id").px(3).flex_none().rounded(4).text_color(t.muted).tooltip(copied ? "Copied" : "Copy id (y)").accessibility_label("Copy id").cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
    cx.stop_propagation();
    dispatch({ _tag: "Copy" });
  }).child(crossfade("\u29C9", "\u2713 Copied", copied, pick2(t, "green", "ansi2")));
}
function sendButton(m, t, dispatch, ui) {
  const on = ui.target !== null;
  return h_flex2().id("send-to-agent").h(26).px(8).flex_none().items_center().rounded(6).border_1().border_color(t.border).text_size(12).text_color(on ? t.foreground : t.muted).opacity(on ? 1 : 0.5).tooltip(ui.target === null ? "No agent in this tab" : `Type the prompt into ${ui.target.name}, without Enter`).accessibility_label("Send to agent").when(
    on,
    (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
      cx.stop_propagation();
      dispatch({ _tag: "Send" });
    })
  ).child(crossfade("Send to agent", m.sent?.text ?? "", m.sent !== null));
}
function metaRow(b, m, t, dispatch, ui, now) {
  const ago = age(b.created_at, now);
  return h_flex2().flex_wrap().gap_x(10).gap_y(4).items_center().text_size(12).child(
    h_flex2().gap(2).items_center().flex_none().child(div().font_family(ui.mono).text_size(12).text_color(t.muted).child(b.id)).child(copyButton(b, m, t, dispatch))
  ).child(statusPill(b, m, t, dispatch, ui)).child(div().text_size(11).font_semibold().text_color(priorityColor(b.priority, t)).child(`P${b.priority}`)).when(b.assignee !== null, (e) => e.child(div().text_color(t.muted).child(`@${b.assignee}`))).child(
    div().id("age").text_color(t.muted).tooltip(`Created ${fullDate(b.created_at)}`).child(ago === "now" ? ago : `${ago} ago`)
  );
}
var writeText = (w) => w.second === null ? bdText(w.error) : `bd reopen worked, but bd update --status ${w.second} failed: ${bdText(w.error)}`;
function beadBody(d, s, m, hidden, t, dispatch, ui, now) {
  const sorted = [...d.comments].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [
    h_flex2().gap(8).items_start().flex_none().child(
      svg2(icon(TYPE_ICON.has(d.issue_type) ? d.issue_type : "task")).size(18).flex_none().text_color(t.dim)
    ).child(div().flex_1().min_w(0).max_h(40).overflow_hidden().text_size(16).line_height(1.25).font_semibold().child(d.title)),
    ...hidden ? [div().flex_none().text_size(12).text_color(t.muted).child("Hidden by the current filters")] : [],
    metaRow(d, m, t, dispatch, ui, now),
    ...m.writeError?.id === d.id ? [div().flex_none().text_size(12).text_color(red(t)).child(writeText(m.writeError))] : [],
    h_flex2().gap(8).items_start().flex_none().child(
      h_flex2().flex_1().min_w(0).flex_wrap().gap(4).children(
        d.labels.map(
          (l) => div().px(6).py(1).rounded(4).bg(pick2(t, "surface0", "raised")).text_size(11).text_color(t.muted).child(l)
        )
      )
    ).child(sendButton(m, t, dispatch, ui)),
    ...textSections(d).map(([label, text3]) => section(label, t, markdown(`md-${d.id}-${label}`, text3))),
    ...tree("Blocked by", "down", depTree(s, d.id, "down"), "Nothing blocks this bead.", t, dispatch, ui.mono),
    ...tree("Blocks", "up", depTree(s, d.id, "up"), "This bead blocks nothing.", t, dispatch, ui.mono),
    ...sorted.length === 0 ? [] : [
      section(
        `Comments (${sorted.length})`,
        t,
        ...sorted.map(
          (c) => v_flex().gap(2).flex_none().child(
            h_flex2().gap(8).items_center().text_size(12).child(div().font_semibold().child(c.author)).child(div().id(`comment-age-${c.id}`).text_size(11).text_color(t.muted).tooltip(fullDate(c.created_at)).child(age(c.created_at, now)))
          ).child(markdown(`md-${d.id}-c-${c.id}`, c.text))
        )
      )
    ]
  ];
}
function detailBody(m, rows, t, dispatch, ui, now) {
  const id = shownId(m);
  const note = (text3) => div().flex_none().text_size(12).text_color(t.muted).child(text3);
  if (id === null) {
    return [note("Select a bead")];
  }
  const [bead2, s] = [shownBead(m), m.snapshot];
  if (bead2 === null || s === null) {
    return [
      note(`${id} no longer exists`),
      h_flex2().flex_none().child(button("refresh-gone", "Refresh", false, t, () => dispatch({ _tag: "Refresh" })))
    ];
  }
  return beadBody(bead2, s, m, hiddenByFilters(m, rows), t, dispatch, ui, now);
}
function detailPane(m, rows, t, dispatch, ui, narrow, now) {
  const scroll = `detail-${shownId(m) ?? "none"}`;
  return v_flex().flex_1().min_w(0).min_h(0).when(!narrow, (e) => e.border_l(1).border_color(t.border)).child(
    h_flex2().h(36).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border).when(
      narrow,
      (e) => e.child(
        h_flex2().id("back").h(26).pl(4).pr(8).gap(2).items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "BackToList" });
        }).child(svg2(icon("chevron-left")).size(14).flex_none()).child("List")
      )
    ).child(walkButton("history-back", "\u2039", "Back ([)", m.back.length > 0, t, () => dispatch({ _tag: "Walk", delta: -1 }))).child(walkButton("history-forward", "\u203A", "Forward (])", m.forward.length > 0, t, () => dispatch({ _tag: "Walk", delta: 1 })))
  ).child(
    div().flex_1().min_h(0).relative().child(
      v_flex().id(scroll).absolute().inset_0().overflow_y_scroll().p(14).gap(10).children(detailBody(m, rows, t, dispatch, ui, now))
    ).child(Scrollbar.vertical(scroll).absolute().inset_0())
  );
}
function footer(m, rows, t, wide) {
  const s = m.snapshot;
  const counts = s === null ? "" : `${s.ready.size} ready`;
  return h_flex2().h(26).flex_none().px(12).gap(12).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.muted).child(div().flex_1().min_w(0).truncate().child(counts)).child(
    div().flex_none().child(wide ? "/ search \xB7 \u21B5 open \xB7 ? keys" : "\u21B5 open")
  );
}
function emptyView(title, hint, retry, loading, t, dispatch) {
  return v_flex().flex_1().min_h(0).p(14).gap(8).items_center().justify_center().text_center().child(div().text_color(t.muted).child(title)).when(
    hint !== null,
    (e) => e.child(
      div().text_size(12).text_color(t.dim).child(hint ?? "")
    )
  ).when(retry, (e) => e.child(button("retry-load", retryLabel(loading), false, t, () => dispatch({ _tag: "Refresh" })).opacity(loading ? 0.6 : 1)));
}
var errorText2 = (m) => m.error === null ? null : bdText(m.error);
function draw(m, rows, t, dispatch, ui, now) {
  const wide = isWide(m);
  const detailFull = !wide && m.pane === "detail";
  const error = errorText2(m);
  const empty = emptyState(m, ui.root);
  return v_flex().id("beads").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(13).track_focus(ui.nav).on_size_change((size) => dispatch({ _tag: "Resized", width: Math.round(size.width) })).on_key_down((ev, cx) => {
    const msg = keyFor(m, ev.keystroke);
    if (msg !== null) {
      dispatch(msg);
      cx.stop_propagation();
    }
  }).when(empty !== null, (e) => e.child(emptyView(empty?.title ?? "", empty?.hint ?? null, empty?.retry ?? false, m.loading, t, dispatch))).when(empty === null && detailFull, (e) => e.child(detailPane(m, rows, t, dispatch, ui, true, now))).when(
    empty === null && !detailFull,
    (e) => e.child(
      wide ? h_flex2().flex_1().min_h(0).items_stretch().child(list(m, rows, t, dispatch, ui, error, now, true).w(listWidth(m.width)).flex_none()).child(detailPane(m, rows, t, dispatch, ui, false, now)) : list(m, rows, t, dispatch, ui, error, now, false).flex_1()
    ).child(footer(m, rows, t, wide))
  );
}
function list(m, rows, t, dispatch, ui, error, now, wide) {
  return v_flex().min_h(0).child(topBar(m, rows, t, dispatch, ui, !wide || listWidth(m.width) < 480)).when(
    error !== null,
    (x) => x.child(
      h_flex2().px(12).py(6).gap(8).items_center().flex_none().text_size(12).child(
        div().flex_1().min_w(0).text_color(pick2(t, "red", "ansi1")).child(error ?? "")
      ).child(button("retry-load", "Retry", false, t, () => dispatch({ _tag: "Refresh" })))
    )
  ).child(listColumn(m, rows, t, dispatch, ui, !wide, now));
}

// src/main.ts
var KEYBOARD_MS = 200;
var keysOpen = 0;
var BeadsView = class extends View {
  store;
  root = null;
  host;
  cx;
  nav;
  search;
  reason;
  scroll;
  // The row of the selected bead the list was last told to show; -1 when it has to be told again.
  shownAt = -1;
  mono = "";
  // Set only on the tab-bar button's copy (props role "toggle"): the Viewer it last saw in the focused tab.
  toggle;
  // The toggle copy's pane watch, or the Viewer's keyboard watch; cancelled on close.
  poll;
  // The Viewer's own pane in herdr, once known (see focusNav).
  own = null;
  // Set only on the keys dialog's copy (props role "keys"): the overlay id it closes itself with.
  keys;
  init(_props, cx) {
    this.cx = cx;
    this.host = realHost(cx);
    if (isToggle(this.host.props())) {
      this.toggle = { pane: beadsPane(this.host.panes(), this.host.focused()) };
      this.poll = watchToggle(cx, this.host, this.toggle);
      return;
    }
    if (isKeys(this.host.props())) {
      this.keys = overlayOf(this.host.props());
      keysOpen++;
      this.mono = decodeFont(this.host.settings());
      this.nav = cx.focus_handle();
      this.nav.focus();
      cx.timer.after(300, () => this.nav.focus());
      return;
    }
    const { root, model } = start(this.host);
    this.root = root;
    this.store = new Store(
      this.host,
      this.root,
      (job) => cx.spawn(job),
      (before, model2, msg) => {
        this.sync(before, model2, msg);
        this.cx.notify();
      },
      model
    );
    this.mono = decodeFont(this.host.settings());
    this.nav = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.search = InputState.new({ placeholder: "Search (/)" });
    this.search.on("change", () => this.dispatch({ _tag: "Search", text: this.search.value() }));
    this.search.on("submit", () => this.dispatch({ _tag: "Enter" }));
    this.search.on("focus", () => this.dispatch({ _tag: "SearchFocused", on: true }));
    this.search.on("blur", () => this.dispatch({ _tag: "SearchFocused", on: false }));
    this.reason = InputState.new({ placeholder: "Reason" });
    this.reason.on("submit", () => this.dispatch({ _tag: "CloseWith", reason: this.reason.value() }));
    cx.spawn(() => this.listen());
    this.focusNav();
    this.poll = cx.timer.every(KEYBOARD_MS, () => {
      if (!this.store.closed && keysOpen === 0 && takesKeyboard(this.own, decodeFocus(this.host.focused())?.pane ?? null, this.nav.is_focused(), this.store.model)) {
        this.nav.focus();
      }
    });
    if (this.root !== null) {
      this.dispatch({ _tag: "Refresh" });
      this.dispatch({ _tag: "ReadStatuses" });
    }
  }
  // pane.go gives a shown copy the keyboard by sending "focus".
  async listen() {
    while (!this.store.closed) {
      try {
        if (await this.host.nextCommand() === "focus" && !this.store.closed) {
          this.focusNav();
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  // The keyboard to the Viewer, and again once the root is drawn with its handle, as herdr-review does. herdr's focus is
  // on this pane whenever this runs for an open or a "focus", so that is when the Viewer learns which pane is its own.
  focusNav() {
    this.nav.focus();
    this.cx.timer.after(300, () => {
      if (this.store.closed) {
        return;
      }
      const f = decodeFocus(this.host.focused());
      if (f !== null && f.terminal === null && f.pane !== null) {
        this.own = f.pane;
      }
      if (!this.store.model.searching && this.store.model.menu === null && keysOpen === 0) {
        this.nav.focus();
      }
    });
  }
  dispatch(msg) {
    if (msg._tag === "ShowKeys" && keysOpen === 0) {
      this.host.openOverlay({ mod: "beads", props: { role: "keys" }, kind: "dialog", width: 460, height: 320 });
    }
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
    if (model.menu === "reason" && before.menu !== "reason") {
      this.reason.set_value("");
      this.reason.focus();
    } else if ((before.menu === "pick" || before.menu === "reason") && model.menu === null) {
      this.nav.focus();
    }
    if (before.pane === "detail" && model.pane === "list") {
      this.shownAt = -1;
    }
    const at = visible(model).findIndex((b) => b.id === model.selected);
    if (at >= 0 && at !== this.shownAt) {
      this.scroll.scroll_to_item(at);
    }
    this.shownAt = at;
  }
  render(_cx) {
    const t = this.host.theme();
    if (this.toggle !== void 0) {
      return drawToggle(this.toggle.pane !== null, t, () => clickToggle(this.host), hasUnderline(this.host.props()));
    }
    if (this.keys !== void 0) {
      const id = this.keys;
      return keysDialog(t, this.mono, this.nav, () => id === null ? null : this.host.closeOverlay(id));
    }
    const target = pickTarget(this.store.model.opener, decodePanes(this.host.panes()), decodeAgents(this.host.agents()));
    const ui = { target, root: this.root, nav: this.nav, search: this.search, reason: this.reason, scroll: this.scroll, mono: this.mono };
    return draw(this.store.model, visible(this.store.model), t, (msg) => this.dispatch(msg), ui, Date.now());
  }
  // Bounded: set the flag and let the replies in flight be dropped.
  close(_cx) {
    this.poll?.cancel();
    if (this.toggle !== void 0) {
      return;
    }
    if (this.keys !== void 0) {
      keysOpen--;
      return;
    }
    this.store.close();
    this.search.release();
    this.reason.release();
    this.scroll.release();
  }
};
export {
  BeadsView as default
};
