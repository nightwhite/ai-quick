import React, { useEffect, useMemo } from "react";
import {
  Settings,
  Image as ImageIcon,
  AlertCircle,
  Trash2,
  Video as VideoIcon,
  SlidersHorizontal,
} from "lucide-react";
import type { ProviderId, SidebarProps } from "./types";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  MODEL_NAME,
  VEO_MODEL_NAME,
} from "./config";
import { getEffectiveProviderConfig } from "./clientSettings";

export const Sidebar: React.FC<SidebarProps> = ({
  settings,
  setSettings,
  onClear,
  capabilities,
  onOpenSettings,
  clientSettings,
  uploadImages,
}) => {
  const isImageProvider = settings.provider === "nano_banana_pro";
  const isVideoProvider =
    settings.provider === "veo" || settings.provider === "sora";
  const VEO_MODELS = [
    { key: "veo_3_1", label: "veo_3_1", durations: [4, 6, 8] },
    { key: "veo_3_1-fast", label: "veo_3_1-fast", durations: [4, 6, 8] },
    { key: "veo_3_1-fl", label: "veo_3_1-fl", durations: [4, 6, 8] },
    { key: "veo_3_1-fast-fl", label: "veo_3_1-fast-fl", durations: [4, 6, 8] },
  ];

  const ORIENTATION_OPTIONS = [
    { label: "横屏 16:9", value: "1280x720", ratio: "16:9" as const },
    { label: "竖屏 9:16", value: "720x1280", ratio: "9:16" as const },
  ];

  const hasReferenceImage = useMemo(
    () => Boolean(uploadImages.primary || uploadImages.secondary),
    [uploadImages.primary, uploadImages.secondary],
  );

  const getDurationOptions = (provider: ProviderId, modelKey?: string) => {
    if (provider === "sora") return [10, 15];

    if (provider === "veo") {
      // 需求：veo_3_1 与 veo_3_1-fast 在“有参考图”时强制 8s
      if (
        hasReferenceImage &&
        (modelKey === "veo_3_1" || modelKey === "veo_3_1-fast")
      )
        return [8];

      return (
        VEO_MODELS.find((m) => m.key === (modelKey || settings.videoModel))
          ?.durations || [4, 6, 8]
      );
    }

    return [4, 6, 8];
  };
  const durationOptions = getDurationOptions(
    settings.provider,
    settings.videoModel,
  );

  useEffect(() => {
    // 若用户上传/清空参考图导致“允许时长”发生变化，自动把当前时长纠正为合法值
    if (!isVideoProvider) return;
    const allowed = getDurationOptions(settings.provider, settings.videoModel);
    if (allowed.length === 0) return;
    if (!allowed.includes(settings.videoDurationSeconds)) {
      setSettings({ ...settings, videoDurationSeconds: allowed[0] });
    }
  }, [
    hasReferenceImage,
    isVideoProvider,
    settings,
    setSettings,
  ]);

  const handleProviderChange = (next: ProviderId) => {
    const durations = getDurationOptions(next, settings.videoModel);
    const safeDuration = durations.includes(settings.videoDurationSeconds)
      ? settings.videoDurationSeconds
      : durations[0];
    const defaultModel =
      next === "veo"
        ? VEO_MODELS[0].key
        : next === "sora"
          ? "sora2"
          : settings.videoModel;
    setSettings({
      ...settings,
      provider: next,
      videoDurationSeconds: safeDuration,
      videoModel: defaultModel,
    });
  };

  const effectiveImage = getEffectiveProviderConfig(
    clientSettings,
    "nano_banana_pro",
  );
  const hasEffectiveImageKey = Boolean(effectiveImage.apiKey);

  const effectiveCurrent = getEffectiveProviderConfig(
    clientSettings,
    settings.provider,
  );
  const hasEffectiveVideoApi = Boolean(effectiveCurrent.baseUrl);

  const modeReady = isImageProvider
    ? capabilities?.image !== false || hasEffectiveImageKey
    : capabilities?.video !== false || hasEffectiveVideoApi;

  return (
    <div className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full shrink-0">
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-yellow-500" />
            图像/视频生成
          </h1>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 border border-neutral-700 transition-colors"
            title="设置"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
        <div className="text-xs text-neutral-500 mt-1 font-mono">
          {isImageProvider
            ? MODEL_NAME
            : settings.provider === "veo"
              ? VEO_MODEL_NAME
              : "sora2"}
        </div>
        {!modeReady && (
          <div className="mt-3 text-xs text-red-300 bg-red-950/30 border border-red-900/40 rounded-lg p-2">
            {isImageProvider
              ? "图片未配置：请点击右上角「设置」填写 Nano Banana Pro 的 API Key（或配置服务端密钥）。"
              : "视频未配置：请点击右上角「设置」填写对应的视频 API Base URL（或配置服务端 Vertex AI）。"}
          </div>
        )}
      </div>

      <div className="p-6 flex-1 overflow-y-auto space-y-8">
        {/* 模式 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Settings className="w-4 h-4" />
            模型
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => handleProviderChange("nano_banana_pro")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                settings.provider === "nano_banana_pro"
                  ? "bg-yellow-600 text-white shadow-lg shadow-yellow-900/20"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Nano Banana Pro（生图/修图）
            </button>
            <button
              onClick={() => handleProviderChange("veo")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                settings.provider === "veo"
                  ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
              }`}
            >
              <VideoIcon className="w-4 h-4" />
              Veo（视频）
            </button>
            <button
              onClick={() => handleProviderChange("sora")}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                settings.provider === "sora"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-900/20"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
              }`}
            >
              <VideoIcon className="w-4 h-4" />
              Sora（视频）
            </button>
          </div>
        </div>

        {/* 配置 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Settings className="w-4 h-4" />
            配置
          </div>

          <div className="space-y-3">
            {isImageProvider ? (
              <>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">
                    分辨率
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {RESOLUTIONS.map((res) => (
                      <button
                        key={res}
                        onClick={() =>
                          setSettings({ ...settings, resolution: res })
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          settings.resolution === res
                            ? "bg-yellow-600 text-white shadow-lg shadow-yellow-900/20"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
                        }`}
                      >
                        {res}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">
                    画幅比例
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {ASPECT_RATIOS.map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() =>
                          setSettings({ ...settings, aspectRatio: ratio })
                        }
                        className={`px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                          settings.aspectRatio === ratio
                            ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">
                    尺寸 / 方向
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ORIENTATION_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            videoSize: option.value,
                            videoAspectRatio: option.ratio,
                          })
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          settings.videoSize === option.value
                            ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {settings.provider === "veo" && (
                  <div>
                    <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">
                      Veo 模型
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {VEO_MODELS.map((model) => (
                        <button
                          key={model.key}
                          onClick={() =>
                            setSettings({
                              ...settings,
                              videoModel: model.key,
                              videoDurationSeconds: getDurationOptions(
                                "veo",
                                model.key,
                              )[0],
                            })
                          }
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                            settings.videoModel === model.key
                              ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20"
                              : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
                          }`}
                        >
                          {model.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">
                    时长
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {getDurationOptions(
                      settings.provider,
                      settings.videoModel,
                    ).map((sec) => (
                      <button
                        key={sec}
                        onClick={() =>
                          setSettings({
                            ...settings,
                            videoDurationSeconds: sec,
                          })
                        }
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          settings.videoDurationSeconds === sec
                            ? "bg-orange-600 text-white shadow-lg shadow-orange-900/20"
                            : "bg-neutral-800 text-neutral-400 hover:bg-neutral-750 hover:text-neutral-200"
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 清空对话 */}
      <div className="p-4 border-t border-neutral-800">
        <button
          onClick={onClear}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-red-900/30 text-neutral-400 hover:text-red-400 rounded-lg transition-colors text-sm font-medium group"
        >
          <Trash2 className="w-4 h-4 group-hover:text-red-400 transition-colors" />
          清空对话
        </button>
      </div>
    </div>
  );
};
