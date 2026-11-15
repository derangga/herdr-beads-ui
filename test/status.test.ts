import { test } from "node:test";
import assert from "node:assert/strict";
import { keyFor, pickOptions, shownBead } from "../src/rows.ts";
import { update } from "../src/update.ts";
import type { BdError, Cmd, Model, Msg } from "../src/types.ts";
import { bead, modelOf, snapshot, steps } from "./model.ts";

const BEADS = [bead("a-1", { priority: 0 }), bead("a-2", { priority: 1, status: "closed" }), bead("a-3", { priority: 2 })];
const boom: BdError = { _tag: "BdRejected", code: 1, text: "boom" };
const written = (id: string, to: string, error: BdError | null = null, second = false): Msg => ({ _tag: "Written", id, to, error, second });

// Wide, the list loaded, the bead selected.
const shown = (id: string): Model => steps({ ...modelOf(BEADS), width: 1000 }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } }, { _tag: "Select", id });

const write = (id: string, from: string, to: string, reason = ""): Cmd => ({ _tag: "Write", id, from, to, reason });

test("the picker lists the built-in five until bd answers, then bd's own", () => {
  const m = shown("a-1");
  assert.deepEqual(m.statuses, ["open", "in_progress", "blocked", "deferred", "closed"]);
  const read = update(m, { _tag: "ReadStatuses" });
  assert.deepEqual(read[1], [{ _tag: "Statuses" }]);
  const ok = update(m, {
    _tag: "StatusesRead",
    res: {
      ok: true,
      value: [
        { name: "open", icon: "", category: "" },
        { name: "review", icon: "", category: "" },
      ],
    },
  })[0];
  assert.deepEqual(ok.statuses, ["open", "review"]);
});

test("bd statuses failing leaves the built-in five in the picker", () => {
  const m = update(shown("a-1"), { _tag: "StatusesRead", res: { ok: false, error: boom } })[0];
  assert.deepEqual(pickOptions(m, "open"), ["open", "in_progress", "blocked", "deferred", "closed"]);
  assert.deepEqual(pickOptions(m, "review"), ["open", "in_progress", "blocked", "deferred", "closed", "review"]);
});

test("the s key and the pill open the picker of the shown bead; nothing is shown, nothing opens", () => {
  assert.deepEqual(keyFor(shown("a-1"), "s"), { _tag: "ToggleMenu", menu: "pick" });
  assert.equal(update(shown("a-1"), { _tag: "ToggleMenu", menu: "pick" })[0].menu, "pick");
  assert.equal(update(modelOf(BEADS), { _tag: "ToggleMenu", menu: "pick" })[0].menu, null);
});

test("open to in_progress runs one write and marks the bead as writing", () => {
  const [m, cmds] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  assert.deepEqual(cmds, [write("a-1", "open", "in_progress")]);
  assert.equal(m.writing.get("a-1"), "running");
  assert.equal(m.menu, null);
});

test("picking the current status is a no-op that closes the picker", () => {
  const [m, cmds] = update(update(shown("a-1"), { _tag: "ToggleMenu", menu: "pick" })[0], { _tag: "Pick", status: "open" });
  assert.deepEqual(cmds, []);
  assert.equal(m.menu, null);
  assert.equal(m.writing.size, 0);
});

test("picking closed asks for a reason; the answer closes with it, trimmed, or without", () => {
  const ask = update(shown("a-1"), { _tag: "Pick", status: "closed" });
  assert.equal(ask[0].menu, "reason");
  assert.deepEqual(ask[1], []);
  assert.deepEqual(update(ask[0], { _tag: "CloseWith", reason: "  done  " })[1], [write("a-1", "open", "closed", "done")]);
  assert.deepEqual(update(ask[0], { _tag: "CloseWith", reason: "" })[1], [write("a-1", "open", "closed", "")]);
});

test("Esc in the reason step cancels without a write", () => {
  const ask = update(shown("a-1"), { _tag: "Pick", status: "closed" })[0];
  const [m, cmds] = update(ask, { _tag: "Escape" });
  assert.equal(m.menu, null);
  assert.deepEqual(cmds, []);
  assert.equal(m.writing.size, 0);
});

test("closed to in_progress is one write that the runner splits into reopen and update", () => {
  const [, cmds] = update(shown("a-2"), { _tag: "Pick", status: "in_progress" });
  assert.deepEqual(cmds, [write("a-2", "closed", "in_progress")]);
});

test("the picker is disabled for a bead while its write runs", () => {
  const [busy] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  assert.equal(update(busy, { _tag: "ToggleMenu", menu: "pick" })[0].menu, null);
  assert.deepEqual(update(busy, { _tag: "Pick", status: "blocked" })[1], []);
  assert.deepEqual(update(busy, { _tag: "CloseWith", reason: "x" })[1], []);
});

