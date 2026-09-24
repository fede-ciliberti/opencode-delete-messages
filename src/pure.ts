// Lógica pura del plugin: sin dependencias, sin efectos, sin acceso a `api`.
// Todo lo que toca el TUI o la red vive en `flow.ts` detrás de los puertos
// de `ports.ts`. Este módulo solo decide sobre datos ya leídos.
//
// Convenciones: copy de UI en inglés, comentarios en español rioplatense.

/** Mensaje de usuario (forma mínima que consume el plugin). */
export type UserMessageLike = {
  id: string
  role: "user"
  time: { created: number }
}

/** Mensaje de assistant (forma mínima que consume el plugin). */
export type AssistantMessageLike = {
  id: string
  role: "assistant"
  time: { created: number }
  providerID: string
  modelID: string
  /** `true` en el mensaje ancla que deja una compactación. Nunca se borra (C7). */
  summary?: boolean
  /** Presente en respuestas abortadas o fallidas (siguen siendo borrables). */
  error?: { name: string } | null
}

export type MessageLike = UserMessageLike | AssistantMessageLike

/** Parte de un mensaje (forma mínima: texto para el preview, conteo de tools). */
export type PartLike = {
  type: string
  text?: string
}

/** Estado de sesión (forma mínima que consume el plugin). */
export type SessionStatusLike =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt?: number; message?: string; next?: number }

/** Límite del preview en la confirmación (~120 chars, matriz Q2 #31). */
export const PREVIEW_MAX_LENGTH = 120

/** Type-guard: distingue assistants dentro de la unión. */
export function isAssistantMessage(message: MessageLike): message is AssistantMessageLike {
  return message.role === "assistant"
}

/**
 * Devuelve el último assistant de la lista, o `undefined` si no hay ninguno.
 * Asume el input ordenado ascendente por (time.created, id) — el orden total
 * que garantiza el store del TUI — así que alcanza con iterar desde el final.
 * En empates de `time.created` gana el último en orden de array (determinista).
 */
export function selectLastAssistant(messages: readonly MessageLike[]): AssistantMessageLike | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message !== undefined && isAssistantMessage(message)) return message
  }
  return undefined
}

/** El target tiene que ser el ÚLTIMO mensaje de la sesión (no solo el último assistant). */
export function isLastMessage(messages: readonly MessageLike[], target: { id: string }): boolean {
  const last = messages[messages.length - 1]
  return last !== undefined && last.id === target.id
}

/** El mensaje ancla de una compactación no se toca: destruirlo rompe el contexto compactado. */
export function isCompactionSummary(target: AssistantMessageLike): boolean {
  return target.summary === true
}

/**
 * El server solo registra sesiones NO idle: su `SessionStatus.set` borra la
 * entrada cuando el estado es idle y `get` devuelve `{type:"idle"}` ante
 * ausencia. Por eso `undefined` significa idle, no "desconocido". Solo se
 * rechaza si la sesión está efectivamente ocupada (busy/retry).
 */
export function isBusy(status: SessionStatusLike | undefined): boolean {
  return status !== undefined && (status.type === "busy" || status.type === "retry")
}

/**
 * Re-validación stale-target (C3): el target dejó de ser el último assistant
 * si otro assistant apareció después, si el target ya no está, o si no queda
 * ningún assistant. Ante la duda se aborta (devuelve `true`).
 */
export function isStaleTarget(messages: readonly MessageLike[], targetId: string): boolean {
  return selectLastAssistant(messages)?.id !== targetId
}

