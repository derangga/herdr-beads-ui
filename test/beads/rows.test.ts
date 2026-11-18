import { test } from "node:test";
import assert from "node:assert/strict";
import { visible } from "../../src/beads/rows.ts";
import type { Bead, Model, SortKey } from "../../src/beads/types.ts";
import { bead, modelOf, steps } from "./model.ts";

const ids = (m: Model): string[] => visible(m).map((b) => b.id);

const BEADS = [
  bead("a-1", { title: "Mock Server menu", status: "open", issue_type: "task", priority: 2 }),
  bead("a-2", { title: "Sidebar row", status: "in_progress", issue_type: "bug", priority: 0 }),
  bead("a-3", { title: "mock listening", status: "blocked", issue_type: "task", priority: 1 }),
  bead("b-4", { title: "Epic of mocks", status: "deferred", issue_type: "epic", priority: 3 }),
  bead("a-5", { title: "Old mock work", status: "closed", issue_type: "task", priority: 4, closed_at: "2026-01-02T00:00:00Z" }),
];
const READY = ["a-1", "b-4", "a-5"];
const model = () => modelOf(BEADS, READY);

test("default view hides closed beads and sorts by priority, P0 first", () => {
  assert.deepEqual(ids(model()), ["a-2", "a-3", "a-1", "b-4"]);
});

test("status filter: all shows closed, a specific status shows only it", () => {
  assert.deepEqual(ids(steps(model(), { _tag: "SetStatus", status: "all" })), ["a-2", "a-3", "a-1", "b-4", "a-5"]);
  assert.deepEqual(ids(steps(model(), { _tag: "SetStatus", status: "closed" })), ["a-5"]);
  assert.deepEqual(ids(steps(model(), { _tag: "SetStatus", status: "blocked" })), ["a-3"]);
});

test("an unknown custom status is not closed", () => {
  const m = modelOf([bead("x-1", { status: "review" }), bead("x-2", { status: "closed" })]);
  assert.deepEqual(ids(m), ["x-1"]);
  assert.deepEqual(ids(steps(m, { _tag: "SetStatus", status: "review" })), ["x-1"]);
});

test("type filter", () => {
  assert.deepEqual(ids(steps(model(), { _tag: "SetType", type: "task" })), ["a-3", "a-1"]);
  assert.deepEqual(ids(steps(model(), { _tag: "SetType", type: "all" })), ["a-2", "a-3", "a-1", "b-4"]);
});

test("ready toggle keeps only the ids bd ready named, and toggles back", () => {
  const on = steps(model(), { _tag: "ToggleReady" });
  assert.deepEqual(ids(on), ["a-1", "b-4"]);
  assert.deepEqual(ids(steps(on, { _tag: "ToggleReady" })), ["a-2", "a-3", "a-1", "b-4"]);
});

test("search matches id and title, case-insensitively, as a substring", () => {
  assert.deepEqual(ids(steps(model(), { _tag: "Search", text: "MOCK" })), ["a-3", "a-1", "b-4"]);
  assert.deepEqual(ids(steps(model(), { _tag: "Search", text: "b-4" })), ["b-4"]);
  assert.deepEqual(ids(steps(model(), { _tag: "Search", text: "  sidebar " })), ["a-2"]);
  assert.deepEqual(ids(steps(model(), { _tag: "Search", text: "nothing" })), []);
});

test("search combines with each filter", () => {
  const search = { _tag: "Search", text: "mock" } as const;
  assert.deepEqual(ids(steps(model(), search, { _tag: "ToggleReady" })), ["a-1", "b-4"]);
  assert.deepEqual(ids(steps(model(), search, { _tag: "SetStatus", status: "all" })), ["a-3", "a-1", "b-4", "a-5"]);
  assert.deepEqual(ids(steps(model(), search, { _tag: "SetStatus", status: "closed" })), ["a-5"]);
  assert.deepEqual(ids(steps(model(), search, { _tag: "SetType", type: "task" })), ["a-3", "a-1"]);
});

