import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Sidebar } from "./Sidebar";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import type {
  AppSettings,
  ClientSettings,
  Message,
  MessagePart,
  ProviderId,
  UploadImages,
} from "./types";
import {
  createVideoJob,
  generateImageContent,
  getHealth,
  getVideoJobStatus,
  createSoraRemixJob,
} from "./api";
import { SettingsModal } from "./SettingsModal";
import {
  getDefaultClientSettings,
  getEffectiveProviderConfig,
  loadClientSettings,
  saveClientSettings,
} from "./clientSettings";

const App = () => {
  const [input, setInput] = useState("");
  const [messagesByProvider, setMessagesByProvider] = useState<
    Record<ProviderId, Message[]>
  >({
    nano_banana_pro: [],
    veo: [],
    sora: [],
  });
  const [loadingByProvider, setLoadingByProvider] = useState<
    Record<ProviderId, boolean>
  >({
    nano_banana_pro: false,
    veo: false,
    sora: false,
  });
  const [capabilities, setCapabilities] = useState<{
    image: boolean;
    video: boolean;
  } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientSettings, setClientSettings] = useState<ClientSettings>(() =>
    loadClientSettings(),
  );

  // 图片上传状态
  const [uploadImages, setUploadImages] = useState<UploadImages>({
    primary: null,
    secondary: null,
  });

  // 配置
  const [settings, setSettings] = useState<AppSettings>({
    provider: "nano_banana_pro",
    aspectRatio: "16:9",
    resolution: "1K",
    videoAspectRatio: "16:9",
    videoDurationSeconds: 10,
    videoSize: "1280x720",
    videoModel: "veo_3_1",
  });
  const [remixLoadingJobId, setRemixLoadingJobId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const health = await getHealth();
        setCapabilities({
          image: !!health.image.enabled,
          video: !!health.video.enabled,
        });
      } catch (e) {
        console.error("健康检查失败", e);
        setCapabilities({ image: false, video: false });
      }
    })();
  }, []);

  useEffect(() => {
    saveClientSettings(clientSettings);
  }, [clientSettings]);

  const handleClear = () => {
    if (confirm("确定要清空当前模型的对话吗？这会重置该模型的对话上下文。")) {
      setMessagesByProvider((prev) => ({
        ...prev,
        [settings.provider]: [],
      }));
      // 这里不重置用量统计，便于用户看到本次会话累计消耗
    }
  };

  const currentProvider = settings.provider;
  const currentMessages = messagesByProvider[currentProvider];
  const currentLoading = loadingByProvider[currentProvider];

  const appendMessage = (
    provider: ProviderId,
    message: Message | ((prev: Message[]) => Message[]),
  ) => {
    setMessagesByProvider((prev) => {
      const prevMessages = prev[provider];
      const nextMessages =
        typeof message === "function"
          ? (message as (p: Message[]) => Message[])(prevMessages)
          : [...prevMessages, message];
      return { ...prev, [provider]: nextMessages };
    });
  };

  const setProviderLoading = (provider: ProviderId, value: boolean) => {
    setLoadingByProvider((prev) => ({ ...prev, [provider]: value }));
  };

  const isImageProvider = settings.provider === "nano_banana_pro";
  const isVideoProvider =
    settings.provider === "veo" || settings.provider === "sora";

  const handleSend = async () => {
    const provider = settings.provider;
    const hasAnyImage = Boolean(uploadImages.primary || uploadImages.secondary);
    if ((!input.trim() && !hasAnyImage) || loadingByProvider[provider])
      return;

    // 组装用户输入（文本 + 可选图片）
    const userParts: MessagePart[] = [];

    // 有图就带图
    const appendImagePart = (
      payload: { data: string; mimeType: string } | null,
    ) => {
      if (!payload) return;
      const hasPrefix = payload.data.includes("base64,");
      const base64 = hasPrefix ? payload.data.split("base64,")[1] : payload.data;
      userParts.push({
        type: "image",
        content: base64,
        mimeType: payload.mimeType,
      });
    }
    appendImagePart(uploadImages.primary);
    appendImagePart(uploadImages.secondary);
    // 有文字就带文字
    if (input.trim()) {
      userParts.push({ type: "text", content: input });
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      parts: userParts,
      timestamp: Date.now(),
    };

    appendMessage(provider, userMsg);
    setInput("");
    setUploadImages({ primary: null, secondary: null });

    const processResult = (result: any, wasRetried = false) => {
      const pTokens = result.usageMetadata?.promptTokenCount || 0;
      const cTokens = result.usageMetadata?.candidatesTokenCount || 0;

      // 若触发重试，追加一条系统提示
      const finalParts = [...result.parts];
      if (wasRetried) {
        finalParts.push({
          type: "text",
          content: "\n\n*(系统：检测到上下文损坏，已重置并重新生成本次回复)*",
        });
      }

      const modelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        parts: finalParts,
        rawParts: result.rawParts, // Store raw parts for history
        timestamp: Date.now(),
      };

      appendMessage(provider, modelMsg);
    };

    try {
      if (provider === "nano_banana_pro") {
        setProviderLoading(provider, true);
        const result = await generateImageContent(
          messagesByProvider[provider],
          userMsg.parts,
          settings,
          clientSettings,
        );
        processResult(result);
      } else {
        setProviderLoading(provider, true);
        const { jobId } = await createVideoJob(
          [],
          userMsg.parts,
          settings,
          clientSettings,
        );

        const statusMsg: Message = {
          id: `${jobId}-status`,
          role: "model",
          jobId,
          parts: [
            {
              type: "text",
              content: `已创建视频任务：\`${jobId}\`。正在生成中...`,
            },
          ],
          timestamp: Date.now(),
        };
        appendMessage(provider, statusMsg);

        // 轮询直到完成（MVP：前端简单轮询）
        let finished = false;
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((r) => setTimeout(r, 5000));
          const status = await getVideoJobStatus(
            jobId,
            provider,
            clientSettings,
          );
          if (!status.done) continue;

          const modelMsg: Message = {
            id: `${jobId}-result`,
            role: "model",
            jobId,
            parts: status.parts || [
              { type: "text", content: "（未返回视频）" },
            ],
            timestamp: Date.now(),
          };
          appendMessage(provider, modelMsg);
          finished = true;
          break;
        }

        if (!finished) {
          const timeoutMsg: Message = {
            id: `${jobId}-timeout`,
            role: "model",
            jobId,
            parts: [
              {
                type: "text",
                content: `视频任务仍在生成中。你可以稍后用 jobId 继续查询：\`${jobId}\`。`,
              },
            ],
            timestamp: Date.now(),
          };
          appendMessage(provider, timeoutMsg);
        }
      }
    } catch (error) {
      console.error("生成失败", error);

      const errorMessage = (error as Error).message || JSON.stringify(error);

      // Auto-recovery for corrupted history (image mode only)
      if (
        provider === "nano_banana_pro" &&
        errorMessage.includes("thought_signature")
      ) {
        console.warn(
          "检测到 thought_signature 错误，正在使用全新上下文重试...",
        );
        try {
          const retryResult = await generateImageContent(
            [],
            userMsg.parts,
            settings,
            clientSettings,
          );
          processResult(retryResult, true);
          setProviderLoading(provider, false);
          return;
        } catch (retryError) {
          console.error("重试失败", retryError);
        }
      }

      // If not caught by retry or retry failed
      const displayMsg: Message = {
        id: Date.now().toString(),
        role: "model",
        parts: [{ type: "text", content: `**错误：** ${errorMessage}` }],
        timestamp: Date.now(),
      };
      appendMessage(provider, displayMsg);
    } finally {
      setProviderLoading(provider, false);
    }
  };

  const handleSoraRemix = async (jobId: string) => {
    if (!jobId.startsWith("sora-2:")) {
      alert(
        `Remix 仅支持 Sora 2 任务（id 形如 sora-2:task_...）。\n当前任务 id：${jobId}\n\n请切换到 Sora 后重新生成一次视频（确保模型为 sora-2），再进行 Remix。`,
      );
      return;
    }

    const prompt = window.prompt("请输入 Remix 提示词", "");
    if (!prompt || !prompt.trim()) return;

    const userMsg: Message = {
      id: `${Date.now()}-remix-user`,
      role: "user",
      jobId,
      parts: [{ type: "text", content: `Remix：${prompt}` }],
      timestamp: Date.now(),
    };
    appendMessage("sora", userMsg);

    setRemixLoadingJobId(jobId);
    setProviderLoading("sora", true);

    try {
      const { jobId: newJobId } = await createSoraRemixJob(
        jobId,
        prompt,
        clientSettings,
      );

      const statusMsg: Message = {
        id: `${newJobId}-status`,
        role: "model",
        jobId: newJobId,
        parts: [
          {
            type: "text",
            content: `已创建 Remix 任务：\`${newJobId}\`，基于原始视频 \`${jobId}\`。正在生成中...`,
          },
        ],
        timestamp: Date.now(),
      };
      appendMessage("sora", statusMsg);

      let finished = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const status = await getVideoJobStatus(
          newJobId,
          "sora",
          clientSettings,
        );
        if (!status.done) continue;

        const modelMsg: Message = {
          id: `${newJobId}-result`,
          role: "model",
          jobId: newJobId,
          parts: status.parts || [{ type: "text", content: "（未返回视频）" }],
          timestamp: Date.now(),
        };
        appendMessage("sora", modelMsg);
        finished = true;
        break;
      }

      if (!finished) {
        const timeoutMsg: Message = {
          id: `${newJobId}-timeout`,
          role: "model",
          jobId: newJobId,
          parts: [
            {
              type: "text",
              content: `Remix 任务仍在生成中。稍后可用 jobId 查询：\`${newJobId}\`。`,
            },
          ],
          timestamp: Date.now(),
        };
        appendMessage("sora", timeoutMsg);
      }
    } catch (error) {
      const errorMessage = (error as Error).message || JSON.stringify(error);
      const displayMsg: Message = {
        id: `${Date.now()}-remix-error`,
        role: "model",
        jobId,
        parts: [{ type: "text", content: `**Remix 错误：** ${errorMessage}` }],
        timestamp: Date.now(),
      };
      appendMessage("sora", displayMsg);
    } finally {
      setRemixLoadingJobId(null);
      setProviderLoading("sora", false);
    }
  };

  const isModeReady =
    settings.provider === "nano_banana_pro"
      ? capabilities?.image !== false ||
        Boolean(
          getEffectiveProviderConfig(clientSettings, "nano_banana_pro").apiKey,
        )
      : capabilities?.video !== false ||
        (settings.provider === "veo"
          ? Boolean(getEffectiveProviderConfig(clientSettings, "veo").baseUrl)
          : settings.provider === "sora"
            ? Boolean(
                getEffectiveProviderConfig(clientSettings, "sora").baseUrl,
              )
            : false);

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-200 overflow-hidden font-sans">
      <Sidebar
        settings={settings}
        setSettings={setSettings}
        onClear={handleClear}
        capabilities={capabilities}
        onOpenSettings={() => setIsSettingsOpen(true)}
        clientSettings={clientSettings}
        uploadImages={uploadImages}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <MessageList
          messages={currentMessages}
          isLoading={currentLoading}
          provider={currentProvider}
          onRemix={settings.provider === "sora" ? handleSoraRemix : undefined}
          remixingJobId={remixLoadingJobId}
        />
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={handleSend}
          isLoading={currentLoading || !isModeReady}
          provider={settings.provider}
          uploadImages={uploadImages}
          setUploadImages={setUploadImages}
          videoModel={settings.videoModel}
        />
      </div>

      <SettingsModal
        open={isSettingsOpen}
        value={clientSettings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(next) => setClientSettings(next)}
        onReset={() => setClientSettings(getDefaultClientSettings())}
      />
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
