/*
  Recent work: each project gets one short animation (about 2.5 s) that plays
  when its card scrolls into view and replays on hover. The SVG markup is the
  finished picture; every timeline only animates *into* that state, so with
  reduced motion or without JavaScript the finished picture simply shows.
*/
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const num = (el, a) => parseFloat(el.getAttribute(a));
const GREY = '#CFCECC';

const builders = {
  // Providers -> NDA -> RFI, then the Request for Information is written
  buyer(svg) {
    const q = (s) => svg.querySelectorAll(s);
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.from(q('.a-progress'), { scaleX: 0, transformOrigin: '0% 50%', duration: 1.5, ease: 'none' }, 0.15)
      .fromTo(q('.b-dot'), { x: -260, opacity: 1 }, { x: 0, duration: 1.5, ease: 'none' }, 0.15)
      .from(q('.b-fill'), { scale: 0, transformOrigin: '50% 50%', duration: 0.4, stagger: 0.75, ease: 'back.out(2.4)' }, 0.15)
      .from(q('.b-label'), { opacity: 0, y: 6, duration: 0.35, stagger: 0.75 }, 0.2)
      .to(q('.b-dot'), { opacity: 0, duration: 0.2 }, 1.65)
      .from(q('.b-doc'), { opacity: 0, y: 18, duration: 0.45 }, 1.7)
      .from(q('.b-line'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.3, stagger: 0.07 }, 1.9);
    return tl;
  },

  // a scan reads the page; the lines it needs fly into a table
  extract(svg) {
    const q = (s) => [...svg.querySelectorAll(s)];
    const hits = q('.e-hit'), cells = q('.e-cell'), scan = q('.e-scan');
    const top = 26, bottom = 212, dur = 1.3;
    const at = (y) => 0.1 + ((y - top) / (bottom - top)) * dur;
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(scan, { y: top - bottom, opacity: 1 }, { y: 0, duration: dur, ease: 'none' }, 0.1)
      .to(scan, { opacity: 0, duration: 0.2 }, 0.1 + dur);
    hits.forEach((hit, r) => {
      const t = at(num(hit, 'y'));
      tl.fromTo(hit, { fill: GREY }, { fill: '#2A4093', duration: 0.2 }, t);
      cells.slice(r * 3, r * 3 + 3).forEach((cell, c) => {
        tl.from(cell, {
          x: num(hit, 'x') + c * 20 - num(cell, 'x'),
          y: num(hit, 'y') - num(cell, 'y'),
          opacity: 0, duration: 0.55, ease: 'power3.inOut',
        }, t + 0.08 + c * 0.07);
      });
    });
    return tl;
  },

  // a reviewer reads the policy, flags two gaps, scores it and suggests fixes
  dpo(svg) {
    const q = (s) => [...svg.querySelectorAll(s)];
    const flags = q('.d-flag'), marks = q('.d-mark'), scan = q('.d-scan');
    const top = 22, bottom = 216, dur = 1.1;
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(scan, { y: top - bottom, opacity: 1 }, { y: 0, duration: dur, ease: 'none' }, 0.1)
      .to(scan, { opacity: 0, duration: 0.2 }, 0.1 + dur);
    flags.forEach((f, i) => {
      const t = 0.1 + ((num(f, 'y') - top) / (bottom - top)) * dur;
      tl.fromTo(f, { fill: GREY }, { fill: '#EC4F24', duration: 0.2 }, t)
        .from(marks[i], { scale: 0, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(3)' }, t);
    });
    tl.fromTo(q('.d-arc'), { strokeDashoffset: 238.8 }, { strokeDashoffset: 62, duration: 0.8, ease: 'power2.inOut' }, 1.15)
      .from(q('.d-label'), { opacity: 0, duration: 0.3 }, 1.3)
      .from(q('.d-fix'), { x: -14, opacity: 0, duration: 0.4, stagger: 0.15 }, 1.75);
    return tl;
  },

  // statements stack up, ratios rise, the report is written and ready to download
  finance(svg) {
    const q = (s) => svg.querySelectorAll(s);
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.from(q('.f-sheet'), { y: 14, opacity: 0, duration: 0.4, stagger: 0.12 }, 0.1)
      .from(q('.f-bar'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.12, ease: 'power3.out' }, 0.6)
      .from(q('.f-label'), { opacity: 0, duration: 0.3 }, 1.0)
      .from(q('.f-report'), { x: 18, opacity: 0, duration: 0.45 }, 1.35)
      .from(q('.f-line'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.3, stagger: 0.06 }, 1.55)
      .from(q('.f-dl'), { scale: 0, transformOrigin: '50% 50%', duration: 0.4, ease: 'back.out(2.2)' }, 2.0)
      .fromTo(q('.f-arrow'), { y: -5 }, { y: 0, duration: 0.45, ease: 'bounce.out' }, 2.25);
    return tl;
  },

  // the teen speaks, the reply is checked, then it is played
  voice(svg) {
    const q = (s) => [...svg.querySelectorAll(s)];
    const ring = q('.v-ring')[0], tick = q('.v-tick')[0];
    const rl = ring.getTotalLength ? ring.getTotalLength() : 126;
    const tlen = tick.getTotalLength ? tick.getTotalLength() : 30;
    // bars bob like speech, then settle at full height
    const talk = (bars) => gsap.timeline()
      .fromTo(bars, { scaleY: 0.15 }, {
        scaleY: 1, transformOrigin: '50% 50%', duration: 0.22, ease: 'sine.inOut',
        stagger: { each: 0.025, repeat: 3, yoyo: true },
      })
      .to(bars, { scaleY: 1, duration: 0.2 });
    const tl = gsap.timeline();
    tl.add(talk(q('.v-in rect')), 0.05)
      .fromTo(ring, { strokeDasharray: rl, strokeDashoffset: rl }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, 0.95)
      .fromTo(tick, { strokeDasharray: tlen, strokeDashoffset: tlen }, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' }, 1.35)
      .add(talk(q('.v-out rect')), 1.6);
    return tl;
  },

  // probe the API, run the tests one by one (one fails), then the report
  evaluator(svg) {
    const q = (s) => [...svg.querySelectorAll(s)];
    const bars = q('.t-bar'), dots = q('.t-dot'), fail = q('.t-fail')[0];
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });
    tl.fromTo(q('.t-probe'), { x: -42, opacity: 1 }, { x: 0, duration: 0.4, ease: 'power1.inOut' }, 0.1)
      .to(q('.t-probe'), { opacity: 0, duration: 0.2 }, 0.5);
    bars.forEach((bar, i) => {
      const t = 0.45 + i * 0.22;
      tl.from(bar, { scaleX: 0, transformOrigin: '0% 50%', duration: 0.25 }, t)
        .from(dots[i], { scale: 0, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(3)' }, t + 0.18);
    });
    const tf = 0.45 + dots.indexOf(fail) * 0.22 + 0.45;
    tl.to(fail, { keyframes: { x: [-3, 3, -2, 0] }, duration: 0.3 }, tf)
      .from(q('.t-pass'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.45 }, 1.85)
      .from(q('.t-failbar'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.2 }, 2.25)
      .from(q('.t-label'), { opacity: 0, duration: 0.3 }, 2.1);
    return tl;
  },
};

export function recentWork({ reduce = false } = {}) {
  document.querySelectorAll('.work').forEach((item) => {
    const svg = item.querySelector('svg');
    const make = builders[item.dataset.work];
    if (!svg || !make || reduce) return;
    let tl;
    try { tl = make(svg).pause(0); } catch (e) { return; }
    ScrollTrigger.create({
      trigger: item,
      start: 'top 82%',
      once: true,
      onEnter: () => {
        gsap.to(item, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' });
        gsap.delayedCall(0.25, () => tl.play(0));
      },
    });
    // hovering a card replays its animation once it has finished
    item.addEventListener('pointerenter', () => {
      if (tl.progress() === 1 || !tl.isActive()) tl.restart();
    });
  });
}
