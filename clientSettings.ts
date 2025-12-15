import type { ClientSettings, ProviderId } from './types';

const STORAGE_KEY = 'nb2.clientSettings.v1';

export const getDefaultClientSettings = (): ClientSettings => {
  const empty = { baseUrl: '', apiKey: '' };
  return {
    shared: { ...empty },
    providers: {
      nano_banana_pro: { ...empty },
      veo: { ...empty },
      sora: { ...empty },
    },
  };
};

export const loadClientSettings = (): ClientSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultClientSettings();
    const parsed = JSON.parse(raw) as ClientSettings;
    const defaults = getDefaultClientSettings();
    return {
      shared: { ...defaults.shared, ...((parsed as any).shared || {}) },
      providers: {
        nano_banana_pro: { ...defaults.providers.nano_banana_pro, ...(parsed.providers?.nano_banana_pro || {}) },
        veo: { ...defaults.providers.veo, ...(parsed.providers?.veo || {}) },
        sora: { ...defaults.providers.sora, ...(parsed.providers?.sora || {}) },
      },
    };
  } catch {
    return getDefaultClientSettings();
  }
};

export const saveClientSettings = (settings: ClientSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const getProviderConfig = (settings: ClientSettings, provider: ProviderId) => settings.providers[provider];

export const getEffectiveProviderConfig = (settings: ClientSettings, provider: ProviderId) => {
  const shared = settings.shared || { baseUrl: '', apiKey: '' };
  const local = settings.providers[provider] || { baseUrl: '', apiKey: '' };
  return {
    baseUrl: (local.baseUrl || shared.baseUrl || '').trim(),
    apiKey: (local.apiKey || shared.apiKey || '').trim(),
  };
};
