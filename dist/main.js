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
  }
}

// src/update.ts
var initModel = () => ({ snapshot: null, loading: false, error: null, filters: initFilters(), sort: initSort(), selected: null, width: 0, pane: "list", searching: false, menu: null, help: false });
function update(m, msg) {
  switch (msg._tag) {
    case "Refresh":
      return m.loading ? [m, []] : [{ ...m, loading: true }, [{ _tag: "Load" }]];
    case "Loaded":
      return [msg.res.ok ? reselect({ ...m, loading: false, error: null, snapshot: msg.res.value }) : { ...m, loading: false, error: msg.res.error }, []];
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
      return [{ ...m, selected: msg.id }, []];
    case "Move":
      return [m.pane === "list" && !m.help ? move(m, msg.delta) : m, []];
    case "Click":
      return [{ ...m, selected: msg.id, menu: null, searching: false, pane: isWide(m) ? "list" : "detail" }, []];
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
      return [{ ...m, pane: "list", help: false }, []];
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
  }
}
function move(m, delta) {
  const rows = visible(m);
  const at = rows.findIndex((b) => b.id === m.selected);
  const next = rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + delta))];
  return next === void 0 || next.id === m.selected ? m : { ...m, selected: next.id };
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
  return m.pane === "detail" && !isWide(m) ? { ...m, pane: "list" } : m;
}

