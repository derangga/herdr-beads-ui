// GPUI drawing. It holds no state and calls no Host method: everything it shows is in the model, the rows and the theme,
// and every press is a Msg handed to dispatch.
import { div, svg, uniform_list } from "gpui-kit";
import type { Element, FocusHandle } from "gpui-kit";
import { h_flex, Input, Popup, Scrollbar, TextView, v_flex } from "gpui-base";
import type { InputState, VirtualListScrollHandle } from "gpui-base";
import { age, ALL, fullDate, hiddenByFilters, idChars, isWide, keyFor, listWidth, NO_AGE_BELOW, NOT_CLOSED, pickOptions, ROW_H, shownBead, shownId, SORT_KEYS, statusOptions, textSections, treeRows, typeOptions } from "./rows.ts";
import { bdText, emptyState, retryLabel } from "./states.ts";
import type { BdError, Bead, BeadDetail, Detail, Menu, Model, Msg, Part, PartName, Target, TreeNode, TreeRow } from "./types.ts";

export type Theme = Record<string, `#${string}`>;
type Dispatch = (msg: Msg) => void;
// What the view owns and the model must not hold: the focus target keys reach, the search box, the close reason's box, the list's
// scroll position, the id font, the Viewed repo, the agent Send to agent would type into, and `seen`, which hears the rows the list just drew so the
// owner can tell whether a row is on screen.
export type Ui = { target: Target | null; root: string | null; nav: FocusHandle; search: InputState; reason: InputState; scroll: VirtualListScrollHandle; mono: string; seen: (start: number, end: number) => void };

const icon = (name: string): string => `mods/beads/icons/${name}.svg`;

// The design names Catppuccin colors; herdr's theme has the ANSI sixteen instead. Try the design's name, then the ANSI one.
const pick = (t: Theme, ...keys: string[]): `#${string}` => {
  const found = keys.find((k) => t[k] !== undefined);
  return t[found ?? "muted"] ?? t.foreground;
};

// Peach has no ANSI twin: halfway between red and yellow.
function peach(t: Theme): `#${string}` {
  if (t.peach !== undefined) {
    return t.peach;
  }
  const [a, b] = [pick(t, "ansi1"), pick(t, "ansi3")];
  const mix = (i: number): string =>
    Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2)
      .toString(16)
      .padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b) ? `#${mix(1)}${mix(3)}${mix(5)}` : b;
}

function priorityColor(p: number, t: Theme): `#${string}` {
  return p <= 0 ? pick(t, "red", "ansi1") : p === 1 ? peach(t) : p === 2 ? pick(t, "yellow", "ansi3") : p === 3 ? pick(t, "blue", "ansi4") : t.muted;
}

const STATUS_COLOR: Record<string, [string, string]> = { open: ["green", "ansi2"], in_progress: ["blue", "ansi4"], blocked: ["red", "ansi1"] };
const statusColor = (status: string, t: Theme): `#${string}` => {
  const names = STATUS_COLOR[status];
  return names === undefined ? t.muted : pick(t, ...names);
};
const STATUS_LABEL: Record<string, string> = { open: "OPEN", in_progress: "IN PROG", blocked: "BLOCKED", deferred: "DEFER", closed: "CLOSED" };
const statusLabel = (status: string): string => STATUS_LABEL[status] ?? status.toUpperCase().slice(0, 8);

const TYPE_ICON = new Set(["task", "bug", "feature", "epic", "chore"]);

function button(id: string, label: string, on: boolean, t: Theme, click: () => void, chevron = false): Element {
  return h_flex()
    .id(id)
    .h(26)
    .px(8)
    .gap(4)
    .flex_none()
    .items_center()
    .rounded(6)
    .border_1()
    .border_color(on ? t.accent : t.border)
    .text_size(12)
    .text_color(on ? t.foreground : t.muted)
    .when(on, (e) => e.bg(t.selected))
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .active((s) => s.bg(t.selected))
    .on_click((_e, cx) => {
      cx.stop_propagation();
      click();
    })
    .child(label)
    .when(chevron, (e) => e.child(svg(icon("chevron-down")).size(12).flex_none()));
}

