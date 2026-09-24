// Tests del builder del preview de confirmación (Q2 #31 + Q3).
import { describe, expect, test } from "bun:test"
import { buildPreview, PREVIEW_MAX_LENGTH, type AssistantMessageLike, type PartLike } from "../src/pure.js"

function assistant(over: Partial<AssistantMessageLike> = {}): AssistantMessageLike {
  return {
    id: "a1",
    role: "assistant",
    time: { created: Date.UTC(2026, 8, 22, 14, 5, 0) },
    providerID: "anthropic",
    modelID: "claude-sonnet-4",
    ...over,
  }
}

function text(text: string): PartLike {
  return { type: "text", text }
}

describe("buildPreview", () => {
  test("texto corto + línea de modelo y hora", () => {
    const out = buildPreview(assistant(), [text("Hola mundo")], 0)
    expect(out).toBe("Hola mundo\nmodel: anthropic/claude-sonnet-4 · 14:05")
  })

  test("colapsa whitespace (saltos, tabs, espacios múltiples)", () => {
    const out = buildPreview(assistant(), [text("  hola\n\n  mundo\tchau  ")], 0)
    expect(out.startsWith("hola mundo chau\n")).toBe(true)
  })

  test("trunca a ~120 chars con elipsis (Q2 #31)", () => {
    const long = "x".repeat(200)
    const out = buildPreview(assistant(), [text(long)], 0)
    const first = out.split("\n")[0] ?? ""
    expect(first.length).toBeLessThanOrEqual(PREVIEW_MAX_LENGTH + 1)
    expect(first.endsWith("…")).toBe(true)
  })

  test("texto de exactamente 120 chars no se trunca", () => {
    const exact = "y".repeat(120)
    const out = buildPreview(assistant(), [text(exact)], 0)
    expect(out.split("\n")[0]).toBe(exact)
  })

  test("concatena múltiples partes de texto", () => {
    const out = buildPreview(assistant(), [text("primera"), text("segunda")], 0)
    expect(out.startsWith("primera segunda\n")).toBe(true)
  })

  test("sin texto → fallback con conteo de tools (Q2 #7)", () => {
    const parts: PartLike[] = [{ type: "tool" }, { type: "tool" }, { type: "text", text: "  " }]
    const out = buildPreview(assistant(), parts, 0)
    expect(out.startsWith("no text — 2 tool calls\n")).toBe(true)
  })

  test("sin partes → fallback con 0 tools", () => {
    const out = buildPreview(assistant(), [], 0)
    expect(out.startsWith("no text — 0 tool calls\n")).toBe(true)
  })

  test("aborted → tag [aborted] (Q2 #8)", () => {
    const msg = assistant({ error: { name: "MessageAbortedError" } })
    const out = buildPreview(msg, [text("incompleto")], 0)
    expect(out.startsWith("[aborted] incompleto\n")).toBe(true)
  })

  test("error de provider → tag [error] (Q2 #9)", () => {
    const msg = assistant({ error: { name: "ProviderAuthError" } })
    const out = buildPreview(msg, [text("falló")], 0)
    expect(out.startsWith("[error] falló\n")).toBe(true)
  })

  test("error null no taggea", () => {
    const msg = assistant({ error: null })
    const out = buildPreview(msg, [text("ok")], 0)
    expect(out.startsWith("ok\n")).toBe(true)
  })

  test("time.created inválido usa el reloj inyectado", () => {
    const msg = assistant({ time: { created: Number.NaN } })
    const out = buildPreview(msg, [text("hola")], Date.UTC(2026, 0, 1, 3, 7, 0))
    expect(out.endsWith("· 03:07")).toBe(true)
  })
})
