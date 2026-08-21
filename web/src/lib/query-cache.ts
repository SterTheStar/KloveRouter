export type QueryKey = string;

type CacheEntry<T> = {
  value?: T;
  timestamp: number;
  promise?: Promise<T>;
};

type Listener = () => void;

class QueryCache {
  private entries = new Map<QueryKey, CacheEntry<unknown>>();
  private listeners = new Map<QueryKey, Set<Listener>>();
  private versions = new Map<QueryKey, number>();

  get<T>(key: QueryKey, ttl: number) {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry || entry.value === undefined) return { value: undefined, stale: true };
    return { value: entry.value, stale: Date.now() - entry.timestamp >= ttl };
  }

  fetch<T>(key: QueryKey, loader: () => Promise<T>): Promise<T> {
    const current = this.entries.get(key) as CacheEntry<T> | undefined;
    if (current?.promise) return current.promise;
    const version = this.versions.get(key) ?? 0;
    const promise = loader().then((value) => {
      if ((this.versions.get(key) ?? 0) === version) {
        this.entries.set(key, { value, timestamp: Date.now() });
        this.notify(key);
      }
      return value;
    }).finally(() => {
      const entry = this.entries.get(key) as CacheEntry<T> | undefined;
      if (entry?.promise === promise) {
        entry.promise = undefined;
        this.entries.set(key, entry);
      }
    });
    this.entries.set(key, { value: current?.value, timestamp: current?.timestamp ?? 0, promise });
    return promise;
  }

  getOrFetch<T>(key: QueryKey, ttl: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key, ttl);
    if (cached.value !== undefined && !cached.stale) return Promise.resolve(cached.value);
    return this.fetch(key, loader);
  }

  invalidate(key: QueryKey) {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    this.entries.delete(key);
    this.notify(key);
  }

  invalidatePrefix(prefix: string) {
    const keys = new Set<QueryKey>();
    for (const key of this.entries.keys()) keys.add(key);
    for (const key of this.listeners.keys()) keys.add(key);
    for (const key of this.versions.keys()) keys.add(key);
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      this.entries.delete(key);
      this.notify(key);
    }
  }

  subscribe(key: QueryKey, listener: Listener) {
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (!listeners?.size) this.listeners.delete(key);
    };
  }

  private notify(key: QueryKey) {
    this.listeners.get(key)?.forEach((listener) => listener());
  }
}

export const queryCache = new QueryCache();

export const queryKeys = {
  providers: "providers",
  provider: (id: string) => `providers:${id}`,
  models: "models",
  modelsByProvider: (id: string) => `models:provider:${id}`,
  chats: "chats",
  chat: (id: string) => `chats:${id}`,
};

export const invalidateProviders = (id?: string) => {
  queryCache.invalidate(queryKeys.providers);
  if (id) queryCache.invalidate(queryKeys.provider(id));
};
export const invalidateModels = (providerId?: string) => {
  queryCache.invalidate(queryKeys.models);
  if (providerId) queryCache.invalidate(queryKeys.modelsByProvider(providerId));
};
export const invalidateChats = (id?: string) => {
  queryCache.invalidate(queryKeys.chats);
  if (id) queryCache.invalidate(queryKeys.chat(id));
};
