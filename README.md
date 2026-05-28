# video-gen

Chat-style AI video generation using OpenRouter video models.

Run from Explorer by right-clicking a folder and choosing:

```text
Mike's Tools > Video Gen
```

Generated videos are written to a temp folder first. Drag a video out of the
window or click save to copy it into the folder Video Gen was opened from.

## Setup

Add an OpenRouter API key to the repo-root `.env`:

```env
OPENROUTER_API_KEY=your_key_here
```

Then launch once from this folder:

```powershell
bun run build:dev
wscript.exe ".\video-gen.vbs" "C:\path\to\output-folder"
```

## Notes

- Uses OpenRouter's async `/api/v1/videos` API.
- Defaults to `google/veo-3.1-fast`.
- Fetches model capabilities from `/api/v1/videos/models` and only offers
  valid resolution, duration, aspect, audio, and frame controls for the
  selected model.
- Supports prompt-only generation, reference images, and first/last frame
  control when the selected model exposes those capabilities.
- Video jobs are long-running; the app polls until OpenRouter marks the job
  complete, then downloads the MP4.
