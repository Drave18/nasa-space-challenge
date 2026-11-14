'use client';

type ProgressListener = (loaded: number, total: number | null) => void;

type PendingAsset = {
  controller: AbortController;
  promise: Promise<ArrayBuffer>;
  listeners: Set<ProgressListener>;
  loaded: number;
  total: number | null;
};

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 2;

/** A viewer-owned byte cache. Parsing and manifest-based progress belong to the viewer. */
export class ModelAssetStore {
  private readonly fetchImpl: typeof fetch;
  private readonly maxBytes: number;
  private readonly pending = new Map<string, PendingAsset>();
  private readonly completed = new Map<string, ArrayBuffer>();
  private cachedBytes = 0;
  private disposed = false;

  constructor(options: { fetchImpl?: typeof fetch; maxBytes?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  load(src: string, onProgress?: ProgressListener): Promise<ArrayBuffer> {
    if (this.disposed) {
      return Promise.reject(new DOMException('Model asset store is disposed', 'AbortError'));
    }

    const cached = this.completed.get(src);
    if (cached) {
      this.completed.delete(src);
      this.completed.set(src, cached);
      onProgress?.(cached.byteLength, cached.byteLength);
      return Promise.resolve(cached);
    }

    let request = this.pending.get(src);
    if (!request) {
      const created: PendingAsset = {
        controller: new AbortController(),
        listeners: new Set(),
        loaded: 0,
        total: null,
        // Defer fetch until the request is registered, including synchronous fetch failures.
        promise: Promise.resolve().then(async () => {
          try {
            const buffer = await this.download(src, created);
            created.controller.signal.throwIfAborted();
            if (this.pending.get(src) === created) this.cache(src, buffer);
            return buffer;
          } finally {
            // An aborted request may settle after a replacement for the same URL starts.
            if (this.pending.get(src) === created) this.pending.delete(src);
            created.listeners.clear();
          }
        }),
      };
      this.pending.set(src, created);
      request = created;
    }

    if (onProgress) {
      request.listeners.add(onProgress);
      onProgress(request.loaded, request.total);
    }
    return request.promise;
  }

  async prefetch(src: string): Promise<void> {
    await this.load(src);
  }

  retain(urls: readonly string[]): void {
    const retained = new Set(urls);
    for (const [src, request] of this.pending) {
      if (retained.has(src)) continue;
      this.pending.delete(src);
      request.listeners.clear();
      request.controller.abort();
    }
    for (const [src, buffer] of this.completed) {
      if (retained.has(src)) continue;
      this.completed.delete(src);
      this.cachedBytes -= buffer.byteLength;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.retain([]);
  }

  private report(request: PendingAsset): void {
    for (const listener of request.listeners) listener(request.loaded, request.total);
  }

  private async download(src: string, request: PendingAsset): Promise<ArrayBuffer> {
    const { signal } = request.controller;
    signal.throwIfAborted();
    const response = await this.fetchImpl(src, { signal });
    if (signal.aborted || !response.ok) {
      void response.body?.cancel(signal.reason).catch(() => {});
      signal.throwIfAborted();
      throw new Error(`Could not load model ${src}: HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    request.total = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : null;
    this.report(request);
    signal.throwIfAborted();

    if (!response.body) {
      const buffer = await response.arrayBuffer();
      signal.throwIfAborted();
      request.loaded = buffer.byteLength;
      this.report(request);
      return buffer;
    }

    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        chunks.push(value);
        request.loaded += value.byteLength;
        this.report(request);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
      reader.releaseLock();
    }

    const bytes = new Uint8Array(request.loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  }

  private cache(src: string, buffer: ArrayBuffer): void {
    // Required downloads may exceed the budget, but must not displace useful cached bytes.
    if (buffer.byteLength > this.maxBytes) return;
    this.completed.set(src, buffer);
    this.cachedBytes += buffer.byteLength;
    while (this.completed.size > MAX_ENTRIES || this.cachedBytes > this.maxBytes) {
      const oldest = this.completed.entries().next().value!;
      this.completed.delete(oldest[0]);
      this.cachedBytes -= oldest[1].byteLength;
    }
  }
}
