import { test } from "node:test";
import assert from "node:assert/strict";
import { keyFor, shownId, treeRows, depTree, hiddenByFilters, visible } from "../../src/beads/rows.ts";
import { update } from "../../src/beads/update.ts";
import type { Edge, Model, Msg, TreeNode } from "../../src/beads/types.ts";
import { bead, modelOf, snapshot, steps } from "./model.ts";

// r depends on a, e and f; a on b and d; b on c. Up from c is the same walk the other way round.
const E: Edge[] = [
  { from: "r", to: "a", type: "blocks" },
  { from: "a", to: "b", type: "parent-child" },
  { from: "b", to: "c", type: "blocks" },
  { from: "a", to: "d", type: "blocks" },
  { from: "r", to: "e", type: "blocks" },
  { from: "r", to: "f", type: "blocks" },
];
const nodes = (): TreeNode[] =>
  depTree(
    snapshot(
      ["r", "a", "b", "c", "d", "e", "f"].map((id) => bead(id)),
      [],
      [],
      E,
    ),
    "r",
    "down",
  );

test("tree rows: depth 0 is skipped, the walk order, depth and edge labels are kept", () => {
  assert.deepEqual(
    treeRows(nodes()).map((r) => [r.id, r.depth, r.edge]),
    [
      ["a", 1, "blocks"],
      ["b", 2, "parent-child"],
      ["c", 3, "blocks"],
      ["d", 2, "blocks"],
      ["e", 1, "blocks"],
      ["f", 1, "blocks"],
    ],
  );
  assert.deepEqual(treeRows([]), []);
});

test("tree rows: a guide goes on while an ancestor level has a later sibling, and last marks the end of a sibling run", () => {
  assert.deepEqual(
    treeRows(nodes()).map((r) => [r.guides, r.last]),
    [
      [[], false],
      [[true], false],
      [[true, true], true],
      [[true], true],
      [[], false],
      [[], true],
    ],
  );
});

test("tree rows: nesting follows parent_id, so a breadth-first order or a child listed before its parent gives the same rows", () => {
  const down = nodes();
  const by = (id: string): TreeNode => down.find((n) => n.id === id) as TreeNode;
  const want = treeRows(down);
  const bfs = ["r", "a", "e", "f", "b", "d", "c"].map(by);
  const childFirst = ["r", "a", "e", "f", "c", "b", "d"].map(by);
  assert.deepEqual(treeRows(bfs), want);
  assert.deepEqual(treeRows(childFirst), want);
});

const BEADS = [bead("a-1", { priority: 0 }), bead("a-2", { priority: 1, issue_type: "bug" }), bead("a-3", { priority: 2 }), bead("a-4", { priority: 3 })];
const open = (): Model => steps(modelOf(BEADS), { _tag: "Resized", width: 1000 }, { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
const jump = (id: string): Msg => ({ _tag: "Jump", id });
const back = { _tag: "Walk", delta: -1 } satisfies Msg;
const forward = { _tag: "Walk", delta: 1 } satisfies Msg;

test("back after three jumps returns to each bead in order, forward walks them again, and a new jump clears forward", () => {
  let m = steps(open(), jump("a-2"), jump("a-3"), jump("a-4"));
  const shown: (string | null)[] = [];
  for (let i = 0; i < 3; i++) {
    m = steps(m, back);
    shown.push(shownId(m));
  }
  assert.deepEqual(shown, ["a-3", "a-2", "a-1"]);
  // At the start there is nothing to go back to.
  assert.equal(steps(m, back), m);
  assert.deepEqual([shownId(steps(m, forward)), shownId(steps(m, forward, forward, forward))], ["a-2", "a-4"]);
  const branched = steps(m, forward, jump("a-4"));
  assert.deepEqual(branched.forward, []);
  assert.equal(steps(branched, forward), branched);
  assert.deepEqual(branched.back, ["a-1", "a-2"]);
});

test("the keys [ and ] walk the history, and the search box and menus keep them as typing", () => {
  const m = open();
  assert.deepEqual([keyFor(m, "["), keyFor(m, "]")], [back, forward]);
  assert.equal(keyFor({ ...m, searching: true }, "["), null);
});

test("jumping to the shown bead, or walking with nothing on that side, changes nothing", () => {
  const m = open();
  assert.equal(steps(m, jump("a-1")), m);
  assert.equal(steps(m, forward), m);
});

test("a jump lands on a bead the list has: it is selected, and the list keeps its order", () => {
  const m = steps(open(), jump("a-3"));
  assert.deepEqual([m.selected, m.shown, shownId(m)], ["a-3", null, "a-3"]);
});

test("a link to a bead the filters hide shows it with the hidden note and leaves the list and its selection alone", () => {
  const base = open();
  const filtered = steps(base, { _tag: "SetType", type: "task" });
  assert.deepEqual(
    visible(filtered).map((b) => b.id),
    ["a-1", "a-3", "a-4"],
  );
  const m = steps(filtered, jump("a-2"));
  assert.deepEqual([m.selected, m.shown, shownId(m)], ["a-1", "a-2", "a-2"]);
  assert.equal(hiddenByFilters(m, visible(m)), true);
  assert.deepEqual(m.filters, filtered.filters);
  assert.deepEqual(visible(m), visible(filtered));
  // Back returns to the selected one, which the list marks.
  const returned = steps(m, back);
  assert.deepEqual([returned.selected, returned.shown, hiddenByFilters(returned, visible(returned))], ["a-1", null, false]);
  // A list move takes the detail back from the link.
  assert.deepEqual([steps(m, { _tag: "Move", delta: 1 }).selected, shownId(steps(m, { _tag: "Move", delta: 1 }))], ["a-3", "a-3"]);
});

test("jumping and walking between loaded beads runs no bd", () => {
  const m = open();
  const away = steps(m, jump("a-2"));
  for (const msg of [jump("a-3"), back, forward] satisfies Msg[]) {
    assert.deepEqual(update(away, msg)[1], []);
  }
});

test("narrow: Esc and the List button go to the list after any number of jumps, selecting the last bead shown if the list has it", () => {
  const narrow = steps(open(), { _tag: "Resized", width: 500 }, { _tag: "Enter" });
  assert.equal(narrow.pane, "detail");
  const jumped = steps(narrow, jump("a-2"), jump("a-3"), jump("a-4"), back, back);
  assert.equal(shownId(jumped), "a-2");
  for (const leave of [{ _tag: "Escape" }, { _tag: "BackToList" }] satisfies Msg[]) {
    const list = steps(jumped, leave);
    assert.deepEqual([list.pane, list.selected, list.shown, list.back, list.forward], ["list", "a-2", null, [], []]);
  }
});

test("narrow: leaving to the list after a jump to a hidden bead keeps the previous selection", () => {
  const narrow = steps(open(), { _tag: "SetType", type: "task" }, { _tag: "Resized", width: 500 }, { _tag: "Enter" }, jump("a-2"));
  assert.equal(hiddenByFilters(narrow, visible(narrow)), true);
  const list = steps(narrow, { _tag: "Escape" });
  assert.deepEqual([list.pane, list.selected, list.shown], ["list", "a-1", null]);
});

test("clicking a row in the list does not push history", () => {
  const m = steps(open(), { _tag: "Click", id: "a-3" }, { _tag: "Move", delta: 1 });
  assert.deepEqual([m.back, m.forward, m.selected], [[], [], "a-4"]);
});
