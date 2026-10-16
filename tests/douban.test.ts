import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { readXlsx } from '../src/lib/xlsx';
import { makeZip } from '../src/lib/zip';
import { creditsOf, parseDouban, type DoubanRow } from '../src/lib/douban';

const parse = (t: string) => new DOMParser().parseFromString(t, 'application/xml') as unknown as Document;
const load = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const HEAD = ['标题', '简介', '豆瓣评分', '链接', '创建时间', '我的评分', '标签', '评论', '可见性'];

// written by 豆伴's own export path and SheetJS build (scripts/make-doufen-fixture.mjs) — invented data
const TOFU = 'tests/fixtures/douban/doufen-synthetic.xlsx';
// the prototype's sample (openpyxl: shared strings, numeric ratings) — still has to read
const SAMPLE = 'scripts/fixtures/douban-sample.xlsx';

test('douban: a 豆伴 export has its 14 interest sheets with the same 9 headers (plus others to ignore)', async () => {
  const sheets = await readXlsx(load(TOFU), parse);
  assert.deepEqual(sheets.map((s) => s.name), ['看过', '在看', '想看', '听过', '在听', '想听', '读过', '在读', '想读', '玩过', '在玩', '想玩', '看过的舞台剧', '想看的舞台剧', '影评', '广播']);
  for (const s of sheets.slice(0, 14)) assert.deepEqual(s.rows[0], HEAD, s.name);
  const row = sheets[0].rows[1];
  assert.equal(row[4], '2023-05-20 23:41:08');   // create_time stays text
  assert.equal(row[5], '5');                     // rating.value, a number cell
});

test('douban: only the done sheets are read; kinds, dates, stars, comments, stage plays', async () => {
  const r = parseDouban(await readXlsx(load(TOFU), parse));
  assert.ok('rows' in r);
  const rows = (r as { rows: DoubanRow[] }).rows;
  assert.equal(rows.length, 12);   // 看过 5 + 听过 1 + 读过 4 + 玩过 1 + 看过的舞台剧 1; 在看/想看/在读/影评/广播 never
  const by = (sid: string) => rows.find((x) => x.sid === sid)!;
  assert.deepEqual(rows.reduce<Record<string, number>>((m, x) => ({ ...m, [x.kind]: (m[x.kind] ?? 0) + 1 }), {}), { film: 6, music: 1, book: 4, game: 1 });
  assert.equal(by('90000101').marked, '2023-05-20');
  assert.equal(by('90000101').rating10, 10);
  assert.equal(by('90000101').year, 2021);
  assert.equal(by('90000103').rating10, undefined);   // no stars
  assert.equal(by('90000104').rating10, 6);
  assert.match(by('90000105').comment!, /\n第二行/);
  assert.equal(by('90000801').stage, true);
  assert.equal(by('90000701').kind, 'game');
  assert.ok(!rows.some((x) => x.sid === '90000201' || x.sid === '90000601'), '在看 / 在读 came in');
  // the same title twice, two subjects: both kept
  assert.equal(rows.filter((x) => x.title === '同名的书').length, 2);
});

test('douban: core creators from 简介 (card_subtitle) per kind', async () => {
  const rows = (parseDouban(await readXlsx(load(TOFU), parse)) as { rows: DoubanRow[] }).rows;
  const by = (sid: string) => creditsOf(rows.find((x) => x.sid === sid)!).map((c) => c.name);
  assert.deepEqual(by('90000101'), ['岑一舟']);
  assert.deepEqual(by('90000103'), ['安娜·莫罗', '莱昂·里特']);
  assert.deepEqual(by('90000501'), ['岑闻']);
  assert.deepEqual(by('90000502'), ['汐见透']);   // 「[日] 」 goes
  assert.deepEqual(by('90000401'), ['雾灯乐队']);
  assert.deepEqual(by('90000701'), ['雾港工作室']);
  assert.deepEqual(by('90000801'), ['岑一舟']);
});

