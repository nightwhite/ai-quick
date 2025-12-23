export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export type ImageSize = "1K" | "2K" | "4K";
export type VideoAspectRatio = "9:16" | "16:9";
export type ProviderId = "nano_banana_pro" | "veo" | "sora";
export type VideoSize = "720x1280" | "1280x720";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ClientSettings {
  shared: ProviderConfig;
  providers: Record<ProviderId, ProviderConfig>;
}

export interface AppSettings {
  provider: ProviderId;
  aspectRatio: AspectRatio;
  resolution: ImageSize;
  videoAspectRatio: VideoAspectRatio;
  videoDurationSeconds: number;
  videoSize: VideoSize;
  videoModel: string;
}

export interface UploadImages {
  primary: { data: string; mimeType: string } | null;
  secondary: { data: string; mimeType: string } | null;
}

export interface MessagePart {
  type: "text" | "image" | "video";
  content: string; // 文本 / base64 / URL
  mimeType?: string;
  source?: "base64" | "url";
}

export interface Message {
  id: string;
  role: "user" | "model";
  parts: MessagePart[];
  rawParts?: any[]; // 保存原始 API parts（含 thought_signature 等）
  timestamp: number;
}

export interface SidebarProps {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  onClear: () => void;
  capabilities?: { image: boolean; video: boolean } | null;
  onOpenSettings: () => void;
  clientSettings: ClientSettings;
  uploadImages: UploadImages;
  setUploadImages: (updater: (prev: UploadImages) => UploadImages) => void;
}
