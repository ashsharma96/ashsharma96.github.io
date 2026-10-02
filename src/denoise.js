/*
  The portrait arrives the way an image model makes a picture: it starts as
  noise and is cleaned up in a handful of discrete steps. Each step mixes the
  photo with fresh Gaussian noise at a falling noise level, inside the
  silhouette, plus a speckled halo that fades as the steps run out.
*/

function gaussian() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// separable box blur of a single channel, used to find the halo around the silhouette
function blur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Plays the denoising reveal over `img` and resolves when the clean photo shows.
 * Rejects if the browser will not let the page read the image's pixels.
 */
export async function denoiseIn(img, { steps = 15, stepMs = 72 } = {}) {
  if (!img.complete || !img.naturalWidth) await img.decode();
  const box = img.getBoundingClientRect();
  if (!box.width || !box.height) throw new Error('portrait not laid out');
  const scale = Math.min(1, 440 / box.width);
  const w = Math.max(2, Math.round(box.width * scale));
  const h = Math.max(2, Math.round(box.height * scale));

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.className = 'denoise';
  cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h); // throws if the image is not readable
  const px = src.data;
  const N = w * h;
  const lum = new Float32Array(N), alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = px[i * 4];
    alpha[i] = px[i * 4 + 3] / 255;
  }
  const halo = blur(alpha, w, h, Math.max(3, Math.round(w / 70)));
  const frame = ctx.createImageData(w, h);
  const out = frame.data;

  img.parentNode.appendChild(cv);

  return new Promise((resolve) => {
    let k = steps;
    const draw = () => {
      const sigma = Math.pow(k / steps, 1.6);
      for (let i = 0; i < N; i++) {
        const a = alpha[i], hl = halo[i];
        const reach = Math.max(a, hl * 1.4);
        if (reach < 0.003) { out[i * 4 + 3] = 0; continue; }
        const n = gaussian();
        const v = lum[i] * (1 - sigma) + (128 + 92 * n) * sigma;
        const speck = hl * sigma * (Math.random() < 0.55 ? 1 : 0);
        const g = v < 0 ? 0 : v > 255 ? 255 : v;
        out[i * 4] = g; out[i * 4 + 1] = g; out[i * 4 + 2] = g;
        out[i * 4 + 3] = Math.min(255, 255 * Math.max(a * (1 - 0.3 * sigma), speck * 0.85));
      }
      ctx.putImageData(frame, 0, 0);
      if (k === steps) cv.classList.add('is-on');
      if (k-- > 0) setTimeout(draw, stepMs);
      else {
        img.style.opacity = '';
        cv.classList.add('is-done');
        setTimeout(() => cv.remove(), 450);
        resolve();
      }
    };
    draw();
  });
}
