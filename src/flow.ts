// Orquestación del borrado: lee puertos, aplica guards puros, pide
// confirmación y ejecuta el DELETE. Todo efecto pasa por `FlowPorts`
// para que los tests usen fakes sin tocar el TUI real.

import {
  buildPreview,
  isBusy,
  isCompactionSummary,
  isLastMessage,
  isStaleTarget,
  mapDeleteError,
  selectLastAssistant,
} from "./pure.js"
import type { FlowPorts, ServerMessage } from "./ports.js"
import type { SessionStatusLike } from "./pure.js"

const CONFIRM_TITLE = "Delete last assistant message"
const CONFIRM_SUFFIX =
  "This permanently removes the message and its parts. File changes are NOT reverted."

function toAscending(messages: readonly ServerMessage[]): readonly import("./pure.js").MessageLike[] {
  return [...messages].reverse().map((entry) => entry.info)
}

/**
 * Resuelve el status de la sesión. El store local es la fuente primaria; si es
 * `undefined` (sesión idle desde el arranque, sin evento de status), consulta el
 * mapa del server. Un resultado ausente significa idle; solo busy/retry rechaza.
 */
async function resolveStatus(ports: FlowPorts, sessionID: string): Promise<SessionStatusLike | undefined> {
  const local = ports.readStateStatus(sessionID)
  if (local !== undefined) return local
  try {
    const map = await ports.fetchServerStatus()
    return map[sessionID]
  } catch {
    return undefined
  }
}

function partsForPreview(
  ports: FlowPorts,
  targetId: string,
  serverMessages: readonly ServerMessage[] | undefined,
): readonly import("./pure.js").PartLike[] {
  if (serverMessages !== undefined) {
    const found = serverMessages.find((entry) => entry.info.id === targetId)
    if (found !== undefined && found.parts.length > 0) return found.parts
  }
  return ports.readParts(targetId)
}

export function runDeleteFlow(ports: FlowPorts): void {
  void (async () => {
    try {
      await executeFlow(ports)
    } catch (error: unknown) {
      const mapped = mapDeleteError(error)
      ports.toast("error", mapped.message)
    }
  })()
}

async function executeFlow(ports: FlowPorts): Promise<void> {
  if (ports.currentRouteName() !== "session") {
    ports.toast("info", "Open a session first")
    return
  }

  const sessionID = ports.currentSessionID()
  if (sessionID === undefined || sessionID === "") {
    ports.toast("info", "Open a session first")
    return
  }

  let stateMessages = ports.listStateMessages(sessionID)
  let serverMessages: readonly ServerMessage[] | undefined

  if (stateMessages.length === 0) {
    try {
      const fetched = await ports.fetchServerMessages(sessionID, 50)
      serverMessages = fetched
      if (fetched.length > 0) stateMessages = toAscending(fetched)
    } catch {
      // Si el fetch falla, tratamos como "sin mensajes" y avisamos abajo.
    }
  }

  const target = selectLastAssistant(stateMessages)
  if (target === undefined) {
    ports.toast("info", "No assistant message to delete")
    return
  }

  if (isCompactionSummary(target)) {
    ports.toast("warning", "Last assistant message is a compaction summary — not deletable")
    return
  }

  if (!isLastMessage(stateMessages, target)) {
    ports.toast("warning", "The last message is not an assistant message — nothing deleted")
    return
  }

  const status = await resolveStatus(ports, sessionID)
  if (isBusy(status)) {
    ports.toast("warning", "Session is busy — try again when it's idle")
    return
  }

  const parts = partsForPreview(ports, target.id, serverMessages)
  const preview = buildPreview(target, parts, ports.now())
  const dialogMessage = `${preview}\n\n${CONFIRM_SUFFIX}`

  ports.confirmDelete(
    CONFIRM_TITLE,
    dialogMessage,
    () => {
      void (async () => {
        try {
          await handleConfirm(ports, sessionID, target.id)
        } catch (error: unknown) {
          const mapped = mapDeleteError(error)
          ports.toast("error", mapped.message)
        }
      })()
    },
    () => {},
  )
}

async function handleConfirm(ports: FlowPorts, sessionID: string, targetId: string): Promise<void> {
  let messages = ports.listStateMessages(sessionID)
  if (messages.length === 0) {
    try {
      const fetched = await ports.fetchServerMessages(sessionID, 50)
      if (fetched.length > 0) messages = toAscending(fetched)
    } catch {
      // Mantener vacío → stale lo va a rechazar.
    }
  }

  if (isStaleTarget(messages, targetId)) {
    ports.toast("warning", "The conversation changed — nothing deleted")
    return
  }

  const status = await resolveStatus(ports, sessionID)
  if (isBusy(status)) {
    ports.toast("warning", "Session is busy — try again when it's idle")
    return
  }

  const directory = ports.readDirectory()
  let outcome: import("./ports.js").DeleteOutcome
  try {
    outcome = await ports.deleteMessage({ sessionID, messageID: targetId, directory })
  } catch (error: unknown) {
    const mapped = mapDeleteError(error)
    ports.toast("error", mapped.message)
    return
  }

  if (!outcome.ok) {
    const mapped = mapDeleteError(outcome.error, outcome.status)
    ports.toast("error", mapped.message)
    return
  }

  ports.toast("success", "Assistant message deleted")
}
