import { test } from "node:test";
import assert from "node:assert/strict";
import { fullDate, hiddenByFilters, textSections, visible } from "../src/rows.ts";
import { run } from "../src/runner.ts";
import { Store } from "../src/store.ts";
import { update } from "../src/update.ts";
import type { BdError, Cmd, Model, Msg, PartName, TreeNode } from "../src/types.ts";
import { exit, fakeHost, fixture, ok } from "./fake-host.ts";
import { bead, detail, many, modelOf, snapshot, steps } from "./model.ts";

const BEADS = [bead("a-1", { priority: 0 }), bead("a-2", { priority: 1, issue_type: "bug" }), bead("a-3", { priority: 2 })];
const WIDE = { _tag: "Resized", width: 1000 } satisfies Msg;
const NARROW = { _tag: "Resized", width: 500 } satisfies Msg;
const J = { _tag: "Move", delta: 1 } satisfies Msg;
const K = { _tag: "Move", delta: -1 } satisfies Msg;
const boom: BdError = { _tag: "BdRejected", code: 1, text: "boom" };
const gone: BdError = { _tag: "BeadGone", text: "Issue a-1 not found" };

const PARTS: PartName[] = ["show", "down", "up", "comments"];
const wait = (id: string, gen: number, timer: "fetch" | "loading"): Cmd => ({ _tag: "Wait", id, gen, timer });
// A bead just shown: the timers only.
const debounced = (id: string, gen: number): Cmd[] => [wait(id, gen, "fetch"), wait(id, gen, "loading")];
// A reload: the four calls at once, and the loading timer.
const fetches = (id: string, gen: number): Cmd[] => [...PARTS.map((part): Cmd => ({ _tag: "Fetch", id, part, gen })), wait(id, gen, "loading")];
const issued = (id: string, gen: number): Cmd[] => fetches(id, gen).slice(0, 4);

// The request number a bead's part is waiting on, or -1.
const genOf = (m: Model, id: string, part: PartName = "show"): number => {
  const p = m.details.get(id)?.[part];
  return p?._tag === "Loading" ? p.gen : -1;
};

// The replies to the calls `m` is waiting on, as the runner would send them.
const replies = (m: Model, id: string, only: PartName[] = PARTS): Msg[] =>
  (
    [
      { _tag: "Shown", id, gen: genOf(m, id, "show"), res: { ok: true, value: detail(id) } },
      { _tag: "Tree", id, gen: genOf(m, id, "down"), direction: "down", res: { ok: true, value: [] } },
      { _tag: "Tree", id, gen: genOf(m, id, "up"), direction: "up", res: { ok: true, value: [] } },
      { _tag: "Discussed", id, gen: genOf(m, id, "comments"), res: { ok: true, value: [] } },
    ] satisfies Msg[]
  ).filter((_, i) => only.includes(PARTS[i] as PartName));
const answer = (m: Model, id: string, only: PartName[] = PARTS): Model => steps(m, ...replies(m, id, only));

// A loaded list on the first bead, wide, with that bead's calls started (request 1).
const wide = (): Model => steps(modelOf(BEADS), WIDE, { _tag: "Refresh" }, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });

test("a bead just shown waits before asking bd; once its timer fires it starts show, both trees and the comments at once", () => {
  const [m, cmds] = update({ ...modelOf(BEADS), width: 1000 }, { _tag: "Select", id: "a-1" });
  assert.deepEqual(cmds, debounced("a-1", 1));
  assert.deepEqual(
    PARTS.map((p) => m.details.get("a-1")?.[p]._tag),
    ["Loading", "Loading", "Loading", "Loading"],
  );
  // The same bead again starts nothing.
  assert.deepEqual(update(m, { _tag: "Select", id: "a-1" })[1], []);
  assert.deepEqual(update(m, { _tag: "Waited", id: "a-1", gen: 1, timer: "fetch" })[1], issued("a-1", 1));
});

