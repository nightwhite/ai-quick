import type {
  AppSettings,
  ClientSettings,
  Message,
  MessagePart,
  ProviderId,
} from "./types";

const IMAGE_MODEL = "gemini-3-pro-image-preview";
const IMAGE_MODEL_4K = "gemini-3-pro-image-preview-4k";
const DEFAULT_VEO_PORTRAIT_MODEL = "veo_3_1-portrait";
const DEFAULT_VEO_LANDSCAPE_MODEL = "veo_3_1-landscape";
const DEFAULT_GEMINI_BASE =
  (import.meta.env.VITE_GEMINI_BASE_URL as string | undefined) ||
  "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || "";

const trimBaseUrl = (url: string) => url.replace(/\/+$/, "");

const normalizeGeminiBaseUrl = (baseUrl: string) => {
  const trimmed = trimBaseUrl(baseUrl).trim();
  if (!trimmed) return trimmed;
  // 允许用户传入 https://host 或 https://host/；如果未包含 v1/v1beta 则自动补齐 v1beta
  if (/\/v1beta(\/|$)/.test(trimmed) || /\/v1(\/|$)/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1beta`;
};

const VIDEO_MODELS: Record<ProviderId, string | undefined> = {
  nano_banana_pro: undefined,
  veo: DEFAULT_VEO_PORTRAIT_MODEL,
  sora: "sora-2-hd",
};

const VIDEO_DURATION_OPTIONS: Record<ProviderId, number[] | undefined> = {
  nano_banana_pro: undefined,
  veo: [2, 4, 6, 8, 10, 15],
  sora: [10, 15],
};

const VIDEO_PENDING_STATES = [
  "queued",
  "pending",
  "processing",
  "running",
  "generating",
  "in_progress",
];

const ensureVideoConfig = (
  clientSettings: ClientSettings,
  provider: ProviderId,
) => {
  const shared = clientSettings?.shared || { baseUrl: "", apiKey: "" };
  const providerCfg = clientSettings?.providers?.[provider] || {
    baseUrl: "",
    apiKey: "",
  };
  const baseUrl = trimBaseUrl(
    providerCfg.baseUrl || shared.baseUrl || "",
  ).trim();
  const apiKey = (providerCfg.apiKey || shared.apiKey || "").trim();

  if (!baseUrl || !apiKey) {
    throw new Error(
      "请在设置中为当前视频模型填写 Base URL 和 API Token（前端直连模式）。",
    );
  }

  return { baseUrl, apiKey };
};

const clampDuration = (provider: ProviderId, seconds: number | string) => {
  const allowed = VIDEO_DURATION_OPTIONS[provider];
  if (!allowed) return String(seconds || 10);
  const numeric = Number(seconds) || allowed[0];
  return String(allowed.includes(numeric) ? numeric : allowed[0]);
};

const MAX_HISTORY_ROUNDS = 10;
const MAX_HISTORY_MESSAGES = MAX_HISTORY_ROUNDS * 2;

const parseImageResponse = (response: any): GenerateImageResult => {
  const generatedParts: MessagePart[] = [];
  let imageCount = 0;

  const rawParts = response?.candidates?.[0]?.content?.parts || [];

  for (const part of rawParts) {
    if (
      part?.thought ||
      (part && typeof part === "object" && "thought" in part)
    )
      continue;

    if (part?.inlineData) {
      generatedParts.push({
        type: "image",
        content: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      });
      imageCount++;
    } else if (part?.text) {
      generatedParts.push({ type: "text", content: part.text });
    }
  }

  if (generatedParts.length === 0) {
    generatedParts.push({ type: "text", content: "（未生成可显示内容）" });
  }

  return {
    parts: generatedParts,
    rawParts,
    imageCount,
    usageMetadata: response?.usageMetadata,
  };
};

const findRecentImagePart = (messages: Message[]): MessagePart | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const part = msg.parts.find((p) => p.type === "image");
    if (part) return part;
  }
  return null;
};

const parseVeoTextToParts = (fullText: string): MessagePart[] => {
  const parts: MessagePart[] = [];
  const urlMatch = fullText.match(/https?:\/\/[^\s)\]]+/);
  if (urlMatch) {
    parts.push({
      type: "video",
      source: "url",
      content: urlMatch[0],
      mimeType: "video/mp4",
    });
  }

  const cleanedText = fullText.trim();
  if (cleanedText) {
    parts.push({ type: "text", content: cleanedText });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content: "任务完成，但未解析到内容。" });
  }

  return parts;
};

const pickVeoModel = (settings: AppSettings) => {
  if (settings.videoModel) return settings.videoModel;
  return settings.videoAspectRatio === "9:16"
    ? DEFAULT_VEO_PORTRAIT_MODEL
    : DEFAULT_VEO_LANDSCAPE_MODEL;
};

const buildVeoUserContent = (currentParts: MessagePart[]) => {
  const content: any[] = [];
  const textParts = currentParts.filter((p) => p.type === "text");
  const imageParts = currentParts.filter((p) => p.type === "image");

  if (textParts.length > 0) {
    for (const part of textParts) {
      content.push({ type: "text", text: part.content });
    }
  }

  for (const part of imageParts) {
    const url = part.content.includes("base64,")
      ? part.content
      : `data:${part.mimeType || "image/png"};base64,${part.content}`;
    content.push({
      type: "image_url",
      image_url: { url },
    });
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "请根据上下文生成视频。" });
  }

  return content;
};

const readVeoStream = async (
  res: Response,
  onDelta?: (text: string) => void,
) => {
  if (!res.body) {
    throw new Error("Veo 接口未返回可读取的流。");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const dataStr = line.replace(/^data:\s*/, "");
      if (dataStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed?.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          onDelta?.(content);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return content;
};

const buildHistoryContents = (
  historyMessages: Message[],
  currentParts: MessagePart[],
) => {
  const recentMessages = historyMessages.slice(-MAX_HISTORY_MESSAGES);
  const historyContents: any[] = recentMessages
    .map((msg) => {
      if (msg.role === "model") {
        if (msg.rawParts && msg.rawParts.length > 0) {
          return { role: "model", parts: msg.rawParts };
        }
        return {
          role: "model",
          parts: [{ text: "图片已根据上一轮请求生成。" }],
        };
      }

      const textParts = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => ({ text: p.content }));
      if (textParts.length === 0) return null;
      return { role: "user", parts: textParts };
    })
    .filter(Boolean);

  const userHasImage = currentParts.some((p) => p.type === "image");
  const baseImagePart = !userHasImage
    ? findRecentImagePart(historyMessages)
    : null;

  const currentContentParts: any[] = [];
  if (baseImagePart) {
    const base64Data = baseImagePart.content.includes("base64,")
      ? baseImagePart.content.split("base64,")[1]
      : baseImagePart.content;
    currentContentParts.push({
      inlineData: {
        mimeType: baseImagePart.mimeType || "image/png",
        data: base64Data,
      },
    });
  }
  for (const part of currentParts) {
    if (part.type === "text") {
      currentContentParts.push({ text: part.content });
    } else if (part.type === "image") {
      const data = part.content.includes("base64,")
        ? part.content.split("base64,")[1]
        : part.content;
      currentContentParts.push({
        inlineData: {
          mimeType: part.mimeType || "image/png",
          data,
        },
      });
    }
  }

  if (currentContentParts.length === 0) {
    currentContentParts.push({ text: "继续优化上一张图片。" });
  }

  historyContents.push({ role: "user", parts: currentContentParts });
  return historyContents;
};

const findValueByKeys = (obj: any, keys: string[]) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
};

const extractVideoUrl = (payload: any) => {
  const direct = findValueByKeys(payload, [
    "video_url",
    "url",
    "output_url",
    "result_url",
  ]);
  if (direct) return direct;

  if (typeof payload?.video === "string") return payload.video;
  if (typeof payload?.output === "string") return payload.output;

  const candidates = payload?.videos || payload?.outputs || payload?.results;
  if (Array.isArray(candidates)) {
    for (const item of candidates) {
      if (typeof item === "string" && item) return item;
      const url = findValueByKeys(item || {}, ["video_url", "url"]);
      if (url) return url;
    }
  }

  if (typeof payload?.output === "object" && payload.output) {
    return findValueByKeys(payload.output, ["video_url", "url"]);
  }

  return null;
};

const extractVideoBase64 = (payload: any) => {
  const value = findValueByKeys(payload, ["video_base64", "base64", "content"]);
  if (value) return value;
  if (payload?.video && typeof payload.video === "object") {
    return findValueByKeys(payload.video, [
      "video_base64",
      "base64",
      "content",
    ]);
  }
  return null;
};

const buildVideoPartsFromPayload = (payload: any): MessagePart[] => {
  const status = (payload?.status || "").toString().toLowerCase();
  if (status && ["failed", "error", "cancelled"].includes(status)) {
    const err = payload?.error;
    const errMessage =
      typeof err === "string"
        ? err
        : typeof err?.message === "string"
          ? err.message
          : undefined;
    const errCode =
      typeof err === "object" && typeof err?.code === "string"
        ? err.code
        : undefined;
    const fallbackMessage =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : status;
    const display =
      errMessage && errCode ? `${errMessage}（${errCode}）` : errMessage || errCode || fallbackMessage;
    return [
      {
        type: "text",
        content: `视频生成失败：${display}`,
      },
    ];
  }

  const url = extractVideoUrl(payload);
  if (url) {
    return [
      {
        type: "video",
        source: "url",
        content: url,
        mimeType: "video/mp4",
      },
    ];
  }

  const base64 = extractVideoBase64(payload);
  if (base64) {
    return [
      {
        type: "video",
        source: "base64",
        content: base64,
        mimeType: "video/mp4",
      },
    ];
  }

  return [
    {
      type: "text",
      content: `任务完成，但未找到可展示视频：\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
    },
  ];
};

