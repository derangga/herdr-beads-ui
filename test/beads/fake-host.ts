// A Host that answers exec from a function, records every call, and sleeps instantly. Only the tests use it.
import { readFileSync } from "node:fs";
import type { ExecResult, Host } from "../../src/beads/host.ts";

export const fixture = (name: string, ext = "json"): string => readFileSync(new URL(`./fixtures/${name}.${ext}`, import.meta.url), "utf8");

export type Reply = ExecResult | Error;
export type Call = { command: string; args: string[]; cwd?: string; timeout?: number };

export const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: "" });
export const exit = (stderr: string, stdout = ""): ExecResult => ({ code: 1, stdout, stderr });

// `over` replaces Host members; `events` lists, in order, every sleep, run and clipboard write the defaults saw.
export function fakeHost(exec: (call: Call, n: number) => Reply, over: Partial<Host> = {}): { host: Host; calls: Call[]; sleeps: number[]; events: string[] } {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const events: string[] = [];
  const host: Host = {
    async exec(command, args, options) {
      const call = { command, args, ...options };
      calls.push(call);
      const reply = exec(call, calls.length);
      if (reply instanceof Error) {
        throw reply;
      }
      return reply;
    },
    sleep(ms) {
      sleeps.push(ms);
      events.push(`sleep ${ms}`);
      return Promise.resolve();
    },
    run(name, args) {
      events.push(`run ${name} ${JSON.stringify(args ?? {})}`);
      return null;
    },
    openOverlay(spec) {
      events.push(`overlay ${JSON.stringify(spec)}`);
      return "o1";
    },
    closeOverlay(id) {
      events.push(`close ${id}`);
      return null;
    },
    focused: () => null,
    panes: () => [],
    agents: () => [],
    spaces: () => [],
    props: () => ({}),
    settings: () => ({}),
    nextCommand: () => new Promise<string>(() => {}),
    theme: () => ({}),
    readClipboard: () => undefined,
    writeClipboard: (text) => {
      events.push(`clipboard ${text}`);
    },
    ...over,
  };
  return { host, calls, sleeps, events };
}
