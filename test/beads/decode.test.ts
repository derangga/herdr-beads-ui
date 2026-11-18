import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAgents, decodeBlocked, decodeExport, decodeFocus, decodeFont, decodePanes, decodeProps, decodeReady, decodeStatuses } from "../../src/beads/decode.ts";
import type { Res } from "../../src/beads/types.ts";
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

// The export fixture with one line changed, as bd text.
function brokenExport(change: (lines: any[]) => void): string {
  const lines = fixture("export", "jsonl")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  change(lines);
  return lines.map((l) => JSON.stringify(l)).join("\n");
}

const undecodable = (res: Res<unknown>, path: string) => {
  assert.ok(!res.ok);
  assert.deepEqual({ _tag: res.error._tag, path: "path" in res.error ? res.error.path : null, version: "version" in res.error ? res.error.version : null }, { _tag: "Undecodable", path, version: V });
};

test("export: beads with the parent taken from the parent-child edge, and every edge", () => {
  const { beads, edges } = value(decodeExport(fixture("export", "jsonl"), V));
  assert.deepEqual(
    beads.map((b) => [b.id, b.parent]),
    [
      ["x-e1", null],
      ["x-e1.1", "x-e1"],
      ["x-e1.2", "x-e1"],
      ["x-e1.3", "x-e1"],
    ],
  );
  assert.deepEqual(
    edges.map((e) => [e.from, e.to, e.type]),
    [
      ["x-e1.1", "x-e1", "parent-child"],
      ["x-e1.2", "x-e1", "parent-child"],
      ["x-e1.2", "x-e1.1", "blocks"],
      ["x-e1.2", "x-e1.3", "blocks"],
      ["x-e1.3", "x-e1", "parent-child"],
    ],
  );
});

test("export: a closed bead, a comment, the long fields and absent optional ones", () => {
  const { beads } = value(decodeExport(fixture("export", "jsonl"), V));
  const closed = beads.find((b) => b.id === "x-e1.1");
  assert.equal(closed?.status, "closed");
  assert.equal(closed?.closed_at, "2026-10-16T11:29:55Z");
  assert.equal(closed?.comment_count, 1);
  assert.deepEqual(closed?.comments, [{ id: "a00db897-5db8-526e-88fe-ae985db7c284", author: "derangga", text: "Done in one export.", created_at: "2026-10-16T11:29:50Z" }]);
  const open = beads.find((b) => b.id === "x-e1.2");
  assert.equal(open?.acceptance_criteria, "[ ] Shows at once\n  [x] Walks the history");
  assert.equal(open?.design, "No bd call.");
  assert.equal(open?.assignee, null);
  assert.equal(open?.closed_at, null);
  assert.deepEqual(open?.comments, []);
  const bare = beads.find((b) => b.id === "x-e1.3");
  assert.deepEqual([bare?.description, bare?.design, bare?.acceptance_criteria, bare?.notes, bare?.labels], ["", "", "", "", []]);
});

test("export: blank lines and records of another _type are skipped", () => {
  const [a, b] = fixture("export", "jsonl").trim().split("\n");
  const text = `\n${a}\n\n{"_type":"memory","key":"k"}\n${b}\n`;
  assert.deepEqual(
    value(decodeExport(text, V)).beads.map((x) => x.id),
    ["x-e1", "x-e1.1"],
  );
  assert.deepEqual(value(decodeExport("", V)), { beads: [], edges: [] });
});

test("export: the path names the line of a missing title, a wrong-typed edge, a bad comment and a non-JSON line", () => {
  undecodable(
    decodeExport(
      brokenExport((l) => delete l[3].title),
      V,
    ),
    "$[3].title",
  );
  undecodable(
    decodeExport(
      brokenExport((l) => (l[2].dependencies[1].type = 7)),
      V,
    ),
    "$[2].dependencies[1].type",
  );
  undecodable(
    decodeExport(
      brokenExport((l) => delete l[1].comments[0].text),
      V,
    ),
    "$[1].comments[0].text",
  );
  undecodable(decodeExport(`${fixture("export", "jsonl")}nope\n`, V), "$[4]");
  undecodable(decodeExport("[1]", V), "$[0]");
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
  const res = decodeExport("nope", null);
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