export interface GenerateImageResult {
  parts: MessagePart[];
  rawParts?: any[];
  imageCount: number;
  usageMetadata?: any;
}

export interface VideoJobCreated {
  jobId?: string;
  done?: boolean;
  parts?: MessagePart[];
  raw?: any;
}

export interface VideoJobStatus {
  jobId: string;
  done: boolean;
  error?: string;
  parts?: MessagePart[];
  raw?: any;
  status?: string;
  progress?: number;
}

export const getHealth = async () => {
  return {
    image: { enabled: true },
    video: { enabled: true },
  };
};

export const generateImageContent = async (
  historyMessages: Message[],
  currentParts: MessagePart[],
  settings: AppSettings,
  clientSettings: ClientSettings,
) => {
  const shared = clientSettings?.shared || { baseUrl: "", apiKey: "" };
  const providerCfg = clientSettings?.providers?.nano_banana_pro || {
    baseUrl: "",
    apiKey: "",
  };

  const apiKey = (
    providerCfg.apiKey ||
    shared.apiKey ||
    DEFAULT_GEMINI_KEY
  ).trim();
  const baseUrl = normalizeGeminiBaseUrl(
    providerCfg.baseUrl || shared.baseUrl || DEFAULT_GEMINI_BASE,
  );

  if (!apiKey) {
    throw new Error(
      "图片生成未配置：请在「设置」中填写 Nano Banana Pro 的 API Key。",
    );
  }

  const historyContents = buildHistoryContents(historyMessages, currentParts);
  const requestBody = {
    contents: historyContents,
    generationConfig: {
      responseModalities: ["image"],
      imageConfig: {
        aspectRatio: settings.aspectRatio,
        imageSize: settings.resolution,
      },
    },
  };

  const response = await fetch(
    `${baseUrl}/models/${
      settings.resolution === "4K" ? IMAGE_MODEL_4K : IMAGE_MODEL
    }:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`图片生成失败：${response.status} - ${text}`);
  }

  const data = await response.json();
  return parseImageResponse(data);
};

export const createVideoJob = async (
  _historyMessages: Message[],
  currentParts: MessagePart[],
  settings: AppSettings,
  clientSettings: ClientSettings,
  onStreamText?: (text: string) => void,
) => {
  const provider = settings.provider;
  if (provider === "veo") {
    const { baseUrl, apiKey } = ensureVideoConfig(clientSettings, provider);
    const model = pickVeoModel(settings);
    const userContent = buildVeoUserContent(currentParts);

    const messages: any[] = [{ role: "user", content: userContent }];

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`创建视频任务失败：${res.status} - ${text}`);
    }

    const streamedText = await readVeoStream(res, onStreamText);
    const parts = parseVeoTextToParts(streamedText);
    return {
      jobId: undefined,
      done: true,
      parts,
      raw: streamedText,
    };
  }

  const model = settings.videoModel || VIDEO_MODELS[provider];
  if (!model) {
    throw new Error("当前模型不支持视频生成功能。");
  }

  const { baseUrl, apiKey } = ensureVideoConfig(clientSettings, provider);

  const prompt =
    currentParts.find((p) => p.type === "text")?.content?.trim() || "";
  const imageParts = currentParts.filter((p) => p.type === "image");

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append(
    "seconds",
    clampDuration(provider, settings.videoDurationSeconds),
  );
  const size =
    settings.videoSize ||
    (settings.videoAspectRatio === "9:16" ? "720x1280" : "1280x720");
  if (size) {
    formData.append("size", size);
  }
  formData.append("ratio", settings.videoAspectRatio);

  for (const part of imageParts) {
    const blob = (() => {
      const content = part.content.includes("base64,")
        ? part.content
        : `data:${part.mimeType || "image/png"};base64,${part.content}`;
      const [meta, base64] = content.split(",");
      const mimeMatch = meta.match(/data:(.*);base64/);
      const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    })();
    formData.append("input_reference", blob, "reference" + imageParts.indexOf(part));
  }

  const res = await fetch(`${baseUrl}/v1/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`创建视频任务失败：${res.status} - ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!data?.id) {
    throw new Error("视频任务创建成功，但未返回 id。");
  }
  return { jobId: data.id };
};

export const getVideoJobStatus = async (
  jobId: string,
  provider: ProviderId,
  clientSettings: ClientSettings,
) => {
  if (provider === "veo") {
    return {
      jobId,
      done: true,
      error: "Veo 新接口为即时返回，无需轮询。",
    };
  }

  const { baseUrl, apiKey } = ensureVideoConfig(clientSettings, provider);

  const res = await fetch(`${baseUrl}/v1/videos/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`查询视频任务失败：${res.status} - ${text}`);
  }

  const payload = await res.json().catch(() => ({}));
  const status = (payload?.status || "").toString().toLowerCase();
  const done = !VIDEO_PENDING_STATES.includes(status);

  return {
    jobId,
    done,
    parts: done ? buildVideoPartsFromPayload(payload) : undefined,
    raw: payload,
    status: payload?.status,
    progress:
      typeof payload?.progress === "number" ? payload.progress : undefined,
  };
};
