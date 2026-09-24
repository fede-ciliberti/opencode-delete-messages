# Design — opencode-delete-messages

Record of the design decisions and the findings behind them. This document describes what the plugin **should** do; the code implements it.

## Goal

Delete **only the last assistant message** of the active session, surgically, without reverting file changes. opencode does not expose this action in the TUI.

## Why it is not native

- The endpoint exists and is first-class (`DELETE /session/{sessionID}/message/{messageID}`, PR #14417, Feb 2026), documented as *"permanently delete a specific message … without reverting file changes"*.
- The internal primitive `Session.removeMessage` was born (PR #2577, Sep 2025) to serve the **revert** machinery, not as a user feature.
- The TUI is **turn-centric**: its message dialog only acts on user messages. No first-party client uses `deleteMessage`.
- Feature requests for "delete message in the TUI" were closed as `not_planned`.

## Locked decisions

1. **Action**: `client.session.deleteMessage({ sessionID, messageID, directory })`. Never a file revert.
2. **Command**: id `delete-last-assistant-message`, in the palette (`namespace: "palette"`) and as slash `/delete-last`. Only enabled on the session route.
3. **No default keybind**; rebindable via the `keybind` option in the plugin's tuple in `tui.json`.
4. **Guards before DELETE**:
   - session not busy (busy/retry rejected; absent status means idle);
   - the target is the session's **last message**;
   - it is not a **compaction summary** (`summary === true`);
   - **stale-target re-validation** on confirm.
5. **Fallbacks**: if the local message store is empty (sync window), `client.session.messages({ limit: 50 })`.
6. **Errors**: try/catch **and** result-tuple check (the SDK interceptor can throw on `text/html`). Mapping: 409 busy · 404 `NotFoundError` → session missing · generic 404 → endpoint missing · network · generic with status.
7. **UI in English**; comments and docs in English.
8. **Packaging**: strict TypeScript → `dist/` (tsc). No JSX, **zero runtime deps**. `exports["./tui"] → ./dist/tui.js`.
9. **TUI-only**: no server plugin.
10. Explicit `directory` from `api.state.path.directory`; `workspace` omitted.

## Corrections from the design consultation

| # | Finding | Resolution |
|---|---|---|
| C1 | `tui.json`'s `keybinds` is a closed set and **rejects** unknown keys → useless for plugins | Rebind via the plugin's **options** tuple |
| C2 | Installing TUI plugins in `opencode.json` is wrong | They go in `tui.json` → `plugin` |
| C3 | The server does **not** validate message existence: deleting an already-deleted one returns **200** (idempotent) | Stale-target re-validation is the real barrier |
| C4 | The SDK can **throw** even with the result-tuple (`text/html`) | try/catch **+** `result.error` |
| C5 | The local status can be `undefined` (session idle since startup) | `undefined` means **idle**: the server omits idle sessions from its status map. Fallback to `client.session.status()` and reject only if busy/retry |
| C6 | The local store is capped at 100 messages and can be empty right after entering | Fallback to `client.session.messages({ limit: 50 })` |
| C7 | Deleting a compaction summary breaks the context | `summary === true` guard |
| C8 | `api.command` (legacy) is deprecated | Use `api.keymap.registerLayer` |
| C9 | `engines.opencode` does not protect path installs | Runtime feature check + generic-404 mapping |
| C10 | UI language | English |

## Key structural invariant

`AssistantMessage.parentID` is **required** and points to the user message that triggered it; `UserMessage` has **no** `parentID`. Therefore **assistant messages are leaves**: nothing can point to them, and deleting the last assistant **cannot orphan** anything. The known orphan bug only happens when deleting **user messages**. Hence no "child guard" is needed.

## Edge-case matrix (summary)

Empty · user-only · normal assistant · aborted · errored · tool-only · compaction summary · consecutive assistants · `time.created` ties · status idle/busy/retry/undefined · stale target · 409/404/generic-404/network/text-html · non-session route · child/fork session · double invocation · cancellation.

## Risks

| Risk | Mitigation |
|---|---|
| The endpoint is not first-class (external PR, no first-party clients) | Clear error mapping if it disappears; never corrupts |
| SDK type drift | Pinned devDeps + `tsc` in CI |
| `engines` does not cover path installs | Runtime feature check |
| V1/V2 message model | "Is-last" guard + leaf-only targeting |

## References

- Endpoint: `packages/opencode/src/server/routes/instance/httpapi/groups/session.ts` (opencode).
- Revert (context): `packages/opencode/src/session/revert.ts`.
- TUI plugin spec: `packages/opencode/specs/tui-plugins.md`.
- TUI API: `packages/plugin/src/tui.ts`.
