import { useEffect, useRef, useState } from "react";
import { Electroview } from "electrobun/view";
import type { GeneratedVideo, SseEvent, VideoGenRPC, VideoModel } from "../shared/types.js";
import {
  coerceVideoSettings,
  supportedAspectRatios,
  supportedDurations,
  supportedResolutions,
  supportsFrameImage,
  supportsReferenceImages,
  type VideoFrameType,
} from "../shared/modelOptions.js";

const rpc = Electroview.defineRPC<VideoGenRPC>({ handlers: { requests: {}, messages: {} } });
void new Electroview({ rpc });

type ChatMessage =
  | { id: string; role: "user"; prompt: string; images: ImageAttachment[] }
  | {
      id: string;
      role: "assistant";
      jobId: string;
      videos: GeneratedVideo[];
      isGenerating: boolean;
      progress?: string;
      error?: string;
    };

type ImageAttachment = {
  id: string;
  dataUrl: string;
  name: string;
};

const FALLBACK_MODELS: VideoModel[] = [
  { id: "google/veo-3.1-fast", name: "Google: Veo 3.1 Fast" },
  { id: "google/veo-3.1-lite", name: "Google: Veo 3.1 Lite" },
  { id: "google/veo-3.1", name: "Google: Veo 3.1" },
];

function randomId() {
  return Math.random().toString(36).slice(2);
}

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function attachmentsFromFiles(files: FileList | File[]): Promise<ImageAttachment[]> {
  const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
  return Promise.all(
    images.map(async (file) => ({
      id: randomId(),
      name: file.name,
      dataUrl: await dataUrlFromBlob(file),
    })),
  );
}

function Spinner({ label = "Generating..." }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9aa0a6", fontSize: 13 }}>
      <div style={spinnerStyle} />
      {label}
    </div>
  );
}

function SettingControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={settingLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

function SingleVideo({
  video,
  onDownload,
  downloadStatus,
}: {
  video: GeneratedVideo;
  onDownload: (videoId: string) => void;
  downloadStatus?: string;
}) {
  const handleDragStart = (e: React.DragEvent<HTMLVideoElement>) => {
    const fileUrl = "file:///" + video.tempPath.replace(/\\/g, "/");
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/uri-list", fileUrl);
    e.dataTransfer.setData("DownloadURL", `video/mp4:${video.videoId}.mp4:${fileUrl}`);
  };

  return (
    <div style={{ position: "relative", width: "min(640px, 100%)" }}>
      <video
        src={video.serveUrl}
        aria-label="Generated video"
        controls
        draggable
        onDragStart={handleDragStart}
        style={videoStyle}
      />
      <div style={videoActionsStyle}>
        <button type="button" style={iconBtnStyle} onClick={() => onDownload(video.videoId)} title="Download">
          Save
        </button>
      </div>
      {downloadStatus && <div style={downloadStatusStyle}>{downloadStatus}</div>}
    </div>
  );
}

function VideoBubble({
  msg,
  onDownload,
  downloadStatus,
}: {
  msg: Extract<ChatMessage, { role: "assistant" }>;
  onDownload: (videoId: string) => void;
  downloadStatus: Record<string, string>;
}) {
  if (msg.isGenerating && msg.videos.length === 0) {
    return <Spinner label={msg.progress ?? "Generating video..."} />;
  }

  if (msg.error && msg.videos.length === 0) {
    return <div style={errorStyle}>{msg.error}</div>;
  }

  return (
    <div>
      {msg.isGenerating && msg.videos.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Spinner label={msg.progress ?? "Generating video..."} />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {msg.videos.map((video) => (
          <SingleVideo
            key={video.videoId}
            video={video}
            onDownload={onDownload}
            downloadStatus={downloadStatus[video.videoId]}
          />
        ))}
      </div>
      {msg.error && <div style={{ ...errorStyle, marginTop: 6 }}>{msg.error}</div>}
    </div>
  );
}

function UserBubble({ msg }: { msg: Extract<ChatMessage, { role: "user" }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {msg.images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, maxWidth: 520 }}>
          {msg.images.map((image) => (
            <img key={image.id} src={image.dataUrl} alt={image.name} style={messageImageStyle} title={image.name} />
          ))}
        </div>
      )}
      <div style={userBubbleStyle}>{msg.prompt}</div>
    </div>
  );
}

