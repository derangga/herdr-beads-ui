// The reducer: (Model, Msg) -> (Model, Cmd[]). Pure. Single flight: a refresh during a load is dropped.
import { BUILT_IN_STATUSES, initFilters, initSort, isWide, reselect, shownBead, shownId, visible } from "./rows.ts";
import type { Cmd, Detail, Model, Msg, Part, PartName, Res, Timer } from "./types.ts";

export const initModel = (): Model => ({
  snapshot: null,
  loading: false,
  error: null,
  filters: initFilters(),
  sort: initSort(),
  selected: null,
  shown: null,
  back: [],
  forward: [],
  details: new Map(),
  gen: 0,
  width: 0,
  pane: "list",
  searching: false,
  menu: null,
  help: false,
  statuses: BUILT_IN_STATUSES,
  writing: new Map(),
  writeError: null,
  reload: false,
});

// A load fills the list, so the viewer opens by sending Refresh. After every message the shown bead's detail is started if it is missing.
export function update(m: Model, msg: Msg): [Model, Cmd[]] {
  const [next, cmds] = step(m, msg);
  // A failed write's error stays until the next action: another bead on show, or a new write or picker.
  const [settled, more] = settle(next.writeError !== null && next.writeError.id !== shownId(next) ? { ...next, writeError: null } : next);
  return [settled, more.length === 0 ? cmds : [...cmds, ...more]];
}

const PARTS: PartName[] = ["show", "down", "up", "comments"];
const toPart = <T>(res: Res<T>): Part<T> => (res.ok ? { _tag: "Ready", value: res.value } : { _tag: "Failed", error: res.error });
const prevOf = <T>(p: Part<T> | undefined): T | null => (p?._tag === "Ready" ? p.value : p?._tag === "Loading" ? p.prev : null);
const isLoading = (d: Detail): boolean => PARTS.some((p) => d[p]._tag === "Loading");
const fetch = (id: string, part: PartName, gen: number): Cmd => ({ _tag: "Fetch", id, part, gen });
const wait = (id: string, gen: number, timer: Timer): Cmd => ({ _tag: "Wait", id, gen, timer });

// Every call of a bead's detail under one request number. `old` is what the bead showed before a reload. A bead that has just
// been shown waits before asking bd, so passing over it costs nothing; a reload asks at once.
function begin(id: string, gen: number, old: Detail | undefined, debounce: boolean): [Detail, Cmd[]] {
  const loading = <T>(p: Part<T> | undefined): Part<T> => ({ _tag: "Loading", prev: prevOf(p), gen });
  const detail: Detail = { show: loading(old?.show), down: loading(old?.down), up: loading(old?.up), comments: loading(old?.comments), slow: false };
  return [detail, [...(debounce ? [wait(id, gen, "fetch")] : PARTS.map((part) => fetch(id, part, gen))), wait(id, gen, "loading")]];
}

// The entry of the shown bead whose `part` is still waiting for request `gen`. A reply or timer of an earlier request, or for a
// bead that is no longer shown, finds none and is dropped.
function waiting(m: Model, id: string, part: PartName, gen: number): Detail | undefined {
  const d = m.details.get(id);
  const p = d?.[part];
  return d !== undefined && id === shownId(m) && p?._tag === "Loading" && p.gen === gen ? d : undefined;
}

function patch(m: Model, id: string, part: PartName, gen: number, change: Partial<Detail>): Model {
  const d = waiting(m, id, part, gen);
  return d === undefined ? m : { ...m, details: new Map(m.details).set(id, { ...d, ...change }) };
}

// Calls of a bead that is no longer shown are abandoned, so it is fetched afresh when it comes back; finished ones stay cached.
function settle(m: Model): [Model, Cmd[]] {
  const id = shownId(m);
  const keep = [...m.details].filter(([k, d]) => k === id || !isLoading(d));
  if (keep.length === m.details.size && (id === null || m.details.has(id))) {
    return [m, []];
  }
  const details = new Map(keep);
  if (id === null || details.has(id)) {
    return [{ ...m, details }, []];
  }
  const gen = m.gen + 1;
  const [d, cmds] = begin(id, gen, undefined, true);
  return [{ ...m, gen, details: details.set(id, d) }, cmds];
}

// A list action puts the detail back on the selected bead, whatever a link had shown.
const pick = (m: Model, id: string): Model => ({ ...m, selected: id, shown: null });

// Shows a bead by link or from the history. The list selects it when its filters let it through, else it keeps its selection and the
// bead is shown beside it (the detail says it is hidden).
const land = (m: Model, id: string): Model => (visible(m).some((b) => b.id === id) ? pick(m, id) : { ...m, shown: id });

// The detail that fills the Viewer closes, and with it the history of that visit.
const toList = (m: Model): Model => ({ ...m, pane: "list", shown: null, back: [], forward: [] });

