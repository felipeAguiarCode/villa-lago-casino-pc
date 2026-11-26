/**
 * The Villa Lago circuit: the pool of regulars who sit in at the Party tables.
 *
 * Every name is a single short nickname, a pun in the spirit of the poker world's legends; none is a
 * real person.
 * Each regular carries a hidden temperament (`style`) that only weights the mindset they draw for
 * each hand (see mindset.ts), and the bankroll they sit down with.
 *
 * A table seats four of them at random when the player sits down; when one goes broke they leave
 * and a new face from the pool takes the seat.
 */
import type { Rng } from '../../core/rng';
import type { AiProfile } from './rules';

export const ROSTER: AiProfile[] = [
  { name: 'Hellmo', style: 'wildcard', bank: 3000 },
  { name: 'Negreadu', style: 'bookish', bank: 2600 },
  { name: 'Bruhnson', style: 'daring', bank: 3200 },
  { name: 'Ivy', style: 'bookish', bank: 3500 },
  { name: 'Moneyker', style: 'wildcard', bank: 1800 },
  { name: 'Durrr', style: 'daring', bank: 2800 },
  { name: 'Chancy', style: 'bookish', bank: 2400 },
  { name: 'Stuey', style: 'daring', bank: 1500 },
  { name: 'Selfie', style: 'daring', bank: 2600 },
  { name: 'Abraca', style: 'wildcard', bank: 2200 },
  { name: 'Handsome', style: 'daring', bank: 2500 },
  { name: 'Sidebet', style: 'cautious', bank: 2400 },
  { name: 'Laaky', style: 'wildcard', bank: 1600 },
  { name: 'Hardcall', style: 'bookish', bank: 2400 },
  { name: 'Tilty', style: 'wildcard', bank: 2000 },
  { name: 'Holdz', style: 'bookish', bank: 3000 },
  { name: 'Bluffree', style: 'bookish', bank: 2200 },
  { name: 'Overbet', style: 'daring', bank: 2000 },
  { name: 'Mouthy', style: 'wildcard', bank: 1700 },
  { name: 'Scotty', style: 'daring', bank: 2300 },
  { name: 'Greenchip', style: 'cautious', bank: 2600 },
  { name: 'Poke', style: 'daring', bank: 2100 },
  { name: 'Gramz', style: 'wildcard', bank: 1500 },
  { name: 'Deebstack', style: 'bookish', bank: 3000 },
  { name: 'Allkari', style: 'daring', bank: 2400 },
  { name: 'Foldsen', style: 'cautious', bank: 2200 },
  { name: 'Trickshot', style: 'daring', bank: 2300 },
  { name: 'Goldfond', style: 'bookish', bank: 2700 },
  { name: 'Nevafold', style: 'daring', bank: 2900 },
  { name: 'Antonice', style: 'cautious', bank: 2800 },
  { name: 'Schoolman', style: 'bookish', bank: 2500 },
  { name: 'Moreman', style: 'bookish', bank: 2300 },
  { name: 'Quicknell', style: 'bookish', bank: 2600 },
  { name: 'Schemin', style: 'wildcard', bank: 2000 },
  { name: 'Gambitov', style: 'daring', bank: 2700 },
  { name: 'Buyer', style: 'daring', bank: 3100 },
  { name: 'Coldman', style: 'cautious', bank: 2500 },
  { name: 'Koonfy', style: 'daring', bank: 2600 },
  { name: 'Jungle', style: 'wildcard', bank: 2400 },
  { name: 'Mercyer', style: 'cautious', bank: 2300 },
];

/** `n` different regulars at random, none of them named in `exclude` (the ones already seated). */
export function drawRegulars(n: number, rng: Rng, exclude: readonly string[] = []): AiProfile[] {
  const pool = ROSTER.filter((p) => !exclude.includes(p.name));
  const out: AiProfile[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng(pool.length), 1)[0]);
  return out;
}

/** A new face for a seat whose regular went broke (never someone already at the table). */
export const replacementFor = (seated: readonly string[], rng: Rng): AiProfile => drawRegulars(1, rng, seated)[0];
