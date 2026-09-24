import type { FlowPorts, ServerMessage, DeleteOutcome } from "../src/ports.js"
import type { MessageLike, PartLike, SessionStatusLike } from "../src/pure.js"

export function userMessage(id: string, created: number): MessageLike {
  return { id, role: "user", time: { created } }
}

export function assistantMessage(
  id: string,
  created: number,
  overrides: Partial<MessageLike & { providerID: string; modelID: string; summary?: boolean; error?: { name: string } | null }> = {},
): MessageLike {
  return {
    id,
    role: "assistant",
    time: { created },
    providerID: "anthropic",
    modelID: "claude-sonnet-4",
    ...overrides,
  }
}

export function textPart(text: string): PartLike {
  return { type: "text", text }
}

export function toolPart(): PartLike {
  return { type: "tool" }
}

export const idleStatus: SessionStatusLike = { type: "idle" }
export const busyStatus: SessionStatusLike = { type: "busy" }
export const retryStatus: SessionStatusLike = { type: "retry", attempt: 1, message: "retrying", next: 1 }

export type FakePortsOptions = {
  routeName?: string
  sessionID?: string | undefined
  stateMessages?: readonly MessageLike[]
  serverMessages?: readonly ServerMessage[]
  partsByMessage?: Readonly<Record<string, readonly PartLike[]>>
  stateStatus?: SessionStatusLike | undefined
  serverStatusMap?: Readonly<Record<string, SessionStatusLike | undefined>>
  directory?: string
  nowValue?: number
  deleteOutcome?: DeleteOutcome
  fetchServerMessagesError?: unknown
  fetchServerStatusError?: unknown
  deleteShouldThrow?: unknown
}

export class FakePorts implements FlowPorts {
  routeName: string
  sessionIDValue: string | undefined
  stateMessagesValue: readonly MessageLike[]
  serverMessagesValue: readonly ServerMessage[]
  partsByMessageValue: Readonly<Record<string, readonly PartLike[]>>
  stateStatusValue: SessionStatusLike | undefined
  serverStatusMapValue: Readonly<Record<string, SessionStatusLike | undefined>>
  directoryValue: string
  nowValueNumber: number
  deleteOutcomeValue: DeleteOutcome
  fetchServerMessagesErrorValue: unknown
  fetchServerStatusErrorValue: unknown
  deleteShouldThrowValue: unknown

  toasts: Array<{ variant: string; message: string }> = []
  confirms: Array<{ title: string; message: string; onConfirm: () => void; onCancel: () => void }> = []
  deleteCalls: Array<{ sessionID: string; messageID: string; directory: string }> = []
  fetchServerMessagesCalls = 0
  fetchServerStatusCalls = 0

  listStateMessagesCalls = 0
  readStateStatusCalls = 0

  constructor(options: FakePortsOptions = {}) {
    this.routeName = options.routeName ?? "session"
    // `in` en vez de `??`: distingue "no provisto" de "provisto como undefined".
    this.sessionIDValue = "sessionID" in options ? options.sessionID : "s1"
    this.stateMessagesValue = options.stateMessages ?? []
    this.serverMessagesValue = options.serverMessages ?? []
    this.partsByMessageValue = options.partsByMessage ?? {}
    this.stateStatusValue = "stateStatus" in options ? options.stateStatus : idleStatus
    this.serverStatusMapValue = options.serverStatusMap ?? {}
    this.directoryValue = options.directory ?? "/tmp/project"
    this.nowValueNumber = options.nowValue ?? Date.UTC(2026, 8, 22, 14, 5, 0)
    this.deleteOutcomeValue = options.deleteOutcome ?? { ok: true }
    this.fetchServerMessagesErrorValue = options.fetchServerMessagesError
    this.fetchServerStatusErrorValue = options.fetchServerStatusError
    this.deleteShouldThrowValue = options.deleteShouldThrow
  }

  listStateMessages(_sessionID: string): readonly MessageLike[] {
    this.listStateMessagesCalls += 1
    return this.stateMessagesValue
  }

  async fetchServerMessages(_sessionID: string, _limit: number): Promise<readonly ServerMessage[]> {
    this.fetchServerMessagesCalls += 1
    if (this.fetchServerMessagesErrorValue !== undefined) throw this.fetchServerMessagesErrorValue
    return this.serverMessagesValue
  }

  readParts(messageID: string): readonly PartLike[] {
    return this.partsByMessageValue[messageID] ?? []
  }

  readStateStatus(_sessionID: string): SessionStatusLike | undefined {
    this.readStateStatusCalls += 1
    return this.stateStatusValue
  }

  async fetchServerStatus(): Promise<Readonly<Record<string, SessionStatusLike | undefined>>> {
    this.fetchServerStatusCalls += 1
    if (this.fetchServerStatusErrorValue !== undefined) throw this.fetchServerStatusErrorValue
    return this.serverStatusMapValue
  }

  async deleteMessage(args: { sessionID: string; messageID: string; directory: string }): Promise<DeleteOutcome> {
    this.deleteCalls.push(args)
    if (this.deleteShouldThrowValue !== undefined) throw this.deleteShouldThrowValue
    return this.deleteOutcomeValue
  }

  confirmDelete(title: string, message: string, onConfirm: () => void, onCancel: () => void): void {
    this.confirms.push({ title, message, onConfirm, onCancel })
  }

  toast(variant: string, message: string): void {
    this.toasts.push({ variant, message })
  }

  currentRouteName(): string {
    return this.routeName
  }

  currentSessionID(): string | undefined {
    return this.sessionIDValue
  }

  readDirectory(): string {
    return this.directoryValue
  }

  now(): number {
    return this.nowValueNumber
  }
}

export function serverMessageEntry(info: MessageLike, parts: readonly PartLike[] = []): ServerMessage {
  return { info, parts }
}

export async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