function step(m: Model, msg: Msg): [Model, Cmd[]] {
  switch (msg._tag) {
    case "Refresh":
      return m.loading ? [m, []] : [{ ...m, loading: true }, [{ _tag: "Load" }]];
    case "Loaded": {
      if (m.reload) {
        return [{ ...m, reload: false }, [{ _tag: "Load" }]];
      }
      // A failed load keeps the last good list and records the error.
      const writing = new Map([...m.writing].filter(([, s]) => s === "running"));
      if (!msg.res.ok) {
        return [{ ...m, loading: false, error: msg.res.error, writing }, []];
      }
      // The beads may have changed, so no cached detail is kept; the shown one reloads under what it showed.
      const next = reselect({ ...m, loading: false, error: null, snapshot: msg.res.value, writing });
      const id = shownId(next);
      if (id === null) {
        return [{ ...next, details: new Map() }, []];
      }
      const gen = m.gen + 1;
      const [d, cmds] = begin(id, gen, m.details.get(id), false);
      return [{ ...next, gen, details: new Map([[id, d]]) }, cmds];
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
      // The keys panel covers the list, so a move would change a selection nobody can see.
      return [m.pane === "list" && !m.help ? move(m, msg.delta) : m, []];
    case "Click":
      // A click opens the detail when it fills the Viewer, and only selects when the list sits beside it.
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
      if (cur === null || id === undefined || m.help) {
        return [m, []];
      }
      return [land({ ...m, ...(msg.delta < 0 ? { back: m.back.slice(0, -1), forward: [...m.forward, cur] } : { back: [...m.back, cur], forward: m.forward.slice(0, -1) }) }, id), []];
    }
    case "Resized":
      // Only the width: the selection, the filters, the search and the pane stay, so crossing a breakpoint redraws the same state.
      return [msg.width === m.width ? m : { ...m, width: msg.width }, []];
    case "FocusSearch":
      return [{ ...m, searching: true, menu: null, help: false, pane: "list" }, []];
    case "SearchFocused":
      return [msg.on === m.searching ? m : { ...m, searching: msg.on }, []];
    case "ToggleMenu": {
      if (msg.menu === "pick") {
        // Only a bead the pill is drawn for, and not while bd writes it.
        const b = shownBead(m);
        if (b === null || m.help || m.writing.has(b.id)) {
          return [m, []];
        }
        return [{ ...m, menu: m.menu === "pick" || m.menu === "reason" ? null : "pick", writeError: null }, []];
      }
      return [{ ...m, menu: m.menu === msg.menu ? null : msg.menu }, []];
    }
    case "ToggleHelp":
      return [{ ...m, help: !m.help, menu: null }, []];
    case "Shown":
      return [patch(m, msg.id, "show", msg.gen, { show: toPart(msg.res) }), []];
    case "Tree":
      return [patch(m, msg.id, msg.direction, msg.gen, msg.direction === "down" ? { down: toPart(msg.res) } : { up: toPart(msg.res) }), []];
    case "Discussed":
      return [patch(m, msg.id, "comments", msg.gen, { comments: toPart(msg.res) }), []];
    case "Waited":
      // The show call stands for the bead: all four started under one number, and it is the one the Loading line waits on.
      if (msg.timer === "loading") {
        return [patch(m, msg.id, "show", msg.gen, { slow: true }), []];
      }
      return [m, waiting(m, msg.id, "show", msg.gen) === undefined ? [] : PARTS.map((part) => fetch(msg.id, part, msg.gen))];
    case "ReadStatuses":
      return [m, [{ _tag: "Statuses" }]];
    case "StatusesRead":
      // A failed read, or one that lists nothing, leaves the built-in five.
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
      // Nothing changed in bd: the pill goes back and the error shows.
      if (msg.error !== null && !msg.second) {
        writing.delete(msg.id);
        return [{ ...m, writing, writeError: { id: msg.id, error: msg.error, second: null } }, []];
      }
      // Done, or the bead is open and only the second step failed: either way the list and that bead's detail load again.
      writing.set(msg.id, "reloading");
      const writeError = msg.error === null ? m.writeError : { id: msg.id, error: msg.error, second: msg.to };
      return m.loading ? [{ ...m, writing, writeError, reload: true }, []] : step({ ...m, writing, writeError }, { _tag: "Refresh" });
    }
    case "Retry": {
      const id = shownId(m);
      const d = id === null ? undefined : m.details.get(id);
      if (id === null || d === undefined) {
        return [m, []];
      }
      const gen = m.gen + 1;
      const again: Detail = { ...d, slow: msg.part === "show" ? false : d.slow };
      again[msg.part] = { _tag: "Loading", prev: null, gen };
      return [{ ...m, gen, details: new Map(m.details).set(id, again) }, msg.part === "show" ? [fetch(id, "show", gen), wait(id, gen, "loading")] : [fetch(id, msg.part, gen)]];
    }
  }
}

function write(m: Model, id: string, from: string, to: string, reason: string): [Model, Cmd[]] {
  return [{ ...m, menu: null, writeError: null, writing: new Map(m.writing).set(id, "running") }, [{ _tag: "Write", id, from, to, reason }]];
}

function move(m: Model, delta: number): Model {
  const rows = visible(m);
  const at = rows.findIndex((b) => b.id === m.selected);
  const next = rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + delta))];
  return next === undefined || (next.id === m.selected && m.shown === null) ? m : pick(m, next.id);
}

// Esc closes the nearest thing: a menu, the keys panel, the search box (emptied), then the detail that fills the Viewer.
function escape(m: Model): Model {
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
