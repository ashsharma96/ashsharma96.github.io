import { smooth } from './util.js';

// Five cry bursts separated by short breaths, used by both the
// time-domain ribbon and the spectrogram relief so the two always agree.
export const BURSTS = [
  { t0: 0.03, d: 0.15, a: 0.9, f: 0.105 },
  { t0: 0.22, d: 0.16, a: 1.0, f: 0.12 },
  { t0: 0.42, d: 0.14, a: 0.82, f: 0.1 },
  { t0: 0.61, d: 0.16, a: 1.0, f: 0.125 },
  { t0: 0.8, d: 0.15, a: 0.78, f: 0.11 },
];

function envelope(t) {
  return smooth(0, 0.12, t) * (1 - smooth(0.72, 1, t));
}

// Time-domain cry signal at u in [0, 1]; `cycles` sets how many oscillations
// fit across the whole length (kept low enough that a thick tube can show them).
export function cryWave(u, cycles, bursts = BURSTS) {
  let y = 0;
  for (const b of bursts) {
    const t = (u - b.t0) / b.d;
    if (t < 0 || t > 1) continue;
    const env = envelope(t) * b.a;
    const ph = 2 * Math.PI * cycles * (u - b.t0) * (1 + 0.18 * Math.sin(Math.PI * t));
    y += env * (0.74 * Math.sin(ph) + 0.26 * Math.sin(2.03 * ph + 1.3));
  }
  return y;
}

// Magnitude envelope (0..1) at u, used to shape the relief's front edge.
export function cryEnvelope(u, bursts = BURSTS) {
  let e = 0;
  for (const b of bursts) {
    const t = (u - b.t0) / b.d;
    if (t < 0 || t > 1) continue;
    e = Math.max(e, envelope(t) * b.a);
  }
  return e;
}

// Synthetic log-magnitude spectrogram of the same cries:
// a rising-then-falling fundamental with harmonics and a formant bump.
export function makeSpectrogram(cols, rows, bursts = BURSTS) {
  const H = new Float32Array(cols * rows);
  let max = 0;
  for (let i = 0; i < cols; i++) {
    const x = i / (cols - 1);
    for (let j = 0; j < rows; j++) {
      const fz = j / (rows - 1); // 0 = low frequency (front edge)
      let v = 0;
      for (const b of bursts) {
        const t = (x - b.t0) / b.d;
        if (t < 0 || t > 1) continue;
        const env = envelope(t) * b.a;
        const f0 = b.f * (1 + 0.28 * Math.sin(Math.PI * t) - 0.08 * t) + 0.006 * Math.sin(t * 38);
        for (let k = 1; k <= 8; k++) {
          const fk = f0 * k;
          if (fk > 1.05) break;
          const d = (fz - fk) / 0.03;
          v += env * Math.pow(k, -0.62) * Math.exp(-d * d);
        }
      }
      v *= 0.55 + 0.45 * Math.exp(-Math.pow((fz - 0.34) / 0.24, 2));
      H[j * cols + i] = v;
      if (v > max) max = v;
    }
  }
  for (let n = 0; n < H.length; n++) H[n] = Math.pow(H[n] / max, 0.85);
  return H;
}
