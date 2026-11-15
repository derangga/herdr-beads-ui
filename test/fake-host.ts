// A Host that answers exec from a function, records every call, and sleeps instantly. Only the tests use it.
import { readFileSync } from "node:fs";
import type { ExecResult, Host } from "../src/host.ts";

export const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");

export type Reply = ExecResult | Error;
export type Call = { command: string; args: string[]; cwd?: string; timeout?: number };

export const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: "" });
export const exit = (stderr: string, stdout = ""): ExecResult => ({ code: 1, stdout, stderr });

export function fakeHost(exec: (call: Call, n: number) => Reply): { host: Host; calls: Call[]; sleeps: number[] } {
  const calls: Call[] = [];
  const sleeps: number[] = [];
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
      return Promise.resolve();
    },
    run: () => null,
    focused: () => null,
    panes: () => [],
    agents: () => [],
    spaces: () => [],
    props: () => ({}),
    settings: () => ({}),
    nextCommand: () => new Promise<string>(() => {}),
    theme: () => ({}),
    readClipboard: () => undefined,
    writeClipboard: () => {},
  };
  return { host, calls, sleeps };
}
