/** Makes @capacitor/core see an Android WebView whose SecureStorage plugin answers every call (imported first). */
const g = globalThis as Record<string, unknown>;
g.androidBridge = {};
const saved = new Map<string, string>();
g.Capacitor = {
  PluginHeaders: [{ name: 'SecureStorage', methods: ['internalGetItem', 'internalSetItem', 'internalRemoveItem', 'clearItemsWithPrefix', 'getPrefixedKeys', 'setSynchronize', 'getPlatform'].map((name) => ({ name, rtype: 'promise' })) }],
  nativePromise: async (_plugin: string, method: string, o: { prefixedKey?: string; data?: string }) => {
    if (method === 'internalGetItem') return { data: saved.get(o.prefixedKey ?? '') ?? null };
    if (method === 'internalSetItem') { saved.set(o.prefixedKey ?? '', o.data ?? ''); return {}; }
    return {};
  },
};
