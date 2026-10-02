// Styles (fonts included) load from a <link> in index.html, so the page is
// styled before its first paint in development as well as in the build.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { GATE_T, OUTCOME_T, N_RECORDINGS, streamCount } from './story.js';
import { denoiseIn } from './denoise.js';
import { recentWork } from './recent.js';
import { skills } from './skills.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
ScrollTrigger.config({ ignoreMobileResize: true });

const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = () => window.innerWidth < 768;
if (reduce) root.classList.add('reduced');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const els = {
  canvas: $('#stage'),
  nav: $('#nav'),
  logo: $('.nav__logo'),
  hero: $('.hero'),
  name: $('.hero__name'),
  nameLine: $('.hero__name-line'),
  portrait: $('.hero__portrait'),
  copy: $('.hero__copy'),
  agents: $('#agents'),
  gates: $('#gates'),
  recent: $('#recent'),
  features: $('#features'),
  signal: $('#signal'),
  stack: $('#stack'),
  principles: $('#principles'),
  contact: $('#contact'),
  counter: $('[data-counter]'),
  gateItems: $$('.gates li'),
  outcome: $('.outcome'),
};

let stage = null;
let lenis = null;

/* ------------------------------------------------------------ hero name fit */
function fitName() {
  const line = els.nameLine;
  if (small()) { els.name.style.fontSize = ''; return; }
  els.name.style.fontSize = '';
  const cs = getComputedStyle(els.name);
  const avail = els.name.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const w = line.getBoundingClientRect().width / (gsap.getProperty(line, 'scale') || 1);
  if (!w) return;
  const cur = parseFloat(getComputedStyle(els.name).fontSize);
  els.name.style.fontSize = `${Math.floor(cur * (avail / w) * 100) / 100}px`;
}

/* --------------------------------------------------- section metrics and T */
const M = {};
function measure() {
  const top = (el) => el.getBoundingClientRect().top + window.scrollY;
  const vh = window.innerHeight;
  M.vh = vh;
  const sec = (el) => ({ top: top(el), h: el.offsetHeight, len: Math.max(1, el.offsetHeight - vh) });
  ['agents', 'gates', 'recent', 'features', 'signal', 'principles', 'contact'].forEach((k) => { M[k] = sec(els[k]); });
  M.contactStart = M.contact.top - vh;
  M.contactAnchor = M.contactStart + 0.7 * vh;
  // scroll ranges that move story time T (see story.js); between them T holds
  const pre = 0.6 * vh;
  const end = (c) => c.top + c.len;
  M.segs = [
    [0, M.agents.top, 0, 1],
    [M.agents.top, end(M.agents), 1, 3],
    [M.gates.top - pre, end(M.gates), 3, 4],
    [end(M.gates), end(M.gates) + 0.35 * vh, 4, 4.5],
    [M.features.top - pre, end(M.features), 4.5, 6],
    [M.signal.top - pre, end(M.signal), 6, 9],
    [end(M.signal), end(M.signal) + 0.35 * vh, 9, 9.5],
    [M.contactStart, M.contactStart + 0.7 * vh, 9.5, 10],
  ];
}

// Each chapter's 3D range starts a little before its text pins, so the
// object is already changing while the new words scroll in.
function computeT(sy) {
  if (!M.segs) return 0;
  let T = 0;
  for (const [a, b, t0, t1] of M.segs) {
    if (sy < a) return T;
    if (sy < b) return t0 + (t1 - t0) * clamp((sy - a) / Math.max(1, b - a));
    T = t1;
  }
  return T;
}

/* ------------------------------------------------------------- split text */
function split(el) {
  if (el._split) return el._split;
  el._split = SplitText.create(el, { type: 'words,chars', wordsClass: 'w', charsClass: 'c' });
  return el._split;
}
const charIn = { rotationX: -95, yPercent: 35, opacity: 0, transformPerspective: 700 };

