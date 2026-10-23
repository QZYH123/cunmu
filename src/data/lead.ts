/**
 * The paragraphs written from the records (「按记录写的」): the home lead and line, an interest's and a period's.
 * Words over figures: a lead carries at most one number (the year it began). Each piece that names an interest,
 * a period, a person or a work carries where it goes, so the page can link it (or not, in 给人看).
 */
import type { Kind, Work } from './types';
import { personId } from './derive';
import { coreNames, interestMembers, isMetaTag, periodMembers, tagsOf, type Interest, type Period } from './me';
import { verbOf } from './suggest';

export interface Seg { text: string; to?: string; kind?: 'interest' | 'period' | 'person' | 'work' }
const CJK = /[\p{Script=Han}\u3040-\u30ff]/u;
const LATIN = /[A-Za-z0-9]/;
const gap = (a: string, b: string) => (CJK.test(a) && LATIN.test(b)) || (LATIN.test(a) && CJK.test(b));
/** a space where a name made of letters or digits meets Chinese across two pieces (「是 2010 年春天」, 「和 Gary Oldman」), as the plain text already does inside one */
export const spaced = (segs: Seg[]): Seg[] => segs.flatMap((s, i) => {
  const prev = segs[i - 1]?.text ?? '';
  return i && prev && s.text && gap(prev[prev.length - 1], s.text[0]) ? [{ text: ' ' }, s] : [s];
});
export const plain = (segs: Seg[]) => spaced(segs).map((s) => s.text).join('');

/**
 * A rewrite is kept only when it says something the generated paragraph does not.
 * Empty, or the same words as the generated paragraph, stays the generated one (its links included).
 */
export function keptLead(typed: string, auto: string): string | undefined {
  const t = typed.trim();
  if (!t || t === auto.trim()) return undefined;
  return t;
}

const KIND_WORD: Record<Exclude<Kind, 'essay'>, string> = { anime: '动画', book: '书', film: '影视', game: '游戏', music: '音乐' };
const VERBS: [Kind[], string][] = [[['anime', 'film'], '看过'], [['book'], '读过'], [['game'], '玩过'], [['music'], '听过']];

const joinAnd = (parts: Seg[][]): Seg[] => parts.flatMap((p, i) => [...(i === 0 ? [] : [{ text: i === parts.length - 1 ? '和' : '、' }]), ...p]);
const ofInterest = (i: Interest): Seg[] => [{ text: i.name, to: `/interest/${i.id}`, kind: 'interest' }];
const ofPeriod = (p: Period): Seg[] => [{ text: p.name, to: `/period/${p.id}`, kind: 'period' }];
const ofPerson = (name: string): Seg[] => [{ text: name, to: `/person/${personId(name)}`, kind: 'person' }];
const ofWork = (w: Work): Seg[] => [{ text: '《' }, { text: w.title, to: `/entry/${w.id}`, kind: 'work' }, { text: '》' }];

/** the people most often among these works' core creators (at least twice), most first */
/** a studio, a publisher, a company's division: met, but not a person you meet */
export const orgLike = (name: string) => /(株式会社|有限会社|本部|事業部|制作|製作|スタジオ|プロダクション|委員会|エンタテインメント|エンターテイメント|ゲームス|任天堂|Nintendo|Studio|Studios|Production|Entertainment|Games|Inc\.?|Ltd\.?|Co\.|出版社|编辑部|編集部|工作室|公司|社$)/i.test(name);

export function oftenMet(ws: Work[], n = 3, known?: (name: string) => boolean): string[] {
  const c = new Map<string, number>();
  for (const w of ws) for (const name of coreNames(w)) if (!orgLike(name)) c.set(name, (c.get(name) ?? 0) + 1);
  return [...c.entries()].filter(([name, k]) => k >= 2 && (!known || known(name))).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')).slice(0, n).map(([name]) => name);
}

const firstDated = (ws: Work[]) => ws.filter((w) => w.finished).reduce<Work | null>((a, w) => (!a || w.finished < a.finished ? w : a), null);
const lastDated = (ws: Work[]) => ws.filter((w) => w.finished).reduce<Work | null>((a, w) => (!a || w.finished > a.finished ? w : a), null);

