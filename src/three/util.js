export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const lerp = (a, b, t) => a + (b - a) * t;

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Small seeded PRNG so every visitor sees the same composition.
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r) {
  let u = 0, v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Resample a flat xyz array (n points) to m points by index interpolation.
export function resample(src, n, m, out = new Float32Array(m * 3)) {
  for (let i = 0; i < m; i++) {
    const f = (i / (m - 1)) * (n - 1);
    const a = Math.floor(f), b = Math.min(n - 1, a + 1), w = f - a;
    out[i * 3] = src[a * 3] + (src[b * 3] - src[a * 3]) * w;
    out[i * 3 + 1] = src[a * 3 + 1] + (src[b * 3 + 1] - src[a * 3 + 1]) * w;
    out[i * 3 + 2] = src[a * 3 + 2] + (src[b * 3 + 2] - src[a * 3 + 2]) * w;
  }
  return out;
}

// Sample a flat xyz polyline at parameter u in [0, 1].
export function sampleAt(arr, n, u, out) {
  const f = clamp(u) * (n - 1);
  const a = Math.floor(f), b = Math.min(n - 1, a + 1), w = f - a;
  out.x = arr[a * 3] + (arr[b * 3] - arr[a * 3]) * w;
  out.y = arr[a * 3 + 1] + (arr[b * 3 + 1] - arr[a * 3 + 1]) * w;
  out.z = arr[a * 3 + 2] + (arr[b * 3 + 2] - arr[a * 3 + 2]) * w;
  return out;
}
