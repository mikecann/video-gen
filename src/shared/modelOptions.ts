export type VideoFrameType = "first_frame" | "last_frame";

export type VideoModel = {
  id: string;
  name: string;
  description?: string;
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
  supported_durations?: number[];
  supported_frame_images?: VideoFrameType[];
  generate_audio?: boolean | null;
};

export type VideoSettings = {
  aspectRatio: string;
  resolution: string;
  duration: number;
  generateAudio: boolean;
};

export const DEFAULT_RESOLUTIONS = ["720p", "1080p", "4K"];
export const DEFAULT_ASPECT_RATIOS = ["16:9", "9:16"];
export const DEFAULT_DURATIONS = [4, 6, 8];

export function supportedResolutions(model?: VideoModel): string[] {
  return model?.supported_resolutions?.length ? model.supported_resolutions : DEFAULT_RESOLUTIONS;
}

export function supportedAspectRatios(model?: VideoModel): string[] {
  return model?.supported_aspect_ratios?.length ? model.supported_aspect_ratios : DEFAULT_ASPECT_RATIOS;
}

export function supportedDurations(model?: VideoModel): number[] {
  return model?.supported_durations?.length ? model.supported_durations : DEFAULT_DURATIONS;
}

export function supportsReferenceImages(model?: VideoModel): boolean {
  return /reference/i.test(model?.description ?? "");
}

export function supportsFrameImage(model: VideoModel | undefined, frameType: VideoFrameType): boolean {
  return model?.supported_frame_images?.includes(frameType) ?? false;
}

function preferredResolution(values: string[]): string {
  for (const value of ["4K", "1080p", "720p", "480p"]) {
    if (values.includes(value)) return value;
  }
  return values[values.length - 1] ?? "720p";
}

function preferredAspectRatio(values: string[]): string {
  return values.includes("16:9") ? "16:9" : (values[0] ?? "16:9");
}

function preferredDuration(values: number[]): number {
  if (values.includes(8)) return 8;
  if (values.includes(6)) return 6;
  return values[0] ?? 8;
}

export function coerceVideoSettings(model: VideoModel | undefined, settings: VideoSettings): VideoSettings {
  const resolutions = supportedResolutions(model);
  const aspectRatios = supportedAspectRatios(model);
  const durations = supportedDurations(model);

  return {
    resolution: resolutions.includes(settings.resolution)
      ? settings.resolution
      : preferredResolution(resolutions),
    aspectRatio: aspectRatios.includes(settings.aspectRatio)
      ? settings.aspectRatio
      : preferredAspectRatio(aspectRatios),
    duration: durations.includes(settings.duration)
      ? settings.duration
      : preferredDuration(durations),
    generateAudio: model?.generate_audio === false ? false : settings.generateAudio,
  };
}
