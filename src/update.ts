// The list's reducer: (Model, Msg) -> (Model, Cmd[]). Pure. Single flight: a refresh during a load is dropped.
import { initFilters, initSort, isWide, reselect, visible } from "./rows.ts";
import type { Cmd, Model, Msg } from "./types.ts";

export const initModel = (): Model => ({ snapshot: null, loading: false, error: null, filters: initFilters(), sort: initSort(), selected: null, width: 0, pane: "list", searching: false, menu: null, help: false });

// A load fills the list, so the viewer opens by sending Refresh.
export function update(m: Model, msg: Msg): [Model, Cmd[]] {
  switch (msg._tag) {
    case "Refresh":
      return m.loading ? [m, []] : [{ ...m, loading: true }, [{ _tag: "Load" }]];
    case "Loaded":
      // A failed load keeps the last good list and records the error.
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
      // The keys panel covers the list, so a move would change a selection nobody can see.
      return [m.pane === "list" && !m.help ? move(m, msg.delta) : m, []];
    case "Click":
      // A click opens the detail when it fills the Viewer, and only selects when the list sits beside it.
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
      // Only the width: the selection, the filters, the search and the pane stay, so crossing a breakpoint redraws the same state.
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

function move(m: Model, delta: number): Model {
  const rows = visible(m);
  const at = rows.findIndex((b) => b.id === m.selected);
  const next = rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + delta))];
  return next === undefined || next.id === m.selected ? m : { ...m, selected: next.id };
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
  return m.pane === "detail" && !isWide(m) ? { ...m, pane: "list" } : m;
}
