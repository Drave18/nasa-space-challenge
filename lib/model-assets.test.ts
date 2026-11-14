import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelAssetStore } from './model-assets.ts';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function streamedResponse(contentLength?: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancelled = deferred<unknown>();
  const response = new Response(new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel(reason) { cancelled.resolve(reason); },
  }), { headers: contentLength === undefined ? {} : { 'Content-Length': contentLength } });
  return { response, controller, cancelled: cancelled.promise };
}

function sizedFetch(sizes: Record<string, number>) {
  const calls = new Map<string, number>();
  const fetchImpl: typeof fetch = async input => {
    const src = String(input);
    assert.ok(src in sizes, `Unexpected URL: ${src}`);
    calls.set(src, (calls.get(src) ?? 0) + 1);
    return new Response(new Uint8Array(sizes[src]));
  };
  return { fetchImpl, calls };
}

test('prefetch and loads share bytes and replay progress to a joining subscriber', async () => {
  const stream = streamedResponse('5');
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: async () => { fetches++; return stream.response; } });
  const prefetched = store.prefetch('/model.glb');
  const firstProgress: [number, number | null][] = [];
  const secondProgress: [number, number | null][] = [];
  const firstChunk = deferred<void>();
  const first = store.load('/model.glb', (loaded, total) => {
    firstProgress.push([loaded, total]);
    if (loaded === 2) firstChunk.resolve();
  });
  stream.controller.enqueue(Uint8Array.of(1, 2));
  await firstChunk.promise;

  const second = store.load('/model.glb', (loaded, total) => secondProgress.push([loaded, total]));
  assert.equal(first, second);
  assert.deepEqual(secondProgress, [[2, 5]]);
  stream.controller.enqueue(Uint8Array.of(3, 4, 5));
  stream.controller.close();
  const [buffer, joined] = await Promise.all([first, second, prefetched]);
  assert.equal(buffer, joined);
  assert.deepEqual([...new Uint8Array(buffer)], [1, 2, 3, 4, 5]);
  assert.deepEqual(firstProgress, [[0, null], [0, 5], [2, 5], [5, 5]]);
  assert.deepEqual(secondProgress, [[2, 5], [5, 5]]);
  const cachedProgress: [number, number | null][] = [];
  assert.equal(await store.load('/model.glb', (loaded, total) => cachedProgress.push([loaded, total])), buffer);
  await store.prefetch('/model.glb');
  assert.deepEqual(cachedProgress, [[5, 5]]);
  assert.equal(fetches, 1);
  store.dispose();
});

test('missing or unusable Content-Length stays indeterminate while reporting real bytes', async () => {
  for (const contentLength of [undefined, 'invalid', '-1', '0', '1.5']) {
    const stream = streamedResponse(contentLength);
    const store = new ModelAssetStore({ fetchImpl: async () => stream.response });
    const progress: [number, number | null][] = [];
    const loaded = store.load('/model.glb', (bytes, total) => progress.push([bytes, total]));
    stream.controller.enqueue(Uint8Array.of(3, 8));
    stream.controller.enqueue(Uint8Array.of(2));
    stream.controller.close();
    assert.deepEqual([...new Uint8Array(await loaded)], [3, 8, 2]);
    assert.deepEqual(progress, [[0, null], [0, null], [2, null], [3, null]]);
    store.dispose();
  }
});

test('retain aborts an obsolete fetch while preserving the current request', async () => {
  const started = deferred<void>();
  let obsoleteSignal: AbortSignal | null | undefined;
  const store = new ModelAssetStore({ fetchImpl: async (input, init) => {
    if (String(input) === '/current.glb') return new Response(Uint8Array.of(9));
    obsoleteSignal = init?.signal;
    started.resolve();
    return new Promise<Response>((_, reject) => {
      obsoleteSignal!.addEventListener('abort', () => reject(obsoleteSignal!.reason), { once: true });
    });
  } });
  const obsolete = store.prefetch('/obsolete.glb');
  const rejected = assert.rejects(obsolete, { name: 'AbortError' });
  await started.promise;
  const current = store.load('/current.glb');
  store.retain(['/current.glb']);
  assert.equal(obsoleteSignal!.aborted, true);
  await rejected;
  const buffer = await current;
  assert.deepEqual([...new Uint8Array(buffer)], [9]);
  assert.equal(await store.load('/current.glb'), buffer);
  store.dispose();
});

