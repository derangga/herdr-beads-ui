import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/runner.ts";
import { bdText, emptyState, retryLabel, start, takesKeyboard } from "../src/states.ts";
import { Store } from "../src/store.ts";
import { update } from "../src/update.ts";
import type { BdError, Msg } from "../src/types.ts";
import { exit, fakeHost, ok } from "./fake-host.ts";
import { bead, modelOf, snapshot, steps } from "./model.ts";

const FOCUS = { cwd: "/work/repo", terminal: "t1", tab: "b1", pane: "p1", space: "s1" };
const SPACE = (machine: string | null) => [{ id: "s1", machine, tabs: [{ id: "b1" }, { id: "b2" }] }];
const refresh: Msg = { _tag: "Refresh" };
const loaded = (error: BdError): Msg => ({ _tag: "Loaded", res: { ok: false, error } });
const GOOD = { _tag: "Loaded", res: { ok: true, value: snapshot([bead("a-1")]) } } satisfies Msg;

// A Store over a FakeHost that remembers the jobs it was asked to run, so a test can wait for them.
function store(host: ReturnType<typeof fakeHost>["host"], root: string | null, model = start(host).model) {
  const jobs: Promise<void>[] = [];
  const s = new Store(
    host,
    root,
    (job) => void jobs.push(job()),
    () => {},
    model,
  );
  return { s, done: () => Promise.all(jobs) };
}

test("NoOpener: no folder from the props or the focused terminal", () => {
  const { host } = fakeHost(() => ok(""));
  const { root, model } = start(host);
  assert.equal(root, null);
  assert.deepEqual(model.error, { _tag: "NoOpener" });
  assert.deepEqual(emptyState(model, root), { title: "Open from a terminal", hint: null, retry: false });
});

test("NoOpener: a refresh is dropped and runs nothing", () => {
  const { model } = start(fakeHost(() => ok("")).host);
  assert.deepEqual(update(model, refresh), [model, []]);
});

test("RemoteSpace: a space on another machine shows its message and runs no bd", async () => {
  const { host, calls } = fakeHost(() => ok(""), { focused: () => FOCUS, spaces: () => SPACE("box") });
  const { root, model } = start(host);
  assert.equal(root, null);
  assert.deepEqual(model.error, { _tag: "RemoteSpace" });
  assert.equal(emptyState(model, root)?.title, "Remote spaces aren't supported yet");
  // Even a Store handed the folder runs nothing, because update drops the refresh.
  const { s, done } = store(host, "/work/repo", model);
  s.dispatch(refresh);
  s.dispatch(refresh);
  await done();
  assert.deepEqual(calls, []);
  assert.equal(s.model.loading, false);
});

test("a local space, or one the list does not know, is not remote", () => {
  for (const spaces of [SPACE(null), [], "x"]) {
    const { root, model } = start(fakeHost(() => ok(""), { focused: () => FOCUS, spaces: () => spaces }).host);
    assert.deepEqual([root, model.error], ["/work/repo", null]);
  }
});

test("the props name the folder when there is no focused terminal", () => {
  const { root, model } = start(fakeHost(() => ok(""), { props: () => ({ root: "/other" }) }).host);
  assert.deepEqual([root, model.error], ["/other", null]);
});

test("NoDatabase: a centered message with the folder and the bd init hint, and a Retry", () => {
  const m = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh, loaded({ _tag: "NoDatabase", text: "Error: no beads database found" }));
  assert.deepEqual(emptyState(m, "/work/repo"), { title: "No beads database in /work/repo", hint: "Run bd init in that folder to create one.", retry: true });
});

test("NoDatabase after a good load stays a banner over the last list", () => {
  const m = steps(modelOf([bead("a-1")]), loaded({ _tag: "NoDatabase", text: "gone" }));
  assert.equal(emptyState(m, "/work/repo"), null);
  assert.equal(m.snapshot?.beads.length, 1);
});

test("BdMissing: bd's text shows in red as a banner, not a replaced Viewer", () => {
  const error: BdError = { _tag: "BdMissing", text: "`herdr.exec`: cannot run bd: No such file or directory (os error 2)" };
  const m = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh, loaded(error));
  assert.deepEqual([m.error, m.loading, emptyState(m, "/work/repo")], [error, false, null]);
  assert.equal(bdText(error), error.text);
  // Retry is the same refresh, and it runs now that the load ended.
  assert.deepEqual(update(m, refresh)[1][0], { _tag: "Load" });
});

test("BdMissing and BdRejected keep the last good list", () => {
  for (const error of [
    { _tag: "BdMissing", text: "no bd" },
    { _tag: "BdRejected", code: 1, text: "boom" },
  ] satisfies BdError[]) {
    const good = steps(modelOf([bead("a-1")]), refresh, GOOD);
    const m = steps(good, refresh, loaded(error));
    assert.equal(m.snapshot, good.snapshot);
    assert.deepEqual(m.error, error);
    assert.equal(steps(m, refresh, GOOD).error, null);
  }
});