function ImageDropZone({
  title,
  images,
  multiple,
  onFiles,
  onRemove,
  onClear,
  inputRef,
}: {
  title: string;
  images: ImageAttachment[];
  multiple: boolean;
  onFiles: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onFiles(event.dataTransfer.files);
  };

  return (
    <div
      style={dropZoneStyle}
      role="button"
      tabIndex={0}
      aria-label={title}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <div style={dropZoneHeaderStyle}>
        <span>{title}</span>
        {images.length > 0 && (
          <button
            type="button"
            style={smallTextButtonStyle}
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            Clear
          </button>
        )}
      </div>
      {images.length > 0 ? (
        <div style={imageChipListStyle}>
          {images.map((image) => (
            <div key={image.id} style={imageChipStyle}>
              <img src={image.dataUrl} alt="" style={imageChipImgStyle} />
              <span style={imageChipNameStyle}>{image.name}</span>
              <button
                type="button"
                aria-label={`Remove ${image.name}`}
                style={chipRemoveStyle}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(image.id);
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span style={dropZoneEmptyStyle}>Drop image</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        aria-label={title}
        style={{ display: "none" }}
        onChange={(event) => {
          const files = event.target.files;
          if (files) onFiles(files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ImageAttachment[]>([]);
  const [firstFrame, setFirstFrame] = useState<ImageAttachment | null>(null);
  const [lastFrame, setLastFrame] = useState<ImageAttachment | null>(null);
  const [models, setModels] = useState<VideoModel[]>(FALLBACK_MODELS);
  const [model, setModel] = useState(FALLBACK_MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("auto");
  const [duration, setDuration] = useState(8);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [workingDir, setWorkingDir] = useState("");
  const [downloadStatus, setDownloadStatus] = useState<Record<string, string>>({});

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedModel = models.find((m) => m.id === model);
  const resolutionOptions = supportedResolutions(selectedModel);
  const aspectRatioOptions = supportedAspectRatios(selectedModel);
  const durationOptions = supportedDurations(selectedModel);
  const referenceImagesSupported = supportsReferenceImages(selectedModel);
  const firstFrameSupported = supportsFrameImage(selectedModel, "first_frame");
  const lastFrameSupported = supportsFrameImage(selectedModel, "last_frame");

  useEffect(() => {
    let es: EventSource | null = null;

    rpc.request.getModels().then((list) => {
      if (list.length > 0) {
        setModels(list);
        setModel(list[0].id);
      }
    });

    rpc.request.getConfig().then(({ workingDir: wd, eventsUrl }) => {
      setWorkingDir(wd);
      es = new EventSource(eventsUrl);
      es.onmessage = (ev) => {
        const event = JSON.parse(ev.data) as SseEvent;
        if (event.kind === "generating") {
          setIsGenerating(true);
        } else if (event.kind === "progress") {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant" && m.jobId === event.jobId ? { ...m, progress: event.message } : m,
            ),
          );
        } else if (event.kind === "videoResult") {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant" && m.jobId === event.jobId
                ? { ...m, videos: [...m.videos, event.video], isGenerating: false, progress: undefined }
                : m,
            ),
          );
          setIsGenerating(false);
        } else if (event.kind === "videoError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.role === "assistant" && m.jobId === event.jobId
                ? { ...m, error: event.error, isGenerating: false, progress: undefined }
                : m,
            ),
          );
          setIsGenerating(false);
        }
      };
      es.onerror = () => {
        console.warn("SSE connection lost, reconnecting...");
      };
    });

    return () => {
      es?.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const next = coerceVideoSettings(selectedModel, {
      aspectRatio,
      resolution,
      duration,
      generateAudio,
    });

    if (next.aspectRatio !== aspectRatio) setAspectRatio(next.aspectRatio);
    if (next.resolution !== resolution) setResolution(next.resolution);
    if (next.duration !== duration) setDuration(next.duration);
    if (next.generateAudio !== generateAudio) setGenerateAudio(next.generateAudio);

    if (!supportsReferenceImages(selectedModel) && referenceImages.length > 0) setReferenceImages([]);
    if (!supportsFrameImage(selectedModel, "first_frame") && firstFrame) setFirstFrame(null);
    if (!supportsFrameImage(selectedModel, "last_frame") && lastFrame) setLastFrame(null);
  }, [model, models]);

  const handleSend = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    const jobId = randomId();
    const userMsgId = randomId();
    const assistantMsgId = randomId();

    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      prompt: trimmed,
      images: [
        ...referenceImages,
        ...(firstFrame ? [firstFrame] : []),
        ...(lastFrame ? [lastFrame] : []),
      ],
    };
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      jobId,
      videos: [],
      isGenerating: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setPrompt("");
    setReferenceImages([]);
    setFirstFrame(null);
    setLastFrame(null);
    setIsGenerating(true);

    rpc.request
      .generate({
        jobId,
        prompt: trimmed,
        referenceImageDataUrls: referenceImages.map((image) => image.dataUrl),
        firstFrameDataUrl: firstFrame?.dataUrl,
        lastFrameDataUrl: lastFrame?.dataUrl,
        aspectRatio,
        resolution,
        duration,
        generateAudio,
        negativePrompt,
        model,
      })
      .catch((err: unknown) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, error: String(err), isGenerating: false } : m,
          ),
        );
        setIsGenerating(false);
      });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addReferenceFiles = async (files: FileList | File[]) => {
    const images = await attachmentsFromFiles(files);
    setReferenceImages((current) => [...current, ...images]);
  };

  const setFrameFile = async (frameType: VideoFrameType, files: FileList | File[]) => {
    const [image] = await attachmentsFromFiles(files);
    if (!image) return;
    if (frameType === "first_frame") setFirstFrame(image);
    else setLastFrame(image);
  };

  const handleDownload = async (videoId: string) => {
    setDownloadStatus((s) => ({ ...s, [videoId]: "saving..." }));
    try {
      const { savedPath } = await rpc.request.download({ videoId });
      const filename = savedPath.split("\\").pop() ?? savedPath.split("/").pop() ?? savedPath;
      setDownloadStatus((s) => ({ ...s, [videoId]: `Saved: ${filename}` }));
      setTimeout(
        () =>
          setDownloadStatus((s) => {
            const next = { ...s };
            delete next[videoId];
            return next;
          }),
        3000,
      );
    } catch (err) {
      setDownloadStatus((s) => ({ ...s, [videoId]: `Error: ${err}` }));
    }
  };

  return (
    <div
      style={rootStyle}
      onDragOver={(event) => {
        if (referenceImagesSupported) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!referenceImagesSupported) return;
        event.preventDefault();
        addReferenceFiles(event.dataTransfer.files);
      }}
    >
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, flexShrink: 0 }}>Video Gen</span>
          {workingDir && <span style={workingDirStyle}>{workingDir}</span>}
        </div>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div style={messagesStyle}>
        {messages.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={{ color: "#5f6670", fontSize: 13 }}>Video Gen</div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 16,
            }}
          >
            {msg.role === "user" ? (
              <UserBubble msg={msg} />
            ) : (
              <div style={assistantBubbleStyle}>
                <VideoBubble msg={msg} onDownload={handleDownload} downloadStatus={downloadStatus} />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {(referenceImagesSupported || firstFrameSupported || lastFrameSupported) && (
        <div style={imageInputStripStyle}>
          {referenceImagesSupported && (
            <ImageDropZone
              title="References"
              images={referenceImages}
              multiple
              inputRef={referenceInputRef}
              onFiles={addReferenceFiles}
              onRemove={(id) => setReferenceImages((images) => images.filter((image) => image.id !== id))}
              onClear={() => setReferenceImages([])}
            />
          )}
          {firstFrameSupported && (
            <ImageDropZone
              title="First frame"
              images={firstFrame ? [firstFrame] : []}
              multiple={false}
              inputRef={firstFrameInputRef}
              onFiles={(files) => setFrameFile("first_frame", files)}
              onRemove={() => setFirstFrame(null)}
              onClear={() => setFirstFrame(null)}
            />
          )}
          {lastFrameSupported && (
            <ImageDropZone
              title="Last frame"
              images={lastFrame ? [lastFrame] : []}
              multiple={false}
              inputRef={lastFrameInputRef}
              onFiles={(files) => setFrameFile("last_frame", files)}
              onRemove={() => setLastFrame(null)}
              onClear={() => setLastFrame(null)}
            />
          )}
        </div>
      )}

      <div style={settingsStripStyle}>
        <SettingControl label="Aspect">
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} style={settingSelectStyle}>
            {aspectRatioOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </SettingControl>
        <div style={settingDivider} />
        <SettingControl label="Resolution">
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} style={settingSelectStyle}>
            {resolutionOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </SettingControl>
        <div style={settingDivider} />
        <SettingControl label="Duration">
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={settingSelectStyle}>
            {durationOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}s
              </option>
            ))}
          </select>
        </SettingControl>
        <div style={settingDivider} />
        <SettingControl label="Audio">
          <button
            type="button"
            onClick={() => setGenerateAudio((value) => !value)}
            disabled={selectedModel?.generate_audio === false}
            style={{
              ...toggleBtnStyle,
              background: generateAudio ? "#0f766e" : "#1f2228",
              borderColor: generateAudio ? "#0f766e" : "#2d3138",
              color: generateAudio ? "#fff" : "#d4dae2",
              cursor: selectedModel?.generate_audio === false ? "default" : "pointer",
              opacity: selectedModel?.generate_audio === false ? 0.6 : 1,
            }}
          >
            {generateAudio ? "On" : "Off"}
          </button>
        </SettingControl>
        <div style={settingDivider} />
        <SettingControl label="Negative">
          <input
            aria-label="Negative prompt"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="optional"
            style={negativeInputStyle}
          />
        </SettingControl>
      </div>

      <div style={inputAreaStyle}>
        <div style={inputRowStyle}>
          <button
            type="button"
            aria-label="Add reference image"
            style={attachBtnStyle}
            onClick={() => referenceInputRef.current?.click()}
            disabled={!referenceImagesSupported}
            title="Add reference image"
          >
            +
          </button>
          <textarea
            aria-label="Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the video..."
            rows={2}
            disabled={isGenerating}
            style={textareaStyle}
          />
          <button type="button" onClick={handleSend} disabled={isGenerating || !prompt.trim()} style={sendBtnStyle}>
            {isGenerating ? <div style={spinnerStyle} /> : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  width: "100%",
  overflow: "hidden",
  background: "#101112",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 16px",
  borderBottom: "1px solid #24272c",
  flexShrink: 0,
  background: "#17191d",
};

