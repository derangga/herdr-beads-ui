// The exported View: init, render, close, and the dispatch loop. The model lives on the instance, never in module scope,
// because every copy of the mod shares the module.
import { View } from "gpui-kit";
import type { AsyncContext, Context, Element, FocusHandle } from "gpui-kit";
import { InputState, VirtualListScrollHandle } from "gpui-base";
import { decodeAgents, decodeFocus, decodeFont, decodePanes } from "./decode.ts";
import { realHost } from "./host.ts";
import type { Host } from "./host.ts";
import { pickTarget, visible } from "./rows.ts";
import { start, takesKeyboard } from "./states.ts";
import { Store } from "./store.ts";
import { drawToggle } from "./toggle.ts";
import { beadsPane, clickToggle, isToggle, watchToggle } from "./toggle-state.ts";
import type { Bead, Model, Msg } from "./types.ts";
import { draw } from "./view.ts";

// How soon the Viewer takes the keyboard back after losing it while herdr's focus stays on its pane: under a human's
// pause between a click elsewhere and the next key.
const KEYBOARD_MS = 200;

// The visible rows again only when what they are built from changed: a hover, a resize or a key that moves nothing redraws without a filter and a sort.
function rowsCache(): (m: Model) => Bead[] {
  let last: { snapshot: Model["snapshot"]; filters: Model["filters"]; sort: Model["sort"]; rows: Bead[] } | null = null;
  return (m) => {
    if (last === null || last.snapshot !== m.snapshot || last.filters !== m.filters || last.sort !== m.sort) {
      last = { snapshot: m.snapshot, filters: m.filters, sort: m.sort, rows: visible(m) };
    }
    return last.rows;
  };
}

export default class BeadsView extends View {
  store!: Store;
  root: string | null = null;
  host!: Host;
  cx!: AsyncContext;
  nav!: FocusHandle;
  search!: InputState;
  reason!: InputState;
  scroll!: VirtualListScrollHandle;
  rows = rowsCache();
  // The rows the list drew last, [start, end): what is on screen, which the model does not know.
  seen: [number, number] | null = null;
  mono = "";
  // Set only on the tab-bar button's copy (props role "toggle"): the Viewer it last saw in the focused tab.
  toggle: { pane: string | null } | undefined;
  // The toggle copy's pane watch, or the Viewer's keyboard watch; cancelled on close.
  poll: { cancel(): void } | undefined;
  // The Viewer's own pane in herdr, once known (see focusNav).
  own: string | null = null;

  init(_props: unknown, cx: AsyncContext): void {
    this.cx = cx;
    this.host = realHost(cx);
    if (isToggle(this.host.props())) {
      this.toggle = { pane: beadsPane(this.host.panes(), this.host.focused()) };
      this.poll = watchToggle(cx, this.host, this.toggle);
      return;
    }
    const { root, model } = start(this.host);
    this.root = root;
    this.store = new Store(
      this.host,
      this.root,
      (job) => cx.spawn(job),
      (before, model, msg) => {
        this.sync(before, model, msg);
        this.cx.notify();
      },
      model,
    );
    this.mono = decodeFont(this.host.settings());
    this.nav = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    // The box's text is mirrored into the model on every change; focus and blur say whether a key types or is a command.
    this.search = InputState.new({ placeholder: "Search (/)" });
    this.search.on("change", () => this.dispatch({ _tag: "Search", text: this.search.value() }));
    this.search.on("submit", () => this.dispatch({ _tag: "Enter" }));
    this.search.on("focus", () => this.dispatch({ _tag: "SearchFocused", on: true }));
    this.search.on("blur", () => this.dispatch({ _tag: "SearchFocused", on: false }));
    // Enter in the reason box closes the bead; Esc reaches the Viewer's key handler and cancels.
    this.reason = InputState.new({ placeholder: "Reason" });
    this.reason.on("submit", () => this.dispatch({ _tag: "CloseWith", reason: this.reason.value() }));
    cx.spawn(() => this.listen());
    // A split gives the new pane herdr's focus but sends no "focus" (only pane.go does), so the keyboard comes here at open.
    this.focusNav();
    // shortcut: polls because nothing tells a mod that the keyboard left it while herdr's focus stayed on its pane (zoom,
    // a tab switch, the window losing focus); drop it if herdr ever sends "focus" for all of those.
    this.poll = cx.timer.every(KEYBOARD_MS, () => {
      if (!this.store.closed && takesKeyboard(this.own, decodeFocus(this.host.focused())?.pane ?? null, this.nav.is_focused(), this.store.model)) {
        this.nav.focus();
      }
    });
    if (this.root !== null) {
      this.dispatch({ _tag: "Refresh" });
      // Read with the first load, so the picker has bd's list by the time anyone opens it.
      this.dispatch({ _tag: "ReadStatuses" });
    }
  }

