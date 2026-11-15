import { test } from "node:test";
import assert from "node:assert/strict";
import { bd, beadComments, blockedBeads, depTree, listBeads, readyIds, showBead, statuses } from "../src/runner.ts";
import type { Res } from "../src/types.ts";
import { exit, fakeHost, fixture, ok } from "./fake-host.ts";
import type { Reply } from "./fake-host.ts";

const ROOT = "/work/repo";

function tag(res: Res<unknown>): string {
  return res.ok ? "ok" : res.error._tag;
}

test("runs bd in the Viewed repo with a timeout and decodes stdout", async () => {
  const { host, calls } = fakeHost(() => ok(fixture("list")));
  const res = await listBeads(host, ROOT);
  assert.ok(res.ok && res.value.length === 5);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { command: "bd", args: ["list", "--all", "-n", "0", "--brief", "--json"], cwd: ROOT, timeout: 15_000 });
});

test("each read asks bd for its own command", async () => {
  const seen: string[] = [];
  const { host } = fakeHost(({ args }) => {
    seen.push(args.join(" "));
    return ok(args[0] === "statuses" ? '{"built_in_statuses":[]}' : "[]");
  });
  await readyIds(host, ROOT);
  await blockedBeads(host, ROOT);
  await showBead(host, ROOT, "x-1"); // "[]" is no bead: the version lookup that follows is not under test
  await depTree(host, ROOT, "x-1", "up");
  await beadComments(host, ROOT, "x-1");
  await statuses(host, ROOT);
  assert.deepEqual(
    seen.filter((a) => a !== "--version"),
    ["ready -n 0 --json", "blocked --json", "show x-1 --json", "dep tree x-1 --direction=up --json", "comments x-1 --json", "statuses --json"],
  );
});

test("NoDatabase: bd's text is kept", async () => {
  const text = "Error: no beads database found\nHint: run 'bd where' to inspect the resolved workspace, or 'bd init' to create a new database";
  const { host } = fakeHost(() => exit(`${text}\n`));
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "NoDatabase", text } });
});

// The texts herdr-app 0.1.15 rejects exec with (design/herdr-app-facts.md §4).
const NO_BIN = new Error("`herdr.exec`: cannot run bd: No such file or directory (os error 2)");
const SLOW = new Error("`herdr.exec`: bd took longer than 15 s and was stopped");

test("BdMissing: exec cannot start bd, and bd cannot start without the folder either", async () => {
  const { host, calls, sleeps } = fakeHost(() => NO_BIN);
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdMissing", text: NO_BIN.message } });
  assert.deepEqual(
    calls.map((c) => c.cwd),
    [ROOT, undefined],
  );
  assert.deepEqual(sleeps, []);
});

test("BdRejected: the same rejection when bd starts without the folder means the folder is gone", async () => {
  const { host } = fakeHost(({ cwd }) => (cwd === undefined ? ok("bd version 1.3.4 (dev)") : NO_BIN));
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdRejected", code: -1, text: NO_BIN.message } });
});

test("BdTimeout: exec rejects with its timeout text, retried twice", async () => {
  const { host, calls, sleeps } = fakeHost(() => SLOW);
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdTimeout", text: SLOW.message } });
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [300, 900]);
});

const LOCK = "a maintenance operation is running on this workspace; retry when it completes: workspacegate: /r/.beads/embeddeddolt.gate.lock (shared mode) held by another bd process (no holder info recorded): workspace gate busy";

test("BdLocked: the --json form has the text on stdout and empty stderr; 3 calls, then the error", async () => {
  const { host, calls, sleeps } = fakeHost(() => exit("", JSON.stringify({ error: LOCK, schema_version: 1 })));
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdLocked", text: LOCK } });
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [300, 900]);
});

test("BdLocked: the plain stderr form is told apart too", async () => {
  const { host } = fakeHost(() => exit(`Error: ${LOCK}\n`));
  assert.equal(tag(await bd(host, ROOT, ["list"])), "BdLocked");
});

test("BdLocked: a warning on stderr does not hide the error on stdout", async () => {
  const { host } = fakeHost(() => exit("warning: something harmless", JSON.stringify({ error: LOCK, schema_version: 1 })));
  const res = await bd(host, ROOT, ["list", "--json"]);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdLocked", text: `warning: something harmless\n${LOCK}` } });
});

test("a lock that clears on the second try returns the data after one sleep", async () => {
  const { host, calls, sleeps } = fakeHost((_c, n): Reply => (n === 1 ? exit(`Error: ${LOCK}`) : ok(fixture("list"))));
  const res = await listBeads(host, ROOT);
  assert.ok(res.ok);
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [300]);
});

test("BeadGone: show, with the text on both streams", async () => {
  const hint = "Issue nope-123 not found\nHint: this ID may have never existed";
  const json = JSON.stringify({ error: "no issues found matching the provided IDs", schema_version: 1 });
  const { host } = fakeHost(() => exit(hint, json));
  const res = await showBead(host, ROOT, "nope-123");
  assert.deepEqual(res, { ok: false, error: { _tag: "BeadGone", text: `${hint}\nno issues found matching the provided IDs` } });
  const only = fakeHost(() => exit("", json));
  assert.equal(tag(await showBead(only.host, ROOT, "nope-123")), "BeadGone");
});

test("BeadGone: dep tree (both directions) and comments word it differently, on stdout only", async () => {
  const tree = JSON.stringify({ error: 'resolving issue ID nope-123: no issue found matching "nope-123"', schema_version: 1 });
  const comments = JSON.stringify({ error: 'resolving nope-123: no issue found matching "nope-123"', schema_version: 1 });
  const a = fakeHost(() => exit("", tree));
  assert.equal(tag(await depTree(a.host, ROOT, "nope-123", "down")), "BeadGone");
  assert.equal(tag(await depTree(a.host, ROOT, "nope-123", "up")), "BeadGone");
  const b = fakeHost(() => exit("", comments));
  assert.equal(tag(await beadComments(b.host, ROOT, "nope-123")), "BeadGone");
  assert.equal(a.calls.length + b.calls.length, 3);
});

test("BdRejected carries the code and the text, and is not retried", async () => {
  const { host, calls, sleeps } = fakeHost(() => ({ code: 2, stdout: "", stderr: "Error: unknown flag: --bogus\n" }));
  const res = await bd(host, ROOT, ["list", "--bogus"]);
  assert.deepEqual(res, { ok: false, error: { _tag: "BdRejected", code: 2, text: "Error: unknown flag: --bogus" } });
  assert.equal(calls.length, 1);
  assert.deepEqual(sleeps, []);
});

test("Undecodable carries the bd version, asked for only after the decode fails", async () => {
  const { host, calls } = fakeHost(({ args }) => (args[0] === "--version" ? ok("bd version 1.3.4 (dev)\n") : ok("{}")));
  const res = await listBeads(host, ROOT);
  assert.deepEqual(res, { ok: false, error: { _tag: "Undecodable", version: "1.3.4", path: "$", detail: "expected an array" } });
  assert.deepEqual(
    calls.map((c) => c.args[0]),
    ["list", "--version"],
  );
});

test("Undecodable is not retried, and its version is null when bd cannot say", async () => {
  const { host, sleeps } = fakeHost(({ args }) => (args[0] === "--version" ? exit("boom") : ok("{}")));
  const res = await listBeads(host, ROOT);
  assert.ok(!res.ok && res.error._tag === "Undecodable" && res.error.version === null);
  assert.deepEqual(sleeps, []);
});