/** El comando solo vive en la ruta de sesión. */
export function isSessionRoute(routeName: string): boolean {
  return routeName === "session"
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/** `HH:MM` en UTC para que el preview sea determinista en cualquier máquina. */
function formatHourMinute(epochMs: number): string {
  const date = new Date(epochMs)
  const hh = String(date.getUTCHours()).padStart(2, "0")
  const mm = String(date.getUTCMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

/**
 * Arma el cuerpo del diálogo de confirmación:
 * primera línea = preview del texto (whitespace colapsado, truncado a ~120
 * chars con `…`), tag `[aborted] `/`[error] ` cuando `message.error` existe,
 * fallback `no text — N tool calls` para assistants solo-tools;
 * segunda línea = `model: <providerID>/<modelID> · <HH:MM>`.
 * `now` es el fallback si `time.created` no es un número finito (inyectable
 * para tests deterministas).
 */
export function buildPreview(
  message: AssistantMessageLike,
  parts: readonly PartLike[],
  now: number,
): string {
  const created = Number.isFinite(message.time.created) ? message.time.created : now
  const texts: string[] = []
  for (const part of parts) {
    if (part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") {
      texts.push(part.text)
    }
  }
  const collapsed = collapseWhitespace(texts.join(" "))
  let body: string
  if (collapsed !== "") {
    body =
      collapsed.length > PREVIEW_MAX_LENGTH
        ? collapsed.slice(0, PREVIEW_MAX_LENGTH).trimEnd() + "…"
        : collapsed
  } else {
    const toolCalls = parts.filter((part) => part.type === "tool").length
    body = `no text — ${toolCalls} tool calls`
  }
  const tag =
    message.error !== undefined && message.error !== null
      ? message.error.name === "MessageAbortedError"
        ? "[aborted] "
        : "[error] "
      : ""
  return `${tag}${body}\nmodel: ${message.providerID}/${message.modelID} · ${formatHourMinute(created)}`
}

/** Resultado discriminado del mapeo de errores del DELETE. */
export type DeleteErrorKind =
  | "busy"
  | "session-not-found"
  | "unsupported-version"
  | "request-failed"
  | "network"
  | "version-mismatch"

export type DeleteErrorMapping = {
  kind: DeleteErrorKind
  /** Copy en inglés, lista para el toast. */
  message: string
  status?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Forma del `NotFoundError` del SDK: `{ name: "NotFoundError", data: { message } }`. */
function isNotFoundErrorShape(body: unknown): boolean {
  if (!isRecord(body)) return false
  if (body["name"] !== "NotFoundError") return false
  const data = body["data"]
  return isRecord(data) && typeof data["message"] === "string"
}

/** El interceptor del SDK throwea este texto para respuestas `text/html` (C4). */
function mentionsVersionMismatch(text: string): boolean {
  return /text\/html|not supported by this version/i.test(text)
}

function genericFailure(status: number): DeleteErrorMapping {
  return { kind: "request-failed", message: `Delete failed (${status})`, status }
}

/**
 * Mapea el error del DELETE a un resultado discriminado con copy lista.
 * Cubre los dos carriles (C4): el `throw` del interceptor (siempre un `Error`)
 * y el `result.error` del result-tuple (body parseado + status HTTP).
 */
export function mapDeleteError(error: unknown, status?: number): DeleteErrorMapping {
  // Carril 1: throw del interceptor o de `fetch` (sin result-tuple).
  if (error instanceof Error) {
    if (mentionsVersionMismatch(error.message)) {
      return {
        kind: "version-mismatch",
        message: "This opencode version doesn't support deleting messages",
        status,
      }
    }
    return { kind: "network", message: "Could not reach opencode server", status }
  }
  // Cuerpo de error en texto plano (no-JSON): solo distingue version-mismatch;
  // el resto lo decide el status más abajo (un string nunca tiene forma NotFoundError).
  if (typeof error === "string") {
    if (mentionsVersionMismatch(error) || /<html/i.test(error)) {
      return {
        kind: "version-mismatch",
        message: "This opencode version doesn't support deleting messages",
        status,
      }
    }
  }
  // El 409 manda: la sesión está ocupada (protección real del server).
  if (status === 409) {
    return { kind: "busy", message: "Session was busy — nothing deleted", status }
  }
  // 404 con forma NotFoundError → la sesión ya no existe.
  if (isNotFoundErrorShape(error) && (status === 404 || status === undefined)) {
    return {
      kind: "session-not-found",
      message: "Session not found — it may have been deleted",
      status,
    }
  }
  // 404 genérico → el endpoint no existe en esta versión (drift, C9).
  if (status === 404) {
    return {
      kind: "unsupported-version",
      message: "This opencode version doesn't support deleting messages",
      status,
    }
  }
  // 400/401/403/5xx → genérico con status.
  if (status !== undefined) return genericFailure(status)
  // Sin status ni forma conocida → no hubo respuesta (red caída).
  return { kind: "network", message: "Could not reach opencode server" }
}
