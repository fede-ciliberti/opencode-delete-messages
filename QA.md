# Manual QA — opencode-delete-messages

Checklist to verify the plugin against a real opencode. The automated tests (`npm test`) cover the pure logic, the flow with fakes, and the HTTP contract with the SDK; this list covers what can only be seen with the live TUI.

## Setup

1. Install the plugin (npm or from source) and register it in `tui.json`.
2. Restart opencode.
3. Open a session with at least **1 user message + 1 assistant message**.

## Cases

- [ ] **Command visible**: inside a session, open the palette (`Ctrl+P`) and confirm "Delete last assistant message" appears.
- [ ] **Slash**: type `/delete-last` and confirm it is offered.
- [ ] **Happy path**: run the command → a dialog appears with a preview of the last assistant → confirm → toast "Assistant message deleted" and the message disappears.
- [ ] **History intact**: the previous messages (user + earlier assistants) remain.
- [ ] **No file revert**: ask the assistant to edit a test file; then delete that last assistant; verify the file is **unchanged** on disk.
- [ ] **Busy guard**: with the session running (a tool executing), run the command → it must abort with "Session is busy — try again when it's idle" and not delete.
- [ ] **No assistant**: in an empty session or one with only user messages → "No assistant message to delete", no dialog.
- [ ] **Cancel**: open the dialog and cancel → nothing is deleted, no toast.
- [ ] **Stale target**: open the dialog and, before confirming, send another message → confirm → "The conversation changed — nothing deleted".
- [ ] **Compaction**: if there is a compacted session whose last assistant is the summary → it must reject with "Last assistant message is a compaction summary — not deletable".
- [ ] **Optional keybind**: add `{ "keybind": "ctrl+alt+j" }` in the options, restart, and verify the key triggers the command. Remove the option and verify there is no binding.
- [ ] **Outside a session**: on the home screen, the command does not appear in the palette.

## Success criterion

Command visible and runnable, deletes **only** the last assistant via `deleteMessage`, with confirmation and guards, **without touching files on disk**.
