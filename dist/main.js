// src/main.ts
import { View, div } from "gpui-kit";
import { focused, theme } from "herdr";
var BeadsView = class extends View {
  root = null;
  init(_props, _cx) {
    this.root = focused()?.cwd ?? null;
  }
  render(_cx) {
    const colors = theme();
    return div().size_full().p(12).bg(colors.background).text_color(colors.foreground).child(this.root ?? "Open from a terminal");
  }
};
export {
  BeadsView as default
};
