import { describe, expect, it } from 'vitest';
import { GAMES } from '../src/games/registry';
// read as text: decor.ts needs WebGL and the DOM, so its tables are parsed instead of imported
import source from '../src/table/decor.ts?raw';

/** The busy tables keep their felt clear: no decor at all. */
const BUSY = ['partybj', 'partytcp', 'partyuth', 'partystud', 'partytrump', 'partyhorses', 'roulette', 'horses', 'craps'];

const block = (start: string) => {
  const i = source.indexOf(start);
  return source.slice(i, source.indexOf('\n}', i));
};

/** THEMES, one table per line: `  id: set(['kind', SPOT, yaw?], ...),` or `  id: [],`. */
const themes = new Map<string, string[]>();
for (const m of block('const THEMES').matchAll(/^\s+(\w+): (?:set\((.*)\)|\[\]),\s*$/gm)) {
  themes.set(m[1], m[2] === undefined ? [] : [...m[2].matchAll(/\['(\w+)'/g)].map((k) => k[1]));
}

/** Every kind a theme may name: the recipes, the downloaded models and the placard. */
const kinds = new Set([...[...block('const recipes').matchAll(/^\s+(\w+): \{ make:/gm)].map((m) => m[1]), 'watch', 'goblets', 'lighter', 'placard']);

describe('table decor', () => {
  it('parses the themes and recipes', () => {
    expect(themes.size).toBeGreaterThan(40);
    expect(kinds.size).toBeGreaterThan(30);
  });

  it('gives every registered table a theme', () => {
    for (const g of GAMES) expect(themes.has(g.id), g.id).toBe(true);
  });

  it('leaves the busy tables bare', () => {
    for (const id of BUSY) expect(themes.get(id), id).toEqual([]);
  });

  it('gives every other table its placard and 2-4 pieces', () => {
    for (const g of GAMES) {
      if (BUSY.includes(g.id)) continue;
      const set = themes.get(g.id)!;
      expect(set.filter((k) => k === 'placard'), g.id).toHaveLength(1);
      const pieces = set.filter((k) => k !== 'placard');
      expect(pieces.length, g.id).toBeGreaterThanOrEqual(2);
      expect(pieces.length, g.id).toBeLessThanOrEqual(4);
      expect(new Set(pieces).size, `${g.id} repeats a piece`).toBe(pieces.length);
    }
  });

  it('only names pieces that exist', () => {
    for (const [id, set] of themes) for (const k of set) expect(kinds.has(k), `${id}: ${k}`).toBe(true);
  });

  it('keeps the lobby champagne, plaques and cigar corner', () => {
    expect(themes.get('lobby')).toEqual(expect.arrayContaining(['champagne', 'plaques', 'cigar', 'lighter']));
  });

  it('dresses neighbouring tables in the lobby differently', () => {
    const order = GAMES.map((g) => g.id).filter((id) => !BUSY.includes(id));
    const look = (id: string) =>
      themes
        .get(id)!
        .filter((k) => k !== 'placard')
        .sort()
        .join(',');
    for (let i = 1; i < order.length; i++) expect(look(order[i]), `${order[i - 1]} / ${order[i]}`).not.toBe(look(order[i - 1]));
  });
});
