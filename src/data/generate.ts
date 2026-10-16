/**
 * Generated works — no real titles, people or covers. This module ships with the app: it makes the
 * built-in 「随便看看」 sample (TECH-PLAN v0.3 §10.6). The development catalogue (a Bangumi snapshot with
 * its covers, the 500-item fake library, the fake WeRead batch) lives in src/demo/ and never ships.
 */
import type { Credit, DateClaim, Kind, Work } from './types';
import { coverArt, artAspect } from '../fake/coverArt';
import { rng } from '../lib/hash';

/* ---------- date slots: newest first, quotas per year ---------- */

const YEAR_QUOTA: [number, number][] = [
  [2026, 60], [2025, 8], [2024, 25], [2023, 3], [2022, 1], [2021, 120], [2020, 150], [2019, 133],
  [2018, 300], [2017, 400], [2016, 450], [2015, 450], [2014, 400], [2013, 350], [2012, 150],
];
const MONTH_PLAN: Record<number, Record<number, number>> = {
  2026: { 10: 7, 9: 9, 7: 6, 6: 8, 5: 9, 3: 7, 2: 6, 1: 8 },
  2025: { 12: 2, 11: 2, 9: 1, 7: 1, 4: 1, 2: 1 },
  2024: { 12: 3, 11: 3, 7: 6, 6: 4, 3: 9 },
  2023: { 11: 1, 9: 1, 7: 1 },
  2022: { 5: 1 },
};
export const pad = (n: number) => String(n).padStart(2, '0');

export function buildSlots(): string[] {
  const r = rng(20261007);
  const out: string[] = [];
  for (const [year, n] of YEAR_QUOTA) {
    const plan = MONTH_PLAN[year] ?? (() => {
      const m: Record<number, number> = {};
      const skip = new Set([Math.ceil(r() * 12), Math.ceil(r() * 12)]);
      const months = Array.from({ length: 12 }, (_, i) => i + 1).filter((x) => !skip.has(x));
      for (let i = 0; i < n; i++) { const mo = months[Math.floor(r() * months.length)]; m[mo] = (m[mo] ?? 0) + 1; }
      return m;
    })();
    const ys: string[] = [];
    for (const [mo, c] of Object.entries(plan)) {
      for (let i = 0; i < c; i++) {
        const maxDay = year === 2026 && Number(mo) === 10 ? 6 : 28;
        ys.push(`${year}-${pad(Number(mo))}-${pad(1 + Math.floor(r() * maxDay))}`);
      }
    }
    out.push(...ys.sort().reverse());
  }
  return out;
}

/* ---------- names and titles ---------- */

export const A = ['北方', '雾中', '长夜', '旧城', '远山', '河岸', '灯塔', '群岛', '海风', '白昼', '冬日', '夏至', '晚钟', '候鸟', '纸上',
  '云端', '月下', '雨季', '荒原', '星野', '深林', '春山', '秋水', '落日', '雪线', '石桥', '空港', '玻璃', '铁轨', '钟楼', '花园',
  '沙洲', '潮汐', '黄昏', '清晨', '山城', '岛屿', '邮局', '书店', '长街', '小镇', '南方', '银河', '旷野', '海湾', '灰烬', '蓝色'];
export const B = ['来信', '之歌', '往事', '的人', '笔记', '旅行', '漫游', '以南', '以北', '之外', '手记', '夜话', '航线', '回声', '标本',
  '地图', '纪年', '与我', '守望', '时刻', '肖像', '备忘录', '小史', '故事集', '异闻', '巡礼', '以后', '旧梦', '散步', '十三章'];
const ANIME = ['少女', '物语', '放学后', '魔法使', '旅团', '日和', '轻音部', '的猫', '机关', '之森', '幻想曲', '研究会'];
export const LATIN = ['Afterglow', 'Blue Hour', 'Small Rooms', 'Paper Moon', 'Northbound', 'Lighthouse', 'Tidal', 'Low Season',
  'Quiet Hours', 'Glass Garden', 'Long Summer', 'Night Train', 'Field Notes', 'Halcyon'];