/* --------------------------------------------------------------- the intro */
function intro() {
  const introProxy = { v: 0 };
  if (reduce) {
    root.classList.remove('intro-wait');
    gsap.set(els.logo, { opacity: 1 });
    return;
  }
  const nameSplit = SplitText.create(els.nameLine, { type: 'words,chars', mask: 'chars', wordsClass: 'w', charsClass: 'c' });
  const head = $('.hero__headline');
  const headSplit = SplitText.create(head, { type: 'lines', mask: 'lines', linesClass: 'ln' });
  const img = $('.hero__portrait img');
  img.style.opacity = '0';
  const fadeIn = () => gsap.fromTo(img, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.4, ease: 'power3.out', onComplete: () => { img.style.opacity = ''; } });
  setTimeout(() => { denoiseIn(img).catch(fadeIn); }, 180);
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(nameSplit.chars, { yPercent: 108, duration: 1.3, stagger: 0.04 }, 0.1)
    .from(headSplit.lines, { yPercent: 105, duration: 1.2, stagger: 0.08 }, 0.55)
    .from([$('.hero__sub'), $('.hero__ctas')], { opacity: 0, y: 18, duration: 1.1, stagger: 0.1 }, 0.8)
    .from($('.nav__right'), { opacity: 0, y: -10, duration: 0.9 }, 0.9);
  root.classList.remove('intro-wait');
  intro.proxy = introProxy;
}

function drawRibbon() {
  const proxy = intro.proxy;
  if (!stage || !proxy) return;
  if (window.scrollY > window.innerHeight * 0.5) { proxy.v = 1; stage.setIntro(1); return; }
  gsap.to(proxy, { v: 1, duration: 2.4, ease: 'power2.inOut', onUpdate: () => stage && stage.setIntro(proxy.v) });
}

/* ------------------------------------------------------ hero scroll-out */
function heroScroll() {
  if (reduce) return;
  gsap.timeline({
    scrollTrigger: { trigger: els.hero, start: 'top top', end: 'bottom top', scrub: true },
  })
    .to(els.portrait, { scale: 0.93, yPercent: -4, filter: 'blur(10px)', opacity: 0, ease: 'none', duration: 1 }, 0)
    .to(els.copy, { y: -70, opacity: 0, ease: 'none', duration: 0.5 }, 0);

  // the big name docks into the navigation on wide screens: it reaches the
  // logo by 86% of the scroll, rides along with it, then cross-fades in place
  const dockEnd = () => window.innerHeight * 0.55;
  const target = () => {
    const h1 = els.name, line = els.nameLine;
    const nameLeft = h1.offsetLeft + line.offsetLeft;
    const nameTop = h1.offsetTop + line.offsetTop;
    const nameW = line.offsetWidth, nameH = line.offsetHeight;
    const lg = els.logo;
    const logoLeft = lg.offsetLeft, logoTop = lg.offsetTop + els.nav.offsetTop;
    const sc = lg.offsetWidth / nameW;
    return { x: logoLeft - nameLeft, y: logoTop + lg.offsetHeight / 2 - (nameH * sc) / 2 - nameTop, scale: sc };
  };
  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px)', () => {
    gsap.set(els.nameLine, { transformOrigin: '0 0' });
    let t = target();
    const apply = (p) => {
      const e = Math.min(1, p / 0.86);
      gsap.set(els.nameLine, { x: t.x * e, y: t.y * e + p * dockEnd(), scale: 1 + (t.scale - 1) * e });
      const f = smooth(0.86, 1, p);
      els.logo.style.opacity = f;
      els.nameLine.style.opacity = 1 - f;
    };
    const st = ScrollTrigger.create({
      trigger: els.hero, start: 'top top', end: () => `+=${dockEnd()}`,
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => { t = target(); apply(self.progress); },
    });
    return () => {
      st.kill();
      gsap.set(els.nameLine, { clearProps: 'transform' });
      els.logo.style.opacity = ''; els.nameLine.style.opacity = '';
    };
  });
  mm.add('(max-width: 767px)', () => {
    ScrollTrigger.create({
      trigger: els.hero, start: 'top top', end: () => `+=${window.innerHeight * 0.35}`, scrub: true,
      onUpdate: (self) => {
        els.logo.style.opacity = smooth(0.5, 1, self.progress);
        els.nameLine.style.opacity = 1 - smooth(0, 0.8, self.progress);
      },
    });
  });
}

