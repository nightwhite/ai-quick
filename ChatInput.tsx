
import React, { useRef, useState } from "react";
import { Send, Paperclip, X } from "lucide-react";
import type { ProviderId, UploadImages } from "./types";

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  isLoading: boolean;
  provider: ProviderId;
  uploadImages: UploadImages;
  setUploadImages: (updater: (prev: UploadImages) => UploadImages) => void;
  videoModel: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  isLoading,
  provider,
  uploadImages,
  setUploadImages,
  videoModel,
}) => {
  const singleFileInputRef = useRef<HTMLInputElement>(null);
  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<"primary" | "secondary" | null>(
    null,
  );

  const isVeoF1Model =
    provider === "veo" && typeof videoModel === "string" && videoModel.includes("f1");
  const allowDualVeoImages = provider === "veo";
  const hasAnyImage = Boolean(uploadImages.primary || uploadImages.secondary);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const setSlotImage = (
    slot: "primary" | "secondary",
    dataUrl: string,
    mimeType: string,
  ) => {
    setUploadImages((prev) => ({
      ...prev,
      [slot]: {
        data: dataUrl,
        mimeType,
      },
    }));
  };

  const processFile = (file: File, slot?: "primary" | "secondary") => {
    if (file.size > 5 * 1024 * 1024) {
      alert("图片太大，请选择 5MB 以内的图片。");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const targetSlot =
          slot ||
          (allowDualVeoImages
            ? activeSlot || (uploadImages.primary ? "secondary" : "primary")
            : "primary");
        setSlotImage(targetSlot, event.target.result as string, file.type);
        setActiveSlot(targetSlot);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    slot?: "primary" | "secondary",
  ) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0], slot);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const targetSlot =
            allowDualVeoImages
              ? activeSlot || (uploadImages.primary ? "secondary" : "primary")
              : "primary";
          processFile(file, targetSlot);
        }
        return;
      }
    }
  };

  const clearImage = (slot: "primary" | "secondary") => {
    setUploadImages((prev) => ({
      ...prev,
      [slot]: null,
    }));
    if (slot === "primary" && singleFileInputRef.current) {
      singleFileInputRef.current.value = "";
    }
    if (slot === "primary" && primaryInputRef.current) {
      primaryInputRef.current.value = "";
    }
    if (slot === "secondary" && secondaryInputRef.current) {
      secondaryInputRef.current.value = "";
    }
  };

  const renderSinglePreview = () => {
    if (!uploadImages.primary) return null;
    return (
      <div className="mb-3 flex items-start">
        <div className="relative group">
          <img
            src={uploadImages.primary.data}
            alt="上传预览"
            className="h-20 w-auto rounded-lg border border-neutral-700 object-cover"
          />
          <button
            onClick={() => clearImage("primary")}
            className="absolute -top-2 -right-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-full p-1 border border-neutral-600 shadow-lg transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  const renderDualSlots = () => {
    const slots: Array<{ key: "primary" | "secondary"; label: string }> = [
      { key: "primary", label: "首帧" },
      { key: "secondary", label: "尾帧" },
    ];

    return (
      <div className="mb-4 grid grid-cols-2 gap-3">
        {slots.map((slotInfo) => {
          const data = uploadImages[slotInfo.key];
          return (
            <div
              key={slotInfo.key}
              className={`border-2 rounded-xl p-2 relative cursor-pointer transition-all ${
                activeSlot === slotInfo.key
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-neutral-700 hover:border-neutral-500"
              }`}
              onClick={() => setActiveSlot(slotInfo.key)}
            >
              <div className="text-xs text-neutral-400 mb-1 flex justify-between items-center">
                <span>{slotInfo.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    slotInfo.key === "primary"
                      ? primaryInputRef.current?.click()
                      : secondaryInputRef.current?.click()
                  }
                  className="px-2 py-0.5 bg-neutral-800 rounded-md border border-neutral-700 text-[11px]"
                >
                  上传
                </button>
              </div>
              {data ? (
                <div className="relative">
                  <img
                    src={data.data}
                    alt="上传预览"
                    className="h-28 w-full object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => clearImage(slotInfo.key)}
                    className="absolute -top-2 -right-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-full p-1 border border-neutral-600 shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="h-28 flex flex-col items-center justify-center text-neutral-500 text-xs border border-dashed border-neutral-700 rounded-lg">
                  <Paperclip className="w-4 h-4 mb-1" />
                  <span>拖拽 / 粘贴图片到此</span>
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                ref={slotInfo.key === "primary" ? primaryInputRef : secondaryInputRef}
                onChange={(e) => handleFileSelect(e, slotInfo.key)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderImageSection = () => {
    if (provider === "veo") {
      return renderDualSlots();
    }
    return renderSinglePreview();
  };

  const buildPlaceholder = () => {
    if (provider === "nano_banana_pro") {
      return uploadImages.primary
        ? "描述你想如何修改这张图..."
        : "描述你想生成的图片...（支持粘贴图片）";
    }
    if (provider === "veo") {
      return uploadImages.primary || uploadImages.secondary
        ? "描述基于参考图的镜头/运动..."
        : "描述你想生成的视频...（可粘贴多张参考图）";
    }
    return "描述你想生成的视频...";
  };

  return (
    <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
      <div className="max-w-4xl mx-auto relative">
        {renderImageSection()}

        <div className="relative flex items-end gap-2">
          {provider !== "veo" && (
            <>
              <input
                type="file"
                ref={singleFileInputRef}
                onChange={(e) => handleFileSelect(e, "primary")}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />

              <button
                onClick={() => singleFileInputRef.current?.click()}
                disabled={isLoading}
                className="p-3 bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 rounded-xl transition-colors mb-0.5 border border-neutral-700"
                title="上传参考图片"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            </>
          )}

          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={buildPlaceholder()}
              className="w-full bg-neutral-800 text-white rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none h-[52px] max-h-32 scrollbar-hide border border-neutral-700 placeholder-neutral-500"
              disabled={isLoading}
            />
            <button
              onClick={onSend}
              disabled={
                (!input.trim() && !hasAnyImage) ||
                (isVeoF1Model && (!uploadImages.primary || !uploadImages.secondary)) ||
                isLoading
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto mt-2 text-center">
        <p className="text-[10px] text-neutral-500">
          {provider === "nano_banana_pro"
            ? "使用 Nano Banana Pro（Gemini）生成图片。"
            : provider === "veo"
              ? "使用 Veo 生成视频（支持参考图/首尾帧）。"
              : "使用 Sora 生成视频（需填写分辨率与比例）。"}
        </p>
      </div>
    </div>
  );
};
