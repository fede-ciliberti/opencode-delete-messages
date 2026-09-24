// Tests del mapeo de errores del DELETE (matriz Q2: filas 17-23 + C4/C9).
import { describe, expect, test } from "bun:test"
import { mapDeleteError } from "../src/pure.js"

function notFoundBody(): unknown {
  return { name: "NotFoundError", data: { message: "session not found" } }
}

function busyBody(): unknown {
  return { _tag: "SessionBusyError", sessionID: "s1", message: "busy" }
}

describe("mapDeleteError", () => {
  test("409 → busy (Q2 #19)", () => {
    const mapped = mapDeleteError(busyBody(), 409)
    expect(mapped.kind).toBe("busy")
    expect(mapped.message).toBe("Session was busy — nothing deleted")
    expect(mapped.status).toBe(409)
  })

  test("404 con forma NotFoundError → session-not-found (Q2 #17)", () => {
    const mapped = mapDeleteError(notFoundBody(), 404)
    expect(mapped.kind).toBe("session-not-found")
    expect(mapped.message).toBe("Session not found — it may have been deleted")
  })

  test("404 genérico → unsupported-version / drift (Q2 #21, C9)", () => {
    const mapped = mapDeleteError({ some: "other" }, 404)
    expect(mapped.kind).toBe("unsupported-version")
    expect(mapped.message).toBe("This opencode version doesn't support deleting messages")
  })

  test("404 con string no-JSON → unsupported-version", () => {
    const mapped = mapDeleteError("not found", 404)
    expect(mapped.kind).toBe("unsupported-version")
  })

  test("400 → genérico con status (Q2 #20)", () => {
    const mapped = mapDeleteError({ name: "x" }, 400)
    expect(mapped.kind).toBe("request-failed")
    expect(mapped.message).toBe("Delete failed (400)")
  })

  test("401 → genérico con status", () => {
    expect(mapDeleteError({}, 401).message).toBe("Delete failed (401)")
  })

  test("403 → genérico con status", () => {
    expect(mapDeleteError({}, 403).message).toBe("Delete failed (403)")
  })

  test("500 → genérico con status", () => {
    const mapped = mapDeleteError({}, 500)
    expect(mapped.kind).toBe("request-failed")
    expect(mapped.message).toBe("Delete failed (500)")
  })

  test("sin status ni forma → network (Q2 #22)", () => {
    const mapped = mapDeleteError({})
    expect(mapped.kind).toBe("network")
    expect(mapped.message).toBe("Could not reach opencode server")
  })

  test("throw del interceptor text/html → version-mismatch (Q2 #23, C4)", () => {
    const thrown = new Error("Request is not supported by this version of OpenCode Server (Server responded with text/html)")
    const mapped = mapDeleteError(thrown)
    expect(mapped.kind).toBe("version-mismatch")
    expect(mapped.message).toBe("This opencode version doesn't support deleting messages")
  })

  test("throw de red (fetch) → network", () => {
    const mapped = mapDeleteError(new TypeError("fetch failed"))
    expect(mapped.kind).toBe("network")
    expect(mapped.message).toBe("Could not reach opencode server")
  })

  test("body text/html en string → version-mismatch", () => {
    const mapped = mapDeleteError("<html>nope</html>", 200)
    expect(mapped.kind).toBe("version-mismatch")
  })

  test("NotFoundError sin status explícito igual matchea sesión", () => {
    const mapped = mapDeleteError(notFoundBody())
    expect(mapped.kind).toBe("session-not-found")
  })
})
