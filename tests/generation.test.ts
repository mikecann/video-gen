import { describe, expect, it } from "bun:test";
import {
  buildGenerateVideosRequest,
  fetchVideoModels,
  generateVideo,
} from "../src/bun/generation.js";
import { coerceVideoSettings } from "../src/shared/modelOptions.js";

describe("buildGenerateVideosRequest", () => {
  it("builds a text-to-video Veo request with no optional config by default", () => {
    expect(
      buildGenerateVideosRequest({
        model: "google/veo-3.1",
        prompt: "a neon city timelapse",
      }),
    ).toEqual({
      model: "google/veo-3.1",
      prompt: "a neon city timelapse",
    });
  });

  it("adds OpenRouter video parameters when provided", () => {
    expect(
      buildGenerateVideosRequest({
        model: "google/veo-3.1",
        prompt: "a vertical launch trailer",
        aspectRatio: "9:16",
        resolution: "1080p",
        duration: 8,
        generateAudio: true,
        negativePrompt: "blurry",
      }),
    ).toEqual({
      model: "google/veo-3.1",
      prompt: "a vertical launch trailer",
      aspect_ratio: "9:16",
      resolution: "1080p",
      duration: 8,
      generate_audio: true,
      provider: {
        options: {
          "google-vertex": {
            parameters: {
              negativePrompt: "blurry",
            },
          },
        },
      },
    });
  });

  it("uses explicit first and last frame images as frame images", () => {
    expect(
      buildGenerateVideosRequest({
        model: "google/veo-3.1",
        prompt: "animate this",
        firstFrameDataUrl: "data:image/png;base64,first",
        lastFrameDataUrl: "data:image/png;base64,last",
      }),
    ).toEqual({
      model: "google/veo-3.1",
      prompt: "animate this",
      frame_images: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,first" },
          frame_type: "first_frame",
        },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,last" },
          frame_type: "last_frame",
        },
      ],
    });
  });

  it("uses reference images as input references rather than frame images", () => {
    expect(
      buildGenerateVideosRequest({
        model: "bytedance/seedance-2.0-fast",
        prompt: "use these visual references",
        referenceImageDataUrls: [
          "data:image/png;base64,ref1",
          "data:image/jpeg;base64,ref2",
        ],
      }),
    ).toEqual({
      model: "bytedance/seedance-2.0-fast",
      prompt: "use these visual references",
      input_references: [
        { type: "image_url", image_url: { url: "data:image/png;base64,ref1" } },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,ref2" } },
      ],
    });
  });
});

describe("generateVideo", () => {
  it("starts an OpenRouter video job, polls until completed, then downloads the content", async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const fetchFn: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).endsWith("/videos")) {
        return Response.json({ id: "job-123", polling_url: "https://openrouter.ai/api/v1/videos/job-123", status: "pending" }, { status: 202 });
      }
      if (String(url).endsWith("/videos/job-123")) {
        return Response.json({ id: "job-123", status: "completed", unsigned_urls: ["https://cdn.example/video.mp4"] });
      }
      return new Response("mp4 bytes");
    };

    const writes: Array<{ path: string; bytes: Uint8Array }> = [];

    await generateVideo(
      {
        model: "google/veo-3.1",
        prompt: "a moonlit forest",
        outputPath: "C:\\out\\forest.mp4",
        apiKey: "key",
      },
      {
        fetchFn,
        wait: async () => {},
        writeFile: (outputPath, bytes) => writes.push({ path: outputPath, bytes }),
      },
    );

    expect(calls).toEqual([
      { url: "https://openrouter.ai/api/v1/videos", method: "POST" },
      { url: "https://openrouter.ai/api/v1/videos/job-123", method: undefined },
      { url: "https://cdn.example/video.mp4", method: undefined },
    ]);
    expect(writes[0].path).toBe("C:\\out\\forest.mp4");
    expect(new TextDecoder().decode(writes[0].bytes)).toBe("mp4 bytes");
  });

  it("reports the OpenRouter job id and each polled status", async () => {
    let pollCount = 0;
    const progress: string[] = [];
    const fetchFn: typeof fetch = async (url) => {
      if (String(url).endsWith("/videos")) {
        return Response.json({
          id: "job-abc",
          polling_url: "https://openrouter.ai/api/v1/videos/job-abc",
          status: "pending",
        }, { status: 202 });
      }
      if (String(url).endsWith("/videos/job-abc")) {
        pollCount++;
        return Response.json(
          pollCount === 1
            ? { id: "job-abc", status: "pending" }
            : { id: "job-abc", status: "completed", unsigned_urls: ["https://cdn.example/video.mp4"] },
        );
      }
      return new Response("mp4 bytes");
    };

    await generateVideo(
      {
        model: "google/veo-3.1",
        prompt: "a moonlit forest",
        outputPath: "C:\\out\\forest.mp4",
        apiKey: "key",
      },
      {
        fetchFn,
        wait: async () => {},
        writeFile: () => {},
        onProgress: (message) => progress.push(message),
      },
    );

    expect(progress).toEqual([
      "Submitted OpenRouter video job job-abc; status=pending; polling=https://openrouter.ai/api/v1/videos/job-abc",
      "Poll 1: status=pending",
      "Poll 2: status=completed",
      "Downloading video for job job-abc...",
    ]);
  });
});

