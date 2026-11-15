// GPUI drawing. It holds no state and calls no Host method: everything it shows is in the model, the rows and the theme,
// and every press is a Msg handed to dispatch.
import { div, svg, uniform_list } from "gpui-kit";
import type { Element, FocusHandle } from "gpui-kit";
import { h_flex, Input, Popup, Scrollbar, TextView, v_flex } from "gpui-base";
import type { InputState, VirtualListScrollHandle } from "gpui-base";
import { age, ALL, fullDate, hiddenByFilters, idChars, isWide, keyFor, listWidth, NO_AGE_BELOW, NOT_CLOSED, ROW_H, shownId, SORT_KEYS, statusOptions, textSections, typeOptions } from "./rows.ts";
import type { BdError, Bead, BeadDetail, Detail, Menu, Model, Msg, Part, PartName } from "./types.ts";

export type Theme = Record<string, `#${string}`>;
type Dispatch = (msg: Msg) => void;
// What the view owns and the model must not hold: the focus target keys reach, the search box, the list's scroll position,
// the id font, and `seen`, which hears the rows the list just drew so the owner can tell whether a row is on screen.
export type Ui = { nav: FocusHandle; search: InputState; scroll: VirtualListScrollHandle; mono: string; seen: (start: number, end: number) => void };

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

const SORT_LABEL = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

// Input.new is already a framed editor, so nothing draws a border around it.
function searchBox(ui: Ui): Element {
  return (
    div()
      .id("search")
      .flex_1()
      .min_w(120)
      // A press in the box is the box's own: it must not hand the keyboard to the Viewer behind it.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(ui.search).h(26).w_full().text_size(12))
  );
}

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
    .when(m.menu === name, (e) =>
      e.content(
        v_flex()
          .min_w(140)
          .py(4)
          .rounded(8)
          .border_1()
          .border_color(t.border)
          .bg(t.popover)
          .children(
            options.map((o) =>
              h_flex()
                .id(`option-${name}-${o.label}`)
                .h(26)
                .px(10)
                .gap(8)
                .items_center()
                .text_size(12)
                .text_color(o.on ? t.accent : t.foreground)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .active((s) => s.bg(t.selected))
                .on_click((_e, cx) => {
                  cx.stop_propagation();
                  dispatch(o.msg);
                })
                .child(o.label),
            ),
          ),
      ),
    );
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

function topBar(m: Model, t: Theme, dispatch: Dispatch, ui: Ui, wide: boolean): Element {
  const refresh = iconButton("refresh", "refresh", "Refresh (Ctrl+R)", t, () => dispatch({ _tag: "Refresh" }), m.loading);
  return v_flex()
    .flex_none()
    .border_b(1)
    .border_color(t.border)
    .child(
      h_flex()
        .px(8)
        .py(6)
        .gap(6)
        .items_center()
        .child(searchBox(ui))
        .when(wide, (e) => e.children(filters(m, t, dispatch, false)))
        .child(refresh),
    )
    .when(!wide, (e) =>
      e.child(
        h_flex()
          .px(8)
          .pb(6)
          .gap(6)
          .items_center()
          .children(filters(m, t, dispatch, true)),
      ),
    );
}