test('retain cancels an obsolete response stream and permits a fresh load', async () => {
  const stream = streamedResponse('3');
  const firstChunk = deferred<void>();
  const progress: number[] = [];
  let fetches = 0;
  let signal: AbortSignal | null | undefined;
  const store = new ModelAssetStore({ fetchImpl: async (_, init) => {
    signal = init?.signal;
    return ++fetches === 1 ? stream.response : new Response(Uint8Array.of(7));
  } });
  const obsolete = store.load('/model.glb', loaded => {
    progress.push(loaded);
    if (loaded === 1) firstChunk.resolve();
  });
  const rejected = assert.rejects(obsolete, { name: 'AbortError' });
  stream.controller.enqueue(Uint8Array.of(1));
  await firstChunk.promise;
  store.retain([]);
  assert.equal(signal!.aborted, true);
  assert.equal((await stream.cancelled as Error).name, 'AbortError');
  await rejected;
  assert.deepEqual([...new Uint8Array(await store.load('/model.glb'))], [7]);
  assert.equal(fetches, 2);
  assert.deepEqual(progress, [0, 0, 1]);
  store.dispose();
});

test('late aborted completion cannot cache stale bytes or remove its replacement', async () => {
  const oldResponse = deferred<Response>();
  const newResponse = deferred<Response>();
  const oldStarted = deferred<void>();
  const newStarted = deferred<void>();
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: async () => {
    if (++fetches === 1) { oldStarted.resolve(); return oldResponse.promise; }
    newStarted.resolve();
    return newResponse.promise;
  } });
  const obsolete = store.load('/model.glb');
  const rejected = assert.rejects(obsolete, { name: 'AbortError' });
  await oldStarted.promise;
  store.retain([]);
  const replacement = store.load('/model.glb');
  await newStarted.promise;
  // Deliberately ignore the signal in this fetch to exercise a late completion.
  oldResponse.resolve(new Response(Uint8Array.of(1)));
  await rejected;
  assert.equal(store.load('/model.glb'), replacement);
  newResponse.resolve(new Response(Uint8Array.of(8)));
  const buffer = await replacement;
  assert.deepEqual([...new Uint8Array(buffer)], [8]);
  assert.equal(await store.load('/model.glb'), buffer);
  assert.equal(fetches, 2);
  store.dispose();
});

test('retaining nothing before fetch begins cancels without a network request', async () => {
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: async () => { fetches++; return new Response(); } });
  const load = store.load('/model.glb');
  const rejected = assert.rejects(load, { name: 'AbortError' });
  store.retain([]);
  await rejected;
  assert.equal(fetches, 0);
  store.dispose();
});

test('network and HTTP rejections are evicted instead of cached', async () => {
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: async () => {
    fetches++;
    if (fetches === 1) throw new Error('network failed');
    if (fetches === 2) return new Response('unavailable', { status: 503, statusText: 'Service Unavailable' });
    return new Response(Uint8Array.of(4));
  } });
  await assert.rejects(store.load('/model.glb'), /network failed/);
  await assert.rejects(store.prefetch('/model.glb'), /HTTP 503 Service Unavailable/);
  const buffer = await store.load('/model.glb');
  assert.equal(await store.load('/model.glb'), buffer);
  assert.equal(fetches, 3);
  store.dispose();
});