test('douban: the prototype sample (shared strings) still reads the same', async () => {
  const rows = (parseDouban(await readXlsx(load(SAMPLE), parse)) as { rows: DoubanRow[] }).rows;
  assert.equal(rows.length, 12);   // 看过 4 + 读过 5 + 听过 1 + 玩过 1 + 舞台剧 1
  assert.ok(rows.every((x) => x.marked && /^\d{4}-\d\d-\d\d$/.test(x.marked)));
});

test('douban: not a backup, or nothing done, says which', async () => {
  const other = await readXlsx(await makeZip(xlsxFiles([['名字', '电话'], ['a', '1']])).arrayBuffer(), parse);
  assert.deepEqual(parseDouban(other), { error: 'not-backup' });
  assert.deepEqual(parseDouban([{ name: '想看', rows: [HEAD, ['某片', '', '', 'https://movie.douban.com/subject/1/', '2020-01-01 00:00:00', '', '', '', 'public']] }]), { error: 'no-done' });
});

test('xlsx: a date serial in a date-styled number cell becomes a date; text in that style stays text', async () => {
  const sheets = await readXlsx(await makeZip(xlsxFiles(null)).arrayBuffer(), parse);
  assert.deepEqual(sheets[0].rows[1], ['2023-05-20 00:00:00', '2023-05-20 23:41:08', '42']);
});

/** a minimal workbook: either plain shared-string rows, or one row testing date styles */
function xlsxFiles(rows: string[][] | null) {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sheetXml = rows
    ? rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')
    : '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row><row r="2"><c r="A2" s="1"><v>45066</v></c><c r="B2" s="1" t="str"><v>2023-05-20 23:41:08</v></c><c s="0"><v>42</v></c></row>';
  return [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: `<?xml version="1.0"?><styleSheet ${NS}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>` },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0"?><worksheet ${NS}><sheetData>${sheetXml}</sheetData></worksheet>` },
  ];
}

// 豆备 canonical v1 — generated by scripts/make-doubak-fixture.mjs, passes the spec's own validate.py
import { parseDoubak } from '../src/lib/doubak';
const MARKS = readFileSync('tests/fixtures/doubak/marks.ndjson', 'utf8');
const SUBJECTS = readFileSync('tests/fixtures/doubak/subjects.ndjson', 'utf8');

test('doubak: done marks only, newest revision, page labels for makers, deleted works keep your words', () => {
  const r = parseDoubak(MARKS, SUBJECTS);
  assert.ok('rows' in r);
  const rows = (r as { rows: DoubanRow[] }).rows;
  // 7 done of 10: doing / wish / an unknown medium (podcast) stay out
  assert.deepEqual(rows.map((x) => x.sid).sort(), ['90100001', '90100002', '90100003', '90100004', '90100005', '90100006', '90100007']);
  const by = (sid: string) => rows.find((x) => x.sid === sid)!;
  assert.equal(by('90100001').marked, '2023-05-20');   // the 看过 revision, not the older 想看 one
  assert.equal(by('90100001').rating10, 10);
  assert.equal(by('90100001').year, 2021);
  assert.deepEqual(creditsOf(by('90100002')).map((c) => c.name), ['汐见透', '鹭沼凪']);
  assert.deepEqual(creditsOf(by('90100003')).map((c) => c.name), ['汐见透']);
  assert.deepEqual(creditsOf(by('90100004')).map((c) => [c.name, c.role]), [['雾灯乐队', '艺术家']]);
  assert.deepEqual(creditsOf(by('90100005')).map((c) => [c.name, c.role]), [['雾港工作室', '开发']]);
  assert.equal(by('90100006').stage, true);
  assert.equal(by('90100002').kind, 'film');
  assert.equal(by('90100007').title, '');   // 「未知电影」 is a placeholder, not a name
  assert.match(by('90100007').comment!, /记得/);
});

test('doubak: marks alone ask for subjects; something else is not a backup', () => {
  assert.deepEqual(parseDoubak(MARKS, null), { error: 'need-subjects' });
  assert.deepEqual(parseDoubak('{"hello":1}\n', SUBJECTS), { error: 'not-backup' });
});