/* -------------------------------------------------------- chapter beats */
function chapters() {
  $$('.chapter').forEach((ch) => {
    const beats = $$('.beat', ch);
    const n = beats.length;
    const first = beats[0];

    if (reduce) return;

    const chars = beats.map((b) => $$('[data-split]', b).flatMap((el) => split(el).chars));
    const others = beats.map((b) => [...b.children].filter((c) => !c.hasAttribute('data-split') && !c.classList.contains('outcome')));

    // first beat plays in as the chapter arrives
    const enter = gsap.timeline({
      scrollTrigger: { trigger: ch, start: 'top 62%', toggleActions: 'play none none reverse' },
    });
    enter.from(others[0], { opacity: 0, y: 24, duration: 0.9, stagger: 0.08, ease: 'expo.out' }, 0)
      .from(chars[0], { ...charIn, duration: 1.1, stagger: 0.014, ease: 'expo.out' }, 0.05);

    if (n < 2) return;
    // later beats switch by scroll position but always finish animating,
    // so text is never left half-turned if the reader stops scrolling
    let active = 0;
    const show = (i, dir) => {
      const b = beats[i];
      gsap.killTweensOf([b, ...chars[i]]);
      gsap.fromTo(b, { autoAlpha: 0, y: 34 * dir }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out', delay: 0.12 });
      if (chars[i].length) {
        gsap.fromTo(chars[i], { ...charIn }, { rotationX: 0, yPercent: 0, opacity: 1, duration: 1, stagger: 0.012, ease: 'expo.out', delay: 0.14 });
      }
    };
    const hide = (i, dir) => {
      gsap.killTweensOf(beats[i]);
      gsap.to(beats[i], { autoAlpha: 0, y: -28 * dir, duration: 0.38, ease: 'power2.in' });
    };
    ScrollTrigger.create({
      trigger: ch, start: 'top top', end: 'bottom bottom',
      onUpdate: (self) => {
        const i = Math.min(n - 1, Math.floor(self.progress * n));
        if (i === active) return;
        const dir = i > active ? 1 : -1;
        hide(active, dir);
        show(i, dir);
        active = i;
      },
    });
  });
}

/* ------------------------------------------------ principles colour flood */
const flood = { len: 1, w: 1, h: 1 };
function setupFlood() {
  const svg = $('.flood');
  const path = $('.flood__path');
  const W = window.innerWidth, H = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  path.setAttribute('d', `M ${-0.12 * W} ${0.9 * H} C ${0.2 * W} ${0.62 * H}, ${0.3 * W} ${0.1 * H}, ${0.55 * W} ${0.36 * H} S ${0.86 * W} ${0.74 * H}, ${1.12 * W} ${0.08 * H}`);
  flood.len = path.getTotalLength();
  flood.w = W; flood.h = H;
  path.style.strokeDasharray = `${flood.len}`;

  // two loss curves: the demo keeps improving, production peels away (overfitting)
  const curves = $('.curves');
  curves.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const narrow = W < 768;
  const x0 = (narrow ? 0.06 : 0.04) * W, x1 = (narrow ? 0.94 : 0.96) * W;
  const yTop = (narrow ? 0.7 : 0.66) * H, yBot = (narrow ? 0.91 : 0.93) * H;
  const demo = (u) => yTop + (yBot - yTop) * (1 - Math.exp(-4.2 * u));
  const prod = (u) => demo(u) - (u > 0.42 ? (yBot - yTop) * 1.05 * Math.pow((u - 0.42) / 0.58, 1.7) : 0);
  const d = (f) => {
    let out = '';
    for (let i = 0; i <= 80; i++) { const u = i / 80; out += `${i ? 'L' : 'M'}${(x0 + (x1 - x0) * u).toFixed(1)} ${f(u).toFixed(1)}`; }
    return out;
  };
  const cd = $('.curve--demo'), cp = $('.curve--prod');
  cd.setAttribute('d', d(demo));
  cp.setAttribute('d', d(prod));
  [cd, cp].forEach((el) => { el._len = el.getTotalLength(); el.style.strokeDasharray = `${el._len}`; });
  const ld = $('.curve-label--demo'), lp = $('.curve-label--prod');
  ld.style.left = `${x1}px`; ld.style.top = `${demo(1) + 22}px`;
  lp.style.left = `${x1}px`; lp.style.top = `${prod(1) - 22}px`;
}

function principles() {
  const sec = els.principles;
  const sticky = $('.principles__sticky', sec);
  const path = $('.flood__path', sec);
  const beats = [$('.pbeat', sec), ...$$('.rule', sec)];
  if (reduce) return;
  setupFlood();
  const chars = beats.map((b) => (b.hasAttribute('data-split') ? [b] : $$('[data-split]', b)).flatMap((el) => split(el).chars));
  // the stroke and the strike-through are scrubbed; the words switch by state
  const tl = gsap.timeline({
    scrollTrigger: { trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true },
  });
  tl.fromTo(path, { strokeDashoffset: () => flood.len, attr: { 'stroke-width': () => 0.06 * flood.h } },
    { strokeDashoffset: 0, duration: 0.12, ease: 'power1.inOut' }, 0)
    .to(path, { attr: { 'stroke-width': () => 2.6 * Math.max(flood.w, flood.h) }, duration: 0.18, ease: 'power2.in' }, 0.12)
    .fromTo($('.strike', sec), { scaleX: 0 }, { scaleX: 1, duration: 0.08, ease: 'power2.inOut' }, 0.38)
    .fromTo($$('.curve', sec), { strokeDashoffset: (i, el) => el._len }, { strokeDashoffset: 0, duration: 0.2, ease: 'none' }, 0.31)
    .fromTo($$('.curve-label', sec), { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0.49)
    .to([$('.curves', sec), ...$$('.curve-label', sec)], { opacity: 0.2, duration: 0.05 }, 0.57)
    .to({}, { duration: 0.001 }, 1);

  const vis = [false, false, false];
  const set = (i, on) => {
    if (vis[i] === on) return;
    vis[i] = on;
    const b = beats[i];
    gsap.killTweensOf([b, ...chars[i]]);
    if (on) {
      gsap.fromTo(b, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' });
      gsap.fromTo(chars[i], { ...charIn }, { rotationX: 0, yPercent: 0, opacity: 1, duration: 1, stagger: 0.012, ease: 'expo.out' });
    } else {
      gsap.to(b, { autoAlpha: 0, y: -26, duration: 0.35, ease: 'power2.in' });
    }
  };
  ScrollTrigger.create({
    trigger: sec, start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => {
      const p = self.progress;
      sticky.classList.toggle('is-flooded', p > 0.3);
      set(0, p > 0.3 && p < 0.55);
      set(1, p >= 0.55);
      set(2, p >= 0.7);
    },
  });
}

/* ---------------------------------------------------- plain reveals */
function reveals() {
  if (reduce) return;
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, ease: 'expo.out', overwrite: true }),
  });
}