test('synchronous fetch exceptions and stream failures allow retry', async () => {
  const stream = streamedResponse();
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: () => {
    fetches++;
    if (fetches === 1) throw new Error('synchronous failure');
    return Promise.resolve(fetches === 2 ? stream.response : new Response(Uint8Array.of(6)));
  } });
  await assert.rejects(store.load('/model.glb'), /synchronous failure/);
  const interrupted = store.load('/model.glb');
  const rejected = assert.rejects(interrupted, /interrupted stream/);
  stream.controller.error(new Error('interrupted stream'));
  await rejected;
  assert.deepEqual([...new Uint8Array(await store.load('/model.glb'))], [6]);
  assert.equal(fetches, 3);
  store.dispose();
});

test('retain evicts completed bytes outside the active and next URLs', async () => {
  const { fetchImpl, calls } = sizedFetch({ a: 1, b: 2 });
  const store = new ModelAssetStore({ fetchImpl });
  await store.load('a');
  const b = await store.load('b');
  store.retain(['b']);
  assert.equal(await store.load('b'), b);
  await store.load('a');
  assert.equal(calls.get('a'), 2);
  assert.equal(calls.get('b'), 1);
  store.retain([]);
  await store.load('b');
  assert.equal(calls.get('b'), 2);
  store.dispose();
});

test('the two-entry LRU uses load and prefetch cache hits as recent access', async () => {
  const { fetchImpl, calls } = sizedFetch({ a: 1, b: 1, c: 1 });
  const store = new ModelAssetStore({ fetchImpl });
  const a = await store.load('a');
  await store.load('b');
  await store.prefetch('a');
  await store.load('c');
  assert.equal(await store.load('a'), a);
  await store.load('b');
  assert.equal(calls.get('a'), 1);
  assert.equal(calls.get('b'), 2);
  assert.equal(calls.get('c'), 1);
  store.dispose();
});

test('byte-budget eviction applies even when only two entries are cached', async () => {
  const { fetchImpl, calls } = sizedFetch({ a: 3, b: 2 });
  const store = new ModelAssetStore({ fetchImpl, maxBytes: 4 });
  await store.load('a');
  const b = await store.load('b');
  assert.equal(await store.load('b'), b);
  await store.load('a');
  assert.equal(calls.get('a'), 2);
  assert.equal(calls.get('b'), 1);
  store.dispose();
});

test('buffers exactly at the byte budget cache; oversized required loads do not', async () => {
  const { fetchImpl, calls } = sizedFetch({ fits: 4, oversized: 5 });
  const store = new ModelAssetStore({ fetchImpl, maxBytes: 4 });
  const fits = await store.load('fits');
  const first = store.load('oversized');
  assert.equal(store.load('oversized'), first);
  assert.equal((await first).byteLength, 5);
  assert.equal((await store.load('oversized')).byteLength, 5);
  assert.equal(await store.load('fits'), fits);
  assert.equal(calls.get('fits'), 1);
  assert.equal(calls.get('oversized'), 2);
  store.dispose();
});

test('dispose cancels active streams, clears cached bytes and rejects future work', async () => {
  const stream = streamedResponse('2');
  const firstChunk = deferred<void>();
  let fetches = 0;
  const store = new ModelAssetStore({ fetchImpl: async input => {
    fetches++;
    return String(input) === 'cached' ? new Response(Uint8Array.of(1)) : stream.response;
  } });
  await store.load('cached');
  const pending = store.load('pending', loaded => { if (loaded === 1) firstChunk.resolve(); });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  stream.controller.enqueue(Uint8Array.of(2));
  await firstChunk.promise;
  store.dispose();
  store.dispose();
  await rejected;
  assert.equal((await stream.cancelled as Error).name, 'AbortError');
  await assert.rejects(store.load('cached'), { name: 'AbortError' });
  await assert.rejects(store.prefetch('new'), { name: 'AbortError' });
  assert.equal(fetches, 2);
});
