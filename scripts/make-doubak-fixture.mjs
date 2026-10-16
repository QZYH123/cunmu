#!/usr/bin/env node
/**
 * A synthetic 豆备 (doubak) canonical v1 export for tests — invented titles, people and ids, no personal
 * data. Shapes follow doubak-data-specs canonical/v1 (mark.schema.json, subject.schema.json): one line per
 * record, revisions in time order, per-field sha256 digests, observations pointing back at a bundle.
 * Run by hand; check it with the spec's own validator:
 *
 *   node scripts/make-doubak-fixture.mjs
 *   python3 <doubak-data-specs>/canonical/v1/validate.py tests/fixtures/doubak
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'tests/fixtures/doubak');
const digest = (v) => (v === null ? null : `sha256:${createHash('sha256').update(typeof v === 'string' ? v.normalize('NFC').replace(/\r\n?/g, '\n').trimEnd() : JSON.stringify(v)).digest('hex')}`);
const digests = (f, skip = []) => Object.fromEntries(Object.keys(f).filter((k) => !skip.includes(k)).map((k) => [k, digest(f[k])]));
const obs = (at) => [{ bundle_id: 'bundle-synthetic-0001', capture_ids: ['cap-0001'], observed_at: at, absence_authority: 'whole_route', surface: 'html' }];
const rev = (fields, at, skip) => ({ parser_version: 'doubak-data-parser/0.3.1', first_observed_at: at, last_observed_at: at, fields, digests: digests(fields, skip), observations: obs(at) });
const day = (d) => ({ raw: d, iso: `${d}T00:00:00+08:00`, precision: 'day', timezone_assumption: 'Asia/Shanghai' });
const AT = '2026-08-14T12:00:00+08:00';
const ACC = { user_id: '10000001', username: null };

// [id, medium, title|null, info, raw_meta, status, marked, rating, comment, deleted?]
const ROWS = [
  ['90100001', 'movie', '雾港来信', { 导演: ['岑一舟'], 主演: ['檀青', '濮遥'], 上映日期: ['2021-07-01(中国大陆)'] }, '2021-07-01(中国大陆) / 檀青 / 濮遥 / 中国大陆 / 岑一舟 / 112分钟 / 剧情 / 悬疑 / 汉语普通话', 'done', '2023-05-20', 5, '最后一集的雨下得很久。'],
  ['90100002', 'tv', '海边的一年', { 导演: ['汐见透', '鹭沼凪'], 首播: ['2019-04-05(日本)'] }, '2019-04-05(日本) / 鹭沼遥 / 日本 / 汐见透 / 鹭沼凪 / 剧情', 'done', '2021-11-03', null, null],
  ['90100003', 'book', '群山之间', { 作者: ['[日] 汐见透'], 出版年: ['2005-12'], 出版社: ['青棹出版社'] }, '[日] 汐见透 / 鹭沼遥 / 青棹出版社 / 2005-12 / 39.00元', 'done', '2019-12-24', 4, null],
  ['90100004', 'music', '潮汐录音', { 表演者: ['雾灯乐队'], 发行时间: ['2010-11-01'] }, '雾灯乐队 / 2010-11-01 / 专辑 / CD / 摇滚', 'done', '2018-06-09', 5, null],
  ['90100005', 'game', '灯塔岛', { 开发商: ['雾港工作室'], 发行日期: ['2019-10-15'] }, '角色扮演 / 冒险 / 2019-10-15', 'done', '2021-01-20', 5, null],
  ['90100006', 'performance', '犀角', { 导演: ['岑一舟'], 首演日期: ['1999-06-01'] }, '岑一舟 / 檀青 / 1999-06-01', 'done', '2015-09-12', 4, null],
  ['90100007', 'movie', null, null, null, 'done', '2014-08-01', 3, '这部已经找不到了，但我记得。', true],
  ['90100008', 'movie', '还没看完的剧', { 导演: ['戚容'] }, '2025 / 戚容', 'doing', '2025-03-02', null, null],
  ['90100009', 'book', '想读的书', { 作者: ['巫濮'] }, '巫濮 / 2021-5', 'wish', '2026-01-01', null, null],
  ['90100010', 'podcast', '一档播客', {}, '', 'done', '2024-02-02', null, null],
];

const marks = [];
const subjects = [];
for (const [id, medium, title, info, raw, status, marked, rating, comment, deleted] of ROWS) {
  const url = medium === 'game' ? `https://www.douban.com/game/${id}/` : medium === 'performance' ? `https://www.douban.com/location/drama/${id}/` : `https://${medium === 'tv' ? 'movie' : medium}.douban.com/subject/${id}/`;
  const mf = { status, marked_at: day(marked), rating, comment, tags: [], raw_meta: raw };
  const revisions = [rev(mf, AT)];
  if (id === '90100001') {
    // a 想看 that became 看过 later: two revisions, the newest last
    revisions.unshift(rev({ ...mf, status: 'wish', marked_at: day('2022-12-01'), rating: null, comment: null }, '2023-01-02T09:00:00+08:00'));
  }
  marks.push({ canonical_version: 'canonical/1.1', identity_layer: 'degraded_key', upstream_id: null, account: ACC, medium, subject: { id, url, upstream_deleted: !!deleted }, revisions });
  const sf = { title, aliases: null, info, cover_url: null, cover_url_key: null, raw_meta: raw };
  subjects.push({ canonical_version: 'canonical/1.1', medium, id, url, upstream_deleted: !!deleted, revisions: [rev(sf, AT, ['cover_url'])] });
}
mkdirSync(OUT, { recursive: true });
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(join(OUT, 'marks.ndjson'), nd(marks));
writeFileSync(join(OUT, 'subjects.ndjson'), nd(subjects));
console.log(`${OUT}: ${marks.length} marks, ${subjects.length} subjects`);
