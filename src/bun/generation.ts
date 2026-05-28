// Pure OpenRouter video generation logic. Keep Electrobun and filesystem wiring
// outside this module so the API contract stays easy to test.
import type { VideoFrameType, VideoModel } from "../shared/modelOptions.js";

export const VIDEO_MODELS = [
  {
    id: "google/veo-3.1-fast",
    name: "Google: Veo 3.1 Fast",
    supported_resolutions: ["720p", "1080p", "4K"],
    supported_aspect_ratios: ["16:9", "9:16"],
    supported_durations: [4, 6, 8],
    supported_frame_images: ["first_frame", "last_frame"] as VideoFrameType[],
    generate_audio: true,
  },
  {
    id: "google/veo-3.1-lite",
    name: "Google: Veo 3.1 Lite",
    supported_resolutions: ["720p", "1080p"],
    supported_aspect_ratios: ["16:9", "9:16"],
    supported_durations: [4, 6, 8],
    supported_frame_images: ["first_frame", "last_frame"] as VideoFrameType[],
    generate_audio: true,
  },
  {
    id: "google/veo-3.1",
    name: "Google: Veo 3.1",
    supported_resolutions: ["720p", "1080p", "4K"],
    supported_aspect_ratios: ["16:9", "9:16"],
    supported_durations: [4, 6, 8],
    supported_frame_images: ["first_frame", "last_frame"] as VideoFrameType[],
    generate_audio: true,
  },
];

export const VIDEO_URL = "https://openrouter.ai/api/v1/videos";
export const VIDEO_MODELS_URL = "https://openrouter.ai/api/v1/videos/models";

export type GenerateVideoArgs = {
  model: string;
  prompt: string;
  referenceImageDataUrls?: string[];
  firstFrameDataUrl?: string;
  lastFrameDataUrl?: string;
  inputImageDataUrl?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  generateAudio?: boolean;
  negativePrompt?: string;
};

export type GenerateVideoJobArgs = GenerateVideoArgs & {
  apiKey: string;
  outputPath: string;
};

export type FrameImage = {
  type: "image_url";
  image_url: { url: string };
  frame_type: VideoFrameType;
};

export type InputReference = {
  type: "image_url";
  image_url: { url: string };
};

export type GenerateVideosRequest = {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  generate_audio?: boolean;
  frame_images?: FrameImage[];
  input_references?: InputReference[];
  provider?: {
    options: {
      "google-vertex": {
        parameters: {
          negativePrompt?: string;
        };
      };
    };
  };
};

type SubmitVideoResponse = {
  id: string;
  polling_url?: string;
  status: string;
  error?: string;
};

type PollVideoResponse = SubmitVideoResponse & {
  unsigned_urls?: string[];
};

export type OpenRouterVideoModel = VideoModel;

export type GenerateVideoOptions = {
  pollIntervalMs?: number;
  maxPolls?: number;
  wait?: (ms: number) => Promise<void>;
  onProgress?: (message: string) => void;
  fetchFn?: typeof fetch;
  writeFile?: (outputPath: string, bytes: Uint8Array) => void | Promise<void>;
};

export function buildGenerateVideosRequest(args: GenerateVideoArgs): GenerateVideosRequest {
  const request: GenerateVideosRequest = {
    model: args.model,
    prompt: args.prompt,
  };

  if (args.aspectRatio && args.aspectRatio !== "auto") request.aspect_ratio = args.aspectRatio;
  if (args.resolution && args.resolution !== "auto") request.resolution = args.resolution;
  if (args.duration) request.duration = args.duration;
  if (args.generateAudio !== undefined) request.generate_audio = args.generateAudio;

  const firstFrameDataUrl = args.firstFrameDataUrl ?? args.inputImageDataUrl;
  const frameImages: FrameImage[] = [];
  if (firstFrameDataUrl) {
    frameImages.push({
      type: "image_url",
      image_url: { url: firstFrameDataUrl },
      frame_type: "first_frame",
    });
  }
  if (args.lastFrameDataUrl) {
    frameImages.push({
      type: "image_url",
      image_url: { url: args.lastFrameDataUrl },
      frame_type: "last_frame",
    });
  }
  if (frameImages.length > 0) request.frame_images = frameImages;

  if (args.referenceImageDataUrls?.length) {
    request.input_references = args.referenceImageDataUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    }));
  }

  const negativePrompt = args.negativePrompt?.trim();
  if (negativePrompt) {
    request.provider = {
      options: {
        "google-vertex": {
          parameters: {
            negativePrompt,
          },
        },
      },
    };
  }

  return request;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultWriteFile(outputPath: string, bytes: Uint8Array): Promise<void> {
  const fs = await import("fs");
  fs.writeFileSync(outputPath, Buffer.from(bytes));
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function generateVideo(
  args: GenerateVideoJobArgs,
  options: GenerateVideoOptions = {},
): Promise<{ outputPath: string }> {
  const fetchFn = options.fetchFn ?? fetch;
  const wait = options.wait ?? sleep;
  const writeFile = options.writeFile ?? defaultWriteFile;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const maxPolls = options.maxPolls ?? 30;

  const headers = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/mikecann/mikerosoft",
    "X-Title": "mikerosoft/video-gen",
  };

  const submit = await fetchFn(VIDEO_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(buildGenerateVideosRequest(args)),
  });
  const submitted = await readJsonOrThrow<SubmitVideoResponse>(submit);
  const pollingUrl = submitted.polling_url ?? `${VIDEO_URL}/${submitted.id}`;
  options.onProgress?.(
    `Submitted OpenRouter video job ${submitted.id}; status=${submitted.status}; polling=${pollingUrl}`,
  );

  let status: PollVideoResponse = submitted;
  for (let poll = 0; status.status !== "completed"; poll++) {
    if (["failed", "cancelled", "expired"].includes(status.status)) {
      throw new Error(`Video generation ${status.status}: ${status.error ?? "Unknown error"}`);
    }
    if (poll >= maxPolls) {
      throw new Error(`Video generation timed out after ${Math.round((pollIntervalMs * maxPolls) / 1000)}s.`);
    }

    await wait(pollIntervalMs);
    status = await readJsonOrThrow<PollVideoResponse>(
      await fetchFn(pollingUrl, {
        headers: { Authorization: `Bearer ${args.apiKey}` },
      }),
    );
    options.onProgress?.(`Poll ${poll + 1}: status=${status.status}`);
  }

  const downloadUrl = status.unsigned_urls?.[0] ?? `${VIDEO_URL}/${status.id}/content?index=0`;
  options.onProgress?.(`Downloading video for job ${status.id}...`);
  const content = await fetchFn(downloadUrl, {
    headers: downloadUrl.startsWith(VIDEO_URL) ? { Authorization: `Bearer ${args.apiKey}` } : undefined,
  });
  if (!content.ok) throw new Error(`HTTP ${content.status}: ${await content.text()}`);

  await writeFile(args.outputPath, new Uint8Array(await content.arrayBuffer()));
  return { outputPath: args.outputPath };
}

export async function fetchVideoModels(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<OpenRouterVideoModel[]> {
  const res = await fetchFn(VIDEO_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await readJsonOrThrow<{ data: OpenRouterVideoModel[] }>(res);
  return json.data.map((model) => ({
    id: model.id,
    name: model.name,
    description: model.description,
    supported_resolutions: model.supported_resolutions,
    supported_aspect_ratios: model.supported_aspect_ratios,
    supported_durations: model.supported_durations,
    supported_frame_images: model.supported_frame_images,
    generate_audio: model.generate_audio,
  }));
}
