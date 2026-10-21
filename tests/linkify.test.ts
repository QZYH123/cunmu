import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkify, type Derived } from '../src/data/derive';

type L = Derived['linkables'][number];
/** the plain version: every name tried at every position */
function naive(paragraphs: string[], linkables: L[], selfId: string, unlinked: Set<string>) {
  const done = new Set<string>();
  const cands = linkables.filter((l) => l.target !== selfId && !unlinked.has(`${selfId}>${l.target}`));
  return paragraphs.map((p) => {
    const segs: { text: string; target?: string; kind?: string }[] = [];
    let i = 0, buf = '';
    while (i < p.length) {
      const hit = cands.find((c) => p.startsWith(c.name, i));
      if (hit) {
        if (!done.has(hit.target)) { if (buf) { segs.push({ text: buf }); buf = ''; } segs.push({ text: hit.name, target: hit.target, kind: hit.kind }); done.add(hit.target); } else buf += hit.name;
        i += hit.name.length;
      } else { buf += p[i]; i++; }
    }
    if (buf) segs.push({ text: buf });
    return segs;
  });
}

test('linkify: indexed by first character, the same links as trying every name everywhere', () => {
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const alpha = '三体刘慈欣球状闪电流浪地球AB😀';
  const word = (len: number) => Array.from({ length: len }, () => [...alpha][rnd([...alpha].length)]).join('');
  for (let round = 0; round < 60; round++) {
    const linkables: L[] = Array.from({ length: 30 }, (_, k) => ({ name: word(2 + rnd(4)), target: `t${k % 25}`, kind: k % 3 ? 'work' : 'person' } as L));
    linkables.sort((a, b) => b.name.length - a.name.length);
    const d = { linkables } as unknown as Derived;
    const paras = Array.from({ length: 3 }, () => word(40));
    const unlinked = new Set([`self>t${rnd(25)}`]);
    assert.deepEqual(linkify(paras, d, 'self', unlinked), naive(paras, linkables, 'self', unlinked));
    assert.deepEqual(linkify(paras, d, 't3', new Set()), naive(paras, linkables, 't3', new Set()));
  }
});