function iconButton(id: string, name: string, tip: string, t: Theme, click: () => void, spin = false): Element {
  return div()
    .id(id)
    .w(26)
    .h(26)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(6)
    .text_color(t.muted)
    .tooltip(tip)
    .accessibility_label(tip)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .active((s) => s.bg(t.selected))
    .on_click((_e, cx) => {
      cx.stop_propagation();
      click();
    })
    .child(
      svg(icon(name))
        .size(14)
        .flex_none()
        .when(spin, (e) => e.spin(900)),
    );
}

// ‹ and › of the detail header: dimmed, and dead, when the history has nothing on that side.
function walkButton(id: string, glyph: string, tip: string, on: boolean, t: Theme, click: () => void): Element {
  return div()
    .id(id)
    .w(26)
    .h(26)
    .flex_none()
    .flex()
    .items_center()
    .justify_center()
    .rounded(6)
    .text_size(16)
    .text_color(t.muted)
    .opacity(on ? 1 : 0.35)
    .when(on, (e) =>
      e
        .tooltip(tip)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .active((s) => s.bg(t.selected))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          click();
        }),
    )
    .accessibility_label(tip)
    .child(glyph);
}

const SORT_LABEL = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

// Framed as herdr-review's filter: the edge lights while typing, and the count of shown beads sits inside on the right.
function searchBox(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui): Element {
  const count = m.snapshot === null ? "" : `${rows.length}/${m.snapshot.beads.length}`;
  return (
    h_flex()
      .id("search")
      .flex_1()
      .min_w(120)
      .h(30)
      .px(8)
      .gap(6)
      .items_center()
      .rounded(7)
      .border_1()
      .border_color(m.searching ? t.accent : t.border)
      .cursor_text()
      // A press in the box is the box's own: it must not hand the keyboard to the Viewer behind it.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      // The whole frame is the target, not only the text line inside it.
      .on_click(() => dispatch({ _tag: "FocusSearch" }))
      .child(div().flex_1().min_w(0).child(Input.new(ui.search).h_full().w_full().text_size(12)))
      .child(div().flex_none().text_size(10).text_color(t.dim).child(count))
  );
}

const panel = (t: Theme): Element => v_flex().min_w(140).py(4).rounded(8).border_1().border_color(t.border).bg(t.popover);

const option = (id: string, label: string, on: boolean, t: Theme, click: () => void): Element =>
  h_flex()
    .id(id)
    .h(26)
    .px(10)
    .gap(8)
    .items_center()
    .text_size(12)
    .text_color(on ? t.accent : t.foreground)
    .cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .active((s) => s.bg(t.selected))
    .on_click((_e, cx) => {
      cx.stop_propagation();
      click();
    })
    .child(label);

// A picker: its button, and under it the choices in a layer above the window while its menu is the open one.
function picker(m: Model, name: Menu, label: string, on: boolean, t: Theme, dispatch: Dispatch): Element {
  const options: { label: string; on: boolean; msg: Msg }[] =
    name === "status"
      ? statusOptions(m).map((s) => ({ label: s, on: m.filters.status === s, msg: { _tag: "SetStatus", status: s } }))
      : name === "type"
        ? typeOptions(m).map((s) => ({ label: s, on: m.filters.type === s, msg: { _tag: "SetType", type: s } }))
        : SORT_KEYS.map((k) => ({ label: SORT_LABEL(k), on: m.sort.key === k, msg: { _tag: "SortBy", key: k } }));
  // shortcut: no outside-press dismissal, because a press on this button would close then reopen the menu; Esc, a choice or a row click closes it.
  return Popup.new(
    `menu-${name}`,
    button(name, label, on || m.menu === name, t, () => dispatch({ _tag: "ToggleMenu", menu: name }), true),
  )
    .anchor("bottom_left")
    .flex_none()
    .when(m.menu === name, (e) => e.content(panel(t).children(options.map((o) => option(`option-${name}-${o.label}`, o.label, o.on, t, () => dispatch(o.msg))))));
}

