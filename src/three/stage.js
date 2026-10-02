import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DynamicTube } from './tube.js';
import { cryWave, cryEnvelope, makeSpectrogram } from './signal.js';
import { clamp, smooth, lerp, easeInOut, rng, gauss, resample, sampleAt } from './util.js';
import { GATE_T, N_RECORDINGS, STREAM_FLIGHT, streamWave } from '../story.js';

/* The timeline itself is described in ../story.js. */

const HERO_BURSTS = [
  { t0: 0.03, d: 0.11, a: 0.85 },
  { t0: 0.155, d: 0.13, a: 1.0 },
  { t0: 0.3, d: 0.12, a: 0.92 },
  { t0: 0.425, d: 0.08, a: 0.5 },
];

// [keyframe name, T]. Jumps (same T twice) only happen while the line is hidden.
const SCHEDULE = [
  ['K0', 0], ['KT', 1.35], ['KT', 2.15], ['KB', 2.6], ['KB', 3.0],
  ['KGa', 3.25], ['KGa', 3.55], ['KGb', 3.8], ['KGb', 4.5],
  ['KF', 4.5001], ['KF', 6.0], ['KW', 6.35], ['KW', 6.5], ['KR', 6.75], ['KR', 7.3],
  ['KC', 7.3001], ['KC', 11],
];

// ratings matrix for the WARPSPD chapter
const MR = 8, MC = 12, MF = 3;

// five cry classes, dark to light so each band reads on its own
const CLASS_HEX = ['#2A4093', '#5068C4', '#17224F', '#A7B6EA', '#7A8FDA'];

const lin = (hex) => new THREE.Color(hex);

export class Stage {
  constructor(canvas, { reduced = false, labels = {}, heroBand = null, envUrl = null } = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.labels = labels;
    // free vertical band between the name and the headline on stacked (phone,
    // portrait tablet) heroes, as fractions of the viewport height
    this.heroBand = heroBand;
    this.envUrl = envUrl;
    this.T = 0;
    this.intro = reduced ? 1 : 0;
    this.time = 0;
    this.contactShift = 0; // px the contact line has scrolled away from its anchor
    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.lastT = -1;
    this.idleFrames = 0;
    this.frame = 0;

    this.col = {
      cobalt: lin('#1F3380'),
      signal: lin('#D2421A'),
      ceramic: lin('#F3F2EF'),
      tint: lin('#8FA3E3'),
      deep: lin('#16245F'),
      known: lin('#24388A'),
    };

    this._initRenderer();
    this._initScene();
    this.resize();
    this._loadStudio();
  }

