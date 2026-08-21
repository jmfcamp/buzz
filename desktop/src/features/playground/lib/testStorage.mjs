export function createMemoryStorage() {
  const memory = new Map();
  return {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    get length() {
      return memory.size;
    },
  };
}

export function installLocalStorage(storage = createMemoryStorage()) {
  const target = globalThis.window ?? {};
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  });
  globalThis.window = target;
  globalThis.localStorage = storage;
  return storage;
}