test("success reloads the list, which carries the bead's detail, and the pill spins until the load lands", () => {
  const [busy] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  const [m, cmds] = update(busy, written("a-1", "in_progress"));
  assert.equal(m.loading, true);
  assert.equal(m.writing.get("a-1"), "reloading");
  assert.deepEqual(cmds, [{ _tag: "Load" }]);
  const changed = BEADS.map((b) => (b.id === "a-1" ? { ...b, status: "in_progress" } : b));
  const [loaded, more] = update(m, { _tag: "Loaded", res: { ok: true, value: snapshot(changed) } });
  assert.equal(loaded.writing.size, 0);
  // The snapshot is the detail's source, so the pill shows the new status with nothing more to run.
  assert.deepEqual(more, []);
  assert.equal(shownBead(loaded)?.status, "in_progress");
});

test("a failing bd puts the pill back and keeps the error until the next action", () => {
  const [busy] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  const [m, cmds] = update(busy, written("a-1", "in_progress", boom));
  assert.deepEqual(cmds, []);
  assert.equal(m.writing.size, 0);
  assert.equal(shownBead(m)?.status, "open");
  assert.deepEqual(m.writeError, { id: "a-1", error: boom, second: null });
  // Another bead on show drops it.
  assert.equal(update(m, { _tag: "Select", id: "a-3" })[0].writeError, null);
  // So does opening the picker again.
  assert.equal(update(m, { _tag: "ToggleMenu", menu: "pick" })[0].writeError, null);
});

test("reopen worked and update failed: the list reloads and the error names the second step", () => {
  const [busy] = update(shown("a-2"), { _tag: "Pick", status: "in_progress" });
  const [m, cmds] = update(busy, written("a-2", "in_progress", boom, true));
  assert.deepEqual(cmds, [{ _tag: "Load" }]);
  assert.equal(m.writing.get("a-2"), "reloading");
  assert.deepEqual(m.writeError, { id: "a-2", error: boom, second: "in_progress" });
  const changed = BEADS.map((b) => (b.id === "a-2" ? { ...b, status: "open", closed_at: null } : b));
  const loaded = update(m, { _tag: "Loaded", res: { ok: true, value: snapshot(changed) } })[0];
  assert.equal(shownBead(loaded)?.status, "open");
  assert.equal(loaded.writeError?.second, "in_progress");
});

test("a failed reload after a write keeps the old list and frees the picker", () => {
  const [busy] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  const m = steps(busy, written("a-1", "in_progress"), { _tag: "Loaded", res: { ok: false, error: boom } });
  assert.equal(m.writing.size, 0);
  assert.deepEqual(m.error, boom);
});

test("open to closed with and without a reason, and a write of another bead does not free this one", () => {
  const [one] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  const two = { ...one, writing: new Map(one.writing).set("a-3", "running" as const) };
  const loaded = update(update(two, written("a-1", "in_progress"))[0], { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } })[0];
  assert.equal(loaded.writing.get("a-3"), "running");
  assert.equal(loaded.writing.has("a-1"), false);
});

test("a write that finishes during a load drops that load's answer and loads once more", () => {
  const [busy] = update(shown("a-2"), { _tag: "Pick", status: "in_progress" });
  const loading = update(busy, { _tag: "Refresh" })[0];
  const [m, cmds] = update(loading, written("a-2", "in_progress"));
  assert.deepEqual(cmds, []);
  assert.equal(m.reload, true);
  // The load that was running read the list before the write: its answer is not shown.
  const stale = update(m, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.deepEqual(stale[1], [{ _tag: "Load" }]);
  assert.equal(stale[0].reload, false);
  assert.equal(stale[0].loading, true);
  assert.equal(stale[0].writing.get("a-2"), "reloading");
  assert.equal(shownBead(stale[0])?.status, "closed");
  const changed = BEADS.map((b) => (b.id === "a-2" ? { ...b, status: "in_progress", closed_at: null } : b));
  const final = update(stale[0], { _tag: "Loaded", res: { ok: true, value: snapshot(changed) } })[0];
  assert.equal(final.writing.size, 0);
  assert.equal(shownBead(final)?.status, "in_progress");
  assert.equal(final.snapshot?.beads.find((b) => b.id === "a-2")?.status, "in_progress");
});

test("reopen worked, update failed during a load: the list ends showing open, with the second step's error", () => {
  const [busy] = update(shown("a-2"), { _tag: "Pick", status: "in_progress" });
  const loading = update(busy, { _tag: "Refresh" })[0];
  const m = update(loading, written("a-2", "in_progress", boom, true))[0];
  const stale = update(m, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } })[0];
  const open = BEADS.map((b) => (b.id === "a-2" ? { ...b, status: "open", closed_at: null } : b));
  const final = update(stale, { _tag: "Loaded", res: { ok: true, value: snapshot(open) } })[0];
  assert.equal(shownBead(final)?.status, "open");
  assert.deepEqual(final.writeError, { id: "a-2", error: boom, second: "in_progress" });
  assert.equal(final.writing.size, 0);
});

test("a failed write's error also clears when a link shows another bead", () => {
  const [busy] = update(shown("a-1"), { _tag: "Pick", status: "in_progress" });
  const m = update(busy, written("a-1", "in_progress", boom))[0];
  assert.deepEqual(m.writeError?.id, "a-1");
  assert.equal(update(m, { _tag: "Jump", id: "a-3" })[0].writeError, null);
  // The same bead still on show keeps it.
  assert.deepEqual(update(m, { _tag: "Resized", width: 1100 })[0].writeError, m.writeError);
});
