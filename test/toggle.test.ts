import { test } from "node:test";
import assert from "node:assert/strict";
import { TOGGLE_MS, beadsPane, clickToggle, isToggle, watchToggle } from "../src/toggle-state.ts";
import { fakeHost } from "./fake-host.ts";

const panes = [
  { pane: "p1", terminal: "t1", tab: "a", cwd: "/r" },
  { pane: "p2", terminal: null, mod: "beads", tab: "b" },
  { pane: "p3", terminal: null, mod: "herdr-review", tab: "a" },
];
const never = () => ({ code: 0, stdout: "", stderr: "" });

test("only props role toggle makes the button's copy", () => {
  assert.equal(isToggle({ role: "toggle" }), true);
  assert.equal(isToggle({ root: "/r" }), false);
  assert.equal(isToggle(null), false);
});

test("lit only for a beads pane in the focused tab", () => {
  assert.equal(beadsPane(panes, { tab: "b" }), "p2");
  assert.equal(beadsPane(panes, { tab: "a" }), null, "another mod in the tab is not a Viewer");
  assert.equal(beadsPane(panes, null), null);
  assert.equal(beadsPane("nonsense", { tab: "b" }), null);
});

test("a click splits right when the tab has no Viewer, and closes the Viewer when it has", () => {
  const closed = fakeHost(never, { panes: () => panes, focused: () => ({ tab: "a" }) });
  clickToggle(closed.host);
  assert.deepEqual(closed.events, ['run pane.split {"direction":"right","mod":"beads"}']);
  const open = fakeHost(never, { panes: () => panes, focused: () => ({ tab: "b" }) });
  clickToggle(open.host);
  assert.deepEqual(open.events, ['run pane.close {"pane":"p2"}']);
});

test("the poll redraws only when the Viewer appears or goes", () => {
  let tick = () => {};
  let every = 0;
  let notified = 0;
  let cancelled = false;
  let list: unknown[] = [];
  const cx = {
    timer: {
      every: (ms: number, f: () => void) => {
        every = ms;
        tick = () => cancelled || f();
        return { cancel: () => (cancelled = true) };
      },
    },
    notify: () => notified++,
  };
  const { host } = fakeHost(never, { panes: () => list, focused: () => ({ tab: "b" }) });
  const state = { pane: null as string | null };
  const task = watchToggle(cx, host, state);
  assert.equal(every, TOGGLE_MS);
  tick();
  assert.equal(notified, 0);
  list = panes;
  tick();
  tick();
  assert.deepEqual([state.pane, notified], ["p2", 1]);
  list = [];
  tick();
  assert.deepEqual([state.pane, notified], [null, 2]);
  task.cancel();
  list = panes;
  tick();
  assert.deepEqual([state.pane, notified], [null, 2], "no tick fires after cancel");
});
