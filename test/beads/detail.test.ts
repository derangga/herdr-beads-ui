import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDate, hiddenByFilters, shownBead, textSections, visible } from "../../src/beads/rows.ts";
import { Store } from "../../src/beads/store.ts";
import { update } from "../../src/beads/update.ts";
import type { BdError, Model, Msg } from "../../src/beads/types.ts";
import { fakeHost, fixture, ok } from "./fake-host.ts";
import { bead, detail, modelOf, snapshot, steps } from "./model.ts";

const BEADS = [bead("a-1", { priority: 0, description: "first" }), bead("a-2", { priority: 1, issue_type: "bug", description: "second" }), bead("a-3", { priority: 2, description: "third" })];
const WIDE = { _tag: "Resized", width: 1000 } satisfies Msg;
const NARROW = { _tag: "Resized", width: 500 } satisfies Msg;
const J = { _tag: "Move", delta: 1 } satisfies Msg;
const boom: BdError = { _tag: "BdRejected", code: 1, text: "boom" };

// A loaded list on the first bead, wide.
const wide = (): Model => steps(modelOf(BEADS), WIDE, { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });

test("showing another bead runs no bd, whether by select, move, click, enter, jump or walk", () => {
  const m = wide();
  const msgs: Msg[] = [{ _tag: "Select", id: "a-2" }, J, { _tag: "Click", id: "a-3" }, { _tag: "Enter" }, { _tag: "Jump", id: "a-2" }, { _tag: "Walk", delta: -1 }, { _tag: "Walk", delta: 1 }, { _tag: "BackToList" }];
  let cur = m;
  for (const msg of msgs) {
    const [next, cmds] = update(cur, msg);
    assert.deepEqual(cmds, [], msg._tag);
    cur = next;
  }
  const narrow = update(steps(m, NARROW), { _tag: "Enter" });
  assert.equal(narrow[0].pane, "detail");
  assert.deepEqual(narrow[1], []);
});

test("the detail is the snapshot's bead at once, for the selected bead and for one a link shows", () => {
  const m = wide();
  assert.equal(shownBead(m)?.description, "first");
  assert.equal(shownBead(steps(m, J))?.description, "second");
  // A closed bead is hidden by the default filter, so a link shows it beside the list.
  const all = steps(m, { _tag: "Loaded", res: { ok: true, value: snapshot([...BEADS, bead("a-4", { status: "closed", description: "fourth" })]) } });
  const linked = steps(all, { _tag: "Jump", id: "a-4" });
  assert.equal(linked.shown, "a-4");
  assert.equal(shownBead(linked)?.description, "fourth");
});

test("a shown id that is not in the snapshot has no detail, and showing it runs nothing", () => {
  const [m, cmds] = update(wide(), { _tag: "Jump", id: "gone-1" });
  assert.equal(m.shown, "gone-1");
  assert.equal(shownBead(m), null);
  assert.deepEqual(cmds, []);
});

test("a good load replaces the snapshot, so the shown detail has the new data and runs nothing", () => {
  const m = steps(wide(), J);
  const next = BEADS.map((b) => (b.id === "a-2" ? detail("a-2", { description: "changed", comments: [{ id: "c1", author: "me", text: "hi", created_at: "2026-01-02T00:00:00Z" }] }) : b));
  const [loaded, cmds] = update(m, { _tag: "Loaded", res: { ok: true, value: snapshot(next) } });
  assert.deepEqual(cmds, []);
  assert.equal(shownBead(loaded)?.description, "changed");
  assert.equal(shownBead(loaded)?.comments.length, 1);
  assert.equal(loaded.selected, "a-2");
});

test("a bead shown by link that left the snapshot keeps its id, with no detail", () => {
  const all = steps(wide(), { _tag: "Loaded", res: { ok: true, value: snapshot([...BEADS, bead("a-4", { status: "closed" })]) } });
  const linked = steps(all, { _tag: "Jump", id: "a-4" });
  const [loaded, cmds] = update(linked, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.equal(loaded.shown, "a-4");
  assert.equal(shownBead(loaded), null);
  assert.deepEqual(cmds, []);
});

test("a failed load keeps the snapshot, and so the detail", () => {
  const m = wide();
  const [next, cmds] = update(m, { _tag: "Loaded", res: { ok: false, error: boom } });
  assert.deepEqual(cmds, []);
  assert.equal(next.snapshot, m.snapshot);
  assert.equal(shownBead(next)?.description, "first");
});

test("the hidden-by-filters note shows only when the shown bead is not in the filtered list", () => {
  const m = wide();
  assert.equal(hiddenByFilters(m, visible(m)), false);
  const hidden = { ...m, selected: "a-2", filters: { ...m.filters, type: "task" } };
  assert.equal(hiddenByFilters(hidden, visible(hidden)), true);
  assert.equal(hiddenByFilters({ ...hidden, selected: null }, visible(hidden)), false);
  assert.equal(hiddenByFilters({ ...hidden, width: 500 }, visible(hidden)), false);
});

test("a section with no text is absent", () => {
  assert.deepEqual(textSections(detail("a-1")), []);
  assert.deepEqual(textSections(detail("a-1", { design: "d", notes: "  \n", description: "x" })), [
    ["Description", "x"],
    ["Design", "d"],
  ]);
  assert.deepEqual(
    textSections(detail("a-1", { acceptance_criteria: "ac", notes: "n" })).map(([label]) => label),
    ["Acceptance criteria", "Notes"],
  );
});

test("fullDate is local minutes, and text that is not a date stays as it was", () => {
  assert.match(fullDate("2026-11-12T03:49:36Z"), /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  assert.equal(fullDate("not a date"), "not a date");
});

// A Store whose commands run through a fake bd.
function store(exec: Parameters<typeof fakeHost>[0]) {
  const { host, calls } = fakeHost(exec);
  const jobs: Promise<void>[] = [];
  const s = new Store(
    host,
    "/r",
    (job) => jobs.push(job()),
    () => {},
  );
  // A reply can start more jobs, so wait until no new one appears.
  const settled = async (): Promise<void> => {
    for (let seen = 0; seen < jobs.length;) {
      seen = jobs.length;
      await Promise.all(jobs);
    }
  };
  return { s, calls, settled };
}

const answer = ({ args }: { args: string[] }) => ok(args[0] === "export" ? fixture("export", "jsonl") : args[0] === "blocked" ? fixture("blocked") : fixture("ready"));

test("the store loads once, then moving, jumping and walking start no bd, and replies after close are dropped", async () => {
  const live = store(answer);
  live.s.dispatch(WIDE);
  live.s.dispatch({ _tag: "Refresh" });
  await live.settled();
  assert.deepEqual(live.calls.map((c) => c.args[0]).sort(), ["blocked", "export", "ready"]);
  assert.notEqual(shownBead(live.s.model), null);
  const first = live.s.model.selected;
  for (const msg of [J, J, { _tag: "Jump", id: first ?? "" }, { _tag: "Walk", delta: -1 }] satisfies Msg[]) {
    live.s.dispatch(msg);
  }
  await live.settled();
  assert.equal(live.calls.length, 3);

  const closing = store(answer);
  closing.s.dispatch({ _tag: "Refresh" });
  const before = closing.s.model;
  closing.s.close();
  await closing.settled();
  assert.equal(closing.calls.length > 0, true);
  assert.equal(closing.s.model, before);
  // and nothing more is started once closed
  closing.s.dispatch(J);
  assert.equal(closing.s.model, before);
});
