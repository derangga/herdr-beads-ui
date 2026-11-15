// Runs bd in the Viewed repo and returns a value: the decoded data or a tagged BdError. Nothing here throws.
import { decodeAgents, decodeBlocked, decodeComments, decodeFocus, decodeList, decodePanes, decodeReady, decodeShow, decodeStatuses, decodeTree } from "./decode.ts";
import type { ExecResult, Host } from "./host.ts";
import { pickTarget } from "./rows.ts";
import type { BdError, Cmd, Direction, Msg, Res, Timer } from "./types.ts";

const BD_TIMEOUT_MS = 15_000;
// Another bd process can hold the database for a moment, so a locked or slow call is tried twice more.
const RETRY_DELAYS_MS = [300, 900];
// A bead must stay shown this long before bd is asked about it, so holding j runs bd only for the bead it stops on.
// A detail still empty after the second shows "Loading", so a fast bd never flashes it. Both count from the selection.
export const WAIT_MS: Record<Timer, number> = { fetch: 120, loading: 150 };
// How long "Copied" and "Sent to <agent>" stay on the button.
export const FADE_MS = 1200;
// pane.focus lands about 100 ms after run() returns; this is the poll and its limit.
const FOCUS_POLL_MS = 50;
const FOCUS_POLLS = 30;
// terminal.paste reads the clipboard some time after run() returns, so the old text waits at least this long (design/herdr-app-facts.md).
export const PASTE_MS = 300;

const fail = (error: BdError): Res<never> => ({ ok: false, error });

// With --json some bd errors (the maintenance lock, a missing id) are JSON on stdout and stderr is empty, and a
// warning can sit on stderr beside an error on stdout, so both streams are read.
function errorText({ stdout, stderr }: ExecResult): string {
  let out = stdout.trim();
  try {
    const message = (JSON.parse(stdout) as { error?: unknown }).error;
    out = typeof message === "string" ? message : out;
  } catch {
    // not JSON: the plain text stands
  }
  return [stderr.trim(), out].filter((part) => part !== "").join("\n");
}

// bd 1.3.4 exits 1 for every failure, so the text decides.
export function classify(result: ExecResult): BdError {
  const text = errorText(result);
  if (text.includes("no beads database found")) {
    return { _tag: "NoDatabase", text };
  }
  if (text.includes("maintenance operation is running")) {
    return { _tag: "BdLocked", text };
  }
  // show: "Issue <id> not found" or "no issues found matching"; dep tree and comments: "no issue found matching".
  if (/^Issue \S+ not found/m.test(text) || /no issues? found matching/.test(text)) {
    return { _tag: "BeadGone", text };
  }
  return { _tag: "BdRejected", code: result.code, text };
}

// exec rejects with "`herdr.exec`: <program> took longer than <n> s and was stopped" on a timeout and
// "`herdr.exec`: cannot run <program>: <os error>" when it cannot start, and the second reads the same for a
// missing program and a missing cwd. A bd that starts without the cwd tells them apart.
async function rejection(host: Host, text: string): Promise<BdError> {
  if (/took longer than .* and was stopped/.test(text)) {
    return { _tag: "BdTimeout", text };
  }
  if (!text.includes("cannot run ")) {
    return { _tag: "BdRejected", code: -1, text };
  }
  const bdStarts = await host.exec("bd", ["--version"], { timeout: BD_TIMEOUT_MS }).then(
    () => true,
    () => false,
  );
  return bdStarts ? { _tag: "BdRejected", code: -1, text } : { _tag: "BdMissing", text };
}

async function once(host: Host, root: string, args: string[]): Promise<Res<string>> {
  let result: ExecResult;
  try {
    result = await host.exec("bd", args, { cwd: root, timeout: BD_TIMEOUT_MS });
  } catch (e) {
    return fail(await rejection(host, e instanceof Error ? e.message : String(e)));
  }
  return result.code === 0 ? { ok: true, value: result.stdout } : fail(classify(result));
}

// The retry wraps the call, so no caller repeats it.
export async function bd(host: Host, root: string, args: string[]): Promise<Res<string>> {
  let res = await once(host, root, args);
  for (const delay of RETRY_DELAYS_MS) {
    if (res.ok || (res.error._tag !== "BdLocked" && res.error._tag !== "BdTimeout")) {
      break;
    }
    await host.sleep(delay);
    res = await once(host, root, args);
  }
  return res;
}

async function bdVersion(host: Host, root: string): Promise<string | null> {
  const res = await once(host, root, ["--version"]);
  return res.ok ? (res.value.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null) : null;
}

// The version is asked for only when a decode fails, so the good path costs one bd call.
export async function bdJson<T>(host: Host, root: string, args: string[], decode: (text: string, version: string | null) => Res<T>): Promise<Res<T>> {
  const out = await bd(host, root, args);
  if (!out.ok) {
    return out;
  }
  const res = decode(out.value, null);
  if (res.ok || res.error._tag !== "Undecodable") {
    return res;
  }
  return decode(out.value, await bdVersion(host, root));
}

