import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAgents, decodeBlocked, decodeComments, decodeFocus, decodeFont, decodeList, decodePanes, decodeProps, decodeReady, decodeShow, decodeStatuses, decodeTree } from "../src/decode.ts";
import type { Res } from "../src/types.ts";
import { fixture } from "./fake-host.ts";

const V = "1.3.4";

function value<T>(res: Res<T>): T {
  assert.ok(res.ok, JSON.stringify(res));
  return res.value;
}

// The fixture with one field removed or changed, as bd text.
function broken(name: string, change: (json: any) => void): string {
  const json = JSON.parse(fixture(name));
  change(json);
  return JSON.stringify(json);
}

const undecodable = (res: Res<unknown>, path: string) => {
  assert.ok(!res.ok);
  assert.deepEqual({ _tag: res.error._tag, path: "path" in res.error ? res.error.path : null, version: "version" in res.error ? res.error.version : null }, { _tag: "Undecodable", path, version: V });
};

test("list: a closed bead, an epic and an open task", () => {
  const beads = value(decodeList(fixture("list"), V));
  assert.equal(beads.length, 5);
  const closed = beads.find((b) => b.id === "raccoon-e4n.15");
  assert.equal(closed?.status, "closed");
  assert.equal(closed?.closed_at, "2026-10-16T11:29:55Z");
  assert.equal(closed?.parent, "raccoon-e4n");
  assert.equal(beads.find((b) => b.id === "raccoon-46u")?.issue_type, "epic");
  const open = beads.find((b) => b.id === "raccoon-46u.5");
  assert.equal(open?.closed_at, null);
  assert.equal(open?.dependency_count, 3);
});

test("list: a missing title and a wrong-typed priority", () => {
  undecodable(
    decodeList(
      broken("list", (j) => delete j[2].title),
      V,
    ),
    "$[2].title",
  );
  undecodable(
    decodeList(
      broken("list", (j) => (j[0].priority = "high")),
      V,
    ),
    "$[0].priority",
  );
  undecodable(decodeList("not json", V), "$");
  undecodable(decodeList("{}", V), "$");
});

test("ready: ids only", () => {
  assert.deepEqual(value(decodeReady(fixture("ready"), V)), ["raccoon-51n", "raccoon-jbn"]);
  undecodable(
    decodeReady(
      broken("ready", (j) => delete j[1].id),
      V,
    ),
    "$[1].id",
  );
});

test("blocked: the lock count and the blockers", () => {
  const [first] = value(decodeBlocked(fixture("blocked"), V));
  assert.equal(first?.id, "raccoon-46u.5");
  assert.equal(first?.blocked_by_count, 3);
  assert.deepEqual(first?.blocked_by, ["raccoon-46u.3", "raccoon-46u.1", "raccoon-46u.4"]);
  undecodable(
    decodeBlocked(
      broken("blocked", (j) => (j[0].blocked_by_count = "3")),
      V,
    ),
    "$[0].blocked_by_count",
  );
});

test("show: an open bead, an epic and a closed bead", () => {
  const open = value(decodeShow(fixture("show-open"), V));
  assert.equal(open.id, "raccoon-46u.5");
  assert.ok(open.acceptance_criteria.startsWith("[ ] With MockListening"));
  assert.equal(open.dependencies.length, 4);
  assert.equal(open.dependencies[0]?.dependency_type, "blocks");
  assert.equal(value(decodeShow(fixture("show-epic"), V)).issue_type, "epic");
  const closed = value(decodeShow(fixture("show-closed"), V));
  assert.equal(closed.status, "closed");
  assert.equal(closed.comment_count, 1);
  assert.equal(closed.notes, "");
});

test("show: a missing status, a wrong-typed dependency, an empty array", () => {
  undecodable(
    decodeShow(
      broken("show-open", (j) => delete j[0].status),
      V,
    ),
    "$[0].status",
  );
  undecodable(
    decodeShow(
      broken("show-open", (j) => (j[0].dependencies[1].dependency_type = 7)),
      V,
    ),
    "$[0].dependencies[1].dependency_type",
  );
  undecodable(decodeShow("[]", V), "$[0]");
});