function filters(m: Model, t: Theme, dispatch: Dispatch, narrow: boolean): Element[] {
  const f = m.filters;
  return [
    button("ready", "Ready", f.ready, t, () => dispatch({ _tag: "ToggleReady" })),
    picker(m, "status", f.status === NOT_CLOSED ? "Status" : `Status: ${f.status}`, f.status !== NOT_CLOSED, t, dispatch),
    picker(m, "type", f.type === ALL ? "Type" : `Type: ${f.type}`, f.type !== ALL, t, dispatch),
    div().flex_1(),
    picker(m, "sort", narrow ? "Sort" : `Sort: ${SORT_LABEL(m.sort.key)}`, false, t, dispatch),
    iconButton("reverse", m.sort.reverse ? "arrow-up" : "arrow-down", "Reverse the sort", t, () => dispatch({ _tag: "Reverse" })),
  ];
}

// The list's own toolbar, at the top of the list column in both widths: what it filters sits right above it, and the
// detail beside it keeps the full height. The short sort label is for a column too narrow for "Sort: Priority".
function topBar(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, short: boolean): Element {
  const refresh = iconButton("refresh", "refresh", "Refresh (Ctrl+R)", t, () => dispatch({ _tag: "Refresh" }), m.loading);
  return v_flex()
    .flex_none()
    .px(8)
    .pt(8)
    .pb(6)
    .gap(6)
    .border_b(1)
    .border_color(t.border)
    .child(
      h_flex()
        .gap(6)
        .items_center()
        .child(searchBox(m, rows, t, dispatch, ui))
        .child(refresh),
    )
    .child(
      h_flex()
        .gap(6)
        .items_center()
        .children(filters(m, t, dispatch, short)),
    );
}

function row(b: Bead, m: Model, t: Theme, narrow: boolean, now: number, idW: number, mono: string): Element {
  const closed = b.status === "closed";
  // A bead a link put on show is the one the list marks; when the filters hide it no row is marked.
  const selected = b.id === (shownId(m) ?? m.selected);
  const dim = (c: `#${string}`): `#${string}` => (closed ? t.muted : c);
  const locks = m.snapshot?.locks.get(b.id) ?? 0;
  const status = statusColor(b.status, t);
  return h_flex()
    .id(b.id)
    .w_full()
    .h(ROW_H)
    .flex_none()
    .pr(10)
    .gap(6)
    .items_center()
    .text_size(12)
    .cursor_pointer()
    .text_color(closed ? t.muted : t.foreground)
    .when(selected, (e) => e.bg(pick(t, "surface0", "raised")))
    .hover((s) => s.bg(t.hover))
    .child(
      div()
        .w(2)
        .h_full()
        .flex_none()
        .when(selected, (e) => e.bg(t.accent)),
    )
    .when(!narrow, (e) =>
      e.child(
        svg(icon(TYPE_ICON.has(b.issue_type) ? b.issue_type : "task"))
          .size(14)
          .flex_none()
          .text_color(closed ? t.muted : t.dim),
      ),
    )
    .child(
      div()
        .w(16)
        .flex_none()
        .text_size(11)
        .font_semibold()
        .text_color(dim(priorityColor(b.priority, t)))
        .child(`P${b.priority}`),
    )
    .child(narrow ? div().w(8).h(8).flex_none().rounded(4).bg(dim(status)) : div().w(56).flex_none().text_size(10).font_semibold().text_color(dim(status)).child(statusLabel(b.status)))
    .child(
      div()
        .w(idW * 7)
        .flex_none()
        .truncate()
        .font_family(mono)
        .text_size(11)
        .text_color(t.muted)
        .child(b.id),
    )
    .child(div().flex_1().min_w(0).truncate().child(b.title))
    .when(locks > 0, (e) =>
      e.child(
        h_flex()
          .gap(2)
          .flex_none()
          .items_center()
          .text_size(11)
          .text_color(closed ? t.muted : peach(t))
          .child(svg(icon("lock")).size(11))
          .child(`${locks}`),
      ),
    )
    .when(m.width >= NO_AGE_BELOW, (e) => e.child(div().w(26).flex_none().text_size(11).text_color(t.muted).text_right().child(age(b.created_at, now))));
}