function contactTitle() {
  const title = $('[data-scatter]');
  const s = split(title);
  if (reduce) return;
  const R = gsap.utils.random;
  gsap.from(s.chars, {
    x: () => R(-0.22, 0.22) * window.innerWidth,
    y: () => R(0.05, 0.4) * window.innerHeight,
    rotation: () => R(-70, 70),
    rotationX: () => R(-70, 70),
    scale: () => R(0.6, 1.3),
    opacity: 0,
    ease: 'power1.out',
    scrollTrigger: { trigger: els.contact, start: 'top 80%', end: 'top 20%', scrub: 0.7, invalidateOnRefresh: true },
  });
}

/* ------------------------------------------------------ small behaviours */
function copyEmail() {
  $$('[data-copy]').forEach((btn) => {
    const label = $('.copy__text', btn);
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      try {
        await navigator.clipboard.writeText(text);
        label.textContent = 'Copied';
      } catch {
        // clipboard refused: show the address and select it so it can be copied by hand
        label.textContent = text;
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(label);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      btn.classList.add('is-done');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { label.textContent = 'Copy email'; btn.classList.remove('is-done'); }, 2200);
    });
  });
}

// A pinned section can ask links to land part-way through it (data-land, 0..1),
// so the Skills link opens on the finished map rather than the scattered start.
function anchorY(target) {
  let y = target.getBoundingClientRect().top + window.scrollY;
  const land = parseFloat(target.dataset.land || '');
  const inner = target.firstElementChild;
  if (land && inner && getComputedStyle(inner).position === 'sticky') {
    y += land * Math.max(0, target.offsetHeight - window.innerHeight);
  }
  return y;
}

function anchors() {
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const target = id === '#top' ? document.body : $(id);
      if (!target) return;
      e.preventDefault();
      const focusEl = id === '#top' ? els.hero : target;
      const y = id === '#top' ? 0 : anchorY(target);
      if (lenis) lenis.scrollTo(y, { duration: 1.6 });
      else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      if (!focusEl.hasAttribute('tabindex')) focusEl.setAttribute('tabindex', '-1');
      focusEl.focus({ preventScroll: true });
      try { history.replaceState(null, '', id); } catch { /* sandboxed frames may refuse */ }
    });
  });
}

let lastCount = -1;
function updateCounter(T) {
  if (!els.counter) return;
  const n = streamCount(T);
  const v = reduce ? N_RECORDINGS : (n >= N_RECORDINGS ? n : Math.round(n / 10) * 10);
  if (v === lastCount) return;
  lastCount = v;
  els.counter.textContent = v.toLocaleString('en-US');
}

