// HTTP server with an SSE stream at /events, from bun to the webview.
export function createEventsServer<E>(fallbackFetch: (req: Request) => Response | Promise<Response>) {
  const encoder = new TextEncoder();
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  // Recent events, replayed to a client that reconnects with Last-Event-ID.
  const recent: { id: number; bytes: Uint8Array }[] = [];
  let nextId = 1;

  function broadcast(event: E) {
    const id = nextId++;
    const bytes = encoder.encode(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
    recent.push({ id, bytes });
    if (recent.length > 100) recent.shift();
    for (const ctrl of clients) {
      try {
        ctrl.enqueue(bytes);
      } catch {
        clients.delete(ctrl);
      }
    }
  }

  const server = Bun.serve({
    port: 0,
    // Bun closes connections idle for 10s by default, which drops the SSE
    // stream and loses any event sent while the UI reconnects.
    idleTimeout: 0,
    fetch(req) {
      if (new URL(req.url).pathname !== "/events") return fallbackFetch(req);

      const lastId = Number(req.headers.get("Last-Event-ID") ?? 0);
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      let ping: Timer | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          clients.add(ctrl);
          // Flush headers now so the client sees the stream open straight away.
          ctrl.enqueue(encoder.encode(": connected\n\n"));
          if (lastId) {
            for (const e of recent) if (e.id > lastId) ctrl.enqueue(e.bytes);
          }
          ping = setInterval(() => {
            try {
              ctrl.enqueue(encoder.encode(": ping\n\n"));
            } catch {
              clearInterval(ping);
            }
          }, 5_000);
        },
        cancel() {
          clients.delete(ctrl);
          clearInterval(ping);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
  });

  return { server, broadcast };
}