function listColumn(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, narrow: boolean, now: number): Element {
  const idW = idChars(rows);
  return div()
    .flex_1()
    .min_h(0)
    .relative()
    .child(
      rows.length === 0
        ? div()
            .p(14)
            .text_color(t.muted)
            .child(
              m.snapshot === null
                ? m.slow
                  ? h_flex()
                      .gap(8)
                      .items_center()
                      .child(svg(icon("refresh")).size(14).flex_none().spin(900))
                      .child("Loading beads")
                  : ""
                : "No beads match",
            )
        : // Only the rows on screen are built, so a thousand beads cost what twenty do.
          uniform_list(
            "beads-list",
            rows.length,
            (i) => rows[i]?.id ?? `row:${i}`,
            (range) => {
              ui.seen(range.start, range.end);
              return rows.slice(range.start, range.end).map((b) => row(b, m, t, narrow, now, idW, ui.mono));
            },
          )
            .absolute()
            .inset_0()
            .track_scroll(ui.scroll)
            .on_item_click((id) => dispatch({ _tag: "Click", id })),
    )
    .child(Scrollbar.vertical("beads-list").absolute().inset_0());
}

const KEYS: [string, string][] = [
  ["j k  ↓ ↑", "Move the selection"],
  ["↵", "Open the detail (narrow) or focus it (wide)"],
  ["Esc", "Back to the list (narrow), clear the search, close a menu"],
  ["Tab", "Switch focus between list and detail (wide)"],
  ["[ ]", "Back and forward in the history"],
  ["s", "Change the status of the shown bead"],
  ["y", "Copy the shown bead's id"],
  ["/", "Search"],
  ["Ctrl+R", "Refresh"],
  ["?", "Show or hide these keys"],
];

function keysPanel(t: Theme, mono: string): Element {
  return v_flex()
    .flex_1()
    .min_h(0)
    .p(14)
    .gap(6)
    .text_size(12)
    .child(div().font_semibold().child("Keys"))
    .children(KEYS.map(([k, what]) => h_flex().gap(12).child(div().w(90).flex_none().font_family(mono).text_size(11).text_color(t.accent).child(k)).child(div().flex_1().min_w(0).text_color(t.muted).child(what))));
}

const heading = (label: string, t: Theme): Element => div().text_size(11).font_semibold().text_color(t.muted).child(label.toUpperCase());

const section = (label: string, t: Theme, ...body: Element[]): Element => v_flex().gap(4).flex_none().child(heading(label, t)).children(body);

// A markdown body. The id carries the bead, so another bead's text is never drawn into this one's view state.
const markdown = (id: string, text: string): Element => TextView.markdown(id, text).selectable(true).scrollable(false).w_full().min_w(0);

const red = (t: Theme): `#${string}` => pick(t, "red", "ansi1");

// A section that failed: what bd said, and a button that reruns only that call.
function failed(label: string, error: BdError, part: PartName, t: Theme, dispatch: Dispatch): Element {
  return section(label, t, div().text_size(12).text_color(red(t)).child(bdText(error)), h_flex().child(button(`retry-${part}`, "Retry", false, t, () => dispatch({ _tag: "Retry", part }))));
}

const GUIDE = 14;

// One row of a tree: its guide lines, a status dot, the id as a link, the title and the edge type. A row repeated from higher up is dimmed.
function treeRow(r: TreeRow, key: string, t: Theme, dispatch: Dispatch, mono: string): Element {
  const line = (e: Element): Element => e.border_l(1).border_color(t.border);
  const own = r.last
    ? div()
        .w(GUIDE)
        .h(ROW_H)
        .flex_none()
        .child(
          line(
            div()
              .w(10)
              .h(ROW_H / 2),
          ).border_b(1),
        )
    : line(div().w(GUIDE).h(ROW_H).flex_none()).child(
        div()
          .w(10)
          .h(ROW_H / 2)
          .border_b(1)
          .border_color(t.border),
      );
  return h_flex()
    .h(ROW_H)
    .flex_none()
    .gap(6)
    .items_center()
    .text_size(12)
    .opacity(r.repeat ? 0.5 : 1)
    .child(
      h_flex()
        .flex_none()
        .children([...r.guides.map((on) => (on ? line(div().w(GUIDE).h(ROW_H).flex_none()) : div().w(GUIDE).h(ROW_H).flex_none())), own]),
    )
    .child(div().w(8).h(8).flex_none().rounded(4).bg(statusColor(r.status, t)))
    .child(
      div()
        .id(key)
        .flex_none()
        .font_family(mono)
        .text_size(11)
        .text_color(t.accent)
        .cursor_pointer()
        .hover((s) => s.underline())
        .on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "Jump", id: r.id });
        })
        .child(r.id),
    )
    .child(div().flex_1().min_w(0).truncate().child(r.title))
    .child(div().flex_none().text_size(11).text_color(t.muted).child(r.edge));
}