test("ready, status and type filters combine", () => {
  const m = steps(model(), { _tag: "ToggleReady" }, { _tag: "SetType", type: "task" }, { _tag: "SetStatus", status: "all" });
  assert.deepEqual(ids(m), ["a-1", "a-5"]);
});

test("a ready id that is closed stays hidden under not closed", () => {
  assert.deepEqual(ids(steps(model(), { _tag: "ToggleReady" })).includes("a-5"), false);
});

const sorted = (key: SortKey, reverse: boolean, beads = BEADS): string[] => ids(steps(modelOf(beads), { _tag: "SetStatus", status: "all" }, { _tag: "SortBy", key }, ...(reverse ? [{ _tag: "Reverse" } as const] : [])));

const DATED = [
  bead("d-1", { created_at: "2026-01-02T00:00:00Z", updated_at: "2026-03-01T00:00:00Z", closed_at: "2026-03-01T00:00:00Z", assignee: "bob" }),
  bead("d-2", { created_at: "2026-01-03T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", closed_at: "2026-02-01T00:00:00Z", assignee: "Ann" }),
  bead("d-3", { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }),
];

test("sort by priority, with reverse", () => {
  assert.deepEqual(sorted("priority", false), ["a-2", "a-3", "a-1", "b-4", "a-5"]);
  assert.deepEqual(sorted("priority", true), ["a-5", "b-4", "a-1", "a-3", "a-2"]);
});

test("sort by created, updated and closed is newest first, with reverse", () => {
  assert.deepEqual(sorted("created", false, DATED), ["d-2", "d-1", "d-3"]);
  assert.deepEqual(sorted("created", true, DATED), ["d-3", "d-1", "d-2"]);
  assert.deepEqual(sorted("updated", false, DATED), ["d-1", "d-2", "d-3"]);
  assert.deepEqual(sorted("updated", true, DATED), ["d-3", "d-2", "d-1"]);
  assert.deepEqual(sorted("closed", false, DATED), ["d-1", "d-2", "d-3"]);
});

test("sort by closed puts beads never closed last in both directions", () => {
  assert.deepEqual(sorted("closed", true, DATED), ["d-2", "d-1", "d-3"]);
});

test("sort by status follows the workflow, then unknown names", () => {
  const beads = [bead("s-1", { status: "closed" }), bead("s-2", { status: "review" }), bead("s-3", { status: "deferred" }), bead("s-4", { status: "open" }), bead("s-5", { status: "blocked" }), bead("s-6", { status: "in_progress" })];
  assert.deepEqual(sorted("status", false, beads), ["s-4", "s-6", "s-5", "s-3", "s-1", "s-2"]);
  assert.deepEqual(sorted("status", true, beads), ["s-2", "s-1", "s-3", "s-5", "s-6", "s-4"]);
});

test("sort by id is natural, not by character", () => {
  const beads = [bead("x.10"), bead("x.9"), bead("x.1")];
  assert.deepEqual(sorted("id", false, beads), ["x.1", "x.9", "x.10"]);
  assert.deepEqual(sorted("id", true, beads), ["x.10", "x.9", "x.1"]);
});

test("sort by title ignores case", () => {
  const beads = [bead("t-1", { title: "banana" }), bead("t-2", { title: "Apple" }), bead("t-3", { title: "cherry" })];
  assert.deepEqual(sorted("title", false, beads), ["t-2", "t-1", "t-3"]);
  assert.deepEqual(sorted("title", true, beads), ["t-3", "t-1", "t-2"]);
});

test("sort by type", () => {
  assert.deepEqual(sorted("type", false), ["a-2", "b-4", "a-1", "a-3", "a-5"]);
  assert.deepEqual(sorted("type", true), ["a-1", "a-3", "a-5", "b-4", "a-2"]);
});

