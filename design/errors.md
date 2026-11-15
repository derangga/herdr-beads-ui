# Errors (E)

Part of the [design](../DESIGN.md).

An error is a value from where it is found up to `update.ts`. Each is raised in one place, turned into a tag
once, and reacted to in one place. Retry, escape or die:

- **Retry.** `BdLocked` only, in `bd()`.
- **Escape.** Everything else: keep the last good snapshot, show the error. Nothing here ends the Viewer.
- **Die.** A bug in this code: a `Msg` the reducer's switch does not handle, a decoder that throws something
  that is not its own `Bad`. Let it throw. herdr-app shows the mod error and `herdr-app status` lists it.

## bd

| Tag | Raised by | Reaction | Retry |
|---|---|---|---|
| `NoOpener` | `start`: no folder in the props and none from `focused()` | The whole Viewer is replaced by "Open from a terminal". `Refresh` is dropped, no bd runs | No |
| `RemoteSpace` | `start`: the Opener's tab is in a space on another machine | Replaced by "Remote spaces aren't supported yet". No bd runs, because it would run locally against a folder that only shares the remote path | No |
| `NoDatabase` | `classify`: text has `no beads database found` | With no snapshot: a centered message with the folder, the `bd init` hint and Retry. With a snapshot: a banner over the last list | No, the user presses Retry |
| `BdMissing` | `rejection`: `exec` cannot run `bd`, and `bd --version` cannot run either | Banner with bd's text, red, with Retry. The last list stays | No |
| `BdTimeout` | `rejection`: `took longer than ... and was stopped` | Banner with Retry | No |
| `BdLocked` | `classify`: text has `maintenance operation is running` | After two retries, banner with Retry | Yes, 300 ms then 900 ms |
| `BeadGone` | `classify`: `Issue <id> not found` or `no issue(s) found matching`, on either stream | On a write: the pill goes back and the text shows under the meta row. The reload that follows drops the bead | No |
| `BdRejected` | `classify` for any other exit, and `rejection` for any other reject. Carries `code` (`-1` for a reject) and the text | Banner, or under the meta row for a write | No |
| `Undecodable` | a decoder: a missing or wrong-typed field, a line that is not JSON | Banner naming bd's version, the path and the detail. Compatibility bug, so not retried | No |

A failed load keeps `snapshot` and sets `error`. The next good load clears it. A failed `bd statuses` is not an
error to the user: the picker lists the built-in five (`open`, `in_progress`, `blocked`, `deferred`, `closed`).

The rejection of `exec` has two texts that look alike. `cannot run <program>` means either `bd` is missing or the
folder is. `rejection` tells them apart by running `bd --version` without the folder: it starts, so the folder is
gone (`BdRejected`), or it does not, so `bd` is missing (`BdMissing`).

## Send

| Tag | Raised by | Reaction |
|---|---|---|
| `NoTarget` | `pickTarget` found no agent | The Send button says "No agent in this tab" for 1.2 s. Nothing touched |
| `TargetGone` | the target did not take focus in 30 polls of 50 ms | "Agent is gone". The clipboard is restored and nothing is pasted |
| `SendRejected` | a `run` call threw | "Send failed", and the clipboard is restored |

While there is no target at all the button is dimmed and its tooltip says "No agent in this tab", so the
common case needs no click to learn.

## Where a failure shows

| Place | For |
|---|---|
| Replaces the Viewer (`emptyState`) | `NoOpener`, `RemoteSpace`, `NoDatabase` with no snapshot |
| Banner with Retry over the list | a failed load that has a snapshot to keep |
| Under the detail's meta row (`writeError`) | a failed status write, until another bead is shown or a new write or picker starts |
| The Send button's label for 1.2 s | `SendError` |

`bdText` is the one function that turns a `BdError` into a line: bd's own words, and for `Undecodable` bd's
version.
