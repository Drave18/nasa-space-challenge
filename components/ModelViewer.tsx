'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelAssetStore } from '@/lib/model-assets';
import type { Media } from '@/lib/catalog';
import styles from './ModelViewer.module.css';

type ModelMedia = Extract<Media, { kind: 'model' }>;
export type ModelLoadState = 'idle' | 'loading' | 'preparing' | 'ready' | 'error' | 'unavailable';
export interface ModelViewerHandle { setStoryProgress(progress: number): void }
export interface ModelViewerProps {
  media: ModelMedia | null;
  mode: 'story' | 'inspect';
  active: boolean;
  prefetchSrc?: string | null;
  onStateChange?: (state: ModelLoadState) => void;
  ref?: Ref<ModelViewerHandle>;
}

const GROUND_COLOR = { moon: 0x8a8a86, mars: 0xa5583a } as const;

function regolithTexture(): THREE.CanvasTexture {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a8782';
  g.fillRect(0, 0, s, s);
  const d = g.getImageData(0, 0, s, s);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 46;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = 3 + Math.random() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(40,38,36,.35)');
    gr.addColorStop(0.8, 'rgba(60,58,55,.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function disposeObject(object: THREE.Object3D, retainedTexture?: THREE.Texture) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  object.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && value !== retainedTexture) {
          textures.add(value);
          if (typeof ImageBitmap !== 'undefined' && value.source.data instanceof ImageBitmap) images.add(value.source.data);
        }
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  for (const image of images) image.close();
}

type Runtime = {
  load(media: ModelMedia | null): void;
  configure(): void;
  speculate(src?: string | null): void;
  invalidate(): void;
  pose(): void;
};

