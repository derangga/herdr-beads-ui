// The reducer: (Model, Msg) -> (Model, Cmd[]). Pure. Single flight: a refresh during a load is dropped.
import { BUILT_IN_STATUSES, initFilters, initSort, isWide, reselect, sendText, shownBead, shownId, visible } from "./rows.ts";
import type { Cmd, Model, Msg, Opener } from "./types.ts";

export const initModel = (opener: Opener = { terminal: null, tab: null }): Model => ({
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
  writing: new Map(),
  writeError: null,
  reload: false,
  opener,
  flash: 0,
  copied: null,
  sending: false,
  sent: null,
});

// A load fills the list and every bead's detail, so the viewer opens by sending Refresh and no other message runs bd for a read.
export function update(m: Model, msg: Msg): [Model, Cmd[]] {
  const [next, cmds] = step(m, msg);
  // A failed write's error stays until the next action: another bead on show, or a new write or picker.
  return [next.writeError !== null && next.writeError.id !== shownId(next) ? { ...next, writeError: null } : next, cmds];
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
    case "Refresh": {
      // No bd runs when there is nothing to ask it about, and a refresh during a load is dropped.
      if (m.loading || m.error?._tag === "NoOpener" || m.error?._tag === "RemoteSpace") {
        return [m, []];
      }
      const loads = m.loads + 1;
      // Only a first load has no list to keep on screen, so only it waits to show a spinner.
      return [{ ...m, loading: true, loads, slow: false }, m.snapshot === null ? [{ _tag: "Load" }, { _tag: "WaitLoad", n: loads }] : [{ _tag: "Load" }]];
    }
    case "Slowed":
      return [m.loading && m.snapshot === null && msg.n === m.loads ? { ...m, slow: true } : m, []];
    case "Loaded": {
      if (m.reload) {
        return [{ ...m, reload: false }, [{ _tag: "Load" }]];
      }
      // A failed load keeps the last good list and records the error.
      const writing = new Map([...m.writing].filter(([, s]) => s === "running"));
      if (!msg.res.ok) {
        return [{ ...m, loading: false, slow: false, error: msg.res.error, writing }, []];
      }
      // The snapshot carries every detail, so the shown bead redraws from it at once.
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
      // The narrow detail covers the list, so a move would change a selection nobody can see.
      return [m.pane === "list" ? move(m, msg.delta) : m, []];
    case "Click":
      // A click opens the detail when it fills the Viewer, and only selects when the list sits beside it.
      return [{ ...pick(m, msg.id), menu: null, searching: false, pane: isWide(m) ? "list" : "detail" }, []];
    case "Enter":
      if (m.searching) {
        return [{ ...m, searching: false }, []];
      }
      // Wide shows the detail already and the wheel scrolls it under the pointer, so the list keeps the keyboard.
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
      if (cur === null || id === undefined) {
        return [m, []];
      }
      return [land({ ...m, ...(msg.delta < 0 ? { back: m.back.slice(0, -1), forward: [...m.forward, cur] } : { back: [...m.back, cur], forward: m.forward.slice(0, -1) }) }, id), []];
    }
    case "Resized":
      // Only the width: the selection, the filters, the search and the pane stay, so crossing a breakpoint redraws the same state.
      return [msg.width === m.width ? m : { ...m, width: msg.width }, []];
    case "FocusSearch":
      return [{ ...m, searching: true, menu: null, pane: "list" }, []];
    case "SearchFocused":
      return [msg.on === m.searching ? m : { ...m, searching: msg.on }, []];
    case "ToggleMenu": {
      if (msg.menu === "pick") {
        // Only a bead the pill is drawn for, and not while bd writes it.
        const b = shownBead(m);
        if (b === null || m.writing.has(b.id)) {
          return [m, []];
        }
        return [{ ...m, menu: m.menu === "pick" || m.menu === "reason" ? null : "pick", writeError: null }, []];
      }
      return [{ ...m, menu: m.menu === msg.menu ? null : msg.menu }, []];
    }
    case "ShowKeys":
      // main.ts opens the keys as a dialog, which closes itself (Esc, a press outside): nothing here to keep in step.
      return [m, []];
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
      // Done, or the bead is open and only the second step failed: either way the list loads again, and with it that bead's detail.
      writing.set(msg.id, "reloading");
      const writeError = msg.error === null ? m.writeError : { id: msg.id, error: msg.error, second: msg.to };
      return m.loading ? [{ ...m, writing, writeError, reload: true }, []] : step({ ...m, writing, writeError }, { _tag: "Refresh" });
    }
    case "Copy": {
      const b = shownBead(m);
      // A send borrows the clipboard until it has pasted, so a copy now would send the bare id.
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
      return [msg.what === "copied" ? (m.copied?.n === msg.n ? { ...m, copied: null } : m) : m.sent?.n === msg.n ? { ...m, sent: null } : m, []];
  }
}

// The Send button says `text` until a timer that carries this number runs out.
function flash(m: Model, text: string): [Model, Cmd[]] {
  const n = m.flash + 1;
  return [{ ...m, flash: n, sent: { n, text } }, [{ _tag: "Fade", what: "sent", n }]];
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

// Esc closes the nearest thing: a menu, the search box (emptied), then the detail that fills the Viewer.
function escape(m: Model): Model {
  if (m.menu !== null) {
    return { ...m, menu: null };
  }
  if (m.searching) {
    return reselect({ ...m, searching: false, filters: { ...m.filters, search: "" } });
  }
  return m.pane === "detail" && !isWide(m) ? toList(m) : m;
}
