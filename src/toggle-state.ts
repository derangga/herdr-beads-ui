// What the tab-bar button knows and does, apart from its drawing, so tests can load it without gpui-kit (toggle.ts).
import type { Host } from "./host.ts";

export const TOGGLE_MS = 500;

const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const field = (o: unknown, key: string): unknown => (typeof o === "object" && o !== null ? (o as Record<string, unknown>)[key] : undefined);

export const isToggle = (props: unknown): boolean => field(props, "role") === "toggle";
// The button's bottom border continues a tab bar's divider; props `underline: false` drop it for layouts whose tab
// bar is a rounded card with no divider.
export const hasUnderline = (props: unknown): boolean => field(props, "underline") !== false;
// The copy herdr shows as the keys dialog (main.ts opens it with openOverlay).
export const isKeys = (props: unknown): boolean => field(props, "role") === "keys";
// The overlay id herdr gives a copy it shows above everything, which the copy closes itself with.
export const overlayOf = (props: unknown): string | null => text(field(props, "overlay"));

// The id of the Viewer in the focused tab, or null when that tab has none. A mod pane in panes() carries `mod` and `tab` and
// no terminal, so decodePanes would drop it.
export function beadsPane(panes: unknown, focus: unknown): string | null {
  const tab = text(field(focus, "tab"));
  if (tab === null || !Array.isArray(panes)) {
    return null;
  }
  return text(
    field(
      panes.find((p: unknown) => field(p, "mod") === "beads" && field(p, "tab") === tab),
      "pane",
    ),
  );
}

// The same split as the cmd-shift-b key, or a close of the Viewer that is open.
export function clickToggle(host: Host): void {
  const pane = beadsPane(host.panes(), host.focused());
  if (pane === null) {
    host.run("pane.split", { direction: "right", mod: "beads" });
  } else {
    host.run("pane.close", { pane });
  }
}

// shortcut: polls panes() because herdr.d.ts does not say a mod redraws when a pane opens or closes (herdr-review does the
// same); drop it if it does. The caller cancels the returned task on close.
export function watchToggle(cx: { timer: { every(ms: number, f: () => void): { cancel(): void } }; notify(): void }, host: Host, state: { pane: string | null }): { cancel(): void } {
  return cx.timer.every(TOGGLE_MS, () => {
    const now = beadsPane(host.panes(), host.focused());
    if (now !== state.pane) {
      state.pane = now;
      cx.notify();
    }
  });
}
