---
status: accepted
---

# Plain TypeScript that keeps Effect's three channels, and no Effect library

The mod is designed with the same pass as herdr-review: the success value (`A`), the failures (`E`) and the
requirements (`R`), drawn as a call graph before code. `design/method.md` has the map. The library that gives
those channels types, Effect, is not in the bundle.

## Considered options

- **Effect in the mod.** `Effect.gen`, `Schema` and layers would give the channels their native types. Rejected:
  `import { Schema } from "effect"` fails to load in the mod runtime with `TextEncoder is not defined`
  (herdr-review's herdr-app-facts, section 2), which means a polyfill. The runtime alone adds 210 KB to a bundle
  that reloads on every save, and an `Effect.runPromise` around `exec` cannot be tested without a window.
- **Plain TypeScript with the channels as conventions.** Chosen. `A` is the `value` of a `Res` or a `Msg`. `E` is
  a tagged object in the same `Res`. `R` is the `host: Host` parameter. Retry is a loop in `bd()`. The reaction to
  every error is one table in `update.ts`.
- **Throw tagged objects, as herdr-review's mod does.** Rejected here. Every call returns a `Res`, so a caller
  that ignores the error is a type error and no `withRecovery` wrapper is needed.

## Consequences

- No schema library. `decode.ts` checks by hand the fields the mod reads. A bd field that changed is
  `Undecodable` with its path and bd's version.
- Tests swap only `Host`: `fakeHost` in place of `realHost`.
- The decisions Effect would have enforced are enforced by review and by the rule that `update.ts` and `rows.ts`
  are pure and `runner.ts` never throws. Nothing but a convention stops a function below `host.ts` from calling
  `herdr` directly, except that only `host.ts` imports it.
- Effect can come back if the runtime gains the missing global.