test("narrow: nothing loads until the bead is opened", () => {
  const list = steps(modelOf(BEADS), NARROW, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.equal(list.details.size, 0);
  const [open, cmds] = update(list, { _tag: "Enter" });
  assert.deepEqual(cmds, debounced("a-1", 1));
  assert.equal(open.details.has("a-1"), true);
});

test("the Fetch commands run bd show, dep tree down, dep tree up and comments, each answering with its id and request number", async () => {
  const answers: Record<string, string> = { show: fixture("show-open"), tree: fixture("tree-down"), comments: fixture("comments") };
  const { host, calls } = fakeHost(({ args }) => ok(answers[args[0] ?? ""] ?? "[]"));
  const msgs = await Promise.all(PARTS.map((part) => run(host, "/r", { _tag: "Fetch", id: "raccoon-46u.5", part, gen: 7 })));
  assert.deepEqual(
    calls.map((c) => c.args.join(" ")),
    ["show raccoon-46u.5 --json", "dep tree raccoon-46u.5 --direction=down --json", "dep tree raccoon-46u.5 --direction=up --json", "comments raccoon-46u.5 --json"],
  );
  assert.deepEqual(
    msgs.map((x) => [x._tag, "id" in x ? x.id : null, "gen" in x ? x.gen : null, "direction" in x ? x.direction : null, "res" in x && x.res.ok]),
    [
      ["Shown", "raccoon-46u.5", 7, null, true],
      ["Tree", "raccoon-46u.5", 7, "down", true],
      ["Tree", "raccoon-46u.5", 7, "up", true],
      ["Discussed", "raccoon-46u.5", 7, null, true],
    ],
  );
});

test("the Wait command sleeps 120 ms before the fetch and 150 ms before the Loading line, and answers with what it was given", async () => {
  const { host, sleeps } = fakeHost(() => ok("[]"));
  assert.deepEqual(await run(host, "/r", wait("a-1", 3, "fetch")), { _tag: "Waited", id: "a-1", gen: 3, timer: "fetch" });
  assert.deepEqual(await run(host, "/r", wait("a-1", 3, "loading")), { _tag: "Waited", id: "a-1", gen: 3, timer: "loading" });
  assert.deepEqual(sleeps, [120, 150]);
});

test("a missing bead answers BeadGone", async () => {
  const { host } = fakeHost(() => exit("Issue a-1 not found\nHint: ...\n"));
  const msg = await run(host, "/r", { _tag: "Fetch", id: "a-1", part: "show", gen: 1 });
  assert.ok(msg._tag === "Shown" && !msg.res.ok && msg.res.error._tag === "BeadGone");
});

test("holding j never shows another bead's detail: replies for a bead that is no longer shown are dropped", () => {
  const start = wide();
  // j, j: a-1 is left before any reply arrived.
  const moved = steps(start, J, J);
  assert.equal(moved.selected, "a-3");
  assert.deepEqual([...moved.details.keys()], ["a-3"]);
  for (const reply of replies(start, "a-1")) {
    assert.equal(update(moved, reply)[0], moved);
  }
  const late = answer(moved, "a-3");
  assert.equal(late.details.get("a-3")?.show._tag, "Ready");
});

test("passing ten beads quickly asks bd only about the one you stop on", () => {
  const beads = many(12);
  let m = steps(modelOf(beads), WIDE, { _tag: "Loaded", res: { ok: true, value: snapshot(beads) } });
  const timers: Cmd[] = [];
  for (let i = 0; i < 10; i++) {
    const [next, cmds] = update(m, J);
    m = next;
    timers.push(...cmds);
  }
  // Every timer fires after the last key.
  const asked = timers.flatMap((c) => (c._tag === "Wait" && c.timer === "fetch" ? update(m, { _tag: "Waited", id: c.id, gen: c.gen, timer: "fetch" })[1] : []));
  assert.deepEqual(asked, issued(m.selected ?? "", m.gen));
  assert.equal(timers.filter((c) => c._tag === "Fetch").length, 0);
});

test("a timer of a bead that was left and shown again is ignored; the new one asks", () => {
  const start = wide();
  const [away, awayCmds] = update(start, J);
  assert.deepEqual(awayCmds, debounced("a-2", 2));
  const [back, backCmds] = update(away, K);
  assert.deepEqual(backCmds, debounced("a-1", 3));
  assert.deepEqual(update(back, { _tag: "Waited", id: "a-2", gen: 2, timer: "fetch" })[1], []);
  assert.deepEqual(update(back, { _tag: "Waited", id: "a-1", gen: 1, timer: "fetch" })[1], []);
  assert.deepEqual(update(back, { _tag: "Waited", id: "a-1", gen: 3, timer: "fetch" })[1], issued("a-1", 3));
});

test("a reply for the shown bead fills only its own part", () => {
  const m = steps(wide(), { _tag: "Tree", id: "a-1", gen: 1, direction: "up", res: { ok: false, error: boom } });
  const d = m.details.get("a-1");
  assert.deepEqual([d?.show._tag, d?.down._tag, d?.up._tag, d?.comments._tag], ["Loading", "Loading", "Failed", "Loading"]);
});

test("a reply of an earlier request, arriving after the new one, is dropped", () => {
  const first = wide();
  // A refresh starts request 2 for the same bead while request 1 is still out.
  const [second, cmds] = update(first, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.deepEqual(cmds, fetches("a-1", 2));
  const fresh = answer(second, "a-1");
  assert.equal(fresh.details.get("a-1")?.show._tag, "Ready");
  const old = replies(first, "a-1");
  for (const reply of old) {
    assert.equal(update(fresh, reply)[0], fresh);
  }
  // Arriving the other way round, the old reply finds the part waiting for another number.
  assert.equal(update(second, old[0] as Msg)[0], second);
});

test("a retry is a new request: a late reply of the failed one is dropped", () => {
  const failed = steps(wide(), { _tag: "Shown", id: "a-1", gen: 1, res: { ok: false, error: boom } });
  const [retrying, cmds] = update(failed, { _tag: "Retry", part: "show" });
  assert.equal(genOf(retrying, "a-1"), 2);
  assert.deepEqual(cmds, [{ _tag: "Fetch", id: "a-1", part: "show", gen: 2 }, wait("a-1", 2, "loading")]);
  assert.equal(update(retrying, { _tag: "Shown", id: "a-1", gen: 1, res: { ok: true, value: detail("a-1") } })[0], retrying);
});

test("a retry of one part leaves the other parts' requests valid", () => {
  const failed = steps(wide(), { _tag: "Tree", id: "a-1", gen: 1, direction: "down", res: { ok: false, error: boom } });
  const retrying = update(failed, { _tag: "Retry", part: "down" })[0];
  assert.equal(genOf(retrying, "a-1", "comments"), 1);
  assert.equal(answer(retrying, "a-1", ["comments"]).details.get("a-1")?.comments._tag, "Ready");
});

test("the Loading line may show only after its timer fired, and a timer of an earlier request does not count", () => {
  const m = wide();
  assert.equal(m.details.get("a-1")?.slow, false);
  assert.equal(steps(m, { _tag: "Waited", id: "a-1", gen: 1, timer: "loading" }).details.get("a-1")?.slow, true);
  assert.equal(update(steps(m, J), { _tag: "Waited", id: "a-1", gen: 1, timer: "loading" })[0].details.has("a-1"), false);
  const retried = steps(m, { _tag: "Shown", id: "a-1", gen: 1, res: { ok: false, error: boom } }, { _tag: "Retry", part: "show" });
  assert.equal(update(retried, { _tag: "Waited", id: "a-1", gen: 1, timer: "loading" })[0], retried);
  assert.equal(steps(retried, { _tag: "Waited", id: "a-1", gen: 2, timer: "loading" }).details.get("a-1")?.slow, true);
});

test("cache: going back to a loaded bead runs no bd, and a bead left mid-load is fetched afresh", () => {
  const first = answer(wide(), "a-1");
  const second = answer(steps(first, J), "a-2");
  const done = steps(second, K);
  assert.equal(done.selected, "a-1");
  assert.deepEqual(update(done, J)[1], []);
  const third = update(steps(done, J), J);
  assert.deepEqual(third[1], debounced("a-3", third[0].gen));
  // a-3 is left before its replies came, so it is not cached half-loaded.
  const back = update(third[0], K);
  assert.deepEqual(back[1], []);
  assert.deepEqual([...back[0].details.keys()].sort(), ["a-1", "a-2"]);
  assert.deepEqual(update(back[0], J)[1], debounced("a-3", back[0].gen + 1));
});

test("a good refresh clears the cache and reloads the shown bead under what it showed", () => {
  const first = answer(wide(), "a-1");
  const done = steps(answer(steps(first, J), "a-2"), K);
  assert.equal(done.details.size, 2);
  const [next, cmds] = update(done, { _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  assert.deepEqual([...next.details.keys()], ["a-1"]);
  assert.deepEqual(cmds, fetches("a-1", done.gen + 1));
  const show = next.details.get("a-1")?.show;
  assert.ok(show?._tag === "Loading" && show.prev?.id === "a-1");
  // a-2 was cached before the refresh and is asked about again now.
  assert.deepEqual(update(next, J)[1], debounced("a-2", next.gen + 1));
});

test("a failed refresh keeps the cache", () => {
  const done = answer(wide(), "a-1");
  const [next, cmds] = update(done, { _tag: "Loaded", res: { ok: false, error: boom } });
  assert.deepEqual(cmds, []);
  assert.equal(next.details, done.details);
});

test("BeadGone and other show errors are kept for the view", () => {
  const m = steps(wide(), { _tag: "Shown", id: "a-1", gen: 1, res: { ok: false, error: gone } });
  assert.deepEqual(m.details.get("a-1")?.show, { _tag: "Failed", error: gone });
});

test("partial: a failed tree or comments leaves show ready, and Retry reruns only that call", () => {
  const start = wide();
  const failed = steps(answer(start, "a-1", ["show", "up", "comments"]), { _tag: "Tree", id: "a-1", gen: 1, direction: "down", res: { ok: false, error: boom } });
  const d = failed.details.get("a-1");
  assert.deepEqual([d?.show._tag, d?.down._tag, d?.up._tag, d?.comments._tag], ["Ready", "Failed", "Ready", "Ready"]);
  const [retrying, cmds] = update(failed, { _tag: "Retry", part: "down" });
  assert.deepEqual(cmds, [{ _tag: "Fetch", id: "a-1", part: "down", gen: 2 }]);
  assert.deepEqual([retrying.details.get("a-1")?.show._tag, retrying.details.get("a-1")?.down._tag], ["Ready", "Loading"]);
  const [, commentsRetry] = update(steps(failed, { _tag: "Discussed", id: "a-1", gen: 2, res: { ok: false, error: boom } }), { _tag: "Retry", part: "comments" });
  assert.deepEqual(commentsRetry, [{ _tag: "Fetch", id: "a-1", part: "comments", gen: 2 }]);
});

test("Retry of show also restarts the loading timer, and with nothing shown does nothing", () => {
  const failed = steps(wide(), { _tag: "Waited", id: "a-1", gen: 1, timer: "loading" }, { _tag: "Shown", id: "a-1", gen: 1, res: { ok: false, error: boom } });
  const [m, cmds] = update(failed, { _tag: "Retry", part: "show" });
  assert.deepEqual(cmds, [{ _tag: "Fetch", id: "a-1", part: "show", gen: 2 }, wait("a-1", 2, "loading")]);
  assert.equal(m.details.get("a-1")?.slow, false);
  const idle = steps(modelOf(BEADS), NARROW);
  assert.equal(update(idle, { _tag: "Retry", part: "show" })[0], idle);
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

// A Store whose commands run through a fake bd, with replies the test releases by hand.
function store(exec: Parameters<typeof fakeHost>[0]) {
  const { host, calls } = fakeHost(exec);
  const jobs: Promise<void>[] = [];
  const s = new Store(
    host,
    "/r",
    (job) => jobs.push(job()),
    () => {},
  );
  // A reply can start more jobs (a timer starts the fetches), so wait until no new one appears.
  const settled = async (): Promise<void> => {
    for (let seen = 0; seen < jobs.length;) {
      seen = jobs.length;
      await Promise.all(jobs);
    }
  };
  return { s, calls, settled };
}

test("the store feeds each reply back, and drops the replies that arrive after close", async () => {
  const live = store(({ args }) => ok(args[0] === "show" ? JSON.stringify([detail(args[1] ?? "")]) : "[]"));
  live.s.dispatch(WIDE);
  live.s.dispatch({ _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  await live.settled();
  assert.equal(live.s.model.details.get("a-1")?.show._tag, "Ready");
  // Two keys in a row: a-2 is left before its timer fires, so only a-3 is asked about.
  const callsBefore = live.calls.length;
  live.s.dispatch(J);
  live.s.dispatch(J);
  await live.settled();
  assert.deepEqual(
    live.calls.slice(callsBefore).map((c) => c.args.join(" ")),
    ["show a-3 --json", "dep tree a-3 --direction=down --json", "dep tree a-3 --direction=up --json", "comments a-3 --json"],
  );
  assert.equal(live.s.model.details.get("a-3")?.show._tag, "Ready");

  const closing = store(() => ok("[]"));
  closing.s.dispatch(WIDE);
  closing.s.dispatch({ _tag: "Loaded", res: { ok: true, value: snapshot(BEADS) } });
  const before = closing.s.model;
  closing.s.close();
  await closing.settled();
  assert.equal(closing.calls.length > 0, true);
  assert.equal(closing.s.model, before);
  // and nothing more is started once closed
  closing.s.dispatch(J);
  assert.equal(closing.s.model, before);
});

test("TreeNode data is kept as decoded for the next piece of work", () => {
  const nodes: TreeNode[] = [{ id: "a-1", title: "t", status: "open", priority: 2, issue_type: "task", depth: 0, parent_id: "", edge_from_parent: null }];
  const m = steps(wide(), { _tag: "Tree", id: "a-1", gen: 1, direction: "down", res: { ok: true, value: nodes } });
  const down = m.details.get("a-1")?.down;
  assert.ok(down?._tag === "Ready" && down.value === nodes);
});
