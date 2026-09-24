export type MockReply = {
  status: number
  body: string
  contentType?: string
}

export type MockServer = {
  baseUrl: string
  stop(): void
  requests: Array<{ method: string; url: string }>
}

/** Levanta un server efímero (puerto 0) que responde según `reply`. */
export function startMockServer(reply: (req: Request) => MockReply): MockServer {
  const requests: Array<{ method: string; url: string }> = []
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      requests.push({ method: req.method, url: req.url })
      const { status, body, contentType } = reply(req)
      return new Response(body, {
        status,
        headers: { "content-type": contentType ?? "application/json" },
      })
    },
  })
  return {
    baseUrl: `http://localhost:${server.port}`,
    stop() {
      server.stop(true)
    },
    requests,
  }
}
