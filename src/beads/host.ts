// The only module that imports "herdr". Everything else gets a Host, so tests swap in a FakeHost.
import { agents, closeOverlay, exec, focused, nextCommand, openOverlay, panes, props, run, settings, spaces, theme } from "herdr";
import type { AsyncContext } from "gpui-kit";

export type ExecResult = { code: number; stdout: string; stderr: string };

export interface Host {
  // Rejects when the program cannot start or the timeout passes.
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
  // Mods have no setTimeout, so waiting goes through the host and a FakeHost can make it instant.
  sleep(ms: number): Promise<void>;
  run(name: string, args?: Record<string, unknown>): null;
  // A copy of a mod above everything (kind "dialog": centred, dims the window); answers its id, which the copy gets as props().overlay.
  openOverlay(spec: { mod: string; props?: Record<string, unknown>; kind?: "dialog"; width?: number; height?: number }): string;
  closeOverlay(id: string): null;
  // Untrusted: decoded in decode.ts before use.
  focused(): unknown;
  panes(): unknown;
  agents(): unknown;
  spaces(): unknown;
  props(): unknown;
  settings(): unknown;
  // Waits for the next key command sent to this mod ("focus" when pane.go lands on it).
  nextCommand(): Promise<string>;
  theme(): Record<string, `#${string}`>;
  readClipboard(): string | undefined;
  writeClipboard(text: string): void;
}

export const realHost = (cx: AsyncContext): Host => ({
  exec: (command, args, options) => exec(command, args, options),
  sleep: (ms) => cx.sleep(ms),
  run: (name, args) => run(name, args),
  openOverlay: (spec) => openOverlay(spec),
  closeOverlay: (id) => closeOverlay(id),
  focused: () => focused(),
  panes: () => panes(),
  agents: () => agents(),
  spaces: () => spaces(),
  props: () => props(),
  settings: () => settings(),
  nextCommand: () => nextCommand(),
  // The setters want `#${string}` and theme() says string: the one cast.
  theme: () => theme() as Record<string, `#${string}`>,
  readClipboard: () => cx.read_from_clipboard(),
  writeClipboard: (text) => cx.write_to_clipboard(text),
});
