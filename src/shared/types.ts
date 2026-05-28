import type { RPCSchema } from "electrobun/bun";
import type { VideoModel } from "./modelOptions.js";

export type { VideoModel } from "./modelOptions.js";

export type GenerateParams = {
  jobId: string;
  prompt: string;
  referenceImageDataUrls?: string[];
  firstFrameDataUrl?: string;
  lastFrameDataUrl?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  negativePrompt?: string;
  model?: string;
};

export type GeneratedVideo = {
  videoId: string;
  serveUrl: string;
  tempPath: string;
  prompt: string;
};

export type VideoGenRPC = {
  bun: RPCSchema<{
    requests: {
      getConfig: { params: void; response: { workingDir: string; eventsUrl: string } };
      getModels: { params: void; response: VideoModel[] };
      generate: { params: GenerateParams; response: { jobId: string } };
      download: { params: { videoId: string }; response: { savedPath: string } };
    };
    messages: {};
  }>;
  webview: RPCSchema<{}>;
};

export type SseEvent =
  | { kind: "generating"; jobId: string }
  | { kind: "progress"; jobId: string; message: string }
  | { kind: "videoResult"; jobId: string; video: GeneratedVideo }
  | { kind: "videoError"; jobId: string; error: string };
