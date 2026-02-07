export class MemoryCache {
  constructor({ ttlMs = 300000, maxSize = 100 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.store = new Map();
  }

  _isFresh(entry) {
    if (!entry) return false;
    return Date.now() - entry.timestamp < (entry.ttlMs ?? this.ttlMs);
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (!this._isFresh(entry)) {
      this.store.delete(key);
      return null;
    }

    // simple LRU: refresh key order
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, { ttlMs } = {}) {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }

    this.store.set(key, { value, timestamp: Date.now(), ttlMs });
  }

  del(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  clearByPrefix(prefix) {
    if (!prefix) return;
    for (const key of this.store.keys()) {
      if (String(key).startsWith(prefix)) this.store.delete(key);
    }
  }
}

let sharedCache = null;

export function getCache({ ttlMs, maxSize } = {}) {
  if (!sharedCache) {
    sharedCache = new MemoryCache({ ttlMs, maxSize });
  }
  return sharedCache;
}