function row(b: Bead, m: Model, t: Theme, narrow: boolean, now: number, idW: number, mono: string): Element {
  const closed = b.status === "closed";
  const selected = b.id === m.selected;
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
            .child(m.snapshot === null ? (m.loading ? "Loading beads..." : "") : "No beads match")
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

const bdText = (e: BdError): string => ("text" in e ? e.text : `bd ${e.version ?? "(version unknown)"} gave output this viewer does not understand: ${e.path} ${e.detail}`);

const heading = (label: string, t: Theme): Element => div().text_size(11).font_semibold().text_color(t.muted).child(label.toUpperCase());

const section = (label: string, t: Theme, ...body: Element[]): Element => v_flex().gap(4).flex_none().child(heading(label, t)).children(body);

// A markdown body. The id carries the bead, so another bead's text is never drawn into this one's view state.
const markdown = (id: string, text: string): Element => TextView.markdown(id, text).selectable(true).scrollable(false).w_full().min_w(0);

const red = (t: Theme): `#${string}` => pick(t, "red", "ansi1");

// A section that failed: what bd said, and a button that reruns only that call.
function failed(label: string, error: BdError, part: PartName, t: Theme, dispatch: Dispatch): Element {
  return section(label, t, div().text_size(12).text_color(red(t)).child(bdText(error)), h_flex().child(button(`retry-${part}`, "Retry", false, t, () => dispatch({ _tag: "Retry", part }))));
}

function metaRow(b: BeadDetail, t: Theme, ui: Ui, now: number): Element {
  const status = statusColor(b.status, t);
  const ago = age(b.created_at, now);
  return h_flex()
    .flex_wrap()
    .gap_x(10)
    .gap_y(4)
    .items_center()
    .text_size(12)
    .child(div().font_family(ui.mono).text_size(12).text_color(t.muted).child(b.id))
    .child(div().px(6).rounded(4).border_1().border_color(status).text_size(10).font_semibold().text_color(status).child(statusLabel(b.status)))
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

function beadBody(d: BeadDetail, e: Detail, hidden: boolean, t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element[] {
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
    metaRow(d, t, ui, now),
    ...(d.labels.length === 0
      ? []
      : [
          h_flex()
            .flex_wrap()
            .gap(4)
            .flex_none()
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
        ]),
    ...textSections(d).map(([label, text]) => section(label, t, markdown(`md-${d.id}-${label}`, text))),
    // The trees are drawn by the next piece of work; only a failure shows for now.
    ...(["down", "up"] as const).flatMap((part) => {
      const p = e[part];
      return p._tag === "Failed" ? [failed(part === "down" ? "Blocked by" : "Blocks", p.error, part, t, dispatch)] : [];
    }),
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
  const bead = show._tag === "Ready" ? show.value : show.prev;
  if (bead === null) {
    return entry.slow ? [note("Loading")] : [];
  }
  return beadBody(bead, entry, hiddenByFilters(m, rows), t, dispatch, ui, now);
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
      .when(narrow, (e) =>
        e.child(
          h_flex()
            .h(36)
            .flex_none()
            .px(8)
            .items_center()
            .border_b(1)
            .border_color(t.border)
            .child(
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
        ),
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
  const counts = s === null ? "" : wide ? `${rows.length} of ${s.beads.length} · ${s.ready.size} ready` : `${rows.length} of ${s.beads.length}`;
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

const errorText = (m: Model): string | null => (m.error === null ? null : bdText(m.error));

export function draw(m: Model, rows: Bead[], t: Theme, dispatch: Dispatch, ui: Ui, now: number): Element {
  const wide = isWide(m);
  const detailFull = !wide && m.pane === "detail";
  const error = errorText(m);
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
    .when(detailFull, (e) => e.child(detailPane(m, rows, t, dispatch, ui, true, now)))
    .when(!detailFull, (e) =>
      e
        .child(topBar(m, t, dispatch, ui, wide))
        .when(error !== null, (x) =>
          x.child(
            div()
              .px(12)
              .py(6)
              .flex_none()
              .text_size(12)
              .text_color(pick(t, "red", "ansi1"))
              .child(error ?? ""),
          ),
        )
        .child(
          m.help
            ? keysPanel(t, ui.mono)
            : wide
              ? h_flex()
                  .flex_1()
                  .min_h(0)
                  .child(
                    v_flex()
                      .w(listWidth(m.width))
                      .h_full()
                      .flex_none()
                      .child(listColumn(m, rows, t, dispatch, ui, false, now)),
                  )
                  .child(detailPane(m, rows, t, dispatch, ui, false, now))
              : listColumn(m, rows, t, dispatch, ui, true, now),
        )
        .child(footer(m, rows, t, wide)),
    );
}
