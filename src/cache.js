class Cache {
  constructor(defaultTTL = 15000) {
    this.store = new Map();
    this.defaultTTL = defaultTTL;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    this.store.set(key, { data, expiresAt: Date.now() + ttl });
  }

  clear() {
    this.store.clear();
  }
}

module.exports = new Cache();
