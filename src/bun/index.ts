import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { GenerateParams, GeneratedVideo, SseEvent, VideoGenRPC } from "../shared/types.js";
import {
  VIDEO_MODELS,
  fetchVideoModels,
  generateVideo,
} from "./generation.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const folderPath = process.env["FOLDER_PATH"] ?? process.cwd();
const sessionId = crypto.randomUUID();
const apiKey = process.env["OPENROUTER_API_KEY"];

const logPath = path.join(process.env["TEMP"] ?? "/tmp", "video-gen", "video-gen.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(logPath, line);
  console.log(msg);
}

const tempDir = path.join(process.env["TEMP"] ?? "/tmp", "video-gen", sessionId);
fs.mkdirSync(tempDir, { recursive: true });

const videoStore = new Map<string, { tempPath: string; prompt: string }>();
const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function broadcastSse(event: SseEvent) {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
  for (const ctrl of sseClients) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      sseClients.delete(ctrl);
    }
  }
}

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/events") {
      let ctrl: ReadableStreamDefaultController<Uint8Array>;
      let ping: Timer | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          ctrl = c;
          sseClients.add(ctrl);
          ping = setInterval(() => {
            try {
              ctrl.enqueue(new TextEncoder().encode(": ping\n\n"));
            } catch {
              if (ping) clearInterval(ping);
            }
          }, 15_000);
        },
        cancel() {
          sseClients.delete(ctrl);
          if (ping) clearInterval(ping);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const match = url.pathname.match(/^\/videos\/([^/]+\.mp4)$/);
    if (match) {
      const filePath = path.join(tempDir, match[1]);
      if (fs.existsSync(filePath)) {
        return new Response(Bun.file(filePath), {
          headers: {
            "Content-Type": "video/mp4",
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
          },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

const baseUrl = `http://127.0.0.1:${server.port}`;
log(`video-gen server at ${baseUrl} | apiKey=${apiKey ? "set" : "MISSING"}`);

function safeFilenamePart(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return slug || "video";
}

function nextDownloadPath(prompt: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `video-gen-${stamp}-${safeFilenamePart(prompt)}.mp4`;
  let destPath = path.join(folderPath, filename);
  let counter = 1;

  while (fs.existsSync(destPath)) {
    const base = path.basename(filename, ".mp4");
    destPath = path.join(folderPath, `${base}-${counter++}.mp4`);
  }

  return destPath;
}

async function runGeneration(params: GenerateParams) {
  const { jobId } = params;
  if (!apiKey) {
    broadcastSse({ kind: "videoError", jobId, error: "OPENROUTER_API_KEY is not set. Add it to .env in the repo root." });
    return;
  }

  const model = params.model ?? VIDEO_MODELS[0].id;
  const videoId = crypto.randomUUID();
  const filename = `${videoId}.mp4`;
  const tempPath = path.join(tempDir, filename);

  log(
    `[${jobId}] Starting video generation: model=${model} resolution=${params.resolution ?? "default"} duration=${params.duration ?? "default"} aspect=${params.aspectRatio ?? "default"} refs=${params.referenceImageDataUrls?.length ?? 0} first=${params.firstFrameDataUrl ? "yes" : "no"} last=${params.lastFrameDataUrl ? "yes" : "no"}`,
  );
  broadcastSse({ kind: "generating", jobId });

  try {
    await generateVideo(
      {
        model,
        prompt: params.prompt,
        referenceImageDataUrls: params.referenceImageDataUrls,
        firstFrameDataUrl: params.firstFrameDataUrl,
        lastFrameDataUrl: params.lastFrameDataUrl,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        duration: params.duration,
        generateAudio: params.generateAudio,
        negativePrompt: params.negativePrompt,
        apiKey,
        outputPath: tempPath,
      },
      {
        onProgress: (message) => {
          log(`[${jobId}] ${message}`);
          broadcastSse({ kind: "progress", jobId, message });
        },
      },
    );

    const video: GeneratedVideo = {
      videoId,
      serveUrl: `${baseUrl}/videos/${filename}`,
      tempPath,
      prompt: params.prompt,
    };
    videoStore.set(videoId, { tempPath, prompt: params.prompt });
    log(`[${jobId}] Success: ${videoId}`);
    broadcastSse({ kind: "videoResult", jobId, video });
  } catch (err) {
    log(`[${jobId}] Error: ${err}`);
    broadcastSse({ kind: "videoError", jobId, error: String(err) });
  }
}

const rpc = BrowserView.defineRPC<VideoGenRPC>({
  maxRequestTime: 15_000,
  handlers: {
    requests: {
      getConfig: () => ({ workingDir: folderPath, eventsUrl: `${baseUrl}/events` }),
      getModels: async () => {
        if (!apiKey) return VIDEO_MODELS;
        try {
          return await fetchVideoModels(apiKey);
        } catch (err) {
          log(`getModels failed: ${err}`);
          return VIDEO_MODELS;
        }
      },
      generate: (params) => {
        runGeneration(params).catch(console.error);
        return { jobId: params.jobId };
      },
      download: ({ videoId }) => {
        const entry = videoStore.get(videoId);
        if (!entry) throw new Error(`Unknown videoId: ${videoId}`);

        const destPath = nextDownloadPath(entry.prompt);
        fs.copyFileSync(entry.tempPath, destPath);
        log(`Downloaded to: ${destPath}`);
        return { savedPath: destPath };
      },
    },
  },
});

const win = new BrowserWindow({
  title: "Video Gen",
  url: "views://video-gen-ui/index.html",
  frame: { width: 980, height: 760, x: 140, y: 90 },
  rpc,
});

function pulseWindowSize() {
  try {
    const { width, height } = win.getFrame();
    win.setSize(width + 1, height + 1);
    setTimeout(() => {
      try {
        win.setSize(width, height);
      } catch (err) {
        log(`[window] resize restore failed: ${err}`);
      }
    }, 40);
  } catch (err) {
    log(`[window] resize pulse failed: ${err}`);
  }
}

for (const delay of [150, 500, 1000]) {
  setTimeout(() => {
    log(`[window] resize pulse at ${delay}ms`);
    pulseWindowSize();
  }, delay);
}
