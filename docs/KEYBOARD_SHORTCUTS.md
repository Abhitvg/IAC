# Keyboard shortcuts

The interview assistant is designed to be controlled from the keyboard. No carousel is required to reach these actions.

## In-app shortcuts

These bindings are configurable in the interview shortcut settings.

| macOS   | Action                                              |
| ------- | --------------------------------------------------- |
| `⌘⇧H`   | Toggle BIONIC HUD |
| `⌘⇧L`   | Pause / resume listening |
| `⌘⇧S`   | Solve the current screen |
| `⌘⇧X`   | Snip a screen region |
| `⌘K`    | Search conversation history |
| `Space` | Finish the current answer (only when not typing) |
| `Esc`   | Close the active overlay or cancel shortcut capture |

## System-wide window and capture shortcuts

These are registered by Electron while the app is running. They are separate from the configurable in-app bindings.

| macOS     | Action                                                           |
| --------- | ---------------------------------------------------------------- |
| `⌘\\`     | Show / hide the assistant window                                  |
| `⌘⇧Space` | Show / hide the assistant window                                  |
| `⌘⌥⇧H`    | Show / hide the assistant window                                  |
| `⌥H`      | Show / hide the assistant window (legacy binding)                 |
| `⌘⌥←`     | Move the assistant to the top-left corner of the active display   |
| `⌘⌥→`     | Move the assistant to the top-right corner of the active display  |
| `⌥⇧S`     | Solve the current screen                                          |
| `⌘⇧A`     | Append a screen capture to the current context                    |
| `⌥V`      | Auto-type the current code                                        |
| `⌥T`      | Auto-type the current answer text                                 |

## Dock behavior

On macOS the Dock icon remains available when the last window is closed. Selecting the Dock icon restores or recreates the assistant window. The global show/hide shortcuts also work while the app remains running.

Global shortcuts can fail to register if another app or macOS has already claimed the same key combination. The app logs that failure rather than pretending the shortcut is active.

## Safety

- The unmodified Space shortcut is ignored while typing in editable fields.
- Escape remains reserved for dismissing overlays and cancelling shortcut capture.
- Configurable shortcuts reject duplicates, unsafe unmodified letters/numbers, and reserved system controls.
- Global shortcuts are not currently user-remappable from the in-app shortcut editor.