const gateState = [false, false, false];
let outcomeState = false;
function updateGates(T) {
  GATE_T.forEach((t, i) => {
    const on = reduce || T >= t;
    if (on !== gateState[i]) { gateState[i] = on; els.gateItems[i].classList.toggle('is-on', on); }
  });
  const o = reduce || T >= OUTCOME_T;
  if (o !== outcomeState) { outcomeState = o; els.outcome.classList.toggle('is-on', o); }
}

let navInv = false;
let navSolid = false;
function updateNav(sy) {
  if (!M.principles) return;
  const p = M.principles;
  const navH = els.nav.offsetHeight;
  const inv = reduce
    ? sy + navH / 2 >= p.top && sy + navH / 2 <= p.top + p.h
    : sy >= p.top + p.len * 0.3 && sy <= p.top + p.h - navH / 2;
  if (inv !== navInv) { navInv = inv; els.nav.classList.toggle('is-inverted', inv); }
  const solid = !inv && sy > M.vh * 0.6;
  if (solid !== navSolid) { navSolid = solid; els.nav.classList.toggle('is-solid', solid); }
}

/* ------------------------------------------------------------- 3D stage */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// Where the hero ribbon can run on stacked layouts: between the bottom of the
// name and the top of the headline. offsetTop ignores the scroll transforms.
function docTop(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}
function heroBand() {
  const name = $('.hero__name'), copy = $('.hero__copy');
  if (!name || !copy) return null;
  const h = window.innerHeight;
  const top = (docTop(name) + name.offsetHeight) / h;
  const bottom = docTop(copy) / h;
  return bottom > top ? { top, bottom } : null;
}

async function initStage() {
  if (!webglOK() || (reduce && small())) { els.canvas.remove(); return; }
  try {
    const { Stage } = await import('./three/stage.js');
    const labels = {};
    $$('[data-label]').forEach((el) => { labels[el.dataset.label] = el; });
    const envUrl = new URL('./env/studio-env.png', document.baseURI).href;
    const s = new Stage(els.canvas, { reduced: reduce, labels, heroBand: heroBand(), envUrl });
    await s.prepare();
    stage = s;
    if (intro.proxy) stage.setIntro(intro.proxy.v);
    requestAnimationFrame(() => els.canvas.classList.add('is-ready'));
    if (!reduce) drawRibbon();
  } catch (err) {
    console.warn('3D stage unavailable', err);
    els.canvas.remove();
  }
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  // reloads start at the intro (see index.html); a link to #section still lands there
  if (!window.location.hash) window.scrollTo(0, 0);
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  fitName();
  intro();
  heroScroll();
  chapters();
  principles();
  reveals();
  recentWork({ reduce });
  skills({ reduce });
  contactTitle();
  copyEmail();
  anchors();

  ScrollTrigger.addEventListener('refreshInit', fitName);
  ScrollTrigger.addEventListener('refresh', () => {
    measure();
    if (stage) stage.setHeroBand(heroBand());
  });
  ScrollTrigger.refresh();
  measure();

  // let the type and portrait animate first, then bring in the 3D
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  setTimeout(() => later(() => initStage(), { timeout: 800 }), reduce ? 0 : 1700);

  gsap.ticker.add((time, delta) => {
    const sy = window.scrollY;
    const T = computeT(sy);
    if (stage) {
      stage.setT(T);
      stage.contactShift = sy - (M.contactAnchor || 0);
      stage.tick(Math.min(delta, 50) / 1000);
    }
    updateCounter(T);
    updateGates(T);
    updateNav(sy);
  });

  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__pf = { gsap, ScrollTrigger, get stage() { return stage; }, computeT, M };
  }

  if (!reduce && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      if (stage) stage.setPointer((e.clientX / window.innerWidth - 0.5) * 2, -(e.clientY / window.innerHeight - 0.5) * 2);
    }, { passive: true });
  }

  let lastW = window.innerWidth, lastH = window.innerHeight, rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && w === lastW && Math.abs(h - lastH) < 140) return; // mobile toolbar show/hide
      lastW = w; lastH = h;
      if (stage) { stage.heroBand = heroBand(); stage.resize(); }
      if (!reduce) setupFlood();
      ScrollTrigger.refresh();
    }, 150);
  });
}

boot().catch((err) => {
  console.error(err);
  root.classList.remove('js', 'intro-wait');
  root.classList.add('no-js');
});