test("sort by assignee puts unassigned last in both directions", () => {
  assert.deepEqual(sorted("assignee", false, DATED), ["d-2", "d-1", "d-3"]);
  assert.deepEqual(sorted("assignee", true, DATED), ["d-1", "d-2", "d-3"]);
});

test("ties fall back to updated newest, then id, and reverse leaves the tie-break alone", () => {
  const beads = [bead("t-b", { priority: 1, updated_at: "2026-01-02T00:00:00Z" }), bead("t-a", { priority: 1, updated_at: "2026-01-02T00:00:00Z" }), bead("t-c", { priority: 1, updated_at: "2026-01-03T00:00:00Z" }), bead("t-d", { priority: 0, updated_at: "2026-01-01T00:00:00Z" })];
  assert.deepEqual(sorted("priority", false, beads), ["t-d", "t-c", "t-a", "t-b"]);
  assert.deepEqual(sorted("priority", true, beads), ["t-c", "t-a", "t-b", "t-d"]);
});

test("a tie on updated falls back to id", () => {
  const beads = [bead("u-2"), bead("u-1"), bead("u-3")];
  assert.deepEqual(sorted("updated", false, beads), ["u-1", "u-2", "u-3"]);
});

test("choosing a sort key resets reverse", () => {
  const m = steps(model(), { _tag: "Reverse" }, { _tag: "SortBy", key: "id" });
  assert.deepEqual(m.sort, { key: "id", reverse: false });
});

test("no snapshot shows no rows", () => {
  assert.deepEqual(visible({ ...model(), snapshot: null }), []);
});

test("the id tie-break is natural like the id sort: a.9 before a.10", () => {
  const beads = [bead("a.10"), bead("a.9")];
  assert.deepEqual(sorted("priority", false, beads), ["a.9", "a.10"]);
  assert.deepEqual(sorted("priority", true, beads), ["a.9", "a.10"]);
});

// Three beads tie on the key; `other` differs and sorts after them in the key's natural direction.
const TIES: [SortKey, Partial<Bead>, Partial<Bead>][] = [
  ["created", { created_at: "2026-01-02T00:00:00Z" }, { created_at: "2026-01-01T00:00:00Z" }],
  ["closed", { closed_at: "2026-02-01T00:00:00Z" }, { closed_at: "2026-01-01T00:00:00Z" }],
  ["status", { status: "open" }, { status: "closed" }],
  ["title", { title: "same" }, { title: "zzz" }],
  ["type", { issue_type: "task" }, { issue_type: "zzz" }],
  ["assignee", { assignee: "ann" }, { assignee: "zed" }],
];

for (const [key, tied, other] of TIES) {
  test(`sort by ${key}: ties fall back to updated newest, then id, with and without reverse`, () => {
    const beads = [bead("x-2", { ...tied, updated_at: "2026-01-02T00:00:00Z" }), bead("x-1", { ...tied, updated_at: "2026-01-02T00:00:00Z" }), bead("x-3", { ...tied, updated_at: "2026-01-03T00:00:00Z" }), bead("o-1", { ...other, updated_at: "2026-01-05T00:00:00Z" })];
    assert.deepEqual(sorted(key, false, beads), ["x-3", "x-1", "x-2", "o-1"]);
    assert.deepEqual(sorted(key, true, beads), ["o-1", "x-3", "x-1", "x-2"]);
  });
}

test("the same snapshot, filters and sort give the same rows; new filters give new rows", () => {
  const m = model();
  assert.equal(visible(m), visible(m));
  const all = { ...m, filters: { ...m.filters, status: "all" } };
  assert.notEqual(visible(all), visible(m));
  assert.deepEqual(ids(all), ["a-2", "a-3", "a-1", "b-4", "a-5"]);
  assert.deepEqual(ids(m), ["a-2", "a-3", "a-1", "b-4"]);
});
