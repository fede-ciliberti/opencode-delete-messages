import { describe, expect, test } from "bun:test"
import { runDeleteFlow } from "../src/flow.js"
import {
  FakePorts,
  assistantMessage,
  busyStatus,
  flushMicrotasks,
  idleStatus,
  retryStatus,
  serverMessageEntry,
  textPart,
  toolPart,
  userMessage,
} from "./helpers/fake-api.js"

describe("runDeleteFlow", () => {
  test("route no-session → toast info y no dialoga ni borra", async () => {
    const ports = new FakePorts({ routeName: "home", stateMessages: [assistantMessage("a1", 1)] })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts).toEqual([{ variant: "info", message: "Open a session first" }])
    expect(ports.confirms).toHaveLength(0)
    expect(ports.deleteCalls).toHaveLength(0)
  })

  test("sessionID ausente → toast info", async () => {
    const ports = new FakePorts({ sessionID: undefined, stateMessages: [assistantMessage("a1", 1)] })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]?.message).toBe("Open a session first")
    expect(ports.confirms).toHaveLength(0)
  })

  test("sin assistant → toast info, sin dialog", async () => {
    const ports = new FakePorts({ stateMessages: [userMessage("u1", 1), userMessage("u2", 2)] })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts).toEqual([{ variant: "info", message: "No assistant message to delete" }])
    expect(ports.confirms).toHaveLength(0)
  })

  test("compaction summary → warning y no dialoga", async () => {
    const summary = assistantMessage("a1", 1, { summary: true })
    const ports = new FakePorts({ stateMessages: [summary] })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({
      variant: "warning",
      message: "Last assistant message is a compaction summary — not deletable",
    })
    expect(ports.confirms).toHaveLength(0)
  })

  test("último mensaje no es assistant → warning", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1), userMessage("u1", 2)],
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({
      variant: "warning",
      message: "The last message is not an assistant message — nothing deleted",
    })
    expect(ports.confirms).toHaveLength(0)
  })

  test("status busy → warning y no dialoga", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      stateStatus: busyStatus,
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({
      variant: "warning",
      message: "Session is busy — try again when it's idle",
    })
    expect(ports.confirms).toHaveLength(0)
  })

  test("status retry → busy warning", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      stateStatus: retryStatus,
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]?.variant).toBe("warning")
    expect(ports.toasts[0]?.message).toBe("Session is busy — try again when it's idle")
  })

  test("status undefined → fallback al server con idle → dialoga", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      stateStatus: undefined,
      serverStatusMap: { s1: idleStatus },
      partsByMessage: { a1: [textPart("hola")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.fetchServerStatusCalls).toBe(1)
    expect(ports.confirms).toHaveLength(1)
    expect(ports.confirms[0]?.title).toBe("Delete last assistant message")
  })

  test("status undefined y server sin dato (ausencia = idle) → dialoga", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      stateStatus: undefined,
      serverStatusMap: {},
      partsByMessage: { a1: [textPart("hola")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.fetchServerStatusCalls).toBe(1)
    expect(ports.confirms).toHaveLength(1)
    expect(ports.toasts).toHaveLength(0)
  })

  test("status undefined y fetch falla → dialoga (el 409 del server es el backstop)", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      stateStatus: undefined,
      fetchServerStatusError: new Error("network"),
      partsByMessage: { a1: [textPart("hola")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.confirms).toHaveLength(1)
    expect(ports.toasts).toHaveLength(0)
  })

  test("state vacío → fallback a server messages (newest-first) y dialoga", async () => {
    const user = userMessage("u1", 1)
    const assistant = assistantMessage("a1", 2)
    const ports = new FakePorts({
      stateMessages: [],
      serverMessages: [serverMessageEntry(assistant, [textPart("desde server")]), serverMessageEntry(user, [])],
      stateStatus: idleStatus,
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.fetchServerMessagesCalls).toBe(1)
    expect(ports.confirms).toHaveLength(1)
    expect(ports.confirms[0]?.message).toContain("desde server")
  })

  test("state vacío y server vacío → no assistant", async () => {
    const ports = new FakePorts({ stateMessages: [], serverMessages: [] })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({ variant: "info", message: "No assistant message to delete" })
  })

  test("state vacío y fetch falla → no assistant", async () => {
    const ports = new FakePorts({
      stateMessages: [],
      fetchServerMessagesError: new Error("down"),
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.toasts[0]?.message).toBe("No assistant message to delete")
  })

  test("happy path: dialog → confirm → DELETE → success toast", async () => {
    const assistant = assistantMessage("a1", 2)
    const ports = new FakePorts({
      stateMessages: [userMessage("u1", 1), assistant],
      partsByMessage: { a1: [textPart("respuesta ok")] },
      stateStatus: idleStatus,
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.confirms).toHaveLength(1)
    expect(ports.confirms[0]?.message).toContain("respuesta ok")
    expect(ports.confirms[0]?.message).toContain("model: anthropic/claude-sonnet-4")
    expect(ports.confirms[0]?.message).toContain("File changes are NOT reverted")

    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()

    expect(ports.deleteCalls).toHaveLength(1)
    expect(ports.deleteCalls[0]).toEqual({ sessionID: "s1", messageID: "a1", directory: "/tmp/project" })
    expect(ports.toasts.some((t) => t.variant === "success" && t.message === "Assistant message deleted")).toBe(true)
  })

  test("cancel no borra", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("hola")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.confirms).toHaveLength(1)
    ports.confirms[0]?.onCancel()
    await flushMicrotasks()
    expect(ports.deleteCalls).toHaveLength(0)
    expect(ports.toasts).toHaveLength(0)
  })

  test("stale en confirm: otro assistant llegó → warning y no borra", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("viejo")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.confirms).toHaveLength(1)

    ports.stateMessagesValue = [assistantMessage("a1", 1), assistantMessage("a2", 2)]
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()

    expect(ports.deleteCalls).toHaveLength(0)
    expect(ports.toasts[0]).toEqual({
      variant: "warning",
      message: "The conversation changed — nothing deleted",
    })
  })

  test("stale en confirm: target borrado concurrentemente → warning", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.stateMessagesValue = [userMessage("u1", 1)]
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.deleteCalls).toHaveLength(0)
    expect(ports.toasts[0]?.message).toBe("The conversation changed — nothing deleted")
  })

  test("busy en re-validación de confirm → warning y no borra", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      stateStatus: idleStatus,
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.stateStatusValue = busyStatus
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.deleteCalls).toHaveLength(0)
    expect(ports.toasts[0]?.message).toBe("Session is busy — try again when it's idle")
  })

  test("409 después de confirm → toast busy", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      deleteOutcome: { ok: false, error: { _tag: "SessionBusyError" }, status: 409 },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({ variant: "error", message: "Session was busy — nothing deleted" })
  })

  test("404 NotFoundError después de confirm → session not found", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      deleteOutcome: {
        ok: false,
        error: { name: "NotFoundError", data: { message: "gone" } },
        status: 404,
      },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({
      variant: "error",
      message: "Session not found — it may have been deleted",
    })
  })

  test("404 genérico después de confirm → unsupported version", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      deleteOutcome: { ok: false, error: { weird: true }, status: 404 },
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.toasts[0]?.message).toBe("This opencode version doesn't support deleting messages")
  })

  test("throw del interceptor text/html → version-mismatch", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      deleteShouldThrow: new Error("Request is not supported by this version (text/html)"),
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.toasts[0]?.message).toBe("This opencode version doesn't support deleting messages")
    expect(ports.toasts[0]?.variant).toBe("error")
  })

  test("throw de red genérico → network", async () => {
    const ports = new FakePorts({
      stateMessages: [assistantMessage("a1", 1)],
      partsByMessage: { a1: [textPart("x")] },
      deleteShouldThrow: new TypeError("fetch failed"),
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    ports.confirms[0]?.onConfirm()
    await flushMicrotasks()
    expect(ports.toasts[0]).toEqual({ variant: "error", message: "Could not reach opencode server" })
  })

  test("run() es sincrónico y nunca throwea", () => {
    const ports = new FakePorts({ stateMessages: [assistantMessage("a1", 1)] })
    expect(() => runDeleteFlow(ports)).not.toThrow()
  })

  test("preview usa partes del server cuando el state no tiene partes", async () => {
    const assistant = assistantMessage("a1", 2)
    const ports = new FakePorts({
      stateMessages: [],
      serverMessages: [
        serverMessageEntry(assistant, [textPart("texto del server"), toolPart()]),
        serverMessageEntry(userMessage("u1", 1), []),
      ],
    })
    runDeleteFlow(ports)
    await flushMicrotasks()
    expect(ports.confirms[0]?.message).toContain("texto del server")
  })
})
