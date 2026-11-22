# Keyboard shortcuts

The interview assistant is designed to be controlled from the keyboard. These actions do not require a carousel or a navigation panel.

## Configurable interview shortcuts

These bindings can be changed in the in-app shortcut settings.

| macOS | Windows / Linux | Action |
| --- | --- | --- |
| `⌘⇧H` | `Ctrl+Shift+H` | Toggle BIONIC HUD |
| `⌘⇧L` | `Ctrl+Shift+L` | Pause / resume listening |
| `⌘⇧S` | `Ctrl+Shift+S` | Solve the current screen |
| `⌘⇧X` | `Ctrl+Shift+X` | Snip a screen region |
| `⌘K` | `Ctrl+K` | Search conversation history |
| `Space` | `Space` | Finish the current answer (only when not typing) |
| `Esc` | `Esc` | Close the active overlay or cancel shortcut capture |

## Built-in conversation controls

These are fixed in-app shortcuts. They are intentionally reserved so configurable shortcuts cannot overwrite core conversation actions.

| macOS | Windows / Linux | Action |
| --- | --- | --- |
| `⌘Z` or `⌘[` | `Ctrl+Z` or `Ctrl+[` | Restore the previous question |
| `⌘⇧Z`, `⌘Y`, or `⌘]` | `Ctrl+Shift+Z`, `Ctrl+Y`, or `Ctrl+]` | Redo / move to the next question |
| `⌥C` | `Alt+C` | Mark the question incomplete and wait for continuation |
| `⌘⌫` | `Ctrl+Backspace` | Clear the active answer and return to listening |
| `⌘1` | `Ctrl+1` | Switch to Coding mode |
| `⌘2` | `Ctrl+2` | Switch to Interview mode |
| `⌘3` | `Ctrl+3` | Switch to Quiz mode |
| `⌘J` | `Ctrl+J` | Toggle conversation auto-follow |

## System-wide window and capture shortcuts

These are registered by Electron while the app is running. They work outside the app and are separate from configurable in-app bindings.

| macOS | Windows / Linux | Action |
| --- | --- | --- |
| `⌘\\` | `Ctrl+\\` | Show / hide the assistant window |
| `⌘⇧Space` | `Ctrl+Shift+Space` | Show / hide the assistant window |
| `⌘⌥⇧H` | `Ctrl+Alt+Shift+H` | Show / hide the assistant window |
| `⌥H` | `Alt+H` | Show / hide the assistant window (legacy binding) |
| `⌘⌥←` | `Ctrl+Alt+←` | Move the assistant to the top-left of the display containing its window |
| `⌘⌥→` | `Ctrl+Alt+→` | Move the assistant to the top-right of the display containing its window |
| `⌥⇧S` | `Alt+Shift+S` | Solve the current screen |
| `⌘⇧A` | `Ctrl+Shift+A` | Append a screen capture to the current context |
| `⌥V` | `Alt+V` | Auto-type the current code |
| `⌥T` | `Alt+T` | Auto-type the current answer text |

## Dock behavior

On macOS the Dock icon remains available when the last window is closed. Selecting the Dock icon restores or recreates the assistant window. The global show / hide and corner-placement shortcuts also work while the app remains running.

Global shortcuts can fail to register if another app or the operating system has already claimed the same key combination. The app logs those failures instead of implying that an unavailable shortcut is active.

## Safety

- The unmodified Space shortcut is ignored while typing in editable fields.
- Escape remains reserved for dismissing overlays and cancelling shortcut capture.
- Configurable shortcuts reject duplicates, unsafe unmodified letters / numbers, and reserved system controls.
- Global shortcuts are not currently user-remappable from the in-app shortcut editor.
