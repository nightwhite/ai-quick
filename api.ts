import type {
  AppSettings,
  ClientSettings,
  Message,
  MessagePart,
  ProviderId,
} from "./types";

const IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_GEMINI_BASE =
  (import.meta.env.VITE_GEMINI_BASE_URL as string | undefined) ||
  "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || "";

const normalizeGeminiBaseUrl = (baseUrl: string) => {
  const trimmed = trimBaseUrl(baseUrl).trim();
  if (!trimmed) return trimmed;
  // 允许用户传入 https://host 或 https://host/，这里自动补齐 v1beta。
  if (/\/v1beta(\/|$)/.test(trimmed) || /\/v1(\/|$)/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/v1beta`;
};

const VIDEO_MODELS: Record<ProviderId, string | undefined> = {
  nano_banana_pro: undefined,
  veo: "veo_3_1",
  sora: "sora-2",
};

const VIDEO_DURATION_OPTIONS: Record<ProviderId, number[] | undefined> = {
  nano_banana_pro: undefined,
  // 注意：Veo 的时长由具体 model 决定（部分 model 固定时长）
  veo: undefined,
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

const trimBaseUrl = (url: string) => url.replace(/\/+$/, "");

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

const getAllowedVideoDurations = (
  provider: ProviderId,
  model?: string,
  hasReferenceImage?: boolean,
): number[] | undefined => {
  if (provider === "veo") {
    // 需求：veo_3_1 与 veo_3_1-fast 仅在有参考图时强制 8s
    if (
      hasReferenceImage &&
      (model === "veo_3_1" || model === "veo_3_1-fast")
    )
      return [8];
    // 其它 Veo 模型暂按原有范围
    return [2, 4, 6, 8, 10, 15];
  }
  return VIDEO_DURATION_OPTIONS[provider];
};

const clampDuration = (
  provider: ProviderId,
  seconds: number | string,
  model?: string,
  hasReferenceImage?: boolean,
) => {
  const allowed = getAllowedVideoDurations(provider, model, hasReferenceImage);
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
    return [
      {
        type: "text",
        content: `视频生成失败：${payload?.error || payload?.message || status}`,
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
  jobId: string;
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

export interface RemixJobCreated {
  jobId: string;
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
    `${baseUrl}/models/${IMAGE_MODEL}:generateContent`,
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
) => {
  const provider = settings.provider;
  const model = settings.videoModel || VIDEO_MODELS[provider];
  if (!model) {
    throw new Error("当前模型不支持视频生成功能。");
  }

  const { baseUrl, apiKey } = ensureVideoConfig(clientSettings, provider);

  const prompt =
    currentParts.find((p) => p.type === "text")?.content?.trim() || "";
  const imageParts = currentParts.filter((p) => p.type === "image");
  const hasReferenceImage = imageParts.length > 0;

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append(
    "seconds",
    clampDuration(
      provider,
      settings.videoDurationSeconds,
      model,
      hasReferenceImage,
    ),
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

export const createSoraRemixJob = async (
  jobId: string,
  prompt: string,
  clientSettings: ClientSettings,
): Promise<RemixJobCreated> => {
  const { baseUrl, apiKey } = ensureVideoConfig(clientSettings, "sora");
  if (!prompt.trim()) {
    throw new Error("请填写 Remix 提示词。");
  }

  const res = await fetch(
    `${baseUrl}/v1/videos/${encodeURIComponent(jobId)}/remix`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`创建 Remix 任务失败：${res.status} - ${text}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!data?.id) {
    throw new Error("Remix 任务创建成功，但未返回 id。");
  }
  return { jobId: data.id };
};

export const getVideoJobStatus = async (
  jobId: string,
  provider: ProviderId,
  clientSettings: ClientSettings,
) => {
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
