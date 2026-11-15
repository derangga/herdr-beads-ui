# herdr-beads-ui

A herdr-app mod that shows the beads of a repo in a pane split beside your terminal: filter, sort, search, read a bead,
follow its dependencies, change its status, copy its id and send it to an agent. Terms are in [CONTEXT.md](CONTEXT.md),
the look and keys in [design/ui.md](design/ui.md), the build in [design/plan.md](design/plan.md).

Needs herdr-app 0.1.15 or later and `bd` on your PATH.

## Install

```sh
npm install
bash scripts/stage.sh   # builds, copies dist/ to ~/.config/herdr-app/mods/beads, runs herdr-app check
```

`stage.sh` copies only the mod folder. The button and the key below are one-time edits to your own config, which the
script never touches.

### The Beads button

Add this block to `~/.config/herdr-app/layouts/herdr-review.json`, in the `children` of `tabs-row`, right after the
`review-toggle` block (the Annotate button):

```json
{
  "id": "beads-toggle",
  "type": "block",
  "size": {
    "px": 84
  },
  "window_drag": true,
  "content": {
    "mod": "beads",
    "props": {
      "role": "toggle"
    }
  }
}
```

The `review-toggle` block needs a comma after its closing brace. The button is lit while the focused tab has a Viewer.
A click opens a Viewer for the focused terminal's repo, and a second click closes it.

### The key

Add this line to the `global` section of `~/.config/herdr-app/keys.json` (mind the comma on the line above it):

```json
"cmd-shift-b": {"command": "pane.split", "args": {"direction": "right", "mod": "beads"}}
```

It opens a Viewer in the focused tab, as the button does when none is open.

### Check

After both edits, `herdr-app status` must list no errors, and no `layout.error` or `keys.error` file may appear in
`~/.config/herdr-app`. If a file is invalid, herdr-app keeps the last good version and writes why to that file.

### A herdr-review layout update removes the button

The button lives in the user's copy of `herdr-review.json`. When herdr-review rewrites that layout (an update that
replaces it), the `beads-toggle` block is lost. Add it again from the JSON above. The key is unaffected.

## Keys

In the Viewer:

| Key | Does |
| --- | --- |
| `j` `k` / `↓` `↑` | Move the selection |
| `↵` | Narrow: open detail |
| `Esc` | Narrow: back to the list. Clears a focused search box |
| `/` | Focus search |
| `[` `]` | Back and forward in the history |
| `s` | Open the status picker for the shown bead |
| `y` | Copy the shown bead's id |
| `Ctrl+R` | Refresh |
| `?` | Show the keys |

Outside it: `cmd-shift-b` opens a Viewer.

## Develop

```sh
npm run setup-types   # copies herdr's two .d.ts files in
npm test && npm run typecheck && npm run lint
npm run build         # esbuild -> dist/main.js
```