  _initRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    this.renderer = r;
  }

  // Studio lighting rendered in Blender (see /blender in the source). It ships as
  // an 8-bit PNG storing x / (1 + x) per channel; decoding restores the HDR range.
  _loadStudio() {
    if (!this.envUrl) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const src = ctx.getImageData(0, 0, w, h).data;
        const data = new Uint16Array(w * h * 4);
        const toHalf = THREE.DataUtils.toHalfFloat;
        const one = toHalf(1);
        for (let i = 0; i < w * h; i++) {
          for (let k = 0; k < 3; k++) {
            const y = Math.min(src[i * 4 + k] / 255, 0.996);
            data[i * 4 + k] = toHalf(y / (1 - y));
          }
          data[i * 4 + 3] = one;
        }
        const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
        tex.flipY = true;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.LinearSRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const env = pmrem.fromEquirectangular(tex).texture;
        pmrem.dispose();
        tex.dispose();
        if (this.scene.environment) this.scene.environment.dispose();
        this.scene.environment = env;
        this.scene.environmentIntensity = 0.62;
        this.lastT = -1;
      } catch (e) { /* keep the fallback room */ }
    };
    img.src = this.envUrl;
  }

  _initScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.75;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.camZ = 10;
    this.camera.position.set(0, 0, this.camZ);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd6d5d3, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-1.7, 2.8, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 12;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0004;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    scene.add(key);
    scene.add(key.target);
    this.key = key;

    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ color: new THREE.Color('#1B2250'), opacity: 0.17 })
    );
    catcher.position.z = -0.75;
    catcher.receiveShadow = true;
    catcher.userData.catcher = true; // only shows shadows, so it never counts as content
    scene.add(catcher);

    // every tube shares one clearcoat material; colour comes per vertex
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.12,
    });
    const ceramic = new THREE.MeshPhysicalMaterial({
      color: this.col.ceramic.clone(), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22,
    });
    this.mat = { tubeMat, ceramic };

    const small = matchMedia('(max-width: 767px)').matches;
    this.small = small;

    // the ribbon and four more strands that appear as the agents
    this.main = { tube: new DynamicTube(small ? 460 : 680, small ? 12 : 18, tubeMat), keys: {}, s: 0 };
    scene.add(this.main.tube.mesh);
    this.threads = [];
    for (let s = 1; s <= 4; s++) {
      const t = { tube: new DynamicTube(small ? 280 : 420, small ? 10 : 12, tubeMat), keys: {}, s };
      t.tube.mesh.visible = false;
      scene.add(t.tube.mesh);
      this.threads.push(t);
    }

    // spectrogram relief, unit sized and scaled on resize
    const cols = small ? 120 : 180, rows = small ? 40 : 56;
    const geo = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols * rows * 3), 3));
    const reliefMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.3,
      side: THREE.DoubleSide, transparent: true, opacity: 0,
    });
    const relief = new THREE.Mesh(geo, reliefMat);
    relief.castShadow = true;
    const reliefGroup = new THREE.Group();
    reliefGroup.add(relief);
    reliefGroup.visible = false;
    scene.add(reliefGroup);
    this.relief = { geo, mesh: relief, group: reliefGroup, cols, rows, H: makeSpectrogram(cols, rows), state: '' };
    // an untouched copy of the table transform, for the dots
    this.table = new THREE.Object3D();

    // messages travelling along the agents
    const nB = small ? 16 : 26;
    const beadMat = new THREE.MeshPhysicalMaterial({ color: this.col.signal.clone(), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), beadMat, nB);
    beads.castShadow = true;
    beads.frustumCulled = false;
    beads.visible = false;
    const r = rng(7);
    this.beads = { mesh: beads, mat: beadMat, n: nB, data: [] };
    for (let i = 0; i < nB; i++) this.beads.data.push({ s: i % 5, u: r(), speed: 0.035 + 0.03 * r(), ph: r() * 6.28 });
    scene.add(beads);

    // three gates
    this.rings = [];
    const ringGeo = new THREE.TorusGeometry(1, 0.085, 24, 120);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(ringGeo, ceramic.clone());
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      this.rings.push(m);
    }
    // the building the self-hosted strands go into
    this.box = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.06), ceramic);
    this.box.castShadow = true;
    this.box.visible = false;
    scene.add(this.box);

    // tangle parameters per strand
    const tr = rng(11);
    this.tangle = [];
    for (let s = 0; s < 5; s++) {
      this.tangle.push({ a: 1.2 + 1.5 * tr(), b: 2.8 + 2.2 * tr(), c: 0.9 + 1.6 * tr(), p1: tr() * 6.28, p2: tr() * 6.28, p3: tr() * 6.28 });
    }

    this._initMatrix();
    this._initForecastExtras();
    this._initDots();

    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._ceramicCol = this.col.ceramic;
    this._tintCol = new THREE.Color('#9DAEDF');
    this._cobaltCol = new THREE.Color('#2A4093');
  }

  /* ------------------------------------------------ WARPSPD: ratings matrix */

  _initMatrix() {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.16 });
    const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
    const cells = new THREE.InstancedMesh(geo, mat, MR * MC);
    const factors = new THREE.InstancedMesh(geo, mat, MR * MF + MF * MC);
    [cells, factors].forEach((m) => { m.castShadow = true; m.frustumCulled = false; });
    const group = new THREE.Group();
    group.add(cells, factors);
    group.visible = false;
    this.scene.add(group);

    // a small low-rank model, so the filled-in cells agree with the factors
    const r = rng(23);
    const U = [], V = [];
    for (let i = 0; i < MR; i++) U.push([0, 0, 0].map(() => 0.3 + 0.7 * r()));
    for (let j = 0; j < MC; j++) V.push([0, 0, 0].map(() => 0.3 + 0.7 * r()));
    const cellsData = [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < MR; i++) {
      for (let j = 0; j < MC; j++) {
        const v = U[i][0] * V[j][0] + U[i][1] * V[j][1] + U[i][2] * V[j][2];
        lo = Math.min(lo, v); hi = Math.max(hi, v);
        cellsData.push({ i, j, v, known: r() < 0.42 });
      }
    }
    cellsData.forEach((c) => {
      c.rating = 1 + Math.round(4 * (c.v - lo) / (hi - lo)); // 1..5
      c.d = (c.i + c.j) / (MR + MC - 2);
      cells.setColorAt(c.i * MC + c.j, c.known ? this.col.known : this.col.ceramic);
    });
    const fData = [];
    for (let i = 0; i < MR; i++) for (let f = 0; f < MF; f++) fData.push({ row: true, i, f, v: U[i][f] });
    for (let j = 0; j < MC; j++) for (let f = 0; f < MF; f++) fData.push({ row: false, j, f, v: V[j][f] });
    fData.forEach((d, k) => factors.setColorAt(k, this.col.deep));
    cells.instanceColor.needsUpdate = true;
    factors.instanceColor.needsUpdate = true;
    this.mtx = { group, cells, factors, cellsData, fData, predColorSet: false };
  }

  /* ------------------------------------ WARPSPD: forecast band and anomaly */

  _initForecastExtras() {
    const nb = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nb * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < nb - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    geo.setIndex(idx);
    const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color('#2A4093'), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    band.frustumCulled = false;
    band.visible = false;
    band.renderOrder = -1;
    this.scene.add(band);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshPhysicalMaterial({ color: this.col.signal.clone(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }));
    dot.castShadow = true;
    dot.visible = false;
    this.scene.add(dot);
    this.fc = { band, dot, nb, uF: 0.64, uA: 0.36 };
  }

  /* ----------------------------------------- 50,000 cries: one dot each */

  _initDots() {
    const N = N_RECORDINGS;
    const NX = 250;
    const geo = new THREE.BufferGeometry();
    const aGrid = new Float32Array(N * 3), aSorted = new Float32Array(N * 3), aEmbed = new Float32Array(N * 3); // aGrid is 'position'
    const aInfo = new Float32Array(N * 4);
    const r = rng(31);
    // balanced labels in random order: the unsorted sheet mixes all five
    const cls = new Uint8Array(N);
    for (let i = 0; i < N; i++) cls[i] = i % 5;
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = cls[i]; cls[i] = cls[j]; cls[j] = t; }
    const rank = new Uint32Array(N); // position of each dot within its class
    const seen = [0, 0, 0, 0, 0];
    const pred = new Uint8Array(N);
    const gx = new Float32Array(N), gz = new Float32Array(N), sx = new Float32Array(N), sz = new Float32Array(N);
    const ex = new Float32Array(N), ey = new Float32Array(N), ez = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const c = cls[i];
      rank[i] = seen[c]++;
      const wrong = r() < 0.1; // "around 90% accuracy"
      pred[i] = wrong ? (c + 1 + Math.floor(r() * 4)) % 5 : c;
      aInfo[i * 4] = i / N;
      aInfo[i * 4 + 1] = c;
      aInfo[i * 4 + 2] = wrong ? 1 : 0;
      aInfo[i * 4 + 3] = r();
      // unit sheet coordinates: x across (0..1), z front to back (0..1)
      gx[i] = (i % NX) / (NX - 1);
      gz[i] = Math.floor(i / NX) / (N / NX - 1);
      const k = rank[i], band = Math.floor(N / 5 / NX); // 40 rows per class
      sx[i] = (k % NX) / (NX - 1);
      const row = c * band + Math.floor(k / NX);
      sz[i] = (row + c * 1.6) / (N / NX - 1 + 4 * 1.6);
      ex[i] = gauss(r); ey[i] = gauss(r); ez[i] = gauss(r);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(aGrid, 3)); // the unsorted sheet
    geo.setAttribute('aSorted', new THREE.BufferAttribute(aSorted, 3));
    geo.setAttribute('aEmbed', new THREE.BufferAttribute(aEmbed, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(aInfo, 4));

    const uniforms = {
      uStream: { value: 0 }, uSort: { value: 0 }, uEmbed: { value: 0 }, uErr: { value: 0 },
      uAlpha: { value: 0 }, uSize: { value: 0.01 }, uScale: { value: 500 },
      uSource: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uRot: { value: 0 },
      uArc: { value: 0.3 }, uHop: { value: 0.05 }, uFlight: { value: STREAM_FLIGHT },
      uInk: { value: lin('#2B2D3C') }, uSignal: { value: lin('#EC4F24') },
      uClass: { value: CLASS_HEX.map((h) => lin(h)) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec3 aSorted;
        attribute vec3 aEmbed;
        attribute vec4 aInfo;
        uniform float uStream, uSort, uEmbed, uErr, uAlpha, uSize, uScale, uRot, uArc, uHop, uFlight;
        uniform vec3 uSource, uCenter, uInk, uSignal;
        uniform vec3 uClass[5];
        varying vec3 vColor;
        varying float vAlpha;
        float ease(float t) { return t * t * (3.0 - 2.0 * t); }
        void main() {
          float rnd = aInfo.w;
          float arrive = clamp((uStream - aInfo.x) / uFlight, 0.0, 1.0);
          float a = ease(arrive);
          vec3 p = mix(uSource, position, a);
          p.y += sin(3.14159 * a) * uArc * (0.6 + 0.8 * rnd);
          float s = ease(clamp(uSort * 1.4 - rnd * 0.4, 0.0, 1.0));
          p = mix(p, aSorted, s);
          p.y += sin(3.14159 * s) * uHop;
          float e = ease(clamp(uEmbed * 1.35 - rnd * 0.35, 0.0, 1.0));
          vec3 q = aEmbed - uCenter;
          float cr = cos(uRot), sr = sin(uRot);
          q.xz = vec2(cr * q.x + sr * q.z, -sr * q.x + cr * q.z);
          p = mix(p, uCenter + q, e);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float on = step(0.0001, arrive);
          gl_PointSize = max(1.25, uSize * (0.8 + 0.4 * rnd) * uScale / -mv.z) * on;
          int ci = int(aInfo.y + 0.5);
          vec3 cls = uClass[0];
          if (ci == 1) cls = uClass[1];
          else if (ci == 2) cls = uClass[2];
          else if (ci == 3) cls = uClass[3];
          else if (ci == 4) cls = uClass[4];
          vec3 col = mix(uInk, cls, s);
          col = mix(col, uSignal, aInfo.z * uErr);
          vColor = col;
          vAlpha = uAlpha * on * mix(0.78, 1.0, max(s, aInfo.z * uErr));
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d);
          if (r2 > 0.25) discard;
          vec3 n = vec3(d * 2.0, sqrt(max(0.0, 1.0 - 4.0 * r2)));
          float lit = 0.62 + 0.38 * max(0.0, dot(n, normalize(vec3(-0.4, 0.6, 0.7))));
          float spec = pow(max(0.0, dot(n, normalize(vec3(-0.3, 0.45, 0.85)))), 24.0) * 0.28;
          float edge = smoothstep(0.25, 0.17, r2);
          gl_FragColor = vec4(vColor * lit + spec, vAlpha * edge);
          #include <colorspace_fragment>
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 2;
    this.scene.add(points);
    this.dots = { points, geo, uniforms, N, gx, gz, sx, sz, ex, ey, ez, pred, cls };
  }

  /* ---------------------------------------------------------------- layout */

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    Object.values(this.labels || {}).forEach((el) => { el._hw = 0; });
    const dpr = Math.min(window.devicePixelRatio || 1, this.small ? 1.5 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h;
    const cam = this.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    this.viewH = 2 * this.camZ * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    this.viewW = this.viewH * cam.aspect;
    // phones held sideways (short and wide) keep the desktop split: text left, 3D right
    this.portrait = w / h < 1.05 || (w < 768 && h > 500);
    this.dotScale = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));

    const s = this.portrait
      ? { fx: 0.5, fy: 0.74, fw: 0.94, fh: 0.44 }
      : (w < 1024 ? { fx: 0.74, fy: 0.54, fw: 0.48, fh: 0.64 } : { fx: 0.705, fy: 0.53, fw: 0.52, fh: 0.7 });
    this.cx = (s.fx - 0.5) * this.viewW;
    this.cy = (0.5 - s.fy) * this.viewH;
    const sw = s.fw * this.viewW, sh = s.fh * this.viewH;
    this.k = Math.min(sw, sh) / 2;
    this.ax = sw / (2 * this.k);
    this.ay = sh / (2 * this.k);

    const sc = this.key.shadow.camera;
    sc.left = -this.viewW * 0.7; sc.right = this.viewW * 0.7;
    sc.top = this.viewH * 0.7; sc.bottom = -this.viewH * 0.7;
    sc.updateProjectionMatrix();

    this._layoutProps();
    this._buildKeys();
    this._layoutMatrix();
    this._layoutDots();
    this.lastT = -1;
  }

  _st(sx, sy, sz, out, i) {
    out[i * 3] = this.cx + sx * this.k;
    out[i * 3 + 1] = this.cy + sy * this.k;
    out[i * 3 + 2] = sz * this.k;
  }

  _layoutProps() {
    const { k, ax } = this;
    // relief and dots share a tilted table seen from the front
    const g = this.relief.group;
    const alpha = 0.95;
    // leave room on the right for the class labels in landscape layouts
    const Wr = 2 * ax * k * (this.portrait ? 0.84 : 0.74);
    const Dr = (2 * this.ay * k * 0.56) / Math.sin(alpha);
    this.relief.Hs = 0.34 * k;
    g.position.set(this.cx - (this.portrait ? 0.06 * k : 0.16 * ax * k), this.cy - 0.12 * k, 0.45 * (k / 1.9));
    g.rotation.set(alpha, 0, 0);
    g.scale.set(Wr, this.relief.Hs, Dr);
    g.updateMatrixWorld(true);
    this.table.position.copy(g.position);
    this.table.rotation.copy(g.rotation);
    this.table.scale.set(Wr, 1, Dr);
    this.table.updateMatrixWorld(true);
    this.tableW = Wr;
    this.relief.base = { pos: g.position.clone(), scale: g.scale.clone() };
    this.relief.state = '';

    // gates
    this.gateY = 0.1;
    this.gateX = [-0.55 * ax, -0.05 * ax, 0.45 * ax];
    this.splitX = 0.66 * ax;
    this.boxP = [0.84 * ax, -0.66];
    const ringR = 0.21 * k;
    this.rings.forEach((m, i) => {
      m.position.set(this.cx + this.gateX[i] * k, this.cy + this.gateY * k, 0);
      m.rotation.set(0.1, 1.12, 0);
      m.scale.setScalar(ringR);
      m.userData.baseScale = ringR;
    });
    this.box.position.set(this.cx + this.boxP[0] * k, this.cy + this.boxP[1] * k, 0.05 * k);
    this.box.rotation.set(0.14, 0.62, 0);
    this.box.userData.base = new THREE.Vector3(0.34 * k, 0.26 * k, 0.3 * k);

    // where the dots come from, and where the five clusters sit
    this.dotSource = new THREE.Vector3(this.cx - ax * k * 0.98, this.cy + 0.34 * k, 0.25 * k);
    this.clusters = this.portrait
      ? [[-0.6, 0.44, 0.1], [0.02, 0.52, -0.1], [0.62, 0.38, 0.15], [-0.44, -0.42, 0.25], [0.48, -0.46, 0]]
      : [[-0.72 * ax, 0.3, 0.1], [-0.36 * ax, -0.3, 0.3], [0.0, 0.36, -0.15], [0.36 * ax, -0.26, 0.2], [0.72 * ax, 0.3, 0]];
  }

  _layoutMatrix() {
    const { k, ax } = this;
    const m = this.mtx;
    const gridW = 2 * ax * k * (this.portrait ? 0.62 : 0.66);
    const pitch = gridW / MC;
    m.pitch = pitch;
    m.hMax = (this.portrait ? 0.3 : 0.34) * k;
    m.group.position.set(this.cx + 1.3 * pitch, this.cy - 0.06 * k, 0.12 * k);
    m.group.rotation.set(1.0, -0.16, 0);
    m.group.updateMatrixWorld(true);
    m.x0 = -((MC - 1) / 2) * pitch;
    m.z0 = -((MR - 1) / 2) * pitch;
  }

  _layoutDots() {
    const d = this.dots, N = d.N;
    const aGrid = d.geo.attributes.position.array, aSorted = d.geo.attributes.aSorted.array, aEmbed = d.geo.attributes.aEmbed.array;
    const tm = this.table.matrixWorld.elements;
    const lift = 0.004 * this.k;
    const toWorld = (x, z, out, i) => {
      // table local (x - 0.5, 0, z - 0.5), front row nearest the viewer
      const lx = x - 0.5, lz = 0.5 - z;
      out[i * 3] = tm[0] * lx + tm[8] * lz + tm[12];
      out[i * 3 + 1] = tm[1] * lx + tm[9] * lz + tm[13] + lift;
      out[i * 3 + 2] = tm[2] * lx + tm[10] * lz + tm[14];
    };
    const k = this.k;
    const sp = this.portrait ? [0.13, 0.11, 0.13] : [0.12, 0.1, 0.15];
    for (let i = 0; i < N; i++) {
      toWorld(d.gx[i], d.gz[i], aGrid, i);
      toWorld(d.sx[i], d.sz[i], aSorted, i);
      const c = this.clusters[d.pred[i]];
      aEmbed[i * 3] = this.cx + (c[0] + d.ex[i] * sp[0]) * k;
      aEmbed[i * 3 + 1] = this.cy + (c[1] + d.ey[i] * sp[1]) * k;
      aEmbed[i * 3 + 2] = (c[2] + d.ez[i] * sp[2]) * k;
    }
    d.geo.attributes.aSorted.needsUpdate = true;
    d.geo.attributes.aEmbed.needsUpdate = true;
    d.geo.attributes.position.needsUpdate = true;
    const u = d.uniforms;
    u.uSource.value.copy(this.dotSource);
    u.uCenter.value.set(this.cx, this.cy, 0);
    u.uSize.value = (this.tableW / 250) * (this.portrait ? 0.8 : 0.68);
    u.uScale.value = this.dotScale;
    u.uArc.value = 0.32 * k;
    u.uHop.value = 0.05 * k;
  }

  /* ---------------------------------------------------------- keyframes */

  _buildKeys() {
    const nM = this.main.tube.n;
    const main = this.main.keys;
    const { viewH, k } = this;
    main.K0 = { p: this._genHero(nM), r: viewH * (this.portrait ? 0.0085 : 0.0105), e: 0.012 };
    main.KT = { p: this._genTangle(0, nM), r: k * 0.02, e: 0.03 };
    main.KB = { p: this._genBraid(0, nM), r: k * 0.02, e: 0.03 };
    main.KGa = { p: this._genGates(0, nM, false), r: k * 0.02, e: 0.03 };
    main.KGb = { p: this._genGates(0, nM, true), r: k * 0.02, e: 0.03 };
    main.KF = { p: this._genForecast(nM), r: k * 0.021, e: 0.02 };
    main.KW = { p: this._genWave(nM), r: k * 0.028, e: 0.04 };
    main.KR = { p: this._genReliefEdge(nM), r: k * 0.026, e: 0.04 };
    main.KC = { p: this._genContact(nM), r: viewH * (this.portrait ? 0.0075 : 0.009), e: 0.012 };

    for (const t of this.threads) {
      const n = t.tube.n;
      const onMain = (key) => ({ p: resample(main[key].p, nM, n), r: 0, e: 0.03 });
      t.keys.K0 = onMain('K0');
      t.keys.KT = { p: this._genTangle(t.s, n), r: k * 0.0145, e: 0.03 };
      t.keys.KB = { p: this._genBraid(t.s, n), r: k * 0.0145, e: 0.03 };
      t.keys.KGa = { p: this._genGates(t.s, n, false), r: k * 0.0145, e: 0.03 };
      t.keys.KGb = { p: this._genGates(t.s, n, true), r: k * 0.0145, e: 0.03 };
      ['KF', 'KW', 'KR', 'KC'].forEach((key) => { t.keys[key] = onMain(key); });
    }
    this._layoutBand();
  }

  setHeroBand(band) {
    this.heroBand = band;
    if (this.main && this._bandHero()) {
      this.main.keys.K0.p = this._genHero(this.main.tube.n);
      this.threads.forEach((t) => { t.keys.K0.p = resample(this.main.keys.K0.p, this.main.tube.n, t.tube.n); });
      this.lastT = -1;
    }
  }

  // stacked heroes (phones, portrait tablets) and short sideways screens: the hero
  // line runs through the free band between the name and the headline
  _bandHero() { return this.portrait || this.h <= 500; }

  _genHero(n) {
    const out = new Float32Array(n * 3);
    const { viewW, viewH } = this;
    let fy = this.portrait ? 0.3 : 0.43;
    let amp = (this.portrait ? 0.04 : 0.054) * viewH;
    const band = this.heroBand;
    if (this._bandHero() && band && band.bottom - band.top > 0.05) {
      // a little above centre: the shadow falls below the line
      fy = band.top + 0.42 * (band.bottom - band.top);
      amp = Math.min(amp, 0.28 * (band.bottom - band.top) * viewH);
    }
    // the hero line sits slightly in front of the z = 0 plane; undo the perspective
    const y0 = (0.5 - fy) * viewH * ((this.camZ - 0.25) / this.camZ);
    const cycles = this.portrait ? 14 : 24;
    const bursts = this.portrait
      ? [{ t0: 0.04, d: 0.16, a: 0.9 }, { t0: 0.24, d: 0.16, a: 1 }, { t0: 0.43, d: 0.12, a: 0.6 }]
      : HERO_BURSTS;
    const xL = -viewW / 2 - 0.3, xR = viewW / 2 + 0.3;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const mess = 1 - smooth(0.42, 0.55, u);
      out[i * 3] = lerp(xL, xR, u);
      out[i * 3 + 1] = y0 + amp * (cryWave(u, cycles, bursts) + 0.1 * mess * Math.sin(2 * Math.PI * 61 * u));
      out[i * 3 + 2] = 0.25 + 0.12 * Math.sin(u * Math.PI * 2.2);
    }
    return out;
  }

  _genWave(n) {
    const out = new Float32Array(n * 3);
    const { ax } = this;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this._st(lerp(-ax, ax, u), 0.08 + 0.42 * cryWave(u, 12) + 0.025 * Math.sin(2 * Math.PI * 37 * u), 0.06 * Math.sin(u * Math.PI), out, i);
    }
    return out;
  }

  _genReliefEdge(n) {
    const out = new Float32Array(n * 3);
    const m = this.relief.group.matrixWorld;
    const v = this._v || new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      v.set(u - 0.5, 0.22 * cryEnvelope(u) + 0.04, 0.5).applyMatrix4(m);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y + 0.12 * this.k * cryWave(u, 12);
      out[i * 3 + 2] = v.z + 0.07 * this.k;
    }
    return out;
  }

  // a sales-like series: trend, a season, noise, one anomaly, then a smooth forecast
  _series(u) {
    const trend = -0.3 + 0.44 * u;
    const season = 0.13 * Math.sin(2 * Math.PI * 3.6 * u + 0.4);
    const noise = 0.034 * Math.sin(2 * Math.PI * 41 * u) + 0.024 * Math.sin(2 * Math.PI * 67 * u + 1.3) + 0.018 * Math.sin(2 * Math.PI * 97 * u + 2.1);
    const spike = 0.36 * Math.exp(-Math.pow((u - this.fc.uA) / 0.0075, 2));
    return trend + season + noise * (1 - smooth(this.fc.uF - 0.04, this.fc.uF, u)) + spike;
  }

  _genForecast(n) {
    const out = new Float32Array(n * 3);
    const { ax } = this;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this._st(lerp(-ax * 0.98, ax * 0.98, u), this._series(u), 0.05 * Math.sin(u * Math.PI), out, i);
    }
    return out;
  }

  _layoutBand() {
    const fc = this.fc;
    const pos = fc.band.geometry.attributes.position.array;
    const { ax } = this;
    for (let i = 0; i < fc.nb; i++) {
      const u = lerp(fc.uF, 1, i / (fc.nb - 1));
      const w = 0.2 * Math.sqrt((u - fc.uF) / (1 - fc.uF));
      const x = this.cx + lerp(-ax * 0.98, ax * 0.98, u) * this.k;
      const y = this.cy + this._series(u) * this.k;
      const z = (0.05 * Math.sin(u * Math.PI) - 0.03) * this.k;
      pos[i * 6] = x; pos[i * 6 + 1] = y + w * this.k; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y - w * this.k; pos[i * 6 + 5] = z;
    }
    fc.band.geometry.attributes.position.needsUpdate = true;
    fc.bandDraw = -1;
  }

  _baseline(u) {
    const { ax } = this;
    return [lerp(-ax * 1.0, ax * 1.28, u), 0.05 + 0.13 * Math.sin(Math.PI * (u * 1.15 - 0.1)), 0];
  }

  _genTangle(s, n) {
    const out = new Float32Array(n * 3);
    const f = this.tangle[s];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const [bx, by] = this._baseline(u);
      const A = 0.42 * Math.pow(Math.sin(Math.PI * clamp(u * 1.02)), 0.8);
      const dy = A * (0.6 * Math.sin(2 * Math.PI * f.a * u + f.p1) + 0.4 * Math.sin(2 * Math.PI * f.b * u + f.p2));
      const dz = A * 0.9 * Math.cos(2 * Math.PI * f.c * u + f.p3);
      this._st(bx, by + dy, dz, out, i);
    }
    return out;
  }

  _genBraid(s, n) {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const [bx, by] = this._baseline(u);
      const R = 0.1 * smooth(0, 0.08, u) * (1 - 0.3 * smooth(0.9, 1, u));
      const a = (2 * Math.PI * s) / 5 + 2 * Math.PI * 4.2 * u;
      this._st(bx, by + R * Math.cos(a), R * Math.sin(a) * 1.3, out, i);
    }
    return out;
  }

  _genGates(s, n, split) {
    const out = new Float32Array(n * 3);
    const { ax } = this;
    const y = this.gateY, xs = this.splitX, us = 0.72;
    const xStart = -ax * 1.0, xEnd = ax * 1.4;
    const local = s <= 1; // the two strands flagged at the first gate and not maskable
    const [bxBox, byBox] = this.boxP;
    const boxTop = byBox + 0.13;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      let x, cy, R, a;
      if (u <= us) {
        x = lerp(xStart, xs, u / us);
        cy = y;
        let pinch = 0;
        for (const gx of this.gateX) pinch += Math.exp(-Math.pow((x - gx) / 0.09, 2));
        R = 0.085 * smooth(0, 0.06, u) * (1 - 0.4 * clamp(pinch));
        a = (2 * Math.PI * s) / 5 + 2 * Math.PI * 3.2 * u;
        this._st(x, cy + R * Math.cos(a), R * Math.sin(a) * 1.3, out, i);
      } else {
        const v = (u - us) / (1 - us);
        if (split && local) {
          // quadratic bezier from the split point down into the box
          const p0 = [xs, y], p1 = [bxBox + 0.02, y + 0.02], p2 = [bxBox, boxTop - 0.06];
          const iv = 1 - v;
          x = iv * iv * p0[0] + 2 * iv * v * p1[0] + v * v * p2[0];
          cy = iv * iv * p0[1] + 2 * iv * v * p1[1] + v * v * p2[1];
          R = lerp(0.07, 0.02, v);
          a = Math.PI * s + 2 * Math.PI * 2 * v;
        } else if (split) {
          x = lerp(xs, xEnd, v);
          cy = y + 0.14 * smooth(0, 1, v);
          R = lerp(0.07, 0.03, v);
          a = (2 * Math.PI * s) / 3 + 2 * Math.PI * 1.5 * v;
        } else {
          x = lerp(xs, xEnd, v);
          cy = y;
          R = 0.085;
          a = (2 * Math.PI * s) / 5 + 2 * Math.PI * 3.2 * u;
        }
        this._st(x, cy + R * Math.cos(a), R * Math.sin(a) * 1.3, out, i);
      }
    }
    return out;
  }

  _genContact(n) {
    const out = new Float32Array(n * 3);
    const { viewW, viewH } = this;
    const y0 = (0.5 - (this.portrait ? 0.6 : 0.735)) * viewH;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      out[i * 3] = lerp(-viewW / 2 - 0.3, viewW / 2 + 0.3, u);
      out[i * 3 + 1] = y0 + 0.012 * viewH * Math.sin(u * Math.PI * 2.4 + 0.6);
      out[i * 3 + 2] = 0.2 + 0.1 * Math.sin(u * Math.PI * 1.6);
    }
    return out;
  }

  /* ------------------------------------------------------------ per frame */

  _findSeg(T) {
    let i = 0;
    while (i < SCHEDULE.length - 2 && T >= SCHEDULE[i + 1][1]) i++;
    const [ka, ta] = SCHEDULE[i];
    const [kb, tb] = SCHEDULE[i + 1];
    const w = tb > ta ? easeInOut(clamp((T - ta) / (tb - ta))) : 1;
    return { ka, kb, w };
  }

  // which part of the line is drawn, as [start, end] along its length
  _drawRange(T) {
    if (T < 4.0) return [0, this.intro];
    if (T < 4.5) return [smooth(4.0, 4.45, T), 1];
    if (T < 5.35) return [1, 1];
    if (T < 7.0) return [0, smooth(5.35, 5.72, T)];
    if (T < 7.3) return [smooth(7.0, 7.28, T), 1];
    if (T < 9.5) return [1, 1];
    return [0, smooth(9.55, 10.0, T)];
  }

  // orange marks what a data scientist has to catch: noise, flagged data, errors
  _paint(entry, T) {
    const tube = entry.tube, n = tube.n, P = tube.P, C = tube.C;
    const s = entry.s;
    const hero = s === 0 && T < 0.9 ? 1 : 0;
    const g0 = T > 3 && T < 4.5 && s <= 2 ? smooth(GATE_T[0], GATE_T[0] + 0.07, T) : 0;
    const g1 = s === 2 ? smooth(GATE_T[1], GATE_T[1] + 0.07, T) : 0;
    if (hero < 0.002 && g0 < 0.002) {
      if (tube.colorKey !== 'plain') { tube.fillColor(this.col.cobalt); tube.colorKey = 'plain'; }
      return;
    }
    const key = `${Math.round(T * 400)}|${this.layoutId}`;
    if (tube.colorKey === key) return;
    tube.colorKey = key;
    const c = this._c, cob = this.col.cobalt, sig = this.col.signal;
    const [u0, u1] = this.portrait ? [0.5, 0.514] : [0.555, 0.61];
    const wipe = smooth(0.06, 0.85, T);
    // a crisp edge as soon as the wipe starts, so the two colours never blend into purple
    const bEnd = lerp(u1, -0.04, wipe), bStart = bEnd - lerp(u1 - u0, 0.007, smooth(0.03, 0.18, T));
    const e = 0.035 * this.k;
    const gx0 = this.cx + this.gateX[0] * this.k, gx1 = this.cx + this.gateX[1] * this.k;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = P[i * 3];
      let m = hero * (1 - smooth(bStart, bEnd, u));
      if (g0 > 0) {
        const flagged = smooth(gx0 - e, gx0 + e, x) * g0;
        const cleared = g1 * smooth(gx1 - e, gx1 + e, x);
        m = Math.max(m, flagged * (1 - cleared));
      }
      c.copy(cob).lerp(sig, m);
      C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b;
    }
  }

  _strand(entry, seg, drawStart, drawEnd, wob, yShift = 0) {
    const tube = entry.tube;
    const A = entry.keys[seg.ka], B = entry.keys[seg.kb];
    const n = tube.n, P = tube.P, R = tube.R;
    const w = seg.w;
    const r = lerp(A.r, B.r, w);
    const e = lerp(A.e, B.e, w);
    if (r <= 1e-5 || drawEnd <= drawStart + 1e-4) {
      tube.mesh.visible = false;
      return false;
    }
    tube.mesh.visible = true;
    const pa = A.p, pb = B.p;
    const t = this.time;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const j = i * 3;
      P[j] = pa[j] + (pb[j] - pa[j]) * w;
      P[j + 1] = pa[j + 1] + (pb[j + 1] - pa[j + 1]) * w + wob * Math.sin(t * 1.1 + u * 9 + (entry.phase || 0)) + yShift;
      P[j + 2] = pa[j + 2] + (pb[j + 2] - pa[j + 2]) * w;
      const taper = smooth(0, e, u) * smooth(0, e, 1 - u);
      const vis = smooth(drawStart - 0.001, drawStart + 0.025, u) * (1 - smooth(drawEnd - 0.025, drawEnd + 0.001, u));
      R[i] = r * taper * vis;
    }
    this._paint(entry, this.T);
    tube.update();
    return true;
  }

  _relief(T) {
    const rel = this.relief;
    const appear = smooth(6.42, 6.56, T) * (1 - smooth(7.12, 7.19, T));
    rel.group.visible = appear > 0.001;
    if (!rel.group.visible) return;
    rel.mesh.material.opacity = appear;
    // after printing, the whole spectrogram shrinks into the first dot
    const shrink = easeInOut(smooth(6.98, 7.17, T));
    const b = rel.base;
    rel.group.position.copy(b.pos).lerp(this.dotSource, shrink);
    rel.group.scale.copy(b.scale).multiplyScalar(1 - 0.97 * shrink);
    rel.group.updateMatrixWorld(true);
    const reveal = lerp(0.02, 1.1, smooth(6.52, 6.95, T));
    const key = reveal.toFixed(3);
    if (key === rel.state) return;
    rel.state = key;
    const { cols, rows, H, geo } = rel;
    const pos = geo.attributes.position.array;
    const col = geo.attributes.color.array;
    const c = this._c;
    // PlaneGeometry rows run back (iy = 0) to front (iy = rows - 1)
    for (let iy = 0; iy < rows; iy++) {
      const j = rows - 1 - iy; // frequency index, 0 = front
      for (let ix = 0; ix < cols; ix++) {
        const x = ix / (cols - 1);
        const mask = 1 - smooth(reveal - 0.09, reveal, x);
        const h = H[j * cols + ix] * mask;
        const vi = iy * cols + ix;
        pos[vi * 3] = Math.min(x, reveal) - 0.5; // the sheet unrolls as it is printed
        pos[vi * 3 + 1] = h;
        c.copy(this._ceramicCol).lerp(this._tintCol, Math.pow(h, 1.3) * 0.9);
        col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
  }

  _beads(T, dt) {
    const b = this.beads;
    const alpha = smooth(1.05, 1.3, T) * (1 - smooth(4.0, 4.3, T));
    b.mesh.visible = alpha > 0.001;
    if (!b.mesh.visible) return;
    // orange while the agents talk over each other, paper once they take turns
    const calm = smooth(2.25, 2.6, T);
    b.mat.color.copy(this.col.signal).lerp(this.col.ceramic, calm);
    const m = this._m, q = this._q, s = this._s, p = this._v;
    q.identity();
    const strands = [this.main.tube, ...this.threads.map((x) => x.tube)];
    const r = 0.022 * this.k * alpha;
    const move = this.reduced ? 0 : dt;
    b.data.forEach((d, i) => {
      d.u += move * d.speed * (0.7 + 0.8 * calm);
      const jitter = (1 - calm) * 0.035 * Math.sin(this.time * 2.3 + d.ph);
      const u = (((d.u + jitter + 0.3 * (T - 1.3)) % 1) + 1) % 1;
      const tube = strands[d.s];
      sampleAt(tube.P, tube.n, 0.04 + u * 0.92, p);
      const fade = smooth(0, 0.08, u) * smooth(0, 0.08, 1 - u);
      s.setScalar(Math.max(r * fade * (tube.mesh.visible ? 1 : 0), 1e-5));
      m.compose(p, q, s);
      b.mesh.setMatrixAt(i, m);
    });
    b.mesh.instanceMatrix.needsUpdate = true;
  }

  _gates(T) {
    const scaleIn = smooth(3.05, 3.3, T) * (1 - smooth(4.0, 4.25, T));
    this.rings.forEach((ring, i) => {
      ring.visible = scaleIn > 0.001;
      if (!ring.visible) return;
      ring.scale.setScalar(ring.userData.baseScale * (0.6 + 0.4 * scaleIn));
      const on = smooth(GATE_T[i], GATE_T[i] + 0.06, T);
      ring.material.color.copy(this._ceramicCol).lerp(this._cobaltCol, on);
      ring.rotation.z = this.reduced ? 0 : Math.sin(this.time * 0.4 + i) * 0.05;
    });
    const bIn = smooth(3.6, 3.8, T) * (1 - smooth(4.05, 4.25, T));
    this.box.visible = bIn > 0.001;
    if (this.box.visible) {
      const b = this.box.userData.base;
      this.box.scale.set(b.x, b.y * bIn, b.z);
    }
  }

  _matrix(T) {
    const m = this.mtx;
    const on = T > 4.5 && T < 5.66;
    m.group.visible = on;
    if (!on) return;
    const M4 = this._m, q = this._q, s = this._s, p = this._v;
    q.identity();
    const pitch = m.pitch, foot = pitch * 0.78, tile = 0.05 * pitch;
    const exit = easeInOut(smooth(5.44, 5.62, T));
    const c = this._c;
    let colorDirty = false;
    m.cellsData.forEach((d, idx) => {
      const appear = smooth(4.52 + 0.12 * (d.i / MR), 4.64 + 0.12 * (d.i / MR), T);
      const known = d.known ? easeInOut(smooth(4.66 + 0.14 * d.d, 4.84 + 0.14 * d.d, T)) : 0;
      const pr = d.known ? 0 : easeInOut(smooth(5.08 + 0.22 * d.d, 5.22 + 0.22 * d.d, T));
      const target = (d.rating / 5) * m.hMax;
      let h = tile + (target - tile) * Math.max(known, pr);
      h *= 1 - exit;
      const f = foot * appear * (1 - 0.6 * exit);
      p.set(m.x0 + d.j * pitch, h / 2, m.z0 + d.i * pitch);
      s.set(Math.max(f, 1e-5), Math.max(h, 1e-5), Math.max(f, 1e-5));
      M4.compose(p, q, s);
      m.cells.setMatrixAt(idx, M4);
      if (!d.known) {
        const want = pr > 0.02 ? 1 : 0;
        if (d._c !== want) {
          d._c = want;
          c.copy(this.col.ceramic).lerp(this.col.tint, want);
          m.cells.setColorAt(idx, c);
          colorDirty = true;
        }
      }
    });
    if (colorDirty) m.cells.instanceColor.needsUpdate = true;
    m.cells.instanceMatrix.needsUpdate = true;
    const fIn = easeInOut(smooth(4.88, 5.08, T));
    const fh = 0.2 * m.hMax;
    m.fData.forEach((d, idx) => {
      const size = foot * 0.72 * (1 - exit);
      const h = (0.25 + 0.75 * d.v) * fh * fIn * (1 - exit);
      if (d.row) p.set(m.x0 - (MF - d.f + 0.45) * pitch * 0.82 - (1 - fIn) * 1.4 * pitch, h / 2, m.z0 + d.i * pitch);
      else p.set(m.x0 + d.j * pitch, h / 2, m.z0 - (MF - d.f + 0.45) * pitch * 0.82 - (1 - fIn) * 1.4 * pitch);
      s.set(Math.max(size * fIn, 1e-5), Math.max(h, 1e-5), Math.max(size * fIn, 1e-5));
      M4.compose(p, q, s);
      m.factors.setMatrixAt(idx, M4);
    });
    m.factors.instanceMatrix.needsUpdate = true;
  }

  _forecastExtras(T) {
    const fc = this.fc;
    const bandA = smooth(5.62, 5.78, T) * (1 - smooth(5.96, 6.08, T));
    fc.band.visible = bandA > 0.001;
    if (fc.band.visible) {
      fc.band.material.opacity = 0.17 * bandA;
      // the band grows along with the forecast
      const grow = smooth(5.6, 5.8, T);
      const count = Math.max(0, Math.floor((fc.nb - 1) * grow)) * 6;
      if (count !== fc.bandDraw) { fc.bandDraw = count; fc.band.geometry.setDrawRange(0, count); }
    }
    const dotA = smooth(5.66, 5.76, T) * (1 - smooth(5.95, 6.03, T));
    fc.dot.visible = dotA > 0.001 && this.main.tube.mesh.visible;
    if (fc.dot.visible) {
      sampleAt(this.main.tube.P, this.main.tube.n, fc.uA, this._v);
      fc.dot.position.copy(this._v);
      fc.dot.position.y += 0.012 * this.k;
      fc.dot.scale.setScalar(0.042 * this.k * dotA);
    }
  }

  _dots(T) {
    const d = this.dots, u = d.uniforms;
    const alpha = smooth(7.1, 7.2, T) * (1 - smooth(9.02, 9.3, T));
    d.points.visible = alpha > 0.001;
    if (!d.points.visible) return;
    u.uAlpha.value = alpha;
    u.uStream.value = streamWave(T);
    u.uSort.value = smooth(7.8, 8.28, T);
    u.uEmbed.value = smooth(8.42, 8.9, T);
    u.uErr.value = smooth(8.72, 8.92, T);
    u.uRot.value = this.reduced ? 0 : 0.42 * (T - 8.66) * smooth(8.42, 8.9, T);
  }

  _labels(T) {
    const L = this.labels;
    if (!L) return;
    const k = this.k;
    const place = (name, x, y, z, alpha) => {
      const el = L[name];
      if (!el) return;
      if (alpha <= 0.001) { if (el._a !== 0) { el.style.opacity = 0; el._a = 0; } return; }
      this._w.set(x, y, z).project(this.camera);
      const half = (el._hw || (el._hw = el.offsetWidth / 2)) + 10;
      const sx = clamp((this._w.x * 0.5 + 0.5) * this.w, half, this.w - half);
      const sy = (-this._w.y * 0.5 + 0.5) * this.h;
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = alpha.toFixed(3);
      el._a = alpha;
    };
    const land = this.portrait ? 0 : 1;

    // gates
    const gA = smooth(3.05, 3.2, T) * (1 - smooth(3.98, 4.12, T));
    ['g0', 'g1', 'g2'].forEach((n, i) => {
      place(n, this.cx + this.gateX[i] * k, this.cy + (this.gateY - 0.36) * k, 0, gA * land);
    });
    const sA = smooth(3.74, 3.88, T) * (1 - smooth(4.05, 4.18, T));
    place('local', this.cx + this.boxP[0] * k, this.cy + (this.boxP[1] - 0.3) * k, 0, sA);
    place('api', this.cx + this.ax * 0.93 * k, this.cy + (this.gateY + 0.34) * k, 0, sA);

    // ratings matrix
    const m = this.mtx, mw = m.group.matrixWorld;
    const mA = smooth(4.98, 5.1, T) * (1 - smooth(5.4, 5.48, T));
    this._v.set(m.x0 - 2.1 * m.pitch, 0, m.z0 + (MR + 0.9) * m.pitch).applyMatrix4(mw);
    place('users', this._v.x, this._v.y - 0.04 * k, this._v.z, mA);
    this._v.set(m.x0 + MC * m.pitch * 0.55, 0, m.z0 - 3.6 * m.pitch).applyMatrix4(mw);
    place('items', this._v.x, this._v.y + 0.07 * k, this._v.z, mA);
    const pA = smooth(5.22, 5.32, T) * (1 - smooth(5.4, 5.48, T));
    this._v.set(m.x0 + (MC - 1) * m.pitch, 0, m.z0 + (MR - 0.2) * m.pitch).applyMatrix4(mw);
    place('predicted', this._v.x, this._v.y - 0.09 * k, this._v.z, pA);

    // forecast
    const fA = smooth(5.66, 5.8, T) * (1 - smooth(5.95, 6.05, T));
    place('history', this.cx - this.ax * 0.45 * k, this.cy - 0.62 * k, 0, fA);
    place('forecast', this.cx + this.ax * 0.78 * k, this.cy - 0.62 * k, 0, fA);
    if (this.fc.dot.visible) {
      const d = this.fc.dot.position;
      place('anomaly', d.x, d.y + 0.14 * k, d.z, fA);
    } else place('anomaly', 0, 0, 0, 0);

    // spectrogram axes
    const relA = smooth(6.78, 6.9, T) * (1 - smooth(6.97, 7.04, T));
    const rm = this.relief.group.matrixWorld;
    this._v.set(0.36, 0, 0.62).applyMatrix4(rm);
    place('time', this._v.x, this._v.y, this._v.z, relA);
    this._v.set(0.47, 0.02, -0.56).applyMatrix4(rm);
    place('freq', this._v.x, this._v.y + 0.06 * k, this._v.z, relA * land);

    // five cry types: at the end of each band, then above each cluster
    const cA = smooth(7.9, 8.04, T) * (1 - smooth(9.0, 9.14, T));
    const e = easeInOut(smooth(8.42, 8.9, T));
    const tm = this.table.matrixWorld;
    const rot = this.dots.uniforms.uRot.value;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let c = 0; c < 5; c++) {
      const zc = (c * 40 + 19.5 + c * 1.6) / (199 + 6.4);
      this._v.set(0.5 + 0.035, 0, 0.5 - zc).applyMatrix4(tm);
      const cl = this.clusters[c];
      const qx = cl[0] * k, qz = cl[2] * k;
      const wx = this.cx + cr * qx + sr * qz, wz = -sr * qx + cr * qz;
      const wy = this.cy + (cl[1] + 0.34) * k;
      const x = lerp(this._v.x, wx, e), y = lerp(this._v.y, wy, e), z = lerp(this._v.z, wz, e);
      // the bands are keyed by the swatches in the text; labels arrive with the clusters
      place('c' + c, x, y, z, cA * e);
    }
    const wA = smooth(8.76, 8.9, T) * (1 - smooth(9.0, 9.12, T));
    place('wrong', this.cx, this.cy - (this.portrait ? 0.86 : 0.72) * k, 0, wA);
  }

  // Compile every material up front so the first scroll into a chapter does not stall.
  async prepare() {
    const hidden = [];
    this.scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isGroup) && !o.visible) { hidden.push(o); o.visible = true; }
    });
    try {
      if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.compile(this.scene, this.camera);
      // one render with everything shown also builds the shadow-pass programs,
      // which compile() skips; the canvas is still transparent at this point
      this.renderer.render(this.scene, this.camera);
    } catch (e) { /* compile is an optimisation only */ }
    hidden.forEach((o) => { o.visible = false; });
    this.lastT = -1;
  }

  get layoutId() { return `${this.w}x${this.h}`; }

  setT(T) { this.T = T; }
  setIntro(v) { this.intro = v; }
  setPointer(x, y) { this.pointer.tx = x; this.pointer.ty = y; }

  tick(dt) {
    if (!this.reduced) this.time += dt;
    const T = this.T;
    const changed = Math.abs(T - this.lastT) > 1e-5 || this.intro < 1;
    this.idleFrames = changed ? 0 : this.idleFrames + 1;
    this.frame++;
    // when nothing moves, render at half rate to save battery
    if (!changed && this.idleFrames > 90 && this.frame % 2) return;
    if (this.reduced && !changed && this.idleFrames > 2) return;
    this.lastT = T;

    const seg = this._findSeg(T);
    const [drawStart, drawEnd] = this._drawRange(T);
    const heroWob = (1 - smooth(0.2, 1, T)) * 0.0032 * this.viewH;
    const wob = this.reduced ? 0 : heroWob + 0.002 * this.k;

    this.main.phase = 0;
    // after the story, the contact line scrolls with the page like content
    const yShift = T > 9.49 ? (this.contactShift / this.h) * this.viewH : 0;
    this._strand(this.main, seg, drawStart, drawEnd, wob, yShift);
    const threadsOn = T > 0.45 && T < 4.5;
    this.threads.forEach((t, i) => {
      t.phase = (i + 1) * 1.7;
      if (!threadsOn) { t.tube.mesh.visible = false; return; }
      this._strand(t, seg, drawStart, drawEnd, this.reduced ? 0 : 0.003 * this.k);
    });

    this._relief(T);
    this._beads(T, dt);
    this._gates(T);
    this._matrix(T);
    this._forecastExtras(T);
    this._dots(T);
    this._labels(T);

    // subtle pointer parallax
    const p = this.pointer;
    p.x += (p.tx - p.x) * 0.05;
    p.y += (p.ty - p.y) * 0.05;
    this.camera.position.x = p.x * 0.18;
    this.camera.position.y = p.y * 0.12;
    this.camera.lookAt(0, 0, 0);

    // Between chapters (recent work, skills, the closing sections) nothing is on
    // screen: draw one empty frame, then stop drawing until something returns.
    const blank = this._isBlank();
    if (blank && this.blankDrawn) return;
    this.blankDrawn = blank;
    this.renderer.render(this.scene, this.camera);
  }

  _isBlank() {
    let shown = false;
    this.scene.traverseVisible((o) => {
      if (!shown && (o.isMesh || o.isPoints || o.isLine) && !o.userData.catcher) shown = true;
    });
    return !shown;
  }
}
