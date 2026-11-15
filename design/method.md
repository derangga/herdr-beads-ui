# Method: Effect mapped onto plain TypeScript

Part of the [design](../DESIGN.md).

Every operation is designed with the design-thinking pass: name the shapes, draw the happy path as a call graph
(`A`), mark where it breaks (`E`), mark what each step needs (`R`). The model is `Effect<A, E, R>`. This mod does
not use the Effect library, for the reasons in [ADR 0001](../docs/adr/0001-plain-typescript-with-effect-s-three-channels.md).
herdr-review has the same map onto Rust and onto its own mod.

| Effect | TypeScript in this mod |
|---|---|
| `A`, the success value | The `value` of a `Res<T>`, or a `Msg` that carries the decoded data |
| `E`, the error channel | A tagged object in the `error` of a `Res`: `{ _tag: "BdLocked", text }`. Errors are values from `runner.ts` up to `update.ts`. Nothing below `update.ts` decides what the user sees |
| `R`, the requirements | The `host: Host` parameter, and `root`, the Viewed repo's folder. A function takes them and calls nothing else outside the process |
| `gen` body is A, `pipe` is E | A runner function is a straight line that returns `Res` or `Msg`. `bd()` wraps the call with the lock retry. `classify()` and `rejection()` turn a failed call into a tag once. `update.ts` is the single reaction table |
| Retry | A bounded loop in `bd()` for `BdLocked`: 300 ms, then 900 ms. Nothing else is retried |
| Escape | The reducer keeps the last good snapshot and records the error, which `view.ts` draws as a banner or an empty screen |
| Die | A `throw` of a plain `Error` for a bug: a `Msg` the switch does not handle, a decoder that throws something that is not its own `Bad`. A tag is never thrown |
| Layer swap for tests | `fakeHost(exec)` in place of `realHost(cx)`: `exec` answers from a function, `sleep` is instant, `run`, `openOverlay` and the clipboard write record into `events` |
| Scope | `close(cx)` cancels the poll, sets `closed` so replies still in flight are dropped, and releases the three view handles |

Strip-only type stripping (`node --test`) rejects `enum` and constructor parameter properties. Tagged values
are `type` unions and `import type` is used for types.

## Notation

Steps start with `->`, nested steps are indented. `R:` names what the step needs. `E:` names how it fails and
what happens then. Cardinality is written at the right of a step when it is not once.

```
-> load                                              many, one in flight
  -> bd export                                       R: Host.exec   E: BdLocked -> retry x2
    -> decodeExport(stdout)                          boundary       E: Undecodable -> escape, banner
```

Production and tests get separate sections only when they differ. They differ in what sits behind `R:` and
nothing else. If a graph needs more than that to run in a test, the design has a hidden dependency.