/** 「动画最多，其次是书和游戏」 */
function kindPhrase(ws: Work[]): string {
  const n = new Map<Exclude<Kind, 'essay'>, number>();
  for (const w of ws) if (w.kind !== 'essay') n.set(w.kind, (n.get(w.kind) ?? 0) + 1);
  const ks = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => KIND_WORD[k]);
  if (!ks.length) return '';
  if (ks.length === 1) return `都是${ks[0]}`;
  const rest = ks.slice(1, 3);
  return `${ks[0]}最多，其次是${rest.length === 2 ? `${rest[0]}和${rest[1]}` : rest[0]}`;
}
/** the two things you did most: 「看过、读过」 (not a list of every kind) */
const verbsOf = (ws: Work[]) => VERBS.map(([ks, v]) => ({ v, n: ws.filter((w) => ks.includes(w.kind)).length })).filter((x) => x.n > 0)
  .sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.v).join('、') || '看过';

export interface LeadCtx {
  /** the name; '' = 你 */
  name: string;
  works: Work[];
  interests: Interest[];
  /** in chapter order */
  periods: Period[];
  today: string;
  /** a person who has a page (derive's persons) */
  known?: (name: string) => boolean;
  /** 偏爱 is already naming the people, so this paragraph does not say 常遇见 again */
  skipOften?: boolean;
}

/** the home lead: since when, what most, what you keep coming back to, the periods, the writing */
export function homeLead(c: LeadCtx): Seg[] {
  const ws = c.works.filter((w) => w.kind !== 'essay');
  const essays = c.works.filter((w) => w.kind === 'essay');
  const first = firstDated(ws);
  if (!ws.length) return [];
  const who = c.name || '你';
  const out: Seg[] = [];
  const kinds = kindPhrase(ws);
  out.push({ text: first ? `${who}从 ${first.finished.slice(0, 4)} 年开始记下${verbsOf(ws)}的东西` : `${who}记下${verbsOf(ws)}的东西` });
  out.push({ text: kinds ? `，${kinds}。` : '。' });
  // an interest with nothing in these works is not named, even when the caller forgot to leave it out
  const ints = c.interests.filter((i) => interestMembers(i, ws).length > 0).slice(0, 2);
  const people = c.skipOften ? [] : oftenMet(ws, 3, c.known);
  if (ints.length || people.length) {
    if (ints.length) out.push({ text: '一直喜欢' }, ...joinAnd(ints.map(ofInterest)));
    if (people.length) out.push({ text: ints.length ? '，常遇见' : '常遇见' }, ...joinAnd(people.map(ofPerson)));
    out.push({ text: '。' });
  }
  if (c.periods.length) {
    const sized = c.periods.map((p) => ({ p, n: periodMembers(p, ws, c.today).length })).sort((a, b) => b.n - a.n);
    const most = sized[0].p;
    const latest = c.periods[c.periods.length - 1];
    if (c.periods.length === 1) out.push({ text: '有一段日子叫' }, ...ofPeriod(most), { text: '。' });
    else {
      out.push(...ofPeriod(most), { text: `${verbOf(periodMembers(most, ws, c.today))}得最多` });
      if (latest.id !== most.id) out.push({ text: '；最近一段叫' }, ...ofPeriod(latest));
      out.push({ text: '。' });
    }
  }
  if (essays.length) out.push({ text: essays.length > 1 ? '也写一点东西。' : '也写过一篇东西。' });
  return out;
}

