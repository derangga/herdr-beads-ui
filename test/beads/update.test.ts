import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../src/beads/runner.ts";
import { keyFor, listWidth, reselect, visible } from "../../src/beads/rows.ts";
import { initModel, update } from "../../src/beads/update.ts";
import type { BdError, BeadDetail, Model, Msg } from "../../src/beads/types.ts";
import { exit, fakeHost, fixture, ok } from "./fake-host.ts";
import { bead, many, modelOf, snapshot, steps } from "./model.ts";

const BEADS = [bead("a-1", { priority: 0 }), bead("a-2", { priority: 1, issue_type: "bug" }), bead("a-3", { priority: 2 })];
const rejected: BdError = { _tag: "BdRejected", code: 1, text: "boom" };

test("refresh starts one load", () => {
  const [m, cmds] = update(initModel(), { _tag: "Refresh" });
  assert.equal(m.loading, true);
  // A first load has no list to keep on screen, so it also starts the timer for the spinner.
  assert.deepEqual(cmds, [{ _tag: "Load" }, { _tag: "WaitLoad", n: 1 }]);
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

test("the Load command runs bd export, ready and blocked at once and builds the snapshot", async () => {
  const answers: Record<string, string> = { export: fixture("export", "jsonl"), ready: fixture("ready"), blocked: fixture("blocked") };
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
  assert.deepEqual(calls.map((c) => c.args[0]).sort(), ["blocked", "export", "ready"]);
  assert.ok(msg._tag === "Loaded" && msg.res.ok);
  const { beads, ready, locks } = msg.res.value;
  assert.equal(
    beads.length,
    fixture("export", "jsonl")
      .split("\n")
      .filter((l) => l !== "" && JSON.parse(l)._type === "issue").length,
  );
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
  const { host } = fakeHost(({ args }) => (args[0] === "ready" ? exit("something broke") : ok(args[0] === "export" ? fixture("export", "jsonl") : fixture("blocked"))));
  const msg = await run(host, "/work/repo", { _tag: "Load" });
  assert.ok(msg._tag === "Loaded" && !msg.res.ok && msg.res.error._tag === "BdRejected");
});

const loaded = (beads: BeadDetail[]): Model => reselect(modelOf(beads));
const WIDE = { _tag: "Resized", width: 1000 } satisfies Msg;
const NARROW = { _tag: "Resized", width: 500 } satisfies Msg;
const ENTER = { _tag: "Enter" } satisfies Msg;
const ESCAPE = { _tag: "Escape" } satisfies Msg;

test("j and k move the selection through the shown rows and stop at the ends", () => {
  const m = loaded(BEADS);
  assert.equal(steps(m, { _tag: "Move", delta: 1 }).selected, "a-2");
  assert.equal(steps(m, { _tag: "Move", delta: -1 }).selected, "a-1");
  assert.equal(steps(m, { _tag: "Move", delta: 1 }, { _tag: "Move", delta: 1 }, { _tag: "Move", delta: 1 }).selected, "a-3");
});

test("a move with no selection starts at the first row, and on no rows does nothing", () => {
  assert.equal(steps({ ...loaded(BEADS), selected: null }, { _tag: "Move", delta: 1 }).selected, "a-1");
  assert.equal(steps(loaded([]), { _tag: "Move", delta: 1 }).selected, null);
});

test("narrow: Enter opens the detail and Esc returns to the list with the same bead", () => {
  const open = steps(loaded(BEADS), NARROW, { _tag: "Move", delta: 1 }, ENTER);
  assert.equal(open.pane, "detail");
  assert.equal(open.selected, "a-2");
  const back = steps(open, ESCAPE);
  assert.equal(back.pane, "list");
  assert.equal(back.selected, "a-2");
});

test("narrow: the back button goes to the list", () => {
  const open = steps(loaded(BEADS), NARROW, ENTER);
  assert.equal(steps(open, { _tag: "BackToList" }).pane, "list");
});

test("narrow: a click opens the detail", () => {
  const m = steps(loaded(BEADS), NARROW, { _tag: "Click", id: "a-3" });
  assert.deepEqual([m.selected, m.pane], ["a-3", "detail"]);
});

test("wide: Enter and Esc keep the list, so the arrows go on moving the selection", () => {
  const m = steps(loaded(BEADS), WIDE, ENTER, ESCAPE);
  assert.equal(m.pane, "list");
  assert.equal(steps(m, { _tag: "Move", delta: 1 }).selected, "a-2");
});

test("wide: a click selects and keeps the list", () => {
  const m = steps(loaded(BEADS), WIDE, { _tag: "Click", id: "a-3" });
  assert.deepEqual([m.selected, m.pane], ["a-3", "list"]);
});

test("Enter with nothing selected opens nothing", () => {
  assert.equal(steps(loaded([]), NARROW, ENTER).pane, "list");
});

test("moves do nothing in the narrow detail, where the list is not shown", () => {
  const m = steps(loaded(BEADS), NARROW, ENTER, { _tag: "Move", delta: 1 });
  assert.equal(m.selected, "a-1");
});

test("crossing 800 px changes only the width", () => {
  const busy = steps(loaded(BEADS), NARROW, { _tag: "SetType", type: "task" }, { _tag: "Search", text: "a-" }, { _tag: "SortBy", key: "id" }, { _tag: "Move", delta: 1 }, ENTER);
  for (const width of [799, 800, 1200, 300]) {
    const m = steps(busy, { _tag: "Resized", width });
    assert.deepEqual({ ...m, width: 0 }, { ...busy, width: 0 });
  }
  assert.equal(steps(busy, { _tag: "Resized", width: busy.width }), busy);
});

test("the list is 42% of the width and at least 360 px", () => {
  assert.equal(listWidth(1000), 420);
  assert.equal(listWidth(800), 360);
});

test("/ focuses the search, Esc empties and leaves it, Enter leaves it with the text", () => {
  const typing = steps(loaded(BEADS), { _tag: "FocusSearch" }, { _tag: "Search", text: "a-3" });
  assert.equal(typing.searching, true);
  assert.equal(typing.selected, "a-3");
  const kept = steps(typing, ENTER);
  assert.deepEqual([kept.searching, kept.filters.search], [false, "a-3"]);
  const cleared = steps(typing, ESCAPE);
  assert.deepEqual([cleared.searching, cleared.filters.search], [false, ""]);
});

test("Esc closes a menu before anything else", () => {
  const m = steps(loaded(BEADS), NARROW, ENTER, { _tag: "ToggleMenu", menu: "sort" });
  assert.equal(m.menu, "sort");
  const noMenu = steps(m, ESCAPE);
  assert.deepEqual([noMenu.menu, noMenu.pane], [null, "detail"]);
  assert.equal(steps(noMenu, ESCAPE).pane, "list");
});

test("choosing from a menu closes it", () => {
  const open = steps(loaded(BEADS), { _tag: "ToggleMenu", menu: "type" });
  assert.equal(steps(open, { _tag: "ToggleMenu", menu: "type" }).menu, null);
  assert.equal(steps(open, { _tag: "SetType", type: "bug" }).menu, null);
});

test("keys are commands, except in the search box where only Esc is", () => {
  const m = loaded(BEADS);
  assert.deepEqual(keyFor(m, "j"), { _tag: "Move", delta: 1 });
  assert.deepEqual(keyFor(m, "up"), { _tag: "Move", delta: -1 });
  assert.deepEqual(keyFor(m, "ctrl-r"), { _tag: "Refresh" });
  assert.deepEqual(keyFor(m, "?"), { _tag: "ShowKeys" });
  assert.equal(keyFor(m, "x"), null);
  const typing = { ...m, searching: true };
  assert.equal(keyFor(typing, "j"), null);
  assert.equal(keyFor(typing, "enter"), null);
  assert.deepEqual(keyFor(typing, "escape"), { _tag: "Escape" });
});

test("a thousand beads: a walk to the end lands on the last row", () => {
  let m = modelOf(many(1000));
  const all = visible(m);
  assert.equal(all.length, 1000);
  for (let i = 0; i < 1200; i++) {
    m = steps(m, { _tag: "Move", delta: 1 });
  }
  assert.equal(m.selected, all[999]?.id);
});

test("Ctrl+R refreshes even in the search box or with a menu open", () => {
  const m = loaded(BEADS);
  assert.deepEqual(keyFor({ ...m, searching: true }, "ctrl-r"), { _tag: "Refresh" });
  assert.deepEqual(keyFor({ ...m, menu: "sort" }, "ctrl-r"), { _tag: "Refresh" });
});
