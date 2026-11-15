import { test } from "node:test";
import assert from "node:assert/strict";
import { keyFor, openerOf, pickTarget } from "../src/rows.ts";
import { run } from "../src/runner.ts";
import type { AgentRef, Cmd, Msg, Opener, PaneRef } from "../src/types.ts";
import { initModel, update } from "../src/update.ts";
import { exit, fakeHost } from "./fake-host.ts";
import { bead, detail, modelOf, steps } from "./model.ts";

const opener: Opener = { terminal: "t1", tab: "b1" };
const pane = (p: string, terminal: string | null, over: Partial<PaneRef> = {}): PaneRef => ({ pane: p, terminal, tab: "b1", status: null, name: "zsh", ...over });
const agent = (p: string, seq: number, over: Partial<AgentRef> = {}): AgentRef => ({ pane: p, tab: "b1", seq, name: `agent-${p}`, ...over });

test("target: the Opener when an agent runs there, whatever else is in the tab", () => {
  const panes = [pane("p1", "t1", { status: "idle", name: "Claude Code" }), pane("p2", "t2", { status: "working" })];
  assert.deepEqual(pickTarget(opener, panes, [agent("p2", 9)]), { terminal: "t1", name: "Claude Code" });
});

test("target: a shell Opener sends to the agent of its tab that changed last, and not to one in another tab", () => {
  const panes = [pane("p1", "t1"), pane("p2", "t2"), pane("p3", "t3"), pane("p4", "t4")];
  const agents = [agent("p2", 5), agent("p3", 8), agent("p4", 99, { tab: "b2" })];
  assert.deepEqual(pickTarget(opener, panes, agents), { terminal: "t3", name: "agent-p3" });
});

test("target: none without an agent in the tab, or when the agent's pane has no terminal", () => {
  assert.equal(pickTarget(opener, [pane("p1", "t1")], []), null);
  assert.equal(pickTarget(opener, [pane("p1", "t1"), pane("p2", null)], [agent("p2", 1)]), null);
  assert.equal(pickTarget({ terminal: null, tab: null }, [pane("p1", "t1")], []), null);
});

// What panes() and agents() hand over: the name is a title.
const hostShaped = (refs: (PaneRef | AgentRef)[]) => refs.map(({ name, ...rest }) => ({ ...rest, title: name }));

const SEND: Extract<Cmd, { _tag: "Send" }> = { _tag: "Send", id: "a-1", title: "Fix it", opener };
const panes = [pane("p1", "t1"), pane("p2", "t2", { status: "idle", name: "claude" })];
const agents = [agent("p2", 3, { name: "claude" })];
const focus = (terminal: string | null) => ({ space: "s", tab: "b1", pane: null, terminal, shown: null, agent: null, cwd: null });

test("send: the prompt is pasted once the agent has focus, and the old text comes back only after the wait", async () => {
  let focusedAt: string | null = "t9";
  const { host, events } = fakeHost(() => exit(""), {
    panes: () => hostShaped(panes),
    agents: () => hostShaped(agents),
    readClipboard: () => "old text",
    // Focus lands on the second look, as it does a moment after pane.focus returns.
    focused: () => {
      const now = focusedAt;
      focusedAt = "t2";
      return focus(now);
    },
  });
  assert.deepEqual(await run(host, "/r", SEND), { _tag: "Sent", agent: "claude" });
  assert.deepEqual(events, ["clipboard Work on bead a-1: Fix it", 'run pane.focus {"terminal":"t2"}', "sleep 50", "run terminal.paste {}", "sleep 300", "clipboard old text"]);
});

test("send: focus that never lands pastes nothing, restores the clipboard and says the agent is gone", async () => {
  const { host, events } = fakeHost(() => exit(""), { panes: () => hostShaped(panes), agents: () => hostShaped(agents), readClipboard: () => "old text", focused: () => focus("t1") });
  const msg = await run(host, "/r", SEND);
  assert.deepEqual(msg, { _tag: "SendFailed", error: { _tag: "TargetGone" } });
  assert.ok(!events.some((e) => e.startsWith("run terminal.paste")));
  assert.equal(events.filter((e) => e === "sleep 50").length, 30);
  assert.equal(events.at(-1), "clipboard old text");
  const [m] = update({ ...initModel(opener), sending: true }, msg);
  assert.equal(m.sent?.text, "Agent is gone");
  assert.equal(m.sending, false);
});

