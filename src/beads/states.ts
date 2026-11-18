// What the Viewer shows when there is nothing to list: pure, so tests load it without gpui-kit (view.ts draws it).
import { decodeFocus, decodePanes, decodeProps, isRemoteTab } from "./decode.ts";
import type { Host } from "./host.ts";
import { openerOf } from "./rows.ts";
import type { BdError, Model } from "./types.ts";
import { initModel } from "./update.ts";

// Whether the Viewer takes the keyboard back: herdr's focus is on its own pane, its handle lost the keyboard, and neither
// a text box (search, close reason) nor a menu holds it.
export const takesKeyboard = (own: string | null, focusedPane: string | null, hasKeyboard: boolean, m: Pick<Model, "searching" | "menu">): boolean => own !== null && focusedPane === own && !hasKeyboard && !m.searching && m.menu === null;

// The Viewed repo and the first Model. The props say the folder when something opened the Viewer for one, else the focused terminal's
// folder is the Opener's. `root` is null when no bd may run: no folder, or the Opener's space is on another machine.
export function start(host: Host): { root: string | null; model: Model } {
  const props = decodeProps(host.props());
  const focus = decodeFocus(host.focused());
  const folder = props.root ?? focus?.cwd ?? null;
  const opener = openerOf(props.opener, focus, decodePanes(host.panes()));
  const model = initModel(opener);
  if (folder === null) {
    return { root: null, model: { ...model, error: { _tag: "NoOpener" } } };
  }
  return isRemoteTab(host.spaces(), opener.tab) ? { root: null, model: { ...model, error: { _tag: "RemoteSpace" } } } : { root: folder, model };
}

// A message that replaces the whole Viewer. A failed load with a list to keep shows as a banner over that list instead.
export type Empty = { title: string; hint: string | null; retry: boolean };

export function emptyState(m: Model, root: string | null): Empty | null {
  switch (m.error?._tag) {
    case "NoOpener":
      return { title: "Open from a terminal", hint: null, retry: false };
    case "RemoteSpace":
      return { title: "Remote spaces aren't supported yet", hint: null, retry: false };
    case "NoDatabase":
      return m.snapshot === null ? { title: `No beads database in ${root ?? "this folder"}`, hint: "Run bd init in that folder to create one.", retry: true } : null;
    default:
      return null;
  }
}

// The empty screen's Retry button while a retry runs.
export const retryLabel = (loading: boolean): string => (loading ? "Retrying…" : "Retry");

// bd's own words, and for output the Viewer could not read, bd's version. NoOpener and RemoteSpace replace the whole Viewer
// (emptyState), so they never reach a line of text.
export const bdText = (e: BdError): string => (e._tag === "Undecodable" ? `bd ${e.version ?? "(version unknown)"} gave output this viewer does not understand: ${e.path} ${e.detail}` : "text" in e ? e.text : e._tag);
