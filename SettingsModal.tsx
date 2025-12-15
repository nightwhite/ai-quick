import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ClientSettings, ProviderId } from './types';

const providerLabel: Record<ProviderId, string> = {
  nano_banana_pro: 'Nano Banana Pro（生图/修图）',
  veo: 'Veo（视频）',
  sora: 'Sora（视频）',
};

const providerHint: Record<ProviderId, string> = {
  nano_banana_pro: '可填写 Gemini 兼容的 Base URL 与 API Key。留空则回退到「通用配置」。若通用也为空，则会尝试使用服务端默认配置（如有）。',
  veo: '可填写你自己的视频中转服务 Base URL 与 API Key。留空则回退到「通用配置」。若都为空，则尝试使用服务端 Vertex AI（Veo）。',
  sora: '可填写你自己的视频中转服务 Base URL 与 API Key。留空则回退到「通用配置」。',
};

type Props = {
  open: boolean;
  value: ClientSettings;
  onClose: () => void;
  onSave: (next: ClientSettings) => void;
  onReset: () => void;
};

export const SettingsModal: React.FC<Props> = ({ open, value, onClose, onSave, onReset }) => {
  const [draft, setDraft] = useState<ClientSettings>(value);

  const providers = useMemo(() => Object.keys(draft.providers) as ProviderId[], [draft.providers]);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  if (!open) return null;

  const updateShared = (patch: Partial<ClientSettings['shared']>) => {
    setDraft((prev) => ({
      ...prev,
      shared: { ...prev.shared, ...patch },
    }));
  };

  const updateProvider = (provider: ProviderId, patch: Partial<ClientSettings['providers'][ProviderId]>) => {
    setDraft((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: { ...prev.providers[provider], ...patch },
      },
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleReset = () => {
    if (!confirm('确定要重置所有 API 配置吗？')) return;
    onReset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <div>
            <div className="text-lg font-semibold text-neutral-100">设置</div>
            <div className="text-xs text-neutral-500 mt-1">配置 API Base URL 与 Key（保存在浏览器本地缓存）</div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
            <div className="text-sm font-medium text-neutral-200">通用配置（可选）</div>
            <div className="text-xs text-neutral-500">
              当某个模型未单独填写 Base URL / Key 时，会自动使用这里的配置（按字段分别回退）。
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">Base URL（可选）</label>
                <input
                  value={draft.shared.baseUrl}
                  onChange={(e) => updateShared({ baseUrl: e.target.value })}
                  placeholder="例如：https://your-proxy.com"
                  className="w-full bg-neutral-900 text-neutral-100 rounded-lg px-3 py-2 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-neutral-600"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">API Key</label>
                <input
                  value={draft.shared.apiKey}
                  onChange={(e) => updateShared({ apiKey: e.target.value })}
                  placeholder="请输入 Key"
                  className="w-full bg-neutral-900 text-neutral-100 rounded-lg px-3 py-2 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-neutral-600"
                />
              </div>
            </div>
          </div>

          {providers.map((provider) => (
            <div key={provider} className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-neutral-200">{providerLabel[provider]}</div>
              </div>
              <div className="text-xs text-neutral-500">{providerHint[provider]}</div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">Base URL（可选）</label>
                  <input
                    value={draft.providers[provider].baseUrl}
                    onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                    placeholder="例如：https://generativelanguage.googleapis.com/v1beta"
                    className="w-full bg-neutral-900 text-neutral-100 rounded-lg px-3 py-2 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-neutral-600"
                  />
                  <div className="mt-1 text-[11px] text-neutral-600">
                    留空则使用通用 Base URL（若通用也为空，则部分模型会走服务端默认配置）。
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1.5 uppercase tracking-wider font-semibold">API Key</label>
                  <input
                    value={draft.providers[provider].apiKey}
                    onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                    placeholder="请输入 Key"
                    className="w-full bg-neutral-900 text-neutral-100 rounded-lg px-3 py-2 border border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-neutral-600"
                  />
                  <div className="mt-1 text-[11px] text-neutral-600">留空则使用通用 API Key。</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-red-950/30 text-neutral-300 hover:text-red-300 border border-neutral-800 transition-colors text-sm"
          >
            重置
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/40 transition-colors text-sm font-medium"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
