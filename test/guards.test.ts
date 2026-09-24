// Tests de guards puros (matriz Q2: filas 1,4,10-12 + stale-target 24/26).
import { describe, expect, test } from "bun:test"
import {
  isBusy,
  isCompactionSummary,
  isLastMessage,
  isSessionRoute,
  isStaleTarget,
  type AssistantMessageLike,
  type MessageLike,
} from "../src/pure.js"

function user(id: string, created: number): MessageLike {
  return { id, role: "user", time: { created } }
}

function assistant(id: string, created: number): AssistantMessageLike {
  return { id, role: "assistant", time: { created }, providerID: "p", modelID: "m" }
}

describe("isBusy", () => {
  test("idle → false (borrable)", () => {
    expect(isBusy({ type: "idle" })).toBe(false)
  })

  test("busy → true (Q2 #4: run pendiente rechaza)", () => {
    expect(isBusy({ type: "busy" })).toBe(true)
  })

  test("retry cuenta como busy → true (Q2 #11)", () => {
    expect(isBusy({ type: "retry", attempt: 1, message: "x", next: 2 })).toBe(true)
  })

  test("undefined (ausencia = idle en el server) → false, NO rechaza", () => {
    expect(isBusy(undefined)).toBe(false)
  })
})

describe("isCompactionSummary", () => {
  test("summary === true → true (Q2 #10)", () => {
    expect(isCompactionSummary({ ...assistant("a1", 1), summary: true })).toBe(true)
  })

  test("summary ausente → false", () => {
    expect(isCompactionSummary(assistant("a1", 1))).toBe(false)
  })

  test("summary === false → false", () => {
    expect(isCompactionSummary({ ...assistant("a1", 1), summary: false })).toBe(false)
  })
})

describe("isLastMessage", () => {
  test("target es el último → true", () => {
    const messages = [user("u1", 1), assistant("a1", 2)]
    expect(isLastMessage(messages, { id: "a1" })).toBe(true)
  })

  test("llegó un user después → false (Q2 #4)", () => {
    const messages = [assistant("a1", 1), user("u1", 2)]
    expect(isLastMessage(messages, { id: "a1" })).toBe(false)
  })

  test("lista vacía → false", () => {
    expect(isLastMessage([], { id: "a1" })).toBe(false)
  })
})

describe("isStaleTarget", () => {
  test("sigue siendo el último assistant → false", () => {
    const messages = [user("u1", 1), assistant("a1", 2)]
    expect(isStaleTarget(messages, "a1")).toBe(false)
  })

  test("otro assistant llegó después → true (Q2 #26)", () => {
    const messages = [assistant("a1", 1), assistant("a2", 2)]
    expect(isStaleTarget(messages, "a1")).toBe(true)
  })

  test("el target ya no está (borrado concurrente) → true (Q2 #27)", () => {
    const messages = [user("u1", 1), assistant("a2", 2)]
    expect(isStaleTarget(messages, "a1")).toBe(true)
  })

  test("no queda ningún assistant → true", () => {
    expect(isStaleTarget([user("u1", 1)], "a1")).toBe(true)
  })

  test("lista vacía → true", () => {
    expect(isStaleTarget([], "a1")).toBe(true)
  })
})

describe("isSessionRoute", () => {
  test("session → true", () => {
    expect(isSessionRoute("session")).toBe(true)
  })

  test("home/plugin → false (Q2 #1)", () => {
    expect(isSessionRoute("home")).toBe(false)
    expect(isSessionRoute("plugin")).toBe(false)
  })
})