const workingDirStyle: React.CSSProperties = {
  color: "#6f7682",
  fontSize: 11,
  fontFamily: "monospace",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "#444b55",
  textAlign: "center",
};

const userBubbleStyle: React.CSSProperties = {
  background: "#173b43",
  color: "#d5f3f1",
  padding: "8px 12px",
  borderRadius: "12px 12px 2px 12px",
  maxWidth: 520,
  fontSize: 14,
  lineHeight: 1.5,
};

const messageImageStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: 6,
  objectFit: "cover",
};

const assistantBubbleStyle: React.CSSProperties = {
  maxWidth: 680,
  width: "min(680px, 100%)",
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: 460,
  borderRadius: 8,
  display: "block",
  background: "#050607",
  border: "1px solid #25282e",
  cursor: "grab",
};

const videoActionsStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  display: "flex",
  gap: 4,
};

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.66)",
  border: "1px solid #363a42",
  borderRadius: 6,
  color: "#d4dae2",
  cursor: "pointer",
  fontSize: 12,
  padding: "4px 8px",
  lineHeight: 1,
};

const errorStyle: React.CSSProperties = {
  color: "#ee8b8b",
  fontSize: 13,
};

const downloadStatusStyle: React.CSSProperties = {
  color: "#83d7bf",
  fontSize: 11,
  marginTop: 4,
};