describe("fetchVideoModels", () => {
  it("returns OpenRouter video models from the dedicated model endpoint", async () => {
    const fetchFn: typeof fetch = async () =>
      Response.json({
        data: [
          {
            id: "google/veo-3.1",
            name: "Google: Veo 3.1",
            description: "Reference capable",
            supported_resolutions: ["720p", "1080p"],
            supported_aspect_ratios: ["16:9"],
            supported_durations: [4, 8],
            supported_frame_images: ["first_frame", "last_frame"],
            generate_audio: true,
          },
          { id: "other/model", name: "Other" },
        ],
      });

    await expect(fetchVideoModels("key", fetchFn)).resolves.toEqual([
      {
        id: "google/veo-3.1",
        name: "Google: Veo 3.1",
        description: "Reference capable",
        supported_resolutions: ["720p", "1080p"],
        supported_aspect_ratios: ["16:9"],
        supported_durations: [4, 8],
        supported_frame_images: ["first_frame", "last_frame"],
        generate_audio: true,
      },
      {
        id: "other/model",
        name: "Other",
        description: undefined,
        supported_resolutions: undefined,
        supported_aspect_ratios: undefined,
        supported_durations: undefined,
        supported_frame_images: undefined,
        generate_audio: undefined,
      },
    ]);
  });
});

describe("coerceVideoSettings", () => {
  it("keeps Seedance 2.0 Fast settings inside its advertised capabilities", () => {
    expect(
      coerceVideoSettings(
        {
          id: "bytedance/seedance-2.0-fast",
          name: "ByteDance: Seedance 2.0 Fast",
          supported_resolutions: ["480p", "720p"],
          supported_aspect_ratios: ["1:1", "3:4", "9:16", "4:3", "16:9", "21:9", "9:21"],
          supported_durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
          generate_audio: true,
        },
        {
          resolution: "4K",
          aspectRatio: "16:9",
          duration: 8,
          generateAudio: true,
        },
      ),
    ).toEqual({
      resolution: "720p",
      aspectRatio: "16:9",
      duration: 8,
      generateAudio: true,
    });
  });

  it("disables audio when the selected model does not support it", () => {
    expect(
      coerceVideoSettings(
        {
          id: "minimax/hailuo-2.3",
          name: "MiniMax: Hailuo 2.3",
          supported_resolutions: ["1080p"],
          supported_aspect_ratios: ["16:9"],
          supported_durations: [6, 10],
          generate_audio: false,
        },
        {
          resolution: "720p",
          aspectRatio: "9:16",
          duration: 8,
          generateAudio: true,
        },
      ),
    ).toEqual({
      resolution: "1080p",
      aspectRatio: "16:9",
      duration: 6,
      generateAudio: false,
    });
  });
});
