import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {LABELS} from './labels.js';

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000004);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

// Sun: single hard light, no atmosphere fill
const sun = new THREE.DirectionalLight(0xfff4e0, 4.5);
sun.position.set(180, 260, 140);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 700});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 5000);
camera.position.set(190, 70, 260);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 80;
controls.maxDistance = 700;

// Procedural regolith
function regolithTexture() {
  const s = 1024, c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8782'; g.fillRect(0, 0, s, s);
  const d = g.getImageData(0, 0, s, s);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - .5) * 46;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 22;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(40,38,36,.35)'); gr.addColorStop(.8, 'rgba(60,58,55,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2500, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({map: regolithTexture(), roughness: 1, metalness: 0, bumpMap: regolithTexture(), bumpScale: 2}));
ground.receiveShadow = true;
scene.add(ground);

// Material roles by source colour (see scene.gltf names -> role)
const ROLE = {
  color_10988977: {metalness: .9, roughness: .25},                    // polished struts
  color_12568524: {metalness: .8, roughness: .35},                    // aluminium
  color_14541540: {metalness: .7, roughness: .4},                     // light metal
  color_14789940: {color: 0xc89a2c, metalness: 1, roughness: .28},    // gold Kapton foil
  color_15277357: {metalness: 0, roughness: .6},                      // red markings
  color_16311991: {color: 0xd9a84a, metalness: 1, roughness: .35},    // crinkled foil
  color_16448250: {metalness: .1, roughness: .55},                    // white panels
  color_2829873:  {metalness: .3, roughness: .6},                     // black parts
  color_3888547:  {metalness: 0, roughness: .6},                      // blue markings
  color_6383466:  {metalness: .6, roughness: .45},                    // dark metal
};

const labelsEl = document.getElementById('labels');
const tags = [];
const root = new THREE.Group();
scene.add(root);

new GLTFLoader().load('/models/scene.gltf', gltf => {
  const m = gltf.scene;
  m.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const mat = o.material;
    mat.side = THREE.DoubleSide;
    const r = ROLE[mat.name];
    if (r) { if (r.color) mat.color.set(r.color); mat.metalness = r.metalness; mat.roughness = r.roughness; }
    mat.envMapIntensity = 1;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
  });
  // glTF is Y-up, feet at ~y=-134..-119; centre on XZ, put lowest point at y=0
  const box = new THREE.Box3().setFromObject(m);
  const c = box.getCenter(new THREE.Vector3());
  m.position.set(-c.x, -box.min.y, -c.z);
  root.add(m);
  const size = box.getSize(new THREE.Vector3());
  root.userData.size = size;
  controls.target.set(0, size.y * .5, 0);
  camera.position.set(size.x * 1.4, size.y * .75, size.z * 2.0);
  for (const L of LABELS) {
    const el = document.createElement('div');
    el.className = 'tag'; el.textContent = L.t;
    labelsEl.append(el);
    tags.push({el, p: new THREE.Vector3(...L.p), occluded: false});
  }
  window.__ready = true;
});

const labToggle = document.getElementById('lab');
document.getElementById('spin').onchange = e => controls.autoRotate = e.target.checked;
controls.autoRotateSpeed = 1.2;

const v = new THREE.Vector3(), dir = new THREE.Vector3();
const ray = new THREE.Raycaster();
function updateOcclusion() {
  for (const t of tags) {
    dir.copy(t.p).sub(camera.position);
    const d = dir.length();
    ray.set(camera.position, dir.normalize());
    ray.far = d - 4;
    t.occluded = ray.intersectObject(root, true).length > 0;
  }
}
setInterval(updateOcclusion, 250);
function updateLabels() {
  for (const t of tags) {
    v.copy(t.p).project(camera);
    const vis = labToggle.checked && !t.occluded && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
    t.el.classList.toggle('hide', !vis);
    if (!vis) continue;
    t.el.style.left = (v.x + 1) / 2 * innerWidth + 'px';
    t.el.style.top = (1 - v.y) / 2 * innerHeight + 'px';
  }
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); updateLabels(); });
Object.assign(window, {camera, controls, THREE, scene, renderer, root});
