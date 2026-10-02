/*
  Skills, trained by scrolling.

  The HTML is the finished picture: five stages on one pipeline, each with its
  group of skills. On wider screens the section pins and starts as an untrained
  embedding: every skill is a grey point scattered in the empty space, a few
  orange noise points sit between them, and the five stages wait as an unlit
  index. Each step of scroll trains one stage: the line draws to its node, the
  node and its name light up, and its skills fly into their group while some of
  the noise disappears. On phones the line runs down the side and each group
  gathers as it scrolls into view. Reduced motion and no-JS show the picture.
*/
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const PAPER = '#E2E1E1';
const COBALT = '#2A4093';
const INK = '#080912';
const INK2 = '#2B2D3C';
const GREY_TEXT = '#7C7D8B'; // a skill that has not found its group yet
const GREY_DOT = '#B3B2B0';

const START = 0.05; // share of the pinned scroll before the first stage trains
const END = 0.9;    // all five stages are done here; the rest is a short hold
const N_NOISE = 30;

// seeded, so the scatter is the same on every visit
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function skills({ reduce = false } = {}) {
  const sec = document.getElementById('skills');
  if (!sec || reduce) return;
  const sticky = sec.querySelector('.skills__sticky');
  const head = sec.querySelector('.skills__head');
  const plot = sec.querySelector('.skills__plot');
  const track = sec.querySelector('.skills__track');
  const line = sec.querySelector('.skills__line');
  const noiseBox = sec.querySelector('.skills__noise');
  const stages = [...sec.querySelectorAll('.stage')];
  if (!plot || !line || stages.length !== 5) return;
  const nodes = stages.map((s) => s.querySelector('.stage__node'));
  const names = stages.map((s) => s.querySelector('.stage__name'));
  const items = stages.map((s) => [...s.querySelectorAll('.stage__skills li')]);
  const all = items.flat();

  const noise = [];
  for (let i = 0; i < N_NOISE; i++) {
    const el = document.createElement('i');
    noiseBox.appendChild(el);
    noise.push(el);
  }

  // Where every skill sits before training: positions are relative to its
  // final place, so the timeline only ever animates back to x = 0, y = 0.
  const P = new Map();
  function layout(area) {
    const R = rng(20261002);
    const W = plot.clientWidth;
    const pad = 10;
    const taken = [];
    const final = (li) => {
      const st = li.closest('.stage');
      return { x: st.offsetLeft + li.offsetLeft, y: st.offsetTop + li.offsetTop, w: li.offsetWidth, h: li.offsetHeight };
    };
    // keep the scatter off the heading text, every final group, the names and the line
    if (area.head) {
      // layout offsets, not screen rects: the heading may still be mid-reveal
      head.querySelectorAll('h2, p').forEach((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const w = r.getBoundingClientRect().width;
        taken.push({
          x: el.offsetLeft - plot.offsetLeft - pad, y: el.offsetTop - plot.offsetTop - pad,
          w: w + 2 * pad, h: el.offsetHeight + 2 * pad + 28, // + the distance it slides in from
        });
      });
    }
    stages.forEach((st, i) => {
      taken.push({ x: st.offsetLeft - pad, y: st.offsetTop - pad, w: st.offsetWidth + 2 * pad, h: st.offsetHeight + 2 * pad });
      const n = nodes[i];
      taken.push({ x: st.offsetLeft + n.offsetLeft - pad, y: st.offsetTop + n.offsetTop - pad, w: n.offsetWidth + 2 * pad, h: n.offsetHeight + 2 * pad });
    });
    taken.push({ x: 0, y: plot.clientHeight / 2 - 12, w: W, h: 24 });

    const order = all.slice().sort(() => R() - 0.5);
    order.forEach((li) => {
      const f = final(li);
      // a slow drift while it waits, so the noise is never quite still; the
      // space it drifts through is reserved too, so it never drifts into a group
      const a = R() * Math.PI * 2, d = 8 + R() * 12;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      const span = (x, y) => ({
        x: Math.min(x, x + dx), y: Math.min(y, y + dy),
        w: f.w + Math.abs(dx), h: f.h + Math.abs(dy),
      });
      const xLo = Math.max(0, -dx), xHi = Math.max(xLo + 1, W - f.w - Math.max(0, dx));
      const yLo = area.top + Math.max(0, -dy), yHi = Math.max(yLo + 1, area.bottom - f.h - Math.max(0, dy));
      // look for a clear spot with comfortable spacing first, then accept a tighter one
      let best = null, bestHit = Infinity;
      for (const gap of [pad, pad * 0.4, 0]) {
        let found = null, foundHit = Infinity;
        for (let k = 0; k < 220 && foundHit > 0; k++) {
          const x = xLo + R() * (xHi - xLo);
          const y = yLo + R() * (yHi - yLo);
          const s = span(x, y);
          const box = { x: s.x - gap, y: s.y - gap * 0.6, w: s.w + 2 * gap, h: s.h + gap * 1.2 };
          let hit = 0;
          for (const t of taken) hit += overlap(box, t);
          if (hit < foundHit) { foundHit = hit; found = { x, y }; }
        }
        if (foundHit < bestHit) { bestHit = foundHit; best = found; }
        if (foundHit === 0) break;
      }
      taken.push(span(best.x, best.y));
      P.set(li, {
        x0: best.x - f.x, y0: best.y - f.y,
        x1: best.x - f.x + dx, y1: best.y - f.y + dy,
      });
    });

    noise.forEach((el) => {
      let best = null, bestHit = Infinity;
      for (let k = 0; k < 80 && bestHit > 0; k++) {
        const x = 6 + R() * (W - 12);
        const y = area.top + 6 + R() * (area.bottom - area.top - 12);
        const box = { x: x - 10, y: y - 10, w: 20, h: 20 };
        let hit = 0;
        for (const t of taken) hit += overlap(box, t);
        if (hit < bestHit) { bestHit = hit; best = { x, y }; }
      }
      // keep the next points away from this one, so they never clump into rows
      taken.push({ x: best.x - 26, y: best.y - 26, w: 52, h: 52 });
      el.style.left = `${best.x.toFixed(1)}px`;
      el.style.top = `${best.y.toFixed(1)}px`;
    });
  }

  // while pinned the scatter can use the whole screen under the navigation,
  // including the empty space beside the heading (the heading text is kept clear)
  const pinnedArea = () => {
    const cs = getComputedStyle(sticky);
    const top = parseFloat(cs.paddingTop) - plot.offsetTop;
    const bottom = sticky.clientHeight - parseFloat(cs.paddingBottom) - plot.offsetTop;
    return { top: Math.min(0, top), bottom: Math.max(plot.clientHeight, bottom), head: true };
  };
  const plotArea = () => ({ top: 0, bottom: plot.clientHeight });

  // one timeline for the whole training run, 0 to 1
  function training() {
    const win = (END - START) / stages.length;
    const tl = gsap.timeline({ paused: true });
    stages.forEach((st, i) => {
      const s = START + i * win;
      if (i > 0) {
        tl.fromTo(line, { scaleX: (i - 1) / 4 }, { scaleX: i / 4, duration: win * 0.34, ease: 'power1.inOut', immediateRender: i === 1 }, s);
      }
      const lit = s + win * (i > 0 ? 0.3 : 0.06);
      tl.fromTo(nodes[i], { '--fill': PAPER, '--ring': GREY_DOT, scale: 0.8 },
        { '--fill': COBALT, '--ring': COBALT, scale: 1, duration: win * 0.16, ease: 'back.out(2.6)' }, lit);
      tl.fromTo(names[i], { color: GREY_TEXT }, { color: INK, duration: win * 0.16, ease: 'none' }, lit);
      // each stage settles in the first 60% of its stretch and then holds, so a
      // reader who stops scrolling usually sees a finished group, not words mid-flight
      items[i].forEach((li, k) => {
        const p = () => P.get(li);
        const t0 = s + win * (0.06 + k * 0.05);
        tl.fromTo(li, { x: () => p().x0, y: () => p().y0 }, { x: () => p().x1, y: () => p().y1, duration: t0, ease: 'none' }, 0);
        tl.fromTo(li, { x: () => p().x1, y: () => p().y1 }, { x: 0, y: 0, duration: win * 0.3, ease: 'power3.inOut', immediateRender: false }, t0);
        tl.fromTo(li, { color: GREY_TEXT, '--dot': GREY_DOT }, { color: INK2, '--dot': COBALT, duration: win * 0.2, ease: 'none' }, t0 + win * 0.08);
      });
    });
    // the noise thins out as the stages train, a sixth of it per stage
    const R = rng(77);
    noise.forEach((el, j) => {
      const g = j % (stages.length + 1);
      const t = START + Math.min(stages.length - 0.5, g) * win + R() * win * 0.5;
      tl.fromTo(el, { scale: 1, opacity: 1 }, { scale: 0, opacity: 0, duration: win * 0.25, ease: 'power2.in' }, t);
    });
    tl.to({}, { duration: 1 - tl.duration() > 0 ? 1 - tl.duration() : 0.001 });
    return tl;
  }

  const mm = gsap.matchMedia();
  mm.add({
    scene: '(min-width: 768px) and (min-height: 600px)',
    short: '(min-width: 768px) and (max-height: 599.98px)',
    list: '(max-width: 767.98px)',
  }, (ctx) => {
    const { scene, short, list } = ctx.conditions;

    if (list) {
      // the line follows the reader down; each group gathers as it arrives
      const fit = () => {
        const last = stages[stages.length - 1];
        track.style.bottom = `${Math.max(0, plot.clientHeight - (last.offsetTop + 12))}px`;
      };
      fit();
      ScrollTrigger.addEventListener('refreshInit', fit);
      gsap.fromTo(line, { scaleY: 0 }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: plot, start: 'top 72%', end: 'bottom 72%', scrub: 0.5 },
      });
      stages.forEach((st, i) => {
        const R = rng(31 + i);
        gsap.set(nodes[i], { '--fill': PAPER, '--ring': GREY_DOT });
        gsap.set(names[i], { color: GREY_TEXT });
        gsap.set(items[i], {
          // start a little scattered, but never past the edges of the screen
          x: (k, li) => {
            const r = li.getBoundingClientRect();
            return Math.max(8 - r.left, Math.min(innerWidth - 8 - r.right, (R() - 0.5) * 140));
          },
          y: () => (R() - 0.5) * 70,
          opacity: 0, color: GREY_TEXT, '--dot': GREY_DOT,
        });
        ScrollTrigger.create({
          trigger: st, start: 'top 74%', once: true,
          onEnter: () => {
            gsap.to(nodes[i], { '--fill': COBALT, '--ring': COBALT, duration: 0.45, ease: 'power2.out' });
            gsap.to(names[i], { color: INK, duration: 0.6, ease: 'power2.out' });
            gsap.to(items[i], {
              x: 0, y: 0, opacity: 1, color: INK2, '--dot': COBALT,
              duration: 0.9, ease: 'power3.out', stagger: 0.05,
            });
          },
        });
      });
      return () => {
        ScrollTrigger.removeEventListener('refreshInit', fit);
        track.style.bottom = '';
      };
    }

    const area = scene ? pinnedArea : plotArea;
    const relayout = () => layout(area());
    relayout();
    ScrollTrigger.addEventListener('refreshInit', relayout);
    const tl = training();

    if (scene) {
      // scrubbed across the pinned stretch of the section
      ScrollTrigger.create({
        trigger: sec, start: 'top top', end: 'bottom bottom',
        animation: tl, scrub: 0.6, invalidateOnRefresh: true,
      });
    } else if (short) {
      // short landscape screens: no pinning, the run plays once in view
      tl.timeScale(0.3);
      ScrollTrigger.create({
        trigger: plot, start: 'top 70%', once: true,
        onEnter: () => tl.play(0),
      });
    }
    return () => {
      ScrollTrigger.removeEventListener('refreshInit', relayout);
      tl.kill();
    };
  });
}
