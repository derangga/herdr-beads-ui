// Placeholder: draws the Viewed repo. The model lives on the instance, never in module scope.
import { View, div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { decodeFocus } from "./decode.ts";
import { realHost } from "./host.ts";
import type { Host } from "./host.ts";

export default class BeadsView extends View {
  host: Host | null = null;
  root: string | null = null;

  init(_props: unknown, cx: AsyncContext): void {
    this.host = realHost(cx);
    this.root = decodeFocus(this.host.focused())?.cwd ?? null;
  }

  render(_cx: Context): Element {
    const colors = this.host?.theme() ?? {};
    return div()
      .size_full()
      .p(12)
      .bg(colors.background)
      .text_color(colors.foreground)
      .child(this.root ?? "Open from a terminal");
  }
}
