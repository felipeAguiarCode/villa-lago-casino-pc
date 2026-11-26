import { PS, PS_ROWS, psRow4 } from './rules';

/**
 * Exact return of Poker Slots (no sampling). The reels are independent uniform draws of 52 cards,
 * so one spin is the 52^4 ordered lines. Holds make it an average-reward decision process:
 *
 *   g = E[pay] − 1 + q · E_line[ max(0, M(line) − 1 − g) ]   over losing lines,
 *
 * with q the chance of a HOLD offer after a losing un-held spin and M(line) the best expected pay
 * of a spin that keeps one to three of its cards. After a held spin the next spin is a plain one,
 * which is why a hold is worth taking exactly when M(line) > 1 + g (the long-run return).
 */
export function exactRtp(holdChance = PS.holdChance): { base: number; rtp: number; holdRate: number } {
  const N = 52;
  const pay = PS_ROWS.map((r) => r.pays);
  const P = new Float32Array(N ** 4);
  for (let a = 0, i = 0; a < N; a++)
    for (let b = 0; b < N; b++)
      for (let c = 0; c < N; c++)
        for (let d = 0; d < N; d++, i++) {
          const r = psRow4(a, b, c, d);
          P[i] = r < 0 ? 0 : pay[r];
        }
  // expected pay holding 3, 2, 1 cards (the paytable is symmetric: any order of the held cards)
  const EV3 = new Float32Array(N ** 3);
  for (let i = 0; i < N ** 3; i++) {
    let s = 0;
    for (let d = 0; d < N; d++) s += P[i * N + d];
    EV3[i] = s / N;
  }
  const EV2 = new Float32Array(N ** 2);
  for (let i = 0; i < N ** 2; i++) {
    let s = 0;
    for (let k = 0; k < N; k++) s += EV3[i * N + k];
    EV2[i] = s / N;
  }
  const EV1 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = 0; k < N; k++) s += EV2[i * N + k];
    EV1[i] = s / N;
  }
  let base = 0;
  for (let i = 0; i < N; i++) base += EV1[i];
  base /= N;
  // best held spin of every losing line (winning lines are never offered holds)
  const M = new Float32Array(N ** 4);
  const e3 = (x: number, y: number, z: number) => EV3[(x * N + y) * N + z];
  const e2 = (x: number, y: number) => EV2[x * N + y];
  for (let a = 0, i = 0; a < N; a++)
    for (let b = 0; b < N; b++)
      for (let c = 0; c < N; c++)
        for (let d = 0; d < N; d++, i++) {
          if (P[i] > 0) continue;
          let m = Math.max(e3(a, b, c), e3(a, b, d), e3(a, c, d), e3(b, c, d));
          m = Math.max(m, e2(a, b), e2(a, c), e2(a, d), e2(b, c), e2(b, d), e2(c, d));
          M[i] = Math.max(m, EV1[a], EV1[b], EV1[c], EV1[d]);
        }
  const gap = (g: number) => {
    const th = 1 + g;
    let s = 0;
    for (let i = 0; i < M.length; i++) if (M[i] > th) s += M[i] - th;
    return base - 1 + (holdChance * s) / M.length - g;
  };
  let lo = -0.6;
  let hi = 0.6;
  for (let k = 0; k < 44; k++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > 0) lo = mid;
    else hi = mid;
  }
  const rtp = 1 + (lo + hi) / 2;
  let held = 0;
  let losing = 0;
  for (let i = 0; i < M.length; i++) {
    if (P[i] > 0) continue;
    losing++;
    if (M[i] > rtp) held++;
  }
  return { base, rtp, holdRate: held / losing };
}
