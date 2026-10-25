/**
 * The sentences, as data. Slots are already formatted (2017, 六, 800 多个小时).
 * Product wording uses 『』 around a topic. An empty variant means that sentence is not written yet.
 */
import { lintSentence } from './lint';
import type { TemplateId } from './types';

export const COPY: Record<TemplateId, Record<string, string>> = {
  L1: {
    full: '从 {from} 到 {to}，你每隔一阵就回到『{a}』和『{b}』。别的都换过几轮了，这两个没走。',
    short: '从 {from} 到 {to}，你每隔一阵就回到『{a}』和『{b}』。',
  },
  L2: { full: '『{topic}』消失了{gap}年。{back} 年，你又回来了。' },
  L3: { full: '『{topic}』出现在你记录里的 {years} 个年份，比任何一个题材都多。' },
  L4: {
    full: '你记下的第一部『{topic}』是 {firstYear} 年的《{firstTitle}》，最近一部是 {lastYear} 年的《{lastTitle}》。{span}年，同一条线。',
    noTitle: '{firstYear} 年起、到 {lastYear} 年，{span}年，同一条线。',
  },
  L5: {
    full: '从 {from} 年起，你每一年都在{kindVerb}，一年没落下。',
    gap: '{years} 年里有 {had} 年，你都在{kindVerb}。',
  },
  L6: {},
  L7: {},
  S1: {}, S2: {}, S3: {}, S4: {}, S5: {}, S6: {},
  M1: { full: '{p1}和{p2}，在你不同年份的 {n} 部作品里反复出现。' },
  M2: { full: '{list}' },
  M3: { full: '你和{p}，{firstYear} 年第一次碰上，到 {lastYear} 年还在碰。{span}年。' },
  M4: {}, M5: {}, M6: {},
  Z1: { full: '{from} 到 {to} 年，你记下的多是{nounEarly}；{after} 年以后，多是{nounLate}。' },
  Z1b: { full: '{from} 到 {to} 年，你是{whoEarly}；{after} 年以后，是{whoLate}。' },
  Z2: {
    full: '{year} 年{season}，你一口气记下 {n} 部{noun}。那是你记得最满的一个季节。',
    noSeason: '{year} 年，你一口气记下 {n} 部{noun}。那是你记得最满的一段日子。',
  },
  Z3: {
    full: '{year} 年，你第一次记下{noun}。从那年起，每年都有。',
    short: '{year} 年，你第一次记下{noun}。那之后的三年里，每年都有。',
  },
  Z4: { full: '『{a}』在 {after} 年以后几乎没再出现，换成了『{b}』。' },
  Z5: {
    full: '记得最满的一年是 {year}：{n} 部，{noun}占了一半。',
    short: '记得最满的一年是 {year}：{n} 部。',
  },
  Z6: { full: '{year} 年是个分界：这一年起，你{late}比{early}多了。' },
  Z7: { full: '{from} 到 {to} 年，几乎没留下记录。' },
};

export const HEADLINE_COPY = {
  H2: '{span}年，同一个名字：{p}。',
} as const;

export const HINT = {
  more: '再多一些记录，这里会有一句。',
  people: '人物还在补，补完这里会多一行。',
  allOff: '偏爱的句子都关着。改一下 ›',
  dated: '记录里有可信日期的作品，才会被数进去。',
} as const;

/** values that keep every written variant inside the voice rules */
export const SAMPLE: Record<string, string | number> = {
  from: 2014,
  to: 2026,
  a: '科幻',
  b: '推理',
  topic: '推理',
  gap: '六',
  back: 2024,
  years: 9,
  had: 8,
  firstYear: 2017,
  lastYear: 2026,
  firstTitle: '三体',
  lastTitle: '余下',
  span: '九',
  kindVerb: '读书',
  p1: '渡边信一郎',
  p2: '伊坂幸太郎',
  n: 6,
  list: '伊坂幸太郎 6 部',
  p: '伊坂幸太郎',
  after: 2022,
  nounEarly: '番',
  nounLate: '游戏',
  whoEarly: '看番的人',
  whoLate: '玩游戏的人',
  year: 2019,
  season: '夏天',
  noun: '番',
  late: '看的番',
  early: '读的书',
};

export function fill(tpl: string, slots: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, key: string) => (slots[key] == null ? '' : String(slots[key])));
}

if (process.env.NODE_ENV !== 'production') {
  for (const [tid, variants] of Object.entries(COPY)) {
    for (const [name, tpl] of Object.entries(variants)) {
      const hard = lintSentence(fill(tpl, SAMPLE)).filter((p) => p !== 'length');
      if (hard.length) throw new Error(`copy ${tid}/${name}: ${hard.join(',')}`);
    }
  }
  const hardH = lintSentence(fill(HEADLINE_COPY.H2, SAMPLE)).filter((p) => p !== 'length');
  if (hardH.length) throw new Error(`copy H2: ${hardH.join(',')}`);
}