// src/view.ts
import { div, svg, uniform_list } from "gpui-kit";
import { h_flex, Input, Popup, Scrollbar, v_flex } from "gpui-base";
var icon = (name) => `mods/beads/icons/${name}.svg`;
var pick = (t, ...keys) => {
  const found = keys.find((k) => t[k] !== void 0);
  return t[found ?? "muted"] ?? t.foreground;
};
function peach(t) {
  if (t.peach !== void 0) {
    return t.peach;
  }
  const [a, b] = [pick(t, "ansi1"), pick(t, "ansi3")];
  const mix = (i) => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? `#${mix(1)}${mix(3)}${mix(5)}` : b;
}
function priorityColor(p, t) {
  return p <= 0 ? pick(t, "red", "ansi1") : p === 1 ? peach(t) : p === 2 ? pick(t, "yellow", "ansi3") : p === 3 ? pick(t, "blue", "ansi4") : t.muted;
}
var STATUS_COLOR = { open: ["green", "ansi2"], in_progress: ["blue", "ansi4"], blocked: ["red", "ansi1"] };
var statusColor = (status, t) => {
  const names = STATUS_COLOR[status];
  return names === void 0 ? t.muted : pick(t, ...names);
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
  const selected = b.id === m.selected;
  const dim = (c) => closed ? t.muted : c;
  const locks = m.snapshot?.locks.get(b.id) ?? 0;
  const status = statusColor(b.status, t);
  return h_flex().id(b.id).w_full().h(ROW_H).flex_none().pr(10).gap(6).items_center().text_size(12).cursor_pointer().text_color(closed ? t.muted : t.foreground).when(selected, (e) => e.bg(pick(t, "surface0", "raised"))).hover((s) => s.bg(t.hover)).child(
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
  ["/", "Search"],
  ["Ctrl+R", "Refresh"],
  ["?", "Show or hide these keys"]
];
function keysPanel(t, mono) {
  return v_flex().flex_1().min_h(0).p(14).gap(6).text_size(12).child(div().font_semibold().child("Keys")).children(KEYS.map(([k, what]) => h_flex().gap(12).child(div().w(90).flex_none().font_family(mono).text_size(11).text_color(t.accent).child(k)).child(div().flex_1().min_w(0).text_color(t.muted).child(what))));
}
function detailPane(m, t, dispatch, ui, narrow) {
  const bead2 = m.snapshot?.beads.find((b) => b.id === m.selected);
  return v_flex().flex_1().min_w(0).min_h(0).when(!narrow, (e) => e.border_l(2).border_color(m.pane === "detail" ? t.accent : t.border)).when(
    narrow,
    (e) => e.child(
      h_flex().h(36).flex_none().px(8).items_center().border_b(1).border_color(t.border).child(
        h_flex().id("back").h(26).pl(4).pr(8).gap(2).items_center().rounded(6).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).active((s) => s.bg(t.selected)).on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "BackToList" });
        }).child(svg(icon("chevron-left")).size(14).flex_none()).child("List")
      )
    )
  ).child(
    m.help ? keysPanel(t, ui.mono) : div().p(14).text_size(bead2 === void 0 ? 12 : 16).when(bead2 !== void 0, (e) => e.font_semibold()).text_color(bead2 === void 0 ? t.muted : t.foreground).child(bead2?.title ?? "Select a bead")
  );
}
function footer(m, rows, t, wide) {
  const s = m.snapshot;
  const counts = s === null ? "" : wide ? `${rows.length} of ${s.beads.length} \xB7 ${s.ready.size} ready` : `${rows.length} of ${s.beads.length}`;
  return h_flex().h(26).flex_none().px(12).gap(12).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.muted).child(div().flex_1().min_w(0).truncate().child(counts)).child(
    div().flex_none().child(wide ? "/ search \xB7 \u21B5 open \xB7 ? keys" : "\u21B5 open")
  );
}
var errorText2 = (m) => m.error === null ? null : "text" in m.error ? m.error.text : m.error.detail;
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
  }).when(detailFull, (e) => e.child(detailPane(m, t, dispatch, ui, true))).when(
    !detailFull,
    (e) => e.child(topBar(m, t, dispatch, ui, wide)).when(
      error !== null,
      (x) => x.child(
        div().px(12).py(6).flex_none().text_size(12).text_color(pick(t, "red", "ansi1")).child(error ?? "")
      )
    ).child(
      m.help ? keysPanel(t, ui.mono) : wide ? h_flex().flex_1().min_h(0).child(
        v_flex().w(listWidth(m.width)).h_full().flex_none().child(listColumn(m, rows, t, dispatch, ui, false, now))
      ).child(detailPane(m, t, dispatch, ui, false)) : listColumn(m, rows, t, dispatch, ui, true, now)
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
  model = initModel();
  closed = false;
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
    while (!this.closed) {
      try {
        if (await this.host.nextCommand() === "focus" && !this.closed) {
          this.nav.focus();
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  dispatch(msg) {
    if (this.closed) {
      return;
    }
    const before = this.model;
    const [model, cmds] = update(before, msg);
    this.model = model;
    if (model !== before) {
      this.sync(before, model, msg);
      this.cx.notify();
    }
    for (const cmd of cmds) {
      this.start(cmd);
    }
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
    const at = this.rows(model).findIndex((b) => b.id === model.selected);
    if (at >= 0 && (this.seen === null || at < this.seen[0] || at >= this.seen[1])) {
      this.scroll.scroll_to_item(at);
    }
  }
  start(cmd) {
    const root = this.root;
    if (root === null) {
      return;
    }
    this.cx.spawn(async () => {
      const reply = await run2(this.host, root, cmd);
      this.dispatch(reply);
    });
  }
  render(_cx) {
    const t = this.host.theme();
    if (this.root === null) {
      return div2().size_full().p(14).bg(t.background).text_color(t.muted).child("Open from a terminal");
    }
    const ui = { nav: this.nav, search: this.search, scroll: this.scroll, mono: this.mono, seen: (start, end) => this.seen = [start, end] };
    return draw(this.model, this.rows(this.model), t, (msg) => this.dispatch(msg), ui, Date.now());
  }
  // Bounded: set the flag and let the replies in flight be dropped.
  close(_cx) {
    this.closed = true;
    this.search.release();
    this.scroll.release();
  }
};
export {
  BeadsView as default
};
