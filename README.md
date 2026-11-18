# herdr-mods

My customizations for the Herdr app. Each one lives in its own folder and works on its own:

- [Paddock](#paddock) is a layout of rounded cards on a dark canvas, in Catppuccin Macchiato colors. It comes with six
  mods of its own.
- [Beads](#beads) is a mod that lists the beads of a repo in a pane beside your terminal.

The `herdr-app/` folder holds the built files. They are laid out the same way as `~/.config/herdr-app`, so you can
copy them straight in: `layouts/paddock.*`, `mods/beads/` and `mods/paddock-*/`.

## Paddock

Paddock puts the sidebar, the tab bar and the terminal in separate rounded cards on a dark canvas. The sidebar holds
your spaces and agents.

It is a copy of Herdr's `main` layout and of six Herdr mods: `tabs`, `pane`, `workspace-chrome`, `spaces`, `agents`
and `toast`. The copies came by way of [herdr-glass](https://github.com/noah4520/herdr-glass) and are recolored in
Catppuccin Macchiato.

### What Paddock needs

- The `catppuccin-macchiato` theme in `~/.config/herdr-app/themes/`.
- The herdr-review mod and the beads mod. The tab bar has a button for each: Annotate and Beads. Without them, those
  two places in the tab bar stay empty.

### Install Paddock

From a clone of this repo, run:

```sh
npm install
bash scripts/stage.sh
```

You can also copy the files by hand. Copy `herdr-app/layouts/paddock.json` and `herdr-app/layouts/paddock.svg` to
`~/.config/herdr-app/layouts/`. Copy each `herdr-app/mods/paddock-*/` folder to `~/.config/herdr-app/mods/`. Copy
each mod's `main.js` last, because Herdr reloads a mod when its `main.js` changes.

Then switch to the layout:

```sh
herdr-app do layout.switch '{"name":"paddock"}'
```

### Licenses

The licenses are listed in `src/paddock/NOTICE`:

- Paddock's own changes use the MIT license (`src/paddock/LICENSE`).
- The parts copied from Herdr use the Apache 2.0 license.
- The icons use the ISC license.

The last two license texts are in `src/paddock/licenses/`.

## Beads

Beads is a herdr-app mod that lists the beads of a repo in a pane beside your terminal. You can filter, sort and
search the list. You can read a bead, follow its dependencies, change its status, copy its id and send it to an
agent.

It needs herdr-app 0.1.15 or later, and the `bd` command on your PATH.

To learn more:

- [CONTEXT.md](docs/beads/CONTEXT.md) defines the terms.
- [design/ui.md](docs/beads/design/ui.md) describes the look and the keys.
- [DESIGN.md](docs/beads/DESIGN.md) describes the design.

### What Beads runs

The mod runs `bd` in the folder of the focused terminal. It runs `bd export`, `bd ready`, `bd blocked` and
`bd statuses`. When you change a status, it runs `bd update`.

The mod uses no network and reads no files itself. Only `bd` reads the repo's `.beads` data.

### Install Beads with your agent

Ask your herdr agent:

```
Read ~/.config/herdr-app/AGENTS.md, then add the beads mod from https://github.com/derangga/herdr-mods/tree/master/herdr-app
```

The agent does three things:

1. It copies `mods/beads/` into `~/.config/herdr-app/mods/`.
2. It adds the `cmd-shift-b` key from `keys.json`. If you already use that key, it asks before it replaces it.
3. It runs `herdr-app check`.

To install a fixed release, replace `master` in the link with a git tag.

[herdr-app/RECIPE.md](herdr-app/RECIPE.md) describes the mod in enough detail to build it again from scratch.

### Install Beads from a clone

```sh
npm install
bash scripts/stage.sh
```

`stage.sh` builds everything and copies `herdr-app/` into `~/.config/herdr-app`. Then it runs `herdr-app check` on
each mod. It copies the mods and the Paddock layout only. It never changes your own config, so add the key and the
button yourself, as described below.

### Add the Beads button (optional)

Paddock already has this button. To add it to the herdr-review layout, open
`~/.config/herdr-app/layouts/herdr-review.json`. Find the `children` of `tabs-row`. Add this block right after the
`review-toggle` block, which is the Annotate button:

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

Add a comma after the closing brace of the `review-toggle` block.

The button lights up while the focused tab has a Viewer. Click it to open a Viewer for the focused terminal's repo.
Click it again to close the Viewer.

When herdr-review updates its layout, it replaces this file, and the button is gone. Add the block again from the
JSON above. The key is not affected.

### Add the key (clone install only)

Add this line to the `global` section of `~/.config/herdr-app/keys.json`. Put a comma at the end of the line above
it.

```json
"cmd-shift-b": {"command": "pane.split", "args": {"direction": "right", "mod": "beads"}}
```

The key opens a Viewer in the focused tab, the same as the button.

### Check your changes

After you edit the files, run `herdr-app status`. It should list no errors.

Also check that `~/.config/herdr-app` has no `layout.error` or `keys.error` file. If a file you edited is not valid,
herdr-app keeps using the last good version. It writes the reason to one of those files.

### Keys in the Viewer

| Key | What it does |
| --- | --- |
| `j` `k` or `↓` `↑` | Move the selection |
| `↵` | In a narrow pane: open the detail |
| `Esc` | In a narrow pane: go back to the list. In the search box: clear it |
| `/` | Go to the search box |
| `[` `]` | Go back and forward through the beads you opened |
| `s` | Open the status picker for the bead on screen |
| `y` | Copy the id of the bead on screen |
| `Ctrl+R` | Refresh |
| `?` | Show the keys |

Outside the Viewer, `cmd-shift-b` opens a Viewer.

## Develop

```sh
npm run setup-types   # copies Herdr's two .d.ts files into the repo
npm test && npm run typecheck && npm run lint
npm run build         # builds herdr-app/ with esbuild
```

Commit the built `herdr-app/` folder with your change. CI fails when it does not match a fresh build.

## License

This repo uses the MIT license ([LICENSE](LICENSE)). Paddock's files in `src/paddock/` and `herdr-app/` also carry
the licenses listed in [Paddock's licenses](#licenses), because parts of them are copied from herdr-glass and Herdr.
