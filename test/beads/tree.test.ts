import { test } from "node:test";
import assert from "node:assert/strict";
import { depTree, taskLists } from "../../src/beads/rows.ts";
import type { Edge, Direction } from "../../src/beads/types.ts";
import { bead, snapshot } from "./model.ts";

const edge = (from: string, to: string, type = "blocks"): Edge => ({ from, to, type });
const tree = (ids: string[], edges: Edge[], id: string, d: Direction) =>
  depTree(
    snapshot(
      ids.map((i) => bead(i)),
      [],
      [],
      edges,
    ),
    id,
    d,
  );
const flat = (n: ReturnType<typeof tree>) => n.map((x) => [x.id, x.depth, x.parent_id, x.edge_from_parent]);

test("down follows what the bead depends on, up what depends on it, with the root first and the edge type on each node", () => {
  const edges = [edge("x", "epic", "parent-child"), edge("epic", "blocker"), edge("kid", "epic", "parent-child"), edge("other", "kid")];
  const ids = ["x", "epic", "blocker", "kid", "other"];
  assert.deepEqual(flat(tree(ids, edges, "x", "down")), [
    ["x", 0, "", null],
    ["epic", 1, "x", "parent-child"],
    ["blocker", 2, "epic", "blocks"],
  ]);
  // Up from the epic: its children, and under a child the bead it blocks.
  assert.deepEqual(flat(tree(ids, edges, "epic", "up")), [
    ["epic", 0, "", null],
    ["x", 1, "epic", "parent-child"],
    ["kid", 1, "epic", "parent-child"],
    ["other", 2, "kid", "blocks"],
  ]);
});

test("a node carries the snapshot bead's title, status, priority and type", () => {
  const s = snapshot([bead("a", { title: "A", status: "closed", priority: 0, issue_type: "bug" }), bead("b")], [], [], [edge("b", "a")]);
  assert.deepEqual(depTree(s, "b", "down")[1], { id: "a", title: "A", status: "closed", priority: 0, issue_type: "bug", depth: 1, parent_id: "b", edge_from_parent: "blocks" });
});

test("an id reached a second time is dropped, like bd's one global seen set", () => {
  // r -> a -> c and r -> b -> c, c -> d: c and d come out once, under a.
  const edges = [edge("r", "a"), edge("r", "b"), edge("a", "c"), edge("b", "c"), edge("c", "d")];
  const n = tree(["r", "a", "b", "c", "d"], edges, "r", "down");
  assert.deepEqual(
    n.map((x) => x.id),
    ["r", "a", "c", "d", "b"],
  );
});

test("two siblings under the same epic show the epic once", () => {
  const edges = [edge("x", "s1"), edge("x", "s2"), edge("s1", "epic", "parent-child"), edge("s2", "epic", "parent-child")];
  assert.deepEqual(flat(tree(["x", "s1", "s2", "epic"], edges, "x", "down")), [
    ["x", 0, "", null],
    ["s1", 1, "x", "blocks"],
    ["epic", 2, "s1", "parent-child"],
    ["s2", 1, "x", "blocks"],
  ]);
});

test("a cycle ends: the way back to the root is dropped", () => {
  const n = tree(["a", "b"], [edge("a", "b"), edge("b", "a")], "a", "down");
  assert.deepEqual(
    n.map((x) => [x.id, x.depth]),
    [
      ["a", 0],
      ["b", 1],
    ],
  );
});

test("a chain is cut at depth 50", () => {
  const ids = Array.from({ length: 80 }, (_, i) => `n${i}`);
  const n = tree(
    ids,
    ids.slice(1).map((id, i) => edge(`n${i}`, id)),
    "n0",
    "down",
  );
  assert.equal(Math.max(...n.map((x) => x.depth)), 50);
});

test("an edge to an id the snapshot lacks is skipped, and a root it lacks gives no tree", () => {
  const edges = [edge("a", "ghost"), edge("a", "b")];
  assert.deepEqual(
    tree(["a", "b"], edges, "a", "down").map((x) => x.id),
    ["a", "b"],
  );
  assert.deepEqual(
    tree(["a", "b"], [edge("ghost", "a")], "a", "up").map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(tree(["a"], edges, "ghost", "down"), []);
});

test("relates-to links are not followed in either direction, every other type is", () => {
  const edges = [edge("a", "b", "relates-to"), edge("a", "c", "related"), edge("a", "d", "discovered-from"), edge("e", "a", "relates-to")];
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(
    tree(ids, edges, "a", "down").map((x) => x.id),
    ["a", "c", "d"],
  );
  assert.deepEqual(
    tree(ids, edges, "a", "up").map((x) => x.id),
    ["a"],
  );
});

test("task lists: a bare [ ], [x] or [X] mark becomes a list item, indent and mark kept", () => {
  assert.equal(taskLists("[ ] one\n[x] two\n[X] three"), "- [ ] one\n- [x] two\n- [X] three");
  assert.equal(taskLists("  [ ] nested\n\t[x] tabbed"), "  - [ ] nested\n\t- [x] tabbed");
});

test("task lists: a list item, a link, mid-text brackets and a mark without a space are left alone", () => {
  for (const text of ["- [ ] item", "  * [x] item", "[link](https://x.y) here", "see [ ] here", "[ ]", "[x]done", "[ab] text"]) {
    assert.equal(taskLists(text), text);
  }
});
