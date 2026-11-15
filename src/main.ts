// Placeholder: draws the Viewed repo. The model lives on the instance, never in module scope.
import { View, div } from "gpui-kit";
import type { AsyncContext, Context, Element } from "gpui-kit";
import { focused, theme } from "herdr";

export default class BeadsView extends View {
  root: string | null = null;

  init(_props: unknown, _cx: AsyncContext): void {
    this.root = focused()?.cwd ?? null;
  }

  render(_cx: Context): Element {
    // theme() says string, the setters want `#${string}`: the one cast.
    const colors = theme() as Record<string, `#${string}`>;
    return div()
      .size_full()
      .p(12)
      .bg(colors.background)
      .text_color(colors.foreground)
      .child(this.root ?? "Open from a terminal");
  }
}
