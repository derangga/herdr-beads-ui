// The exported View: init, render, close, and the dispatch loop. The model lives on the instance, never in module scope,
// because every copy of the mod shares the module.
import { View, div } from "gpui-kit";
import type { AsyncContext, Context, Element, FocusHandle } from "gpui-kit";
import { InputState, VirtualListScrollHandle } from "gpui-base";
import { decodeFocus, decodeFont, decodeProps } from "./decode.ts";
import { realHost } from "./host.ts";
import type { Host } from "./host.ts";
import { visible } from "./rows.ts";
import { Store } from "./store.ts";
import type { Bead, Model, Msg } from "./types.ts";
import { draw } from "./view.ts";

// The Viewed repo: the props say it when something opened the Viewer for a folder, else the focused terminal's folder is the Opener's.
function viewedRepo(host: Host): string | null {
  return decodeProps(host.props()).root ?? decodeFocus(host.focused())?.cwd ?? null;
}

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
  scroll!: VirtualListScrollHandle;
  rows = rowsCache();
  // The rows the list drew last, [start, end): what is on screen, which the model does not know.
  seen: [number, number] | null = null;
  mono = "";

  init(_props: unknown, cx: AsyncContext): void {
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
      },
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
    cx.spawn(() => this.listen());
    if (this.root !== null) {
      this.dispatch({ _tag: "Refresh" });
    }
  }

  // pane.go gives a shown copy the keyboard by sending "focus".
  async listen(): Promise<null> {
    while (!this.store.closed) {
      try {
        if ((await this.host.nextCommand()) === "focus" && !this.store.closed) {
          this.nav.focus();
        }
      } catch {
        return null;
      }
    }
    return null;
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
    // After every change, since a sort, a filter or a reload moves the selected row without changing which bead is selected.
    // Only a row off screen scrolls: the default pins it to the nearest edge, so scrolling a visible one would jump it.
    const at = this.rows(model).findIndex((b) => b.id === model.selected);
    if (at >= 0 && (this.seen === null || at < this.seen[0] || at >= this.seen[1])) {
      this.scroll.scroll_to_item(at);
    }
  }

  render(_cx: Context): Element {
    const t = this.host.theme();
    if (this.root === null) {
      return div().size_full().p(14).bg(t.background).text_color(t.muted).child("Open from a terminal");
    }
    const ui = { nav: this.nav, search: this.search, scroll: this.scroll, mono: this.mono, seen: (start: number, end: number) => (this.seen = [start, end]) };
    return draw(this.store.model, this.rows(this.store.model), t, (msg) => this.dispatch(msg), ui, Date.now());
  }

  // Bounded: set the flag and let the replies in flight be dropped.
  close(_cx: AsyncContext): void {
    this.store.close();
    this.search.release();
    this.scroll.release();
  }
}