test("dep tree: the walk order, depth and edges", () => {
  const nodes = value(decodeTree(fixture("tree-down"), V));
  assert.deepEqual(
    nodes.map((n) => [n.id, n.depth, n.parent_id, n.edge_from_parent]),
    [
      ["raccoon-46u.5", 0, "", null],
      ["raccoon-46u.3", 1, "raccoon-46u.5", "blocks"],
      ["raccoon-46u", 2, "raccoon-46u.3", "parent-child"],
      ["raccoon-ckc", 3, "raccoon-46u", "blocks"],
      ["raccoon-46u.2", 2, "raccoon-46u.3", "blocks"],
      ["raccoon-46u.1", 1, "raccoon-46u.5", "blocks"],
      ["raccoon-46u.4", 1, "raccoon-46u.5", "blocks"],
    ],
  );
  assert.equal(value(decodeTree(fixture("tree-up"), V)).length, 4);
  undecodable(
    decodeTree(
      broken("tree-down", (j) => delete j[3].depth),
      V,
    ),
    "$[3].depth",
  );
});

test("comments", () => {
  const [c] = value(decodeComments(fixture("comments"), V));
  assert.equal(c?.author, "derangga");
  assert.equal(c?.created_at, "2026-08-31T15:45:39Z");
  undecodable(
    decodeComments(
      broken("comments", (j) => delete j[0].text),
      V,
    ),
    "$[0].text",
  );
});

test("statuses", () => {
  const all = value(decodeStatuses(fixture("statuses"), V));
  assert.deepEqual(
    all.slice(0, 5).map((s) => s.name),
    ["open", "in_progress", "blocked", "deferred", "closed"],
  );
  assert.equal(all[4]?.category, "done");
  undecodable(
    decodeStatuses(
      broken("statuses", (j) => delete j.built_in_statuses),
      V,
    ),
    "$.built_in_statuses",
  );
  undecodable(
    decodeStatuses(
      broken("statuses", (j) => delete j.built_in_statuses[0].icon),
      V,
    ),
    "$.built_in_statuses[0].icon",
  );
});

test("a decode failure without a known version carries null", () => {
  const res = decodeList("{}", null);
  assert.ok(!res.ok && res.error._tag === "Undecodable" && res.error.version === null);
});

test("focus: cwd and terminal, null when absent or of another type", () => {
  assert.deepEqual(decodeFocus({ cwd: "/r", terminal: "t1", tab: "b1", pane: "p1" }), { cwd: "/r", terminal: "t1", tab: "b1", pane: "p1" });
  assert.deepEqual(decodeFocus({ cwd: 3 }), { cwd: null, terminal: null, tab: null, pane: null });
  assert.equal(decodeFocus(null), null);
  assert.equal(decodeFocus("x"), null);
});

test("props: root and opener are non-empty strings or null", () => {
  assert.deepEqual(decodeProps({ root: "/work/repo", opener: "t1" }), { root: "/work/repo", opener: "t1" });
  for (const bad of [null, undefined, "x", {}, { root: "", opener: "" }, { root: 3, opener: 3 }]) {
    assert.deepEqual(decodeProps(bad), { root: null, opener: null });
  }
});

test("panes and agents: the fields Send uses, and an entry of the wrong shape is left out", () => {
  const program = { name: "Claude Code" };
  assert.deepEqual(decodePanes([{ pane: "p1", terminal: "t1", tab: "b1", status: "idle", program, title: "x" }, { pane: "p2", terminal: null, tab: "b1", status: null, title: "beads" }, { pane: 3 }, null]), [
    { pane: "p1", terminal: "t1", tab: "b1", status: "idle", name: "Claude Code" },
    { pane: "p2", terminal: null, tab: "b1", status: null, name: "beads" },
  ]);
  assert.deepEqual(
    decodeAgents([
      { pane: "p1", tab: "b1", seq: 4, program, title: "x" },
      { pane: "p1", tab: "b1", seq: "4" },
    ]),
    [{ pane: "p1", tab: "b1", seq: 4, name: "Claude Code" }],
  );
  assert.deepEqual([decodePanes({}), decodeAgents(null)], [[], []]);
});

test("font: the settings family, else Menlo", () => {
  assert.equal(decodeFont({ font_family: "JetBrains Mono" }), "JetBrains Mono");
  for (const bad of [null, {}, { font_family: "" }, { font_family: 1 }]) {
    assert.equal(decodeFont(bad), "Menlo");
  }
});

test("statuses: custom ones follow the built-in, without an icon", () => {
  const all = value(
    decodeStatuses(
      broken("statuses", (j) => (j.custom_statuses = [{ name: "review", category: "unspecified" }])),
      V,
    ),
  );
  assert.equal(all.at(-1)?.name, "review");
  assert.equal(all.at(-1)?.icon, "");
});
