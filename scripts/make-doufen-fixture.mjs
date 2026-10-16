#!/usr/bin/env node
/**
 * A synthetic 豆伴 (tofu, github.com/doufen-org/tofu) export for tests — no personal data, invented titles,
 * people and ids — written the way 豆伴 writes it: its own exporter code path (explorer.js `exportInterest`:
 * one sheet per type/status, the same 9 headers, subject.card_subtitle in 简介, rating.value 1–5 as a
 * number, create_time as text) through the SheetJS build 豆伴 bundles (`XLSX.utils.aoa_to_sheet` +
 * `XLSX.write`). Run by hand, with that SheetJS file:
 *
 *   node scripts/make-doufen-fixture.mjs [path/to/xlsx.full.min.js]
 *     (default /tmp/tofu/extension/vendor/xlsx.full.min.js — from the 豆伴 0.12.0 release zip)
 *   → tests/fixtures/douban/doufen-synthetic.xlsx   (豆伴 names it 豆伴(<user id>).xlsx)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const lib = process.argv[2] ?? '/tmp/tofu/extension/vendor/xlsx.full.min.js';
const sandbox = { module: { exports: {} }, require: createRequire(import.meta.url), console, Buffer, Uint8Array, ArrayBuffer, DataView, Date, Math, String, Number, Object, Array, JSON, RegExp, Error, TypeError, Symbol, Map, Set, setTimeout, clearTimeout };
sandbox.exports = sandbox.module.exports;
sandbox.global = sandbox; sandbox.self = sandbox; sandbox.window = undefined;
vm.createContext(sandbox);
vm.runInContext(readFileSync(lib, 'utf8'), sandbox);
const XLSX = sandbox.module.exports.utils ? sandbox.module.exports : sandbox.XLSX;
if (!XLSX?.utils) { console.error('not a SheetJS build:', lib); process.exit(2); }

const HEAD = ['标题', '简介', '豆瓣评分', '链接', '创建时间', '我的评分', '标签', '评论', '可见性'];
const M = (id) => `https://movie.douban.com/subject/${id}/`;
const B = (id) => `https://book.douban.com/subject/${id}/`;
const U = (id) => `https://music.douban.com/subject/${id}/`;
const G = (id) => `https://www.douban.com/game/${id}/`;
const D = (id) => `https://www.douban.com/location/drama/${id}/`;
// [title, card_subtitle, rating (string, toFixed(1)) or null_rating_reason, url, create_time, my rating (number|''), tags, comment, visibility]
const SHEETS = {
  看过: [
    ['雾港来信', '2021 / 中国大陆 / 剧情 悬疑 / 岑一舟 / 檀青 濮遥', '8.1', M(90000101), '2023-05-20 23:41:08', 5, '国产,悬疑', '最后一集的雨下得很久。', 'public'],
    ['夏日的回声', '2019 / 日本 / 剧情 家庭 / 汐见透 / 鹭沼凪 汐见遥', '7.6', M(90000102), '2021-11-03 21:12:40', 4, '', '', 'public'],
    ['Lighthouse Keepers', '2017 / 美国 英国 / 剧情 / 安娜·莫罗 莱昂·里特 / 米娅·霍尔特', '7.9', M(90000103), '2017-02-25 20:05:33', '', '', '', 'private'],
    ['无评分的老片', '1988 / 中国香港 / 喜剧 / 桑牧', '暂无评分', M(90000104), '2014-08-01 10:00:00', 3, '', '', 'public'],
    ['短评里有/斜杠', '2024 / 中国大陆 / 动画 / 阮甘', '6.8', M(90000105), '2024-12-31 23:59:59', 2, '', '看完想了很久 / 还是喜欢。\n第二行。', 'public'],
  ],
  在看: [['还没看完的剧', '2025 / 中国大陆 / 剧情 / 戚容 / 邬桑', '8.0', M(90000201), '2025-03-02 22:00:00', '', '', '', 'public']],
  想看: [['想看的电影', '2026 / 法国 / 剧情 / Lucie Arnaud', '暂无评分', M(90000301), '2026-01-01 08:00:00', '', '', '', 'public']],
  听过: [['潮汐录音', '雾灯乐队 / 2010-11-01 / 专辑 / CD / 摇滚', '9.0', U(90000401), '2018-06-09 01:02:03', 5, '', '', 'public']],
  在听: [],
  想听: [],
  读过: [
    ['群山之间', '岑闻 / 2005-12 / 青棹出版社', '8.9', B(90000501), '2019-12-24 20:20:20', '', '', '', 'public'],
    ['海上来的信', '[日] 汐见透 / 鹭沼遥 译 / 2016-7 / 青棹文艺出版社', '8.2', B(90000502), '2016-07-30 13:45:10', 4, '小说', '', 'public'],
    ['同名的书', '牧容 / 2022-3 / 某出版社', '7.1', B(90000503), '2023-03-11 09:30:00', 4, '', '', 'public'],
    ['同名的书', '甘戚 / 2010-1 / 另一家出版社', '6.0', B(90000504), '2012-01-10 09:30:00', 3, '', '', 'public'],
  ],
  在读: [['读到一半', '巫濮 / 2021-5 / 青棹出版社', '8.3', B(90000601), '2026-09-01 12:00:00', '', '', '', 'public']],
  想读: [],
  玩过: [['灯塔岛', '2019-10-15 / 雾港工作室 / 角色扮演 冒险', '9.1', G(90000701), '2021-01-20 02:10:00', 5, '', '', 'public']],
  在玩: [],
  想玩: [],
  看过的舞台剧: [['犀角', '岑一舟 / 檀青 / 1999', '8.6', D(90000801), '2015-09-12 22:30:00', 4, '', '', 'public']],
  想看的舞台剧: [],
};

const wb = XLSX.utils.book_new();
for (const [name, rows] of Object.entries(SHEETS)) {
  // as explorer.js: rows pushed as they come; '' for no rating, comment as given (undefined → no cell)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD, ...rows]), name);
}
// 豆伴 can add other sheets in the same file (reviews, broadcasts…); they must be ignored
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['标题', '评论对象', '链接', '创建时间', '我的评分', '类型', '内容'], ['一篇影评', '雾港来信', 'https://movie.douban.com/review/90009001/', '2023-05-21 10:00:00', 5, 'movie', '……']]), '影评');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['创建时间', '链接', '内容', '话题'], ['2023-05-21 10:00:00', 'https://www.douban.com/people/x/status/1/', '一条广播', '']]), '广播');
const out = join(ROOT, 'tests/fixtures/douban/doufen-synthetic.xlsx');
writeFileSync(out, Buffer.from(XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }), 'base64'));
console.log(`${out}  (SheetJS ${XLSX.version})`);