/** the line under the name when you have not written one: 「2008 年起，读过、看过 1,019 部，多是科幻和推理。」 */
export function autoLine(c: LeadCtx): string {
  const ws = c.works.filter((w) => w.kind !== 'essay');
  if (!ws.length) return '';
  const first = firstDated(ws);
  // 0 members is not "most": an empty interest must not fill the line under the name
  const ranked = c.interests.map((i) => ({ i, n: interestMembers(i, ws).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  const most = ranked.length
    ? ranked.map((x) => x.i.name)
    : (kindPhrase(ws).match(/^(.+?)最多/)?.[1] ? [kindPhrase(ws).match(/^(.+?)最多/)![1]] : []);
  const head = first ? `${first.finished.slice(0, 4)} 年起，` : '';
  return `${head}${verbsOf(ws)} ${ws.length.toLocaleString('en-US')} 部${most.length ? `，多是${most.join('和')}` : ''}。`;
}

/** an interest's paragraph: the first one, the thick of it, who you meet there, the latest */
export function interestLead(i: Interest, c: LeadCtx): Seg[] {
  const ms = interestMembers(i, c.works);
  if (!ms.length) return [];
  const first = firstDated(ms), last = lastDated(ms);
  const person = !!i.rule.people?.length && !i.rule.tags?.length;
  const thing = person ? `${i.name}的作品` : i.name;
  const verb = verbOf(ms);
  const out: Seg[] = [];
  if (first) out.push({ text: `你${verb}的第一部${thing}是 ${first.finished.slice(0, 4)} 年的` }, ...ofWork(first), { text: '。' });
  // the period it was thickest in, in words
  const inP = c.periods.map((p) => ({ p, n: periodMembers(p, ms, c.today).length })).filter((x) => x.n >= 3).sort((a, b) => b.n - a.n)[0];
  if (inP) out.push({ text: '最密的是' }, ...ofPeriod(inP.p), { text: '那段时候。' });
  const people = oftenMet(ms, 3, c.known).filter((n) => n !== i.name);
  if (people.length) out.push({ text: '常遇见' }, ...joinAnd(people.map(ofPerson)), { text: '。' });
  if (last && last !== first) out.push({ text: `最近一部是` }, ...ofWork(last), { text: '。' });
  return out;
}

/** a period's paragraph: what it was mostly, where it began and ended, who was there, what came before and after */
export function periodLead(p: Period, c: LeadCtx): Seg[] {
  const ws = c.works.filter((w) => w.kind !== 'essay');
  const ms = periodMembers(p, ws, c.today);
  if (!ms.length) return [];
  const verb = verbOf(ms);
  const out: Seg[] = [];
  const tc = new Map<string, number>();
  for (const w of ms) for (const t of tagsOf(w)) if (!isMetaTag(t)) tc.set(t, (tc.get(t) ?? 0) + 1);
  const top = [...tc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const own = c.interests.filter((i) => interestMembers(i, ws).length > 0).find((i) => top && (i.rule.tags ?? []).includes(top[0]));
  if (top && top[1] >= ms.length * 0.5) out.push({ text: `这段日子${verb}的几乎都是` }, ...(own ? ofInterest(own) : [{ text: top[0] }]), { text: '：' });
  else if (top && top[1] >= ms.length * 0.3) out.push({ text: `这段日子${verb}了不少` }, ...(own ? ofInterest(own) : [{ text: top[0] }]), { text: '：' });
  else out.push({ text: `这段日子${verb}得很密：` });
  out.push({ text: '从' }, ...ofWork(ms[0]));
  if (ms.length > 1) out.push({ text: '开始，停在' }, ...ofWork(ms[ms.length - 1]), { text: '。' });
  else out.push({ text: '。' });
  const people = oftenMet(ms, 2, c.known);
  if (people.length) out.push({ text: '最常遇见的是' }, ...joinAnd(people.map(ofPerson)), { text: '。' });
  const at = c.periods.findIndex((x) => x.id === p.id);
  const prev = at > 0 ? c.periods[at - 1] : null, next = at >= 0 && at < c.periods.length - 1 ? c.periods[at + 1] : null;
  if (prev && next) out.push({ text: '它之前是' }, ...ofPeriod(prev), { text: '，之后是' }, ...ofPeriod(next), { text: '。' });
  else if (prev) out.push({ text: '它之前是' }, ...ofPeriod(prev), { text: '。' });
  else if (next) out.push({ text: '之后是' }, ...ofPeriod(next), { text: '。' });
  return out;
}

/** how many numbers a paragraph says (tests hold a lead to one) */
export const numbersIn = (s: string) => (s.match(/\d[\d,]*/g) ?? []).length;

/**
 * When a 偏爱 row is actually on the page, the home paragraph drops 常遇见.
 * A grey line, or a row you switched off, does not count: nothing there is naming people.
 * An interest's paragraph and a period's paragraph are left as they are.
 */
export function withTasteRows<T extends LeadCtx>(ctx: T, rows: readonly { sentence: unknown; off: boolean }[]): T {
  if (!rows.some((row) => row.sentence != null && !row.off)) return ctx;
  return { ...ctx, skipOften: true };
}