export const listBeads = (host: Host, root: string) => bdJson(host, root, ["list", "--all", "-n", "0", "--brief", "--json"], decodeList);
export const readyIds = (host: Host, root: string) => bdJson(host, root, ["ready", "-n", "0", "--json"], decodeReady);
export const blockedBeads = (host: Host, root: string) => bdJson(host, root, ["blocked", "--json"], decodeBlocked);
export const showBead = (host: Host, root: string, id: string) => bdJson(host, root, ["show", id, "--json"], decodeShow);
export const depTree = (host: Host, root: string, id: string, direction: Direction) => bdJson(host, root, ["dep", "tree", id, `--direction=${direction}`, "--json"], decodeTree);
export const beadComments = (host: Host, root: string, id: string) => bdJson(host, root, ["comments", id, "--json"], decodeComments);
export const statuses = (host: Host, root: string) => bdJson(host, root, ["statuses", "--json"], decodeStatuses);

// A status write is the same call again when it is retried, so the runner's lock retry covers these too.
export const updateStatus = (host: Host, root: string, id: string, status: string) => bd(host, root, ["update", id, "--status", status]);
export const closeBead = (host: Host, root: string, id: string, reason: string) => bd(host, root, ["close", id, ...(reason === "" ? [] : ["--reason", reason])]);
export const reopenBead = (host: Host, root: string, id: string) => bd(host, root, ["reopen", id]);

// bd close and bd reopen own the closed state, so leaving or entering closed is theirs and every other move is bd update. Leaving
// closed for something but open takes two calls, and `second` tells which one an error is of.
async function write(host: Host, root: string, { id, from, to, reason }: Extract<Cmd, { _tag: "Write" }>): Promise<Msg> {
  const done = (res: Res<string>, second: boolean): Msg => ({ _tag: "Written", id, to, error: res.ok ? null : res.error, second });
  if (to === "closed") {
    return done(await closeBead(host, root, id, reason), false);
  }
  if (from !== "closed") {
    return done(await updateStatus(host, root, id, to), false);
  }
  const reopened = await reopenBead(host, root, id);
  return !reopened.ok || to === "open" ? done(reopened, false) : done(await updateStatus(host, root, id, to), true);
}

// Types `Work on bead <id>: <title>` into the target agent without Enter. The text rides the clipboard, which is the user's, so
// the old text is kept and written back. An image on the clipboard cannot be read, so it is not restored.
async function send(host: Host, { id, title, opener }: Extract<Cmd, { _tag: "Send" }>): Promise<Msg> {
  const target = pickTarget(opener, decodePanes(host.panes()), decodeAgents(host.agents()));
  if (target === null) {
    return { _tag: "SendFailed", error: { _tag: "NoTarget" } };
  }
  const kept = host.readClipboard();
  const restore = (): void => {
    if (kept !== undefined) {
      host.writeClipboard(kept);
    }
  };
  try {
    host.writeClipboard(`Work on bead ${id}: ${title}`);
    host.run("pane.focus", { terminal: target.terminal });
    // terminal.paste goes to whatever has the keyboard, so nothing is pasted until the target is seen to have it.
    for (let i = 0; decodeFocus(host.focused())?.terminal !== target.terminal; i++) {
      if (i === FOCUS_POLLS) {
        restore();
        return { _tag: "SendFailed", error: { _tag: "TargetGone" } };
      }
      await host.sleep(FOCUS_POLL_MS);
    }
    host.run("terminal.paste");
    await host.sleep(PASTE_MS);
    restore();
    return { _tag: "Sent", agent: target.name };
  } catch (e) {
    restore();
    return { _tag: "SendFailed", error: { _tag: "SendRejected", text: e instanceof Error ? e.message : String(e) } };
  }
}

// Runs a Cmd and answers with a Msg. The three list reads go at once; the first error in list, ready, blocked order wins.
export async function run(host: Host, root: string, cmd: Cmd): Promise<Msg> {
  switch (cmd._tag) {
    case "Load": {
      const [beads, ready, blocked] = await Promise.all([listBeads(host, root), readyIds(host, root), blockedBeads(host, root)]);
      if (!beads.ok) {
        return { _tag: "Loaded", res: beads };
      }
      if (!ready.ok) {
        return { _tag: "Loaded", res: ready };
      }
      if (!blocked.ok) {
        return { _tag: "Loaded", res: blocked };
      }
      const locks = new Map(blocked.value.map((b) => [b.id, b.blocked_by_count]));
      return { _tag: "Loaded", res: { ok: true, value: { beads: beads.value, ready: new Set(ready.value), locks } } };
    }
    case "WaitLoad":
      await host.sleep(WAIT_MS.loading);
      return { _tag: "Slowed", n: cmd.n };
    case "Fetch":
      switch (cmd.part) {
        case "show":
          return { _tag: "Shown", id: cmd.id, gen: cmd.gen, res: await showBead(host, root, cmd.id) };
        case "down":
        case "up":
          return { _tag: "Tree", id: cmd.id, gen: cmd.gen, direction: cmd.part, res: await depTree(host, root, cmd.id, cmd.part) };
        case "comments":
          return { _tag: "Discussed", id: cmd.id, gen: cmd.gen, res: await beadComments(host, root, cmd.id) };
      }
    case "Wait":
      await host.sleep(WAIT_MS[cmd.timer]);
      return { _tag: "Waited", id: cmd.id, gen: cmd.gen, timer: cmd.timer };
    case "Statuses":
      return { _tag: "StatusesRead", res: await statuses(host, root) };
    case "Write":
      return write(host, root, cmd);
    case "Copy":
      host.writeClipboard(cmd.id);
      await host.sleep(FADE_MS);
      return { _tag: "Faded", what: "copied", n: cmd.n };
    case "Send":
      return send(host, cmd);
    case "Fade":
      await host.sleep(FADE_MS);
      return { _tag: "Faded", what: cmd.what, n: cmd.n };
  }
}