const inputAreaStyle: React.CSSProperties = {
  borderTop: "1px solid #24272c",
  padding: "10px 16px 12px",
  background: "#17191d",
  flexShrink: 0,
};

const inputRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 8,
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  background: "#1f2228",
  border: "1px solid #2d3138",
  borderRadius: 8,
  color: "#e8e8e8",
  fontSize: 14,
  padding: "8px 12px",
  resize: "none",
  outline: "none",
  lineHeight: 1.5,
};

const sendBtnStyle: React.CSSProperties = {
  background: "#0f766e",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 18px",
  height: 52,
  minWidth: 92,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const attachBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #2d3138",
  borderRadius: 8,
  color: "#b2b8c0",
  cursor: "pointer",
  fontSize: 12,
  padding: "8px 10px",
  height: 52,
  minWidth: 58,
};

const imageInputStripStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 8,
  padding: "8px 16px",
  background: "#15181c",
  borderTop: "1px solid #24272c",
  flexShrink: 0,
};

const dropZoneStyle: React.CSSProperties = {
  minHeight: 74,
  border: "1px dashed #343941",
  borderRadius: 8,
  padding: 8,
  cursor: "pointer",
  background: "#111418",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const dropZoneHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: "#c7d0dc",
  fontSize: 12,
  fontWeight: 600,
};