// A tree section. A reload keeps the old rows on screen; before the first reply there is nothing to draw.
function tree(label: string, part: "down" | "up", p: Part<TreeNode[]>, empty: string, t: Theme, dispatch: Dispatch, mono: string): Element[] {
  if (p._tag === "Failed") {
    return [failed(label, p.error, part, t, dispatch)];
  }
  const nodes = p._tag === "Ready" ? p.value : p.prev;
  if (nodes === null) {
    return [];
  }
  const rows = treeRows(nodes);
  return [section(`${label} (${rows.length})`, t, ...(rows.length === 0 ? [div().text_size(12).text_color(t.muted).child(empty)] : rows.map((r, i) => treeRow(r, `${part}-${i}`, t, dispatch, mono))))];
}

// The status pill opens the picker of the shown bead. While bd writes it the pill dims, spins and does nothing.
function statusPill(b: BeadDetail, m: Model, t: Theme, dispatch: Dispatch, ui: Ui): Element {
  const color = statusColor(b.status, t);
  const busy = m.writing.has(b.id);
  const pill = h_flex()
    .id("status-pill")
    .gap(3)
    .px(6)
    .items_center()
    .rounded(4)
    .border_1()
    .border_color(color)
    .text_size(10)
    .font_semibold()
    .text_color(color)
    .opacity(busy ? 0.6 : 1)
    .when(busy, (e) => e.child(svg(icon("refresh")).size(10).flex_none().spin(900)))
    .child(statusLabel(b.status))
    .when(!busy, (e) =>
      e
        .child(svg(icon("chevron-down")).size(10).flex_none())
        .tooltip("Change status (s)")
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .active((s) => s.bg(t.selected))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "ToggleMenu", menu: "pick" });
        }),
    );
  // shortcut: no outside-press dismissal, as with the filter menus. The 120 ms open fade is skipped: freshly mounted Popup content has no
  // earlier opacity for .transition to animate from. Revisit if gpui-kit gains an enter animation.
  return Popup.new("menu-pick", pill)
    .anchor("bottom_left")
    .flex_none()
    .when(!busy && m.menu === "pick", (e) => e.content(panel(t).children(pickOptions(m, b.status).map((s) => option(`option-pick-${s}`, s, s === b.status, t, () => dispatch({ _tag: "Pick", status: s }))))))
    .when(!busy && m.menu === "reason", (e) =>
      e.content(
        panel(t)
          .w(240)
          .p(8)
          .gap(6)
          .child(div().text_size(11).text_color(t.muted).child("Reason for closing (optional)"))
          // A press in the box is the box's own, as with the search box.
          .child(
            div()
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .child(Input.new(ui.reason).h(26).w_full().text_size(12)),
          )
          .child(
            h_flex()
              .gap(6)
              .justify_end()
              .child(button("close-cancel", "Cancel", false, t, () => dispatch({ _tag: "Escape" })))
              .child(button("close-confirm", "Close bead", true, t, () => dispatch({ _tag: "CloseWith", reason: ui.reason.value() }))),
          ),
      ),
    );
}

const FADE = { duration: 120, easing: "ease-out" } as const;

// Both labels stay drawn and trade opacity, because a label mounted fresh has no earlier opacity to animate from. The longer one,
// invisible, gives the box its width.
function crossfade(a: string, b: string, showB: boolean, colorB?: `#${string}`): Element {
  const layer = (text: string, on: boolean, color?: `#${string}`): Element => {
    const e = div()
      .absolute()
      .inset_0()
      .flex()
      .items_center()
      .justify_center()
      .whitespace_nowrap()
      .opacity(on ? 1 : 0)
      .transition("opacity", FADE);
    return (color === undefined ? e : e.text_color(color)).child(text);
  };
  return div()
    .relative()
    .flex_none()
    .child(
      div()
        .opacity(0)
        .whitespace_nowrap()
        .child(b.length > a.length ? b : a),
    )
    .child(layer(a, !showB))
    .child(layer(b, showB, colorB));
}

