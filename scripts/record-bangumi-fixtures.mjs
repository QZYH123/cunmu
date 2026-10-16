#!/usr/bin/env node
/**
 * Records the Bangumi responses the tests replay (tests/fixtures/bangumi/), from the public API, read-only
 * GETs, ~1 request per second. Comments are replaced with made-up text (they are someone's writing); the
 * rest is as Bangumi returned it. Not part of any build or test run — run by hand when the API changes:
 *
 *   node scripts/record-bangumi-fixtures.mjs <username>
 *
 * The recorded files carry that person's public library: make them anonymous before committing (an invented
 * user, times moved, summaries replaced — see tests/fixtures/bangumi/RECORDED.md). Ask before recording anyone.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'tests/fixtures/bangumi');
const USER = process.argv[2];
if (!USER) { console.error('usage: node scripts/record-bangumi-fixtures.mjs <username>'); process.exit(1); }
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const UA = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).userAgent.replace('{version}', version);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(path) {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const r = await fetch(`https://api.bgm.tv${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  console.log(`GET ${path} → ${r.status}`);
  return r.json();
}
const SAY = ['看完很久还记得几个画面。', '节奏慢，但耐看。', '第二遍比第一遍好。', '配乐一直在脑子里转。'];
const scrub = (c, i) => ({ ...c, comment: c.comment ? SAY[i % SAY.length] : c.comment });

mkdirSync(OUT, { recursive: true });
const user = await get(`/v0/users/${USER}`);
writeFileSync(join(OUT, 'user-reader.json'), JSON.stringify(user, null, 1) + '\n');

const done = [];
const later = [];
for (const st of [1, 2, 3, 4, 6]) {
  const page = await get(`/v0/users/${USER}/collections?type=2&subject_type=${st}&limit=8&offset=0`);
  done.push(...page.data.slice(0, 5));
  later.push(...page.data.slice(5, 6));
}
const doing = [];
for (const st of [1, 2, 4]) {
  const page = await get(`/v0/users/${USER}/collections?type=3&subject_type=${st}&limit=2&offset=0`);
  doing.push(...page.data);
}
// the two "later" marks: as a sync after the baseline would see them (marked since)
const laterMarks = later.slice(0, 2).map((c, i) => ({ ...c, updated_at: `2026-10-0${i + 5}T21:00:00+08:00` }));
writeFileSync(join(OUT, 'collections-reader.json'), JSON.stringify({ data: [...done, ...doing].map(scrub), total: done.length + doing.length, limit: 100, offset: 0 }, null, 1) + '\n');
writeFileSync(join(OUT, 'collections-reader-later.json'), JSON.stringify({ data: laterMarks.map(scrub) }, null, 1) + '\n');

// people for one subject of each kind (core creators are picked from these)
const persons = {};
for (const st of [1, 2, 3, 4, 6]) {
  const c = done.find((x) => x.subject_type === st);
  if (c) persons[c.subject_id] = await get(`/v0/subjects/${c.subject_id}/persons`);
}
writeFileSync(join(OUT, 'persons.json'), JSON.stringify(persons, null, 1) + '\n');
// one full subject (收录 → paste a Bangumi link)
const subjects = { 9585: await get('/v0/subjects/9585') };
writeFileSync(join(OUT, 'subjects.json'), JSON.stringify(subjects, null, 1) + '\n');
writeFileSync(join(OUT, 'RECORDED.md'), `Recorded ${new Date().toISOString()} from https://api.bgm.tv/v0 (user ${USER}, public data; comments replaced) by scripts/record-bangumi-fixtures.mjs with User-Agent \`${UA}\`.\n`);
console.log(`fixtures: ${done.length} 看过, ${doing.length} 在看, ${laterMarks.length} later, ${Object.keys(persons).length} people lists`);