test("Undecodable: the text names bd's version, or says it is unknown, and the list is kept", () => {
  const error: BdError = { _tag: "Undecodable", version: "1.3.4", path: "$[0].status", detail: "expected a string" };
  assert.match(bdText(error), /bd 1\.3\.4 gave output this viewer does not understand: \$\[0\]\.status expected a string/);
  assert.match(bdText({ ...error, version: null }), /bd \(version unknown\)/);
  const good = steps(modelOf([bead("a-1")]), refresh, GOOD);
  assert.equal(steps(good, refresh, loaded(error)).snapshot, good.snapshot);
});

test("a refresh during a refresh is dropped, and its reply still ends the one load", async () => {
  const { host, calls } = fakeHost(() => ok("[]"), { focused: () => FOCUS });
  const { s, done } = store(host, "/work/repo");
  s.dispatch(refresh);
  s.dispatch(refresh);
  await done();
  assert.equal(calls.filter((c) => c.args[0] === "list").length, 1);
  assert.equal(s.model.loading, false);
});

test("a first load that stays loading 150 ms shows the spinner", async () => {
  const { host, sleeps } = fakeHost(() => exit(""), { focused: () => FOCUS });
  const [loading, cmds] = update(start(host).model, refresh);
  assert.deepEqual([loading.slow, cmds[1]], [false, { _tag: "WaitLoad", n: 1 }]);
  const slowed = await run(host, "/work/repo", { _tag: "WaitLoad", n: 1 });
  assert.deepEqual([slowed, sleeps], [{ _tag: "Slowed", n: 1 }, [150]]);
  assert.equal(steps(loading, slowed).slow, true);
});

test("a fast load shows no spinner: the late timer finds the load done", () => {
  const loading = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh);
  const done = steps(loading, GOOD);
  assert.equal(done.slow, false);
  assert.equal(steps(done, { _tag: "Slowed", n: 1 }).slow, false);
});

test("the timer of an earlier load cannot start the spinner of a later one", () => {
  const failed = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh, loaded({ _tag: "BdRejected", code: 1, text: "x" }), refresh);
  assert.equal(steps(failed, { _tag: "Slowed", n: 1 }).slow, false);
  assert.equal(steps(failed, { _tag: "Slowed", n: 2 }).slow, true);
});

test("a refresh that has a list to keep starts no spinner timer, and spins only the icon", () => {
  const [m, cmds] = update(modelOf([bead("a-1")]), refresh);
  assert.deepEqual(cmds, [{ _tag: "Load" }]);
  assert.deepEqual([m.loading, m.slow], [true, false]);
  assert.equal(steps(m, { _tag: "Slowed", n: 1 }).slow, false);
});

test("a failed first load ends the spinner", () => {
  const m = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh, { _tag: "Slowed", n: 1 }, loaded({ _tag: "BdRejected", code: 1, text: "x" }));
  assert.deepEqual([m.loading, m.slow], [false, false]);
});

test("the empty screen's Retry says Retrying while the retry runs", () => {
  assert.deepEqual([retryLabel(false), retryLabel(true)], ["Retry", "Retrying…"]);
});

test("? leaves the model alone on every screen, since the keys open as a dialog that closes itself", () => {
  const keys: Msg = { _tag: "ShowKeys" };
  const none = start(fakeHost(() => ok("")).host).model;
  const noDb = steps(start(fakeHost(() => ok(""), { focused: () => FOCUS }).host).model, refresh, loaded({ _tag: "NoDatabase", text: "x" }));
  for (const m of [none, noDb, modelOf([bead("a-1")])]) {
    assert.deepEqual(update(m, keys), [m, []]);
  }
});

test("the Viewer takes the keyboard back only while herdr's focus is on its own pane and no box or menu holds it", () => {
  const idle = { searching: false, menu: null };
  assert.equal(takesKeyboard("p1", "p1", false, idle), true);
  // Already has it, or its pane is not known yet.
  assert.equal(takesKeyboard("p1", "p1", true, idle), false);
  assert.equal(takesKeyboard(null, "p1", false, idle), false);
  // herdr's focus is elsewhere, as on a terminal: never pulled out of it.
  assert.equal(takesKeyboard("p1", "p2", false, idle), false);
  assert.equal(takesKeyboard("p1", null, false, idle), false);
  // Typing in search, the close-reason box, or a menu open.
  assert.equal(takesKeyboard("p1", "p1", false, { searching: true, menu: null }), false);
  assert.equal(takesKeyboard("p1", "p1", false, { searching: false, menu: "reason" }), false);
  assert.equal(takesKeyboard("p1", "p1", false, { searching: false, menu: "sort" }), false);
});