function copyButton(b: BeadDetail, m: Model, t: Theme, dispatch: Dispatch): Element {
  const copied = m.copied?.id === b.id;
  return div()
    .id("copy-id")
    .px(3)
    .flex_none()
    .rounded(4)
    .text_color(t.muted)
    .tooltip(copied ? "Copied" : "Copy id (y)")
    .accessibility_label("Copy id")
    .cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .active((s) => s.bg(t.selected))
    .on_click((_e, cx) => {
      cx.stop_propagation();
      dispatch({ _tag: "Copy" });
    })
    .child(crossfade("⧉", "✓ Copied", copied, pick(t, "green", "ansi2")));
}

// Dimmed, and dead, when no agent is in the tab. For a moment after a send the label is the answer.
function sendButton(m: Model, t: Theme, dispatch: Dispatch, ui: Ui): Element {
  const on = ui.target !== null;
  return h_flex()
    .id("send-to-agent")
    .h(26)
    .px(8)
    .flex_none()
    .items_center()
    .rounded(6)
    .border_1()
    .border_color(t.border)
    .text_size(12)
    .text_color(on ? t.foreground : t.muted)
    .opacity(on ? 1 : 0.5)
    .tooltip(ui.target === null ? "No agent in this tab" : `Type the prompt into ${ui.target.name}, without Enter`)
    .accessibility_label("Send to agent")
    .when(on, (e) =>
      e
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .active((s) => s.bg(t.selected))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          dispatch({ _tag: "Send" });
        }),
    )
    .child(crossfade("Send to agent", m.sent?.text ?? "", m.sent !== null));
}

