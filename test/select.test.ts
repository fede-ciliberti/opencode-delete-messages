// Tests de selección del último assistant (matriz Q2: filas 2,3,5-8).
import { describe, expect, test } from "bun:test"
import { selectLastAssistant, type MessageLike } from "../src/pure.js"

function user(id: string, created: number): MessageLike {
  return { id, role: "user", time: { created } }
}

function assistant(id: string, created: number): MessageLike {
  return {
    id,
    role: "assistant",
    time: { created },
    providerID: "anthropic",
    modelID: "claude",
  }
}

describe("selectLastAssistant", () => {
  test("sesión vacía → undefined (Q2 #2)", () => {
    expect(selectLastAssistant([])).toBeUndefined()
  })

  test("solo mensajes de usuario → undefined (Q2 #3)", () => {
    expect(selectLastAssistant([user("u1", 1), user("u2", 2)])).toBeUndefined()
  })

  test("caso normal: último assistant en el medio del historial", () => {
    const target = assistant("a1", 2)
    const messages = [user("u1", 1), target, user("u2", 3)]
    expect(selectLastAssistant(messages)?.id).toBe("a1")
  })

  test("assistant abortado sigue siendo seleccionable (Q2 #8)", () => {
    const aborted: MessageLike = {
      ...assistant("a1", 2),
      error: { name: "MessageAbortedError" },
    }
    expect(selectLastAssistant([user("u1", 1), aborted])?.id).toBe("a1")
  })

  test("assistant con error de provider sigue siendo seleccionable (Q2 #9)", () => {
    const failed: MessageLike = {
      ...assistant("a1", 2),
      error: { name: "ProviderAuthError" },
    }
    expect(selectLastAssistant([failed])?.id).toBe("a1")
  })

  test("assistant solo-tools es seleccionable (Q2 #7)", () => {
    const toolOnly = assistant("a1", 1)
    expect(selectLastAssistant([toolOnly])?.id).toBe("a1")
  })

  test("summary de compactación se selecciona acá (el rechazo vive en el guard, Q2 #10)", () => {
    const summary: MessageLike = { ...assistant("a1", 1), summary: true }
    expect(selectLastAssistant([summary])?.id).toBe("a1")
  })

  test("assistants consecutivos → el último (aborted + retry OK, Q2 #6)", () => {
    const first: MessageLike = { ...assistant("a1", 1), error: { name: "MessageAbortedError" } }
    const second = assistant("a2", 2)
    expect(selectLastAssistant([first, second])?.id).toBe("a2")
  })

  test("empate de time.created → gana el último en orden de array (determinista)", () => {
    const messages = [assistant("a1", 100), assistant("a2", 100)]
    expect(selectLastAssistant(messages)?.id).toBe("a2")
  })

  test("ignora mensajes de usuario posteriores al último assistant", () => {
    const messages = [assistant("a1", 1), assistant("a2", 2), user("u1", 3)]
    expect(selectLastAssistant(messages)?.id).toBe("a2")
  })
})
