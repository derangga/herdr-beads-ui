# Call graphs: the mod opens

Part of the [design](../../DESIGN.md). Each `E:` line is one test, and each test swaps only `Host`.

## One mod, three copies

herdr-app runs a copy of the mod `beads` for each place it is shown. `props().role` says which:

```
role absent    the Viewer, split to the right of the Opener
role "toggle"  the Beads button in the tab bar (placed by the user's layout file)
role "keys"    the keys dialog, opened by the Viewer through openOverlay
```

`init` branches on the role first. The toggle and keys copies never read bd.

## Open the Viewer (`init`, no role)

```
-> pane.split { direction: "right", mod: "beads" }     herdr-app: the button, or the key cmd-shift-b
-> init(props, cx)                                     once per copy
  -> start(host)                                       R: Host.props, focused, panes, spaces
    -> decodeProps(props())                            E: a bad field -> escape, the field is null
    -> folder = props.root, else focused().cwd
                                                       E: none -> NoOpener -> escape: the Viewer is replaced by "Open from a terminal",
                                                          no bd runs
    -> openerOf(props.opener, focus, panes)            (pure) Opener { terminal, tab }
         terminal: props.opener, else focused().terminal
         tab: the tab of the pane that has that terminal, else focused().tab, else null
    -> isRemoteTab(spaces(), opener.tab)
                                                       E: RemoteSpace -> escape: replaced by "Remote spaces aren't supported yet",
                                                          no bd runs
                                                       E: the space is local, or spaces() does not know the tab -> not remote
  -> new Store(host, root, ...)                        R: Host, root
  -> make the search box, the reason box, the list's scroll handle
  -> take the keyboard                                 (see "The keyboard")
  -> root known: dispatch Refresh, then ReadStatuses   first load (load.md), statuses for the picker (status.md)
```

`focused()` inside `init` of a split mod still names the Opener's terminal and folder, and `panes()` at that
moment does not yet list the new pane ([herdr-app-facts](../herdr-app-facts.md) section 1). That is why the Opener
is read here and never again. The Viewed repo and the Opener are fixed for the Viewer's life, even if the Opener
closes, and Send then falls back to the tab's last agent ([send](send.md)).

`herdr-app check` loads the module, runs `init`, renders once and exits. A task started with `cx.spawn` never
finishes inside it, so `init` renders an empty or error screen without waiting for a load.

## The keyboard

A split gives the new pane herdr's focus but sends no `focus` command (only `pane.go` does), so the Viewer
takes the keyboard itself.

```
-> focusNav()                                          at open, and on every "focus" command from Host.nextCommand
  -> nav.focus(), and again after 300 ms               once the root is drawn with its handle
  -> if focused() is a pane with no terminal           that is this mod's own pane: remembered as `own`
-> every 200 ms: takesKeyboard(own, focused().pane, nav.is_focused(), model)
     true when herdr's focus is on the Viewer's own pane, its handle lost the keyboard, and neither
     the search box nor a menu holds it, and the keys dialog is not open
       E: false -> nothing
```

The poll is a shortcut. Nothing tells a mod that the keyboard left it while herdr's focus stayed on its pane
(zoom, a tab switch, the window losing focus). `main.ts` marks it as one.

Keys are commands except in the search box, where only Esc and Ctrl+R are. Typing `s` in the search box
types `s`.

## The Beads button (role `toggle`)

```
-> init                                                R: Host.props, panes, focused
  -> isToggle(props) -> toggle.pane = beadsPane(panes, focused)
  -> watchToggle: every 500 ms
       now = beadsPane(panes, focused)                 a pane of mod "beads" in the focused tab, else null
       E: now equals toggle.pane -> nothing
       now differs -> toggle.pane = now, cx.notify()   redraw: lit while a Viewer is in the focused tab
-> click -> clickToggle(host)                          R: Host.run, panes, focused
     no Viewer in the focused tab -> run pane.split { right, mod "beads" }
     a Viewer there               -> run pane.close { pane }
```

The poll is a shortcut: `herdr.d.ts` does not say a mod redraws when panes open or close. It costs a timer
and a redraw only on change. A mod pane in `panes()` carries `mod` and `tab` and no terminal, so `decodePanes`
would drop it, and `beadsPane` reads the raw value.

## The keys dialog (role `keys`)

```
-> Viewer: ShowKeys and keysOpen is 0                  (the key ?)
  -> Host.openOverlay { mod "beads", props { role: "keys" }, kind "dialog", width 460, height 320 }
-> init (role keys): keys = props.overlay id, keysOpen++, take the keyboard, again after 300 ms
-> the dialog closes itself on Esc or a press outside   Host.closeOverlay(id)
-> close: keysOpen--
```

`ShowKeys` leaves the model alone. `keysOpen` is module scope on purpose, because every copy shares the module
and the Viewer must see the dialog open and close. It is not persisted, so a quit with the dialog open cannot
leave it stuck. While it is above 0 the keyboard poll does not pull the keyboard back.

## Close

```
-> close(cx)                                           bounded, returns at once
  -> cancel the poll
  -> Viewer: store.close() (sets closed); release the search box, the reason box and the scroll handle
  -> a bd call still running finishes, and Store.dispatch drops its reply because closed is set
```

## Tests

Each `E:` line is one test. Also the happy path: a Viewer opened with a folder and an Opener starts one load
and one statuses read. `init` against a `FakeHost` whose `focused()` is `null` renders the `NoOpener` screen
and throws nothing.