  // pane.go gives a shown copy the keyboard by sending "focus".
  async listen(): Promise<null> {
    while (!this.store.closed) {
      try {
        if ((await this.host.nextCommand()) === "focus" && !this.store.closed) {
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
  focusNav(): void {
    this.nav.focus();
    this.cx.timer.after(300, () => {
      if (this.store.closed) {
        return;
      }
      const f = decodeFocus(this.host.focused());
      if (f !== null && f.terminal === null && f.pane !== null) {
        this.own = f.pane;
      }
      if (!this.store.model.searching && this.store.model.menu === null) {
        this.nav.focus();
      }
    });
  }

  dispatch(msg: Msg): void {
    this.store.dispatch(msg);
  }

  // What the model decided that the view's own state must follow: the box's text and focus, and the list's scroll.
  sync(before: Model, model: Model, msg: Msg): void {
    if (model.filters.search !== this.search.value()) {
      this.search.set_value(model.filters.search);
    }
    if (msg._tag === "FocusSearch") {
      this.search.focus();
    } else if (before.searching && !model.searching && msg._tag !== "SearchFocused") {
      // Enter or Esc in the box gives the keyboard back to the Viewer.
      this.nav.focus();
    }
    if (model.menu === "reason" && before.menu !== "reason") {
      this.reason.set_value("");
      this.reason.focus();
    } else if ((before.menu === "pick" || before.menu === "reason") && model.menu === null) {
      this.nav.focus();
    }
    // The list was not drawn while the detail filled the Viewer, so what `seen` says is old when it comes back.
    if (before.pane === "detail" && model.pane === "list") {
      this.seen = null;
    }
    // After every change, since a sort, a filter or a reload moves the selected row without changing which bead is selected.
    // Only a row off screen scrolls: the default pins it to the nearest edge, so scrolling a visible one would jump it.
    const at = this.rows(model).findIndex((b) => b.id === model.selected);
    if (at >= 0 && (this.seen === null || at < this.seen[0] || at >= this.seen[1])) {
      this.scroll.scroll_to_item(at);
    }
  }

  render(_cx: Context): Element {
    const t = this.host.theme();
    if (this.toggle !== undefined) {
      return drawToggle(this.toggle.pane !== null, t, () => clickToggle(this.host));
    }
    // Looked up on every draw, since the agents come and go without the Viewer being told.
    const target = pickTarget(this.store.model.opener, decodePanes(this.host.panes()), decodeAgents(this.host.agents()));
    const ui = { target, root: this.root, nav: this.nav, search: this.search, reason: this.reason, scroll: this.scroll, mono: this.mono, seen: (start: number, end: number) => (this.seen = [start, end]) };
    return draw(this.store.model, this.rows(this.store.model), t, (msg) => this.dispatch(msg), ui, Date.now());
  }

  // Bounded: set the flag and let the replies in flight be dropped.
  close(_cx: AsyncContext): void {
    this.poll?.cancel();
    if (this.toggle !== undefined) {
      return;
    }
    this.store.close();
    this.search.release();
    this.reason.release();
    this.scroll.release();
  }
}
