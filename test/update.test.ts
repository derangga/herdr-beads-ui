import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/runner.ts";
import { visible } from "../src/rows.ts";
import { initModel, update } from "../src/update.ts";
import type { BdError, Model, Msg } from "../src/types.ts";
import { exit, fakeHost, fixture, ok } from "./fake-host.ts";
import { bead, modelOf, snapshot, steps } from "./model.ts";

const BEADS = [bead("a-1", { priority: 0 }), bead("a-2", { priority: 1, issue_type: "bug" }), bead("a-3", { priority: 2 })];
const rejected: BdError = { _tag: "BdRejected", code: 1, text: "boom" };

test("refresh starts one load", () => {
  const [m, cmds] = update(initModel(), { _tag: "Refresh" });
  assert.equal(m.loading, true);
  assert.deepEqual(cmds, [{ _tag: "Load" }]);
});

test("a refresh while a load is running is dropped", () => {
  const [loading] = update(initModel(), { _tag: "Refresh" });
  const [m, cmds] = update(loading, { _tag: "Refresh" });
  assert.equal(m, loading);
  assert.deepEqual(cmds, []);
});

test("a load that ends lets the next refresh run", () => {
  const m = steps(initModel(), { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.equal(m.loading, false);
  assert.deepEqual(update(m, { _tag: "Refresh" })[1], [{ _tag: "Load" }]);
});

test("load success stores the list, the ready set and the lock map, and selects the first row", () => {
  const value = snapshot(BEADS, ["a-1"], [["a-3", 2]]);
  const m = steps(initModel(), { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value } });
  assert.equal(m.snapshot, value);
  assert.deepEqual([...value.ready], ["a-1"]);
  assert.equal(m.snapshot?.locks.get("a-3"), 2);
  assert.equal(m.error, null);
  assert.equal(m.selected, "a-1");
});

test("load failure keeps the last good list and records the error", () => {
  const good = steps(initModel(), { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  const m = steps(good, { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: false, error: rejected } });
  assert.equal(m.snapshot, good.snapshot);
  assert.equal(m.selected, "a-1");
  assert.equal(m.loading, false);
  assert.deepEqual(m.error, rejected);
});

test("the next good load clears the error", () => {
  const failed = steps(initModel(), { _tag: "Loaded", res: { ok: false, error: rejected } });
  assert.equal(failed.snapshot, null);
  assert.equal(steps(failed, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } }).error, null);
});

test("a reload keeps the selection when the bead is still visible", () => {
  const m = steps(modelOf(BEADS), { _tag: "Select", id: "a-3" }, { _tag: "Loaded", res: { ok: true, value: snapshot([...BEADS, bead("a-4")]) } });
  assert.equal(m.selected, "a-3");
});

test("selection survives a filter change when the bead is still visible", () => {
  const m = steps(modelOf(BEADS), { _tag: "Select", id: "a-3" }, { _tag: "SetType", type: "task" }, { _tag: "Search", text: "a-3" });
  assert.equal(m.selected, "a-3");
});

test("selection moves to the first row when a filter hides the bead", () => {
  const m = steps(modelOf(BEADS), { _tag: "Select", id: "a-1" }, { _tag: "SetType", type: "bug" });
  assert.equal(m.selected, "a-2");
  assert.equal(steps(m, { _tag: "Search", text: "nothing" }).selected, null);
});

test("selection follows the first row after the filter is lifted from an empty list", () => {
  const empty = steps(modelOf(BEADS), { _tag: "Search", text: "nothing" });
  assert.equal(steps(empty, { _tag: "Search", text: "" }).selected, "a-1");
});

test("a sort change keeps the selection", () => {
  const m: Model = steps(modelOf(BEADS), { _tag: "Select", id: "a-3" }, { _tag: "SortBy", key: "id" } satisfies Msg, { _tag: "Reverse" });
  assert.equal(m.selected, "a-3");
  assert.deepEqual(
    visible(m).map((b) => b.id),
    ["a-3", "a-2", "a-1"],
  );
});

test("the Load command runs bd list, ready and blocked at once and builds the snapshot", async () => {
  const answers: Record<string, string> = { list: fixture("list"), ready: fixture("ready"), blocked: fixture("blocked") };
  const { host: base, calls } = fakeHost(({ args }) => ok(answers[args[0] ?? ""] ?? "[]"));
  // Every reply waits until all three calls have started (or 50 ms pass, so a serial run fails instead of hanging).
  let started = 0;
  let startedAtFirstReply = 0;
  const allStarted = new Promise<void>((resolve) => setTimeout(resolve, 50));
  const gate = new Promise<void>((resolve) => {
    const poll = setInterval(() => started === 3 && (clearInterval(poll), resolve()), 1);
  });
  const host = {
    ...base,
    async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }) {
      started++;
      await Promise.race([gate, allStarted]);
      startedAtFirstReply ||= started;
      return base.exec(command, args, options);
    },
  };
  const msg = await run(host, "/work/repo", { _tag: "Load" });
  assert.equal(startedAtFirstReply, 3);
  assert.deepEqual(calls.map((c) => c.args[0]).sort(), ["blocked", "list", "ready"]);
  assert.ok(msg._tag === "Loaded" && msg.res.ok);
  const { beads, ready, locks } = msg.res.value;
  assert.equal(beads.length, 5);
  assert.deepEqual([...ready], ["raccoon-51n", "raccoon-jbn"]);
  assert.deepEqual(
    [...locks],
    [
      ["raccoon-46u.5", 3],
      ["raccoon-46u.4", 1],
    ],
  );
});

test("the Load command answers with the error when any read fails", async () => {
  const { host } = fakeHost(({ args }) => (args[0] === "ready" ? exit("something broke") : ok(fixture(args[0] === "list" ? "list" : "blocked"))));
  const msg = await run(host, "/work/repo", { _tag: "Load" });
  assert.ok(msg._tag === "Loaded" && !msg.res.ok && msg.res.error._tag === "BdRejected");
});
