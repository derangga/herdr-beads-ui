// The tab-bar button: the copy of the mod a layout puts beside herdr-review's Annotate button with props `role: "toggle"`.
// It is lit while the focused tab has a Viewer, and a click opens one or closes it.
import { svg } from "gpui-kit";
import type { Element } from "gpui-kit";
import { h_flex } from "gpui-base";

export function drawToggle(on: boolean, t: Record<string, `#${string}`>, click: () => void): Element {
  return h_flex()
    .size_full()
    .pr(10)
    .items_center()
    .bg(t.chrome)
    .border_b(1)
    .border_color(t.border)
    .child(
      h_flex()
        .id("toggle-beads")
        .h(26)
        .px(8)
        .gap(5)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(12)
        .bg(on ? t.selected : t.chrome)
        .text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover))
        // The block may be a window_drag one: the press stays on the button.
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(click)
        .child(svg("mods/beads/icons/task.svg").size(14))
        .child("Beads"),
    );
}