export function ModelViewer(props: ModelViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const progressRef = useRef(0);
  const [state, setState] = useState<ModelLoadState>('idle');
  const [progress, setProgress] = useState<number | null>(0);
  const [spin, setSpin] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const options = useRef({ spin, showLabels });
  options.current = { spin, showLabels };

  useImperativeHandle(props.ref, () => ({
    setStoryProgress(value) {
      progressRef.current = THREE.MathUtils.clamp(value, 0, 1);
      runtime.current?.pose();
      runtime.current?.invalidate();
    },
  }), []);

  useEffect(() => {
    const root = rootRef.current!;
    const labels = labelsRef.current!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const store = new ModelAssetStore();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setState('unavailable');
      latest.current.onStateChange?.('unavailable');
      store.dispose();
      return;
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    root.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030a);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.35;
    const texture = regolithTexture();
    const sun = new THREE.DirectionalLight(0xfff4e0, 4.5);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.2;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const content = new THREE.Group();
    scene.add(content);
    const tags: { el: HTMLSpanElement; p: THREE.Vector3; occluded: boolean }[] = [];
    const projection = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const spherical = new THREE.Spherical();
    const ray = new THREE.Raycaster();
    const size = new THREE.Vector3();
    const target = new THREE.Vector3();
    let model: THREE.Object3D | null = null;
    let current: ModelMedia | null = null;
    let generation = 0;
    let frame = 0;
    let disposed = false;
    let unavailable = false;
    let compiled = false;
    let ready = false;
    let distance = 1;
    let maxDim = 1;
    let radius = 1;
    let lastOcclusion = -Infinity;
    let labelsDirty = true;

    const publish = (value: ModelLoadState) => {
      if (disposed) return;
      setState(value);
      latest.current.onStateChange?.(value);
    };
    const pose = () => {
      if (!model || latest.current.mode !== 'story') return;
      const p = motion.matches ? 0.5 : progressRef.current;
      spherical.set(distance * (motion.matches ? 1 : THREE.MathUtils.lerp(1.18, 0.88, p)),
        THREE.MathUtils.degToRad(THREE.MathUtils.lerp(72, 52, p)),
        Math.atan2(1.4, 2) + THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-45, 55, p)));
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };
    const invalidate = () => {
      if (!frame && !disposed && !unavailable && latest.current.active && !document.hidden && model && compiled) frame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
      frame = 0;
      if (disposed || unavailable || !latest.current.active || document.hidden || !model || !compiled) return;
      const inspect = latest.current.mode === 'inspect';
      const changed = inspect && controls.update();
      renderer.render(scene, camera);
      if (!ready) { ready = true; publish('ready'); }
      if (inspect && options.current.showLabels && (changed || labelsDirty)) {
        const occlude = now - lastOcclusion >= 250;
        if (occlude) lastOcclusion = now;
        for (const tag of tags) {
          if (occlude) {
            direction.copy(tag.p).sub(camera.position);
            ray.far = Math.max(0, direction.length() - maxDim * 0.025);
            ray.set(camera.position, direction.normalize());
            tag.occluded = ray.intersectObject(model, true).length > 0;
          }
          projection.copy(tag.p).project(camera);
          const visible = !tag.occluded && projection.z < 1 && Math.abs(projection.x) < 1 && Math.abs(projection.y) < 1;
          tag.el.hidden = !visible;
          if (visible) {
            tag.el.style.left = `${(projection.x + 1) * root.clientWidth / 2}px`;
            tag.el.style.top = `${(1 - projection.y) * root.clientHeight / 2}px`;
          }
        }
        labelsDirty = false;
      }
      if (inspect && (changed || controls.autoRotate)) invalidate();
    };
    const fit = () => {
      const w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio, w < 900 ? 1.25 : 1.5));
      renderer.setSize(w, h);
      const shadowSize = w < 900 ? 1024 : 2048;
      if (sun.shadow.mapSize.x !== shadowSize) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(shadowSize, shadowSize);
        renderer.shadowMap.needsUpdate = true;
      }
      camera.aspect = w / h;
      camera.clearViewOffset();

      const aspect = latest.current.mode === 'story' ? w * 0.85 / h : w / h;
      const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect));
      distance = radius * 1.2 / Math.sin(halfFov);
      camera.near = maxDim / 100;
      camera.far = Math.max(maxDim * 50, distance * 4);
      camera.updateProjectionMatrix();
      camera.position.set(1.4, 0.75, 2).normalize().multiplyScalar(distance).add(target);
      controls.target.copy(target);
      controls.minDistance = maxDim * 0.6;
      controls.maxDistance = Math.max(maxDim * 6, distance * 2);
      controls.maxPolarAngle = current?.ground ? Math.PI * 0.52 : Math.PI;
      controls.update();
      pose();
      labelsDirty = true;
      invalidate();
    };
    const clear = () => {
      cancelAnimationFrame(frame); frame = 0;
      compiled = ready = false;
      disposeObject(content, texture);
      content.clear();
      model = null;
      for (const tag of tags) tag.el.remove();
      tags.length = 0;
    };
    const speculate = (src?: string | null) => {
      store.retain([current?.src, src].filter((url): url is string => Boolean(url)));
      if (src && !unavailable) void store.prefetch(src).catch(() => {});
    };
    const load = (media: ModelMedia | null) => {
      const token = ++generation;
      clear();
      current = media;
      store.retain([media?.src, latest.current.prefetchSrc].filter((url): url is string => Boolean(url)));
      setProgress(0);
      if (unavailable) { publish('unavailable'); return; }
      if (!media) { publish('idle'); return; }
      publish('loading');
      let lastPercent: number | null = -1, lastTime = 0;
      void (async () => {
        const buffer = await store.load(media.src, (loaded, total) => {
          if (token !== generation || disposed) return;
          const denominator = total ?? (media.bytes > 0 ? media.bytes : null);
          const percent = denominator ? Math.min(100, Math.floor(loaded / denominator * 100)) : null;
          const now = performance.now();
          if (percent !== lastPercent || now - lastTime >= 100) {
            lastPercent = percent; lastTime = now; setProgress(percent);
          }
        });
        if (token !== generation || disposed) return;
        publish('preparing');
        const gltf = await loader.parseAsync(buffer, new URL('.', new URL(media.src, location.href)).href);
        if (token !== generation || disposed || unavailable) { disposeObject(gltf.scene); return; }
        const object = gltf.scene;
        object.traverse(node => {
          if (!(node instanceof THREE.Mesh)) return;
          node.castShadow = node.receiveShadow = true;
          if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
        });
        const bounds = new THREE.Box3().setFromObject(object);
        const center = bounds.getCenter(new THREE.Vector3());
        bounds.getSize(size);
        object.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
        maxDim = Math.max(size.x, size.y, size.z);
        radius = size.length() / 2;
        target.set(0, size.y * 0.5, 0);
        model = object;
        content.add(object);
        sun.position.set(maxDim * 1.2, maxDim * 1.8, maxDim * 0.9);
        sun.shadow.normalBias = maxDim * 0.0025;
        const shadow = sun.shadow.camera;
        shadow.left = shadow.bottom = -maxDim;
        shadow.right = shadow.top = maxDim;
        shadow.near = maxDim / 100; shadow.far = maxDim * 6;
        shadow.updateProjectionMatrix();
        if (media.ground) {
          const ground = new THREE.Mesh(new THREE.CircleGeometry(maxDim * 20, 64).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: GROUND_COLOR[media.ground], map: texture, bumpMap: texture, bumpScale: maxDim / 60, roughness: 1, metalness: 0 }));
          ground.receiveShadow = true;
          content.add(ground);
        }
        for (const label of media.labels ?? []) {
          const el = document.createElement('span');
          el.className = styles.tag; el.textContent = label.t; el.hidden = true;
          labels.append(el);
          tags.push({ el, p: new THREE.Vector3(...label.p), occluded: false });
        }
        fit();
        renderer.shadowMap.needsUpdate = true;
        await renderer.compileAsync(scene, camera);
        if (token !== generation || disposed || unavailable) return;
        compiled = true;
        invalidate();
      })().catch(error => {
        if (token !== generation || disposed || unavailable || error?.name === 'AbortError') return;
        clear();
        publish('error');
        console.error(error);
      });
    };
    const configure = () => {
      const inspect = latest.current.mode === 'inspect';
      controls.enabled = inspect && latest.current.active;
      controls.autoRotate = inspect && options.current.spin;
      labels.hidden = !inspect || !options.current.showLabels;
      labelsDirty = true;
      if (!latest.current.active) { cancelAnimationFrame(frame); frame = 0; }
      else { pose(); invalidate(); }
    };
    const change = () => { labelsDirty = true; invalidate(); };
    const stopSpin = () => { options.current.spin = false; controls.autoRotate = false; setSpin(false); };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
      else invalidate();
    };
    const reduced = () => {
      if (motion.matches) stopSpin();
      pose(); invalidate();
    };
    const lost = (event: Event) => {
      event.preventDefault(); unavailable = true; generation++;
      store.retain([]); clear(); publish('unavailable');
    };
    controls.addEventListener('change', change);
    controls.addEventListener('start', stopSpin);
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', reduced);
    renderer.domElement.addEventListener('webglcontextlost', lost);
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    runtime.current = { load, configure, speculate, invalidate, pose };
    options.current.spin = !motion.matches;
    setSpin(!motion.matches);
    fit();
    configure();
    return () => {
      disposed = true; generation++;
      runtime.current = null;
      store.dispose(); clear(); observer.disconnect();
      controls.removeEventListener('change', change);
      controls.removeEventListener('start', stopSpin);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', reduced);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      controls.dispose(); texture.dispose();
      sun.shadow.map?.dispose(); environment.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { runtime.current?.load(props.media); }, [props.media]);
  useEffect(() => { runtime.current?.configure(); }, [props.mode, props.active, spin, showLabels]);
  useEffect(() => { runtime.current?.speculate(props.prefetchSrc); }, [props.prefetchSrc, props.media]);

  return (
    <div ref={rootRef} className={styles.root} data-model-state={state} data-mode={props.mode}>
      <div ref={labelsRef} className={styles.labels} aria-hidden="true" />
      {state !== 'ready' && state !== 'idle' ? <p className={styles.progress} role={state === 'error' ? 'alert' : 'status'}>
        {state === 'unavailable' ? '3D is unavailable on this device' : state === 'error' ? 'Could not load model' : state === 'preparing' ? 'Preparing 3D…' : `Loading 3D model${progress === null ? '…' : ` ${progress}%`}`}
      </p> : null}
      {props.mode === 'inspect' && props.media ? <div className={styles.toolbar}>
        {props.media.labels ? <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels(value => !value)}>Labels</button> : null}
        <button type="button" aria-pressed={spin} onClick={() => setSpin(value => !value)}>Spin</button>
      </div> : null}
    </div>
  );
}