function metaRow(b: BeadDetail, m: Model, t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element {
  const ago = age(b.created_at, now);
  return h_flex()
    .flex_wrap()
    .gap_x(10)
    .gap_y(4)
    .items_center()
    .text_size(12)
    .child(
      h_flex()
        .gap(2)
        .items_center()
        .flex_none()
        .child(div().font_family(ui.mono).text_size(12).text_color(t.muted).child(b.id))
        .child(copyButton(b, m, t, dispatch)),
    )
    .child(statusPill(b, m, t, dispatch, ui))
    .child(div().text_size(11).font_semibold().text_color(priorityColor(b.priority, t)).child(`P${b.priority}`))
    .when(b.assignee !== null, (e) => e.child(div().text_color(t.muted).child(`@${b.assignee}`)))
    .child(
      div()
        .id("age")
        .text_color(t.muted)
        .tooltip(`Created ${fullDate(b.created_at)}`)
        .child(ago === "now" ? ago : `${ago} ago`),
    );
}

// A failed status write: bd's text, and when bd reopen had worked, which step failed.
const writeText = (w: { error: BdError; second: string | null }): string => (w.second === null ? bdText(w.error) : `bd reopen worked, but bd update --status ${w.second} failed: ${bdText(w.error)}`);

function beadBody(d: BeadDetail, e: Detail, m: Model, hidden: boolean, t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element[] {
  const comments = e.comments._tag === "Ready" ? e.comments.value : e.comments._tag === "Loading" ? (e.comments.prev ?? []) : [];
  const sorted = [...comments].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return [
    h_flex()
      .gap(8)
      .items_start()
      .flex_none()
      .child(
        svg(icon(TYPE_ICON.has(d.issue_type) ? d.issue_type : "task"))
          .size(18)
          .flex_none()
          .text_color(t.dim),
      )
      // Two lines, then cut: gpui has no line clamp, so the box is two lines high.
      .child(div().flex_1().min_w(0).max_h(40).overflow_hidden().text_size(16).line_height(1.25).font_semibold().child(d.title)),
    ...(hidden ? [div().flex_none().text_size(12).text_color(t.muted).child("Hidden by the current filters")] : []),
    metaRow(d, m, t, dispatch, ui, now),
    ...(m.writeError?.id === d.id ? [div().flex_none().text_size(12).text_color(red(t)).child(writeText(m.writeError))] : []),
    h_flex()
      .gap(8)
      .items_start()
      .flex_none()
      .child(
        h_flex()
          .flex_1()
          .min_w(0)
          .flex_wrap()
          .gap(4)
          .children(
            d.labels.map((l) =>
              div()
                .px(6)
                .py(1)
                .rounded(4)
                .bg(pick(t, "surface0", "raised"))
                .text_size(11)
                .text_color(t.muted)
                .child(l),
            ),
          ),
      )
      .child(sendButton(m, t, dispatch, ui)),
    ...textSections(d).map(([label, text]) => section(label, t, markdown(`md-${d.id}-${label}`, text))),
    ...tree("Blocked by", "down", e.down, "Nothing blocks this bead.", t, dispatch, ui.mono),
    ...tree("Blocks", "up", e.up, "This bead blocks nothing.", t, dispatch, ui.mono),
    ...(e.comments._tag === "Failed" ? [failed("Comments", e.comments.error, "comments", t, dispatch)] : []),
    ...(sorted.length === 0
      ? []
      : [
          section(
            `Comments (${sorted.length})`,
            t,
            ...sorted.map((c) =>
              v_flex()
                .gap(2)
                .flex_none()
                .child(
                  h_flex()
                    .gap(8)
                    .items_center()
                    .text_size(12)
                    .child(div().font_semibold().child(c.author))
                    .child(div().id(`comment-age-${c.id}`).text_size(11).text_color(t.muted).tooltip(fullDate(c.created_at)).child(age(c.created_at, now))),
                )
                .child(markdown(`md-${d.id}-c-${c.id}`, c.text)),
            ),
          ),
        ]),
  ];
}

// What the shown bead's calls have given so far. Nothing at all for the first 150 ms, so a fast bd shows no flash.
function detailBody(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element[] {
  const id = shownId(m);
  const note = (text: string, color: `#${string}` = t.muted): Element => div().flex_none().text_size(12).text_color(color).child(text);
  if (id === null) {
    return [note("Select a bead")];
  }
  const entry = m.details.get(id);
  if (entry === undefined) {
    return [];
  }
  const show: Part<BeadDetail> = entry.show;
  if (show._tag === "Failed") {
    return show.error._tag === "BeadGone"
      ? [
          note(`${id} no longer exists`),
          h_flex()
            .flex_none()
            .child(button("refresh-gone", "Refresh", false, t, () => dispatch({ _tag: "Refresh" }))),
        ]
      : [
          note(bdText(show.error), red(t)),
          h_flex()
            .flex_none()
            .child(button("retry-show", "Retry", false, t, () => dispatch({ _tag: "Retry", part: "show" }))),
        ];
  }
  const bead = shownBead(m);
  if (bead === null) {
    return entry.slow ? [note("Loading")] : [];
  }
  return beadBody(bead, entry, m, hiddenByFilters(m, rows), t, dispatch, ui, now);
}

function detailPane(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, narrow: boolean, now: number): Element {
  // One scroll area per bead, so a bead opens at its top.
  const scroll = `detail-${shownId(m) ?? "none"}`;
  return (
    v_flex()
      .flex_1()
      .min_w(0)
      .min_h(0)
      // Beside the list, an accent edge says which column has the keyboard.
      .when(!narrow, (e) => e.border_l(2).border_color(m.pane === "detail" ? t.accent : t.border))
      .child(
        h_flex()
          .h(36)
          .flex_none()
          .px(8)
          .gap(4)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .when(narrow, (e) =>
            e.child(
              h_flex()
                .id("back")
                .h(26)
                .pl(4)
                .pr(8)
                .gap(2)
                .items_center()
                .rounded(6)
                .text_size(12)
                .text_color(t.muted)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .active((s) => s.bg(t.selected))
                .on_click((_e, cx) => {
                  cx.stop_propagation();
                  dispatch({ _tag: "BackToList" });
                })
                .child(svg(icon("chevron-left")).size(14).flex_none())
                .child("List"),
            ),
          )
          .child(walkButton("history-back", "‹", "Back ([)", m.back.length > 0, t, () => dispatch({ _tag: "Walk", delta: -1 })))
          .child(walkButton("history-forward", "›", "Forward (])", m.forward.length > 0, t, () => dispatch({ _tag: "Walk", delta: 1 }))),
      )
      .child(
        m.help
          ? keysPanel(t, ui.mono)
          : div()
              .flex_1()
              .min_h(0)
              .relative()
              .child(
                v_flex()
                  .id(scroll)
                  .absolute()
                  .inset_0()
                  .overflow_y_scroll()
                  .p(14)
                  .gap(10)
                  .children(detailBody(m, rows, t, dispatch, ui, now)),
              )
              .child(Scrollbar.vertical(scroll).absolute().inset_0()),
      )
  );
}

function footer(m: Model, rows: Bead[], t: Theme, wide: boolean): Element {
  const s = m.snapshot;
  // Shown of total is in the search box; the footer keeps what the box does not say.
  const counts = s === null ? "" : `${s.ready.size} ready`;
  return h_flex()
    .h(26)
    .flex_none()
    .px(12)
    .gap(12)
    .items_center()
    .border_t(1)
    .border_color(t.border)
    .text_size(11)
    .text_color(t.muted)
    .child(div().flex_1().min_w(0).truncate().child(counts))
    .child(
      div()
        .flex_none()
        .child(wide ? "/ search · ↵ open · ? keys" : "↵ open"),
    );
}

// A message in the middle of the Viewer, for when there is no list to draw.
function emptyView(title: string, hint: string | null, retry: boolean, loading: boolean, t: Theme, dispatch: Dispatch): Element {
  return v_flex()
    .flex_1()
    .min_h(0)
    .p(14)
    .gap(8)
    .items_center()
    .justify_center()
    .text_center()
    .child(div().text_color(t.muted).child(title))
    .when(hint !== null, (e) =>
      e.child(
        div()
          .text_size(12)
          .text_color(t.dim)
          .child(hint ?? ""),
      ),
    )
    .when(retry, (e) => e.child(button("retry-load", retryLabel(loading), false, t, () => dispatch({ _tag: "Refresh" })).opacity(loading ? 0.6 : 1)));
}

const errorText = (m: Model): string | null => (m.error === null ? null : bdText(m.error));

export function draw(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element {
  const wide = isWide(m);
  const detailFull = !wide && m.pane === "detail";
  const error = errorText(m);
  const empty = emptyState(m, ui.root);
  return v_flex()
    .id("beads")
    .size_full()
    .min_h(0)
    .overflow_hidden()
    .bg(t.background)
    .text_color(t.foreground)
    .text_size(13)
    .track_focus(ui.nav)
    .on_size_change((size) => dispatch({ _tag: "Resized", width: Math.round(size.width) }))
    .on_key_down((ev, cx) => {
      const msg = keyFor(m, ev.keystroke);
      if (msg !== null) {
        dispatch(msg);
        cx.stop_propagation();
      }
    })
    .when(empty !== null, (e) => e.child(emptyView(empty?.title ?? "", empty?.hint ?? null, empty?.retry ?? false, m.loading, t, dispatch)))
    .when(empty === null && detailFull, (e) => e.child(detailPane(m, rows, t, dispatch, ui, true, now)))
    .when(empty === null && !detailFull, (e) =>
      e
        .child(
          m.help
            ? keysPanel(t, ui.mono)
            : wide
              ? h_flex()
                  .flex_1()
                  .min_h(0)
                  // A row centres its children; both columns need the full height for their headers and scroll areas.
                  .items_stretch()
                  .child(list(m, rows, t, dispatch, ui, error, now, true).w(listWidth(m.width)).flex_none())
                  .child(detailPane(m, rows, t, dispatch, ui, false, now))
              : list(m, rows, t, dispatch, ui, error, now, false).flex_1(),
        )
        .child(footer(m, rows, t, wide)),
    );
}

// The list column: its toolbar, bd's error with Retry while the last good list stays under it, then the rows.
function list(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, error: string | null, now: number, wide: boolean): Element {
  return v_flex()
    .min_h(0)
    .child(topBar(m, rows, t, dispatch, ui, !wide || listWidth(m.width) < 480))
    .when(error !== null, (x) =>
      x.child(
        h_flex()
          .px(12)
          .py(6)
          .gap(8)
          .items_center()
          .flex_none()
          .text_size(12)
          .child(
            div()
              .flex_1()
              .min_w(0)
              .text_color(pick(t, "red", "ansi1"))
              .child(error ?? ""),
          )
          .child(button("retry-load", "Retry", false, t, () => dispatch({ _tag: "Refresh" }))),
      ),
    )
    .child(listColumn(m, rows, t, dispatch, ui, !wide, now));
}
