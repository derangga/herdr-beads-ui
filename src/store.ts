// The dispatch loop: update, tell the owner what changed, run each Cmd and feed its reply back.
// After close() the replies still in flight are dropped.
import type { Host } from "./host.ts";
import { run } from "./runner.ts";
import type { Model, Msg } from "./types.ts";
import { initModel, update } from "./update.ts";

export class Store {
  model: Model = initModel();
  closed = false;
  host: Host;
  root: string | null;
  spawn: (job: () => Promise<void>) => void;
  changed: (before: Model, after: Model, msg: Msg) => void;

  constructor(host: Host, root: string | null, spawn: (job: () => Promise<void>) => void, changed: (before: Model, after: Model, msg: Msg) => void) {
    this.host = host;
    this.root = root;
    this.spawn = spawn;
    this.changed = changed;
  }

  dispatch(msg: Msg): void {
    if (this.closed) {
      return;
    }
    const before = this.model;
    const [model, cmds] = update(before, msg);
    this.model = model;
    if (model !== before) {
      this.changed(before, model, msg);
    }
    const root = this.root;
    if (root !== null) {
      for (const cmd of cmds) {
        this.spawn(async () => this.dispatch(await run(this.host, root, cmd)));
      }
    }
  }

  close(): void {
    this.closed = true;
  }
}
