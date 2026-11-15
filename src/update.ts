// The list's reducer: (Model, Msg) -> (Model, Cmd[]). Pure. Single flight: a refresh during a load is dropped.
import { initFilters, initSort, reselect } from "./rows.ts";
import type { Cmd, Model, Msg } from "./types.ts";

export const initModel = (): Model => ({ snapshot: null, loading: false, error: null, filters: initFilters(), sort: initSort(), selected: null });

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
      return [reselect({ ...m, filters: { ...m.filters, status: msg.status } }), []];
    case "SetType":
      return [reselect({ ...m, filters: { ...m.filters, type: msg.type } }), []];
    case "Search":
      return [reselect({ ...m, filters: { ...m.filters, search: msg.text } }), []];
    case "SortBy":
      return [{ ...m, sort: { key: msg.key, reverse: false } }, []];
    case "Reverse":
      return [{ ...m, sort: { ...m.sort, reverse: !m.sort.reverse } }, []];
    case "Select":
      return [{ ...m, selected: msg.id }, []];
  }
}
