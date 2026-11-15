// Beads and models built by hand for the list tests. Only the tests use it.
import { initModel, update } from "../src/update.ts";
import type { Bead, Model, Msg, Snapshot } from "../src/types.ts";

export const bead = (id: string, over: Partial<Bead> = {}): Bead => ({
  id,
  title: `Title of ${id}`,
  status: "open",
  priority: 2,
  issue_type: "task",
  assignee: null,
  labels: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  closed_at: null,
  parent: null,
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 0,
  ...over,
});

export const snapshot = (beads: Bead[], ready: string[] = [], locks: [string, number][] = []): Snapshot => ({ beads, ready: new Set(ready), locks: new Map(locks) });

export const modelOf = (beads: Bead[], ready: string[] = []): Model => ({ ...initModel(), snapshot: snapshot(beads, ready) });

// Feeds messages in order and returns the model; the commands are dropped.
export function steps(m: Model, ...msgs: Msg[]): Model {
  for (const msg of msgs) {
    m = update(m, msg)[0];
  }
  return m;
}