test("send: no agent in the tab is NoTarget and touches nothing", async () => {
  const { host, events } = fakeHost(() => exit(""), { panes: () => hostShaped([pane("p1", "t1")]) });
  assert.deepEqual(await run(host, "/r", SEND), { _tag: "SendFailed", error: { _tag: "NoTarget" } });
  assert.deepEqual(events, []);
});

test("send: a rejected command restores the clipboard and is named", async () => {
  const { host, events } = fakeHost(() => exit(""), {
    panes: () => hostShaped(panes),
    agents: () => hostShaped(agents),
    readClipboard: () => "old text",
    run: () => {
      throw new Error("no such terminal");
    },
  });
  assert.deepEqual(await run(host, "/r", SEND), { _tag: "SendFailed", error: { _tag: "SendRejected", text: "no such terminal" } });
  assert.deepEqual(events, ["clipboard Work on bead a-1: Fix it", "clipboard old text"]);
});

test("send: with no text on the clipboard nothing is written back", async () => {
  const { host, events } = fakeHost(() => exit(""), { panes: () => hostShaped(panes), agents: () => hostShaped(agents), focused: () => focus("t2") });
  await run(host, "/r", SEND);
  assert.equal(events.filter((e) => e.startsWith("clipboard")).length, 1);
});

const shown = () => ({
  ...modelOf([bead("a-1", { title: "Fix it" })]),
  selected: "a-1",
  width: 900,
  details: new Map([["a-1", { show: { _tag: "Ready" as const, value: detail("a-1", { title: "Fix it" }) }, down: { _tag: "Ready" as const, value: [] }, up: { _tag: "Ready" as const, value: [] }, comments: { _tag: "Ready" as const, value: [] }, slow: false }]]),
  opener,
});

test("Send: one at a time, with the bead's id and title and the Opener", () => {
  const [sending, cmds] = update(shown(), { _tag: "Send" });
  assert.equal(sending.sending, true);
  assert.deepEqual(cmds, [SEND]);
  assert.deepEqual(update(sending, { _tag: "Send" })[1], []);
});

test("Sent: the button says who got it until its own timer runs out", () => {
  const [m, cmds] = update(shown(), { _tag: "Sent", agent: "claude" });
  assert.equal(m.sent?.text, "Sent to claude");
  assert.deepEqual(cmds, [{ _tag: "Fade", what: "sent", n: 1 }]);
  const [again] = update(m, { _tag: "Sent", agent: "pi" });
  // The first timer is for a label that is gone.
  assert.equal(update(again, { _tag: "Faded", what: "sent", n: 1 })[0].sent?.text, "Sent to pi");
  assert.equal(update(again, { _tag: "Faded", what: "sent", n: 2 })[0].sent, null);
});

test("Copy: y copies the shown bead's id, and Copied clears only on its own timer", async () => {
  assert.deepEqual(keyFor(shown(), "y"), { _tag: "Copy" });
  assert.equal(keyFor({ ...shown(), searching: true }, "y"), null);
  const [m, cmds] = update(shown(), { _tag: "Copy" });
  assert.deepEqual(m.copied, { n: 1, id: "a-1" });
  assert.deepEqual(cmds, [{ _tag: "Copy", id: "a-1", n: 1 }]);
  const { host, events } = fakeHost(() => exit(""));
  const faded: Msg = await run(host, "/r", cmds[0] as Cmd);
  assert.deepEqual(events, ["clipboard a-1", "sleep 1200"]);
  assert.equal(update(m, faded)[0].copied, null);
  assert.deepEqual(steps(shown(), { _tag: "Copy" }, { _tag: "Faded", what: "copied", n: 7 }).copied, { n: 1, id: "a-1" });
  assert.deepEqual(update(modelOf([]), { _tag: "Copy" }), [modelOf([]), []]);
});

test("Copy: nothing while a send has the clipboard", () => {
  const sending = { ...shown(), sending: true };
  assert.deepEqual(update(sending, { _tag: "Copy" }), [sending, []]);
});

test("opener: the tab is the Opener's pane's, else the focused tab, else none", () => {
  const listed = [pane("p1", "t1", { tab: "b7" })];
  const f = { cwd: null, terminal: "t5", tab: "b2" };
  assert.deepEqual(openerOf(null, f, listed), { terminal: "t5", tab: "b2" });
  assert.deepEqual(openerOf("t1", f, listed), { terminal: "t1", tab: "b7" });
  // A terminal the panes do not list, as when the Opener was a mod pane: the focused tab stands in.
  assert.deepEqual(openerOf("t9", f, listed), { terminal: "t9", tab: "b2" });
  assert.deepEqual(openerOf(null, null, []), { terminal: null, tab: null });
});