const ESSAY_TITLES = ['周末的书店', '一个人吃饭', '雨天的地铁', '搬家', '旧照片', '慢慢读', '夜里的歌', '回家的路', '冬至', '散步记',
  '去年的今天', '一封没寄的信', '窗外', '早起', '晚风', '路过'];

export function pickZipf<T>(r: () => number, arr: T[], skew = 2.2): T {
  return arr[Math.floor(arr.length * Math.pow(r(), skew))];
}
export function makePool(n: number, make: () => string): string[] {
  const s = new Set<string>();
  while (s.size < n) s.add(make());
  return [...s];
}

/** the people a generated work credits, by role */
export interface Pools { authors: string[]; directors: string[]; staff: string[]; artists: string[]; studios: string[] }

/**
 * The sample's people: made-up names only. Rare surnames with two-character literary given names (and
 * Japanese-style names built from invented surnames), so no combination reads as a real author or director.
 */
const SAMPLE_POOLS: Pools = (() => {
  const r = rng(31);
  const sur = ['岑', '闻', '牧', '容', '甘', '戚', '阮', '邬', '桑', '檀', '巫', '濮'];
  const given = ['遥舟', '青棹', '晚汀', '知渡', '素帆', '临溪', '听澜', '拾川', '雁回', '照野', '归禾', '逐星'];
  const jpSur = ['汐见', '鹭沼', '萤原', '灯野', '栖川', '霞丘', '雾生', '白砂'];
  const jpGiven = ['透', '凪', '湊', '朔', '澪', '昴', '律', '鸣'];
  const cn = () => sur[Math.floor(r() * sur.length)] + given[Math.floor(r() * given.length)];
  const jp = () => jpSur[Math.floor(r() * jpSur.length)] + jpGiven[Math.floor(r() * jpGiven.length)];
  return {
    authors: makePool(60, cn),
    directors: makePool(30, jp),
    staff: makePool(40, () => (r() < 0.5 ? jp() : cn())),
    artists: makePool(20, () => (r() < 0.4 ? `${LATIN[Math.floor(r() * LATIN.length)].split(' ')[0]} Club` : cn())),
    studios: ['北岸工作室', '纸鹤游戏', 'Lantern Works', '白夜社', 'Tiny Harbor', '回声工作室'],
  };
})();

export const GENRES: Record<Kind, string[]> = {
  book: ['科幻', '文学', '推理', '散文', '历史', '奇幻', '长篇', '短篇'],
  anime: ['日常', '奇幻', '治愈', '青春', '科幻', '冒险'],
  film: ['剧情', '悬疑', '爱情', '纪录', '喜剧'],
  music: ['流行', '摇滚', '民谣', '电子', '原声'],
  game: ['独立游戏', '角色扮演', '平台跳跃', '解谜', '冒险'],
  essay: [],
};

export function genTitle(r: () => number, kind: Kind): string {
  const a = A[Math.floor(r() * A.length)];
  const b = B[Math.floor(r() * B.length)];
  if (kind === 'music') return r() < 0.55 ? LATIN[Math.floor(r() * LATIN.length)] : a;
  if (kind === 'anime') return r() < 0.5 ? a + ANIME[Math.floor(r() * ANIME.length)] : a + '的' + ANIME[Math.floor(r() * ANIME.length)];
  if (kind === 'game') return r() < 0.4 ? LATIN[Math.floor(r() * LATIN.length)] : a + '：' + b;
  const p = r();
  if (p < 0.5) return a + b;
  if (p < 0.7) return a + '与' + A[Math.floor(r() * A.length)];
  if (p < 0.85) return '在' + a;
  return a;
}

