# Call graphs: copy the id, and Send to agent

Part of the [design](../../DESIGN.md). Each `E:` line is one test, and each test swaps only `Host`. The
decision is [ADR 0003](../../docs/adr/0003-send-by-clipboard-focus-and-paste.md).

## Copy the id

```
-> key y | the id's copy icon                          Msg.Copy
     E: nothing shown, or a send has the clipboard (sending) -> unchanged, no Cmd
  -> flash + 1 = n; copied = { n, id }                 the id's label says "Copied"
  -> run Copy { id, n }                                R: Host.writeClipboard, Host.sleep 1200 ms
  -> Msg.Faded { what: "copied", n }
       E: copied.n is not n (a later copy started) -> nothing, so an earlier timer cannot clear a later label
```

## Choose the target (pure)

```
-> pickTarget(opener, panes, agents)                   R: nothing; looked up on every draw and again when Send runs
  -> a pane whose terminal is the Opener's and whose status is not null   (an agent runs there)
       -> that terminal, named by the pane
  -> else the agents of the Opener's tab, the one with the highest seq first (changed most recently)
       -> the first whose pane has a terminal
  -> else null
       E: -> NoTarget
```

The Opener is the first choice. A shell Opener sends to the agent of its tab that changed last, and never to
one in another tab. An agent whose pane has no terminal is skipped. The Send button is dimmed while the target
is null, and its tooltip says "No agent in this tab". Otherwise the tooltip says where the text will go.

## Send

```
-> key or button Send                                  Msg.Send
     E: nothing shown, or a send already runs -> unchanged
  -> sending = true; Cmd.Send { id, title, opener }
-> run Send                                            R: Host.panes, agents, readClipboard, writeClipboard,
                                                          run, focused, sleep
  -> pickTarget(...)                                   E: null -> SendFailed NoTarget, nothing touched
  -> kept = readClipboard()                            the user's own text, undefined when there is none
  -> writeClipboard("Work on bead <id>: <title>")      the title's line breaks and tabs become single spaces
  -> run pane.focus { terminal }
  -> poll focused().terminal every 50 ms, up to 30 times
       E: it never becomes the target -> restore the clipboard, SendFailed TargetGone, nothing pasted
  -> run terminal.paste                                pastes text, does not press Enter
  -> sleep 300 ms                                      the paste has not read the clipboard when run() returns
  -> restore: writeClipboard(kept)                     E: kept is undefined -> nothing written back
  -> Msg.Sent { agent }
     E: any run call throws -> restore the clipboard, SendFailed SendRejected { text }
-> update(Sent | SendFailed)
  -> sending = false; sent = { n, text }               the button says "Sent to <agent>" or the error's line
  -> run Fade { what: "sent", n }                      1200 ms, then Faded clears it if n is still the latest
```

Why each step is there, all from [herdr-app-facts](../herdr-app-facts.md) section 2:

- `run("pane.focus")` has not taken effect when `run()` returns, and `focused()` lands on the target about 100 ms
  later. `terminal.paste` goes to whatever has the keyboard, so nothing is pasted until the target is seen to have it.
- `terminal.paste` has not read the clipboard when `run()` returns. By the time the target is seen focused it
  has. The 300 ms wait before writing the old text back is the margin, measured on one machine.
- The API reads clipboard text only, so an image on the clipboard is not restored.

Focus stays on the agent afterwards, as decided, so the user can edit the prompt and press Enter. The Viewer
stays open.

## Tests

Each `E:` line is one test. Also the happy path: the prompt is pasted once the agent has focus, the old text
comes back only after the 300 ms wait, and the order of `events` is write, `pane.focus`, `terminal.paste`, sleep,
write back.
