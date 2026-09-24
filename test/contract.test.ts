import { afterEach, describe, expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { startMockServer } from "./helpers/mock-server.js"
import type { MockReply, MockServer } from "./helpers/mock-server.js"

const servers: MockServer[] = []

afterEach(() => {
  while (servers.length > 0) servers.pop()?.stop()
})

function clientFor(reply: (req: Request) => MockReply) {
  const server = startMockServer(reply)
  servers.push(server)
  return createOpencodeClient({ baseUrl: server.baseUrl })
}

function errorName(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  if (!("name" in error)) return undefined
  const name = error.name
  return typeof name === "string" ? name : undefined
}

describe("contrato DELETE /session/:id/message/:id contra el SDK real", () => {
  test("200 true → result.data true y sin error", async () => {
    const client = clientFor(() => ({ status: 200, body: "true" }))
    const result = await client.session.deleteMessage({ sessionID: "s1", messageID: "m1" })
    expect(result.error).toBeUndefined()
    expect(result.data).toBe(true)
  })

  test("409 SessionBusyError → result.error y status 409", async () => {
    const body = JSON.stringify({ name: "SessionBusyError", data: { message: "busy" } })
    const client = clientFor(() => ({ status: 409, body }))
    const result = await client.session.deleteMessage({ sessionID: "s1", messageID: "m1" })
    expect(result.error).toBeDefined()
    expect(result.response?.status).toBe(409)
  })

  test("404 NotFoundError → error con forma NotFoundError y status 404", async () => {
    const body = JSON.stringify({ name: "NotFoundError", data: { message: "gone" } })
    const client = clientFor(() => ({ status: 404, body }))
    const result = await client.session.deleteMessage({ sessionID: "s1", messageID: "m1" })
    expect(result.response?.status).toBe(404)
    expect(errorName(result.error)).toBe("NotFoundError")
  })

  test("404 genérico (endpoint ausente) → status 404 sin forma NotFoundError", async () => {
    const client = clientFor(() => ({ status: 404, body: JSON.stringify({ message: "no route" }) }))
    const result = await client.session.deleteMessage({ sessionID: "s1", messageID: "m1" })
    expect(result.response?.status).toBe(404)
    expect(errorName(result.error)).not.toBe("NotFoundError")
  })

  test("respuesta text/html → el interceptor del SDK throwea (C4)", async () => {
    const client = clientFor(() => ({ status: 200, body: "<html>nope</html>", contentType: "text/html" }))
    await expect(client.session.deleteMessage({ sessionID: "s1", messageID: "m1" })).rejects.toThrow()
  })
})