export function genWork(i: number, date: string, idPrefix = 'gen', pools: Pools = SAMPLE_POOLS): Work {
  const r = rng(i * 7919 + 13);
  const p = r();
  const kind: Kind = p < 0.4 ? 'book' : p < 0.64 ? 'anime' : p < 0.76 ? 'film' : p < 0.86 ? 'music' : p < 0.95 ? 'game' : 'essay';
  const id = `${idPrefix}-${i}`;
  if (kind === 'essay') return genEssay(id, r, date);
  const title = genTitle(r, kind);
  const credits: Credit[] = [];
  if (kind === 'book') {
    credits.push({ name: pickZipf(r, pools.authors), role: '作者', core: true });
    if (r() < 0.3) credits.push({ name: pickZipf(r, pools.staff, 1.6), role: '译者' });
  } else if (kind === 'anime' || kind === 'film') {
    credits.push({ name: pickZipf(r, pools.directors), role: '导演', core: true });
    const n = Math.floor(r() * 4);
    const roles = kind === 'anime' ? ['系列构成', '人物设定', '音乐', '脚本'] : ['编剧', '主演', '摄影', '配乐'];
    for (let k = 0; k < n; k++) credits.push({ name: pickZipf(r, pools.staff, 1.6), role: roles[k] });
  } else if (kind === 'music') {
    credits.push({ name: pickZipf(r, pools.artists), role: '艺术家', core: true });
  } else {
    credits.push({ name: pools.studios[Math.floor(r() * pools.studios.length)], role: '开发', core: true });
  }
  const c = r();
  const hasCover = c > 0.13;
  const year = Number(date.slice(0, 4)) - Math.floor(r() * (kind === 'book' ? 30 : 6));
  const g = GENRES[kind];
  return {
    id, kind, title, credits, year, finished: date, collected: date,
    source: kind === 'book' ? (r() < 0.5 ? 'weread' : 'manual') : 'bangumi',
    cover: hasCover ? (() => { const u = coverArt(id, kind, title, credits[0].name); return { thumb: u, medium: u, aspect: artAspect(kind) }; })() : null,
    coverBroken: hasCover && c < 0.16,
    genres: [g[Math.floor(r() * g.length)]],
    info: kind === 'book' ? [{ key: '出版', value: ['译林出版社', '上海译文出版社', '人民文学出版社', '北京十月文艺出版社', '理想国'][Math.floor(r() * 5)] }] : [],
    readHours: kind === 'book' && r() < 0.5 ? 2 + Math.floor(r() * 16) : undefined,
  };
}

function genEssay(id: string, r: () => number, date: string): Work {
  const title = ESSAY_TITLES[Math.floor(r() * ESSAY_TITLES.length)];
  const photo = r() < 0.4;
  return {
    id, kind: 'essay', title, credits: [], finished: date, collected: date, source: 'manual',
    cover: photo ? { thumb: coverArt(id, 'essay', title, ''), medium: coverArt(id, 'essay', title, ''), aspect: artAspect('essay') } : null,
    genres: [], info: [],
    body: ['那天的天气很好。走了很远的路，回来的时候天已经黑了。', '想记下来的东西不多，但都很清楚。'],
  };
}

export const claim = (source: DateClaim['source'], value: string, baseLevel: DateClaim['baseLevel']): DateClaim =>
  ({ source, value, precision: 'day', baseLevel, observedAt: value });

/**
 * 「随便看看」 (TECH-PLAN v0.3 §10.6): a built-in, read-only set laid over the user's library — generated
 * art and made-up names only (no real covers or people), every work `isSample`. Never written into the
 * library; leaving it deletes nothing.
 */
export const SAMPLE_WORKS: Work[] = buildSlots().slice(0, 50).map((date, i) => {
  const w = genWork(90000 + i, date, 'sample');
  const src = w.kind === 'essay' ? 'essay_written' : w.source === 'bangumi' ? 'bgm_first_seen' : w.source === 'weread' ? 'weread_finish' : 'manual_add';
  return {
    ...w, isSample: true, coverBroken: false,
    sources: [{ provider: w.source === 'bangumi' ? 'bangumi_account' : w.source === 'weread' ? 'weread' : 'manual', externalId: w.id }],
    claims: [claim(src, date, src === 'essay_written' || src === 'manual_add' ? 1 : 2)],
  };
});