const dropZoneEmptyStyle: React.CSSProperties = {
  color: "#6f7682",
  fontSize: 12,
};

const smallTextButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#8bd4c7",
  cursor: "pointer",
  fontSize: 11,
  padding: 0,
};

const imageChipListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const imageChipStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr) 16px",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  maxWidth: "100%",
  padding: "3px 5px",
  borderRadius: 6,
  background: "#1f2228",
  border: "1px solid #2d3138",
};

const imageChipImgStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 4,
  objectFit: "cover",
};

const imageChipNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11,
  color: "#d4dae2",
};

const chipRemoveStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#9aa0a6",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};

const settingsStripStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "8px 16px",
  borderTop: "1px solid #202329",
  background: "#14161a",
  flexShrink: 0,
  flexWrap: "wrap",
};

const settingLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6f7682",
  textTransform: "uppercase",
  letterSpacing: 0,
};

const settingDivider: React.CSSProperties = {
  width: 1,
  height: 28,
  background: "#24272c",
  flexShrink: 0,
};

const settingSelectStyle: React.CSSProperties = {
  background: "#1f2228",
  border: "1px solid #2d3138",
  borderRadius: 5,
  color: "#d4dae2",
  fontSize: 12,
  padding: "3px 6px",
  cursor: "pointer",
};

const toggleBtnStyle: React.CSSProperties = {
  border: "1px solid #2d3138",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 12,
  padding: "3px 10px",
};

const negativeInputStyle: React.CSSProperties = {
  background: "#1f2228",
  border: "1px solid #2d3138",
  borderRadius: 5,
  color: "#d4dae2",
  fontSize: 12,
  padding: "4px 6px",
  outline: "none",
  width: 260,
};

const selectStyle: React.CSSProperties = {
  background: "#1f2228",
  border: "1px solid #2d3138",
  borderRadius: 6,
  color: "#d4dae2",
  fontSize: 12,
  padding: "4px 8px",
  maxWidth: 260,
};

const spinnerStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  border: "2px solid rgba(255,255,255,0.18)",
  borderTopColor: "#d9fffb",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
  display: "inline-block",
};
