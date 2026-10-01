import { afterEach, describe, expect, it } from "bun:test";
import { createEventsServer } from "../src/bun/events.js";

// Read an SSE stream into a growing string so tests can wait for text to arrive.
function readStream(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const state = { text: "", closed: false };
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        state.text += decoder.decode(value, { stream: true });
      }
    } catch {}
    state.closed = true;
  })();
  return { state, cancel: () => reader.cancel().catch(() => {}) };
}

async function waitFor(check: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await Bun.sleep(20);
  return check();
}

describe("events server", () => {
  let events: ReturnType<typeof createEventsServer> | undefined;
  let cancel: (() => void) | undefined;

  afterEach(() => {
    cancel?.();
    events?.server.stop(true);
  });

  it("serves other paths through the fallback", async () => {
    events = createEventsServer(() => new Response("fallback"));
    const res = await fetch(`http://127.0.0.1:${events.server.port}/videos/x.mp4`);
    expect(await res.text()).toBe("fallback");
  });

  // Bun.serve closes connections idle for 10 seconds by default, checking every
  // few seconds, so stay idle for 15. A result sent while the UI reconnected
  // used to be lost.
  it("keeps /events open past Bun's idle timeout and still delivers events", async () => {
    events = createEventsServer(() => new Response("Not found", { status: 404 }));
    const res = await fetch(`http://127.0.0.1:${events.server.port}/events`);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const stream = readStream(res);
    cancel = stream.cancel;

    await Bun.sleep(15_000);
    events.broadcast({ kind: "videoResult", jobId: "job-1" });

    const arrived = await waitFor(() => stream.state.text.includes('"jobId":"job-1"'), 2_000);
    expect(stream.state.closed).toBe(false);
    expect(arrived).toBe(true);
  }, 25_000);

  // EventSource sends Last-Event-ID when it reconnects, so replay what it missed.
  it("replays events sent while the client was reconnecting", async () => {
    events = createEventsServer(() => new Response("Not found", { status: 404 }));
    const url = `http://127.0.0.1:${events.server.port}/events`;
    const first = readStream(await fetch(url));
    events.broadcast({ kind: "generating", jobId: "job-1" });
    expect(await waitFor(() => first.state.text.includes("job-1"), 2_000)).toBe(true);
    const lastId = first.state.text.match(/^id: (\d+)$/m)?.[1];
    expect(lastId).toBeDefined();
    first.cancel();

    events.broadcast({ kind: "videoResult", jobId: "job-2" });

    const second = readStream(await fetch(url, { headers: { "Last-Event-ID": lastId! } }));
    cancel = second.cancel;
    expect(await waitFor(() => second.state.text.includes("job-2"), 2_000)).toBe(true);
    expect(second.state.text).not.toContain("job-1");
  });
});
