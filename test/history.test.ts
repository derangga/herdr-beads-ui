import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeTree } from "../src/decode.ts";
import { keyFor, shownId, treeRows, hiddenByFilters, visible } from "../src/rows.ts";
import { update } from "../src/update.ts";
import type { Model, Msg, Res, TreeNode } from "../src/types.ts";
import { fixture } from "./fake-host.ts";
import { bead, detail, modelOf, snapshot, steps } from "./model.ts";

const nodes = (name: string): TreeNode[] => {
  const res: Res<TreeNode[]> = decodeTree(fixture(name), "1.3.4");
  assert.ok(res.ok);
  return res.value;
};

test("tree rows: depth 0 is skipped, bd's walk order, depth and edge labels are kept", () => {
  const down = treeRows(nodes("tree-down"));
  assert.deepEqual(
    down.map((r) => [r.id, r.depth, r.edge]),
    [
      ["raccoon-46u.3", 1, "blocks"],
      ["raccoon-46u", 2, "parent-child"],
      ["raccoon-ckc", 3, "blocks"],
      ["raccoon-46u.2", 2, "blocks"],
      ["raccoon-46u.1", 1, "blocks"],
      ["raccoon-46u.4", 1, "blocks"],
    ],
  );
  assert.deepEqual(
    treeRows(nodes("tree-up")).map((r) => [r.id, r.depth, r.edge]),
    [
      ["raccoon-46u.3", 1, "parent-child"],
      ["raccoon-46u.5", 2, "blocks"],
      ["raccoon-46u.1", 1, "parent-child"],
    ],
  );
  assert.deepEqual(treeRows([]), []);
});

test("tree rows: a guide goes on while an ancestor level has a later sibling, and last marks the end of a sibling run", () => {
  assert.deepEqual(
    treeRows(nodes("tree-down")).map((r) => [r.guides, r.last]),
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
  const down = nodes("tree-down");
  const by = (id: string): TreeNode => down.find((n) => n.id === id) as TreeNode;
  const want = treeRows(down);
  const bfs = ["raccoon-46u.5", "raccoon-46u.3", "raccoon-46u.1", "raccoon-46u.4", "raccoon-46u", "raccoon-46u.2", "raccoon-ckc"].map(by);
  const childFirst = ["raccoon-46u.5", "raccoon-46u.3", "raccoon-46u.1", "raccoon-ckc", "raccoon-46u.4", "raccoon-46u", "raccoon-46u.2"].map(by);
  assert.deepEqual(treeRows(bfs), want);
  assert.deepEqual(treeRows(childFirst), want);
});

test("tree rows: an id already drawn higher up, or the bead itself, is dimmed as a repeat and not walked again", () => {
  const n = (id: string, depth: number, parent_id: string): TreeNode => ({ id, title: id, status: "open", priority: 2, issue_type: "task", depth, parent_id, edge_from_parent: depth === 0 ? null : "blocks" });
  // a leads to b, which leads back to a; r also leads to c, which leads back to r.
  const rows = treeRows([n("r", 0, ""), n("a", 1, "r"), n("b", 2, "a"), n("a", 3, "b"), n("c", 1, "r"), n("r", 2, "c")]);
  assert.deepEqual(
    rows.map((r) => [r.id, r.depth, r.repeat]),
    [
      ["a", 1, false],
      ["b", 2, false],
      ["a", 3, true],
      ["c", 1, false],
      ["r", 2, true],
    ],
  );
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
  assert.deepEqual(steps(m, jump("a-2"), { _tag: "ToggleHelp" }, back).back, ["a-1"]);
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
  // The detail of the linked bead is fetched like any other, and back returns to the selected one, which the list marks.
  const [, cmds] = update(filtered, jump("a-2"));
  assert.deepEqual(
    cmds.map((c) => [c._tag, "id" in c ? c.id : null]),
    [
      ["Wait", "a-2"],
      ["Wait", "a-2"],
    ],
  );
  assert.deepEqual([...m.details.keys()], ["a-2"]);
  const returned = steps(m, back);
  assert.deepEqual([returned.selected, returned.shown, hiddenByFilters(returned, visible(returned))], ["a-1", null, false]);
  // A list move takes the detail back from the link.
  assert.deepEqual([steps(m, { _tag: "Move", delta: 1 }).selected, shownId(steps(m, { _tag: "Move", delta: 1 }))], ["a-3", "a-3"]);
});

test("a linked bead is fetched through the debounce, and walking back to a loaded one runs no bd", () => {
  const m = steps(open(), jump("a-2"));
  const gen = m.gen;
  const loaded = steps(
    m,
    { _tag: "Shown", id: "a-2", gen, res: { ok: true, value: detail("a-2") } },
    { _tag: "Tree", id: "a-2", gen, direction: "down", res: { ok: true, value: [] } },
    { _tag: "Tree", id: "a-2", gen, direction: "up", res: { ok: true, value: [] } },
    { _tag: "Discussed", id: "a-2", gen, res: { ok: true, value: [] } },
  );
  const away = steps(loaded, jump("a-3"));
  assert.deepEqual(update(away, back)[1], []);
  assert.deepEqual(update(away, forward)[1], []);
  assert.equal(update(steps(away, back), { _tag: "Waited", id: "a-2", gen, timer: "fetch" })[1].length, 0);
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
