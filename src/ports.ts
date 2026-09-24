// Puertos mínimos del plugin: interfaces estructurales chiquitas que el `api`
// real y el SDK satisfacen vía adaptadores finos en `tui.ts`, SIN casts.
// El flow (`flow.ts`) solo conoce estos puertos → testeable con fakes.
//
// Convenciones: copy de UI en inglés, comentarios en español rioplatense.

import type { MessageLike, PartLike, SessionStatusLike } from "./pure.js"

/** Un mensaje del server viene con sus partes pegadas. */
export type ServerMessage = {
  info: MessageLike
  parts: readonly PartLike[]
}

/** Origen de mensajes: store local del TUI + fallback al server (ventana de sync, C6). */
export interface MessageSource {
  /** Store sincronizado del TUI (`api.state.session.messages`), ascendente. */
  listStateMessages(sessionID: string): readonly MessageLike[]
  /** `client.session.messages({ sessionID, limit })`: devuelve los más nuevos primero. */
  fetchServerMessages(sessionID: string, limit: number): Promise<readonly ServerMessage[]>
  /** Partes sincronizadas del TUI (`api.state.part`). */
  readParts(messageID: string): readonly PartLike[]
}

/** Origen del estado de la sesión: store local + fallback al server (bootstrap, C5). */
export interface StatusSource {
  /** Store sincronizado (`api.state.session.status`); `undefined` en bootstrap. */
  readStateStatus(sessionID: string): SessionStatusLike | undefined
  /** `client.session.status({ directory })`: mapa sessionID → status (puede faltar la clave). */
  fetchServerStatus(): Promise<Readonly<Record<string, SessionStatusLike | undefined>>>
}

/** Resultado normalizado del DELETE (los dos carriles del SDK colapsados). */
export type DeleteOutcome = { ok: true } | { ok: false; error: unknown; status?: number }

/** Borrado quirúrgico: `client.session.deleteMessage` con `directory` explícito. */
export interface MessageDeleter {
  deleteMessage(args: { sessionID: string; messageID: string; directory: string }): Promise<DeleteOutcome>
}

/** Diálogo de confirmación (llamada directa al componente, sin JSX). */
export interface Confirmer {
  confirmDelete(title: string, message: string, onConfirm: () => void, onCancel: () => void): void
}

/** Toasts del host. */
export type ToastVariant = "info" | "success" | "warning" | "error"

export interface Toaster {
  toast(variant: ToastVariant, message: string): void
}

/** Ruta actual del TUI (para el gate de sesión). */
export interface RouteReader {
  currentRouteName(): string
  currentSessionID(): string | undefined
}

/** Directorio del proyecto activo (`api.state.path.directory`). */
export interface DirectoryReader {
  readDirectory(): string
}

/** Reloj inyectable (para previews deterministas). */
export interface Clock {
  now(): number
}

/** Todos los puertos que el flow necesita, juntos. */
export interface FlowPorts
  extends MessageSource,
    StatusSource,
    MessageDeleter,
    Confirmer,
    Toaster,
    RouteReader,
    DirectoryReader,
    Clock {}
