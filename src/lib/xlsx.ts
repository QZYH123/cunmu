import { readZip } from './zip';

export interface Sheet { name: string; rows: string[][] }

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
/** elements by local name, as an array (works with the browser's DOM and with xmldom in tests) */
const all = (el: Document | Element, name: string) => Array.from(el.getElementsByTagNameNS(NS, name));
/** Excel's serial day (1900 system) → YYYY-MM-DD hh:mm:ss */
const fromSerial = (x: number) => new Date(Math.round((x - 25569) * 86400000)).toISOString().replace('T', ' ').slice(0, 19);

/**
 * A minimal .xlsx reader (client-side; the file never leaves the device): shared strings, inline strings,
 * formula/plain strings (t="str", what SheetJS writes — 豆伴's exporter), numbers, and dates stored as
 * serials in a date-styled numeric cell. Enough for 豆伴 / douban-backup exports.
 * `parse` is injectable so tests can run it under node with xmldom.
 */
export async function readXlsx(buf: ArrayBuffer, parse: (xml: string) => Document = (t) => new DOMParser().parseFromString(t, 'application/xml')): Promise<Sheet[]> {
  const files = await readZip(buf);
  const text = (n: string) => { const b = files.get(n); return b ? new TextDecoder().decode(b) : null; };
  const xml = (n: string) => { const t = text(n); return t ? parse(t) : null; };
  const wb = xml('xl/workbook.xml');
  if (!wb) throw new Error('not xlsx');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const target = new Map<string, string>();
  if (rels) for (const r of Array.from(rels.getElementsByTagName('Relationship'))) target.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? '');
  const shared: string[] = [];
  const ss = xml('xl/sharedStrings.xml');
  if (ss) for (const si of all(ss, 'si')) shared.push(all(si, 't').map((t) => t.textContent ?? '').join(''));
  // which style ids are dates (built-in 14–22, 45–47, or a custom format with y/m/d in it)
  const dateStyles = new Set<number>();
  const st = xml('xl/styles.xml');
  if (st) {
    const custom = new Map<number, string>();
    all(st, 'numFmt').forEach((f) => custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? ''));
    const xfs = all(st, 'cellXfs')[0];
    (xfs ? all(xfs, 'xf') : []).forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[ymd]/i.test(custom.get(id)?.replace(/"[^"]*"/g, '') ?? '')) dateStyles.add(i);
    });
  }
  const out: Sheet[] = [];
  for (const s of all(wb, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? s.getAttribute('r:id') ?? '';
    const t = (target.get(rid) ?? '').replace(/^\/?xl\//, '').replace(/^\//, '').replace(/^\.\//, '');
    const doc = xml(`xl/${t}`);
    if (!doc) continue;
    const rows: string[][] = [];
    for (const row of all(doc, 'row')) {
      const cells: string[] = [];
      let next = 0;
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r');
        const i = ref ? colIndex(ref) : next;   // r is optional; without it cells follow each other
        next = i + 1;
        const type = c.getAttribute('t');
        const v = all(c, 'v')[0]?.textContent ?? '';
        let val = '';
        if (type === 's') val = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') val = all(c, 't').map((x) => x.textContent ?? '').join('');
        else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        // only a number can be a date serial (a t="str" cell in a date style is text already)
        else if ((!type || type === 'n') && v && dateStyles.has(Number(c.getAttribute('s') ?? -1)) && Number.isFinite(Number(v))) val = fromSerial(Number(v));
        else val = v;
        cells[i] = val;
      }
      rows.push(Array.from(cells, (x) => x ?? ''));
    }
    out.push({ name: s.getAttribute('name') ?? '', rows });
  }
  return out;
}
