---
status: accepted
---

# Send to agent types by clipboard, focus and paste

Send writes `Work on bead <id>: <title>` to the clipboard, focuses the target terminal, waits until that terminal
has the keyboard, runs `terminal.paste` and writes the user's old clipboard text back. The prompt is typed and
not submitted, so the user can edit it and press Enter.

## Considered options

- **Clipboard, `pane.focus`, `terminal.paste`.** Chosen. It pastes text without Enter. Focus moves to the agent,
  which is wanted anyway.
- **`hc send` or `terminal.send`.** Rejected: both always press Enter.
- **`hc keys` one key per character.** Rejected: it waits about 3 s of quiet and needs a key name for every
  character. It would work without moving focus and stays the fallback if the paste ever stops reading text.

## Consequences

- The user's clipboard is borrowed for about half a second. An image on it is lost, because the API reads text
  only. `sending` blocks Copy meanwhile, so a copy cannot send the bare id.
- `terminal.paste` goes to whatever has the keyboard, so nothing is pasted until `focused().terminal` is the
  target. If focus never lands in 1.5 s, nothing is pasted and the button says "Agent is gone".
- `pane.focus` lands about 100 ms after `run()` returns, and the paste reads the clipboard no later than that.
  The 300 ms wait before the restore is a margin measured on one machine (herdr-app-facts, section 2). If the
  margin is too small the old text would be pasted in place of the prompt.
- The target is the Opener when an agent runs there, else the agent of the Viewer's tab that changed last. It is
  chosen when Send runs and not stored, so an agent that left is not a stale target.
- A title's line breaks and tabs are flattened to single spaces, because a newline would submit.
