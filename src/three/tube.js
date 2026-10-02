import * as THREE from 'three';

/**
 * A tube whose centreline, radius and colour can change every frame without
 * reallocating geometry. Frames use parallel transport so the surface does
 * not twist as the curve bends.
 */
export class DynamicTube {
  constructor(n, radial, material) {
    this.n = n;
    this.radial = radial;
    const verts = n * (radial + 1);
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    const Index = verts > 65535 ? Uint32Array : Uint16Array;
    const idx = new Index((n - 1) * radial * 6);
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        idx[k++] = a; idx[k++] = a + 1; idx[k++] = b;
        idx[k++] = b; idx[k++] = a + 1; idx[k++] = b + 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;

    this.P = new Float32Array(n * 3); // centreline, written by the caller
    this.R = new Float32Array(n);     // radius per point, written by the caller
    this.C = new Float32Array(n * 3); // linear colour per point, written by the caller
    this.colorKey = '';               // caller sets a new key when C changes
    this._colorKey = null;
    this._T = new Float32Array(n * 3);
    this._N = new Float32Array(n * 3);
    this._B = new Float32Array(n * 3);
    this._cos = new Float32Array(radial + 1);
    this._sin = new Float32Array(radial + 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      this._cos[j] = Math.cos(a);
      this._sin[j] = Math.sin(a);
    }
  }

  fillColor(c) {
    const C = this.C;
    for (let i = 0; i < this.n; i++) { C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }
  }

  update() {
    const { n, radial, P, R, _T: T, _N: N, _B: B, _cos, _sin, pos, nor } = this;
    let px = 1, py = 0, pz = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2];
      const len = Math.hypot(tx, ty, tz);
      if (len < 1e-7) { tx = px; ty = py; tz = pz; } else { tx /= len; ty /= len; tz /= len; }
      T[i * 3] = tx; T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
      px = tx; py = ty; pz = tz;
    }
    // initial normal: project a fixed reference so the frame is stable frame to frame
    let rx = 0, ry = 0, rz = 1;
    if (Math.abs(T[2]) > 0.9) { rx = 0; ry = 1; rz = 0; }
    let d = rx * T[0] + ry * T[1] + rz * T[2];
    let nx = rx - d * T[0], ny = ry - d * T[1], nz = rz - d * T[2];
    let nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (let i = 0; i < n; i++) {
      const tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
      d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx; ny -= d * ty; nz -= d * tz;
      nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-6) { // tangent flipped onto the normal: rebuild from a reference
        const ref = Math.abs(tz) > 0.9 ? [0, 1, 0] : [0, 0, 1];
        const dd = ref[0] * tx + ref[1] * ty + ref[2] * tz;
        nx = ref[0] - dd * tx; ny = ref[1] - dd * ty; nz = ref[2] - dd * tz;
        nl = Math.hypot(nx, ny, nz) || 1;
      }
      nx /= nl; ny /= nl; nz /= nl;
      N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
      B[i * 3] = ty * nz - tz * ny;
      B[i * 3 + 1] = tz * nx - tx * nz;
      B[i * 3 + 2] = tx * ny - ty * nx;
    }
    let v = 0;
    for (let i = 0; i < n; i++) {
      const r = R[i];
      const cx = P[i * 3], cy = P[i * 3 + 1], cz = P[i * 3 + 2];
      const Nx = N[i * 3], Ny = N[i * 3 + 1], Nz = N[i * 3 + 2];
      const Bx = B[i * 3], By = B[i * 3 + 1], Bz = B[i * 3 + 2];
      for (let j = 0; j <= radial; j++) {
        const c = _cos[j], s = _sin[j];
        const ox = c * Nx + s * Bx, oy = c * Ny + s * By, oz = c * Nz + s * Bz;
        pos[v] = cx + r * ox; pos[v + 1] = cy + r * oy; pos[v + 2] = cz + r * oz;
        nor[v] = ox; nor[v + 1] = oy; nor[v + 2] = oz;
        v += 3;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;

    // expand per-point colour to the ring vertices only when it changed
    if (this.colorKey !== this._colorKey) {
      this._colorKey = this.colorKey;
      const { C, col } = this;
      let w = 0;
      for (let i = 0; i < n; i++) {
        const r = C[i * 3], g = C[i * 3 + 1], b = C[i * 3 + 2];
        for (let j = 0; j <= radial; j++) { col[w] = r; col[w + 1] = g; col[w + 2] = b; w += 3; }
      }
      this.geometry.attributes.color.needsUpdate = true;
    }
  }
}
