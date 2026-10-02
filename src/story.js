/*
  Story time T. The page maps scroll position to T; the 3D stage and the
  text counters both read it, so they can never disagree.

    0 - 1    hero: a noisy orange signal goes behind the portrait and comes out clean
    1 - 3    Ingenia: the line frays into five agents that tangle, then braid
    3 - 4    gates: strands flagged at the first ring turn orange, masking clears one,
             the flagged ones go self-hosted and the rest go to an API
    4 - 4.5  the strands leave; recent work and skills read without 3D
    4.5 - 6  WARPSPD: a ratings matrix is completed from two factor strips,
             then a forecast line with its uncertainty band and one anomaly
    6 - 9    50,000 cries: the line becomes a cry, the cry becomes a spectrogram,
             50,000 dots arrive (one per recording), sort by label, then embed
    9 - 9.5  the dots leave before the colour flood
    9.5 - 10 contact: one calm line
*/

export const N_RECORDINGS = 50000;

export const GATE_T = [3.31, 3.43, 3.55];
export const OUTCOME_T = 3.74;

// the dots start arriving here, one after another, in index order
export const STREAM = [7.15, 7.72];
export const STREAM_FLIGHT = 0.08; // share of the window each dot spends flying

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// 0..1+flight: how far the arrival wave has moved
export function streamWave(T) {
  const p = clamp((T - STREAM[0]) / (STREAM[1] - STREAM[0]));
  return p * (1 + STREAM_FLIGHT);
}

// how many recordings have started to arrive: the counter shows exactly this
export function streamCount(T) {
  return Math.min(N_RECORDINGS, Math.floor(N_RECORDINGS * clamp(streamWave(T))));
}
