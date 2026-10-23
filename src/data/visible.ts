/**
 * What a guest may see of the library (给人看, the long image, and anything shared later).
 * One list — works, periods, interests, favorites — so a page does not filter `me.interests` or
 * `me.periods` on its own. A new guest-facing outlet has to go through `outwardView()` and be added
 * to the list in tests/outward.test.ts. Words the owner wrote (the line under the name, a rewritten
 * paragraph) are not scrubbed; they are the owner's, shown as written.
 */
import type { Kind, Work } from './types';
import { KIND_LABEL } from './types';
import { derive, cnMonth, type Derived, type Settings } from './derive';
import { chapterOrder, interestMembers, shownPeriods, shownTo, type Favorite, type Interest, type MeData, type Period } from './me';
import { decodePart } from '../lib/decode';

export interface OutwardView {
  /** 只给自己, essays and the sample left out. A work in progress (`status === 'doing'`) stays; callers drop it when they want to. */
  works: Work[];
  /** chapter order; a period with nothing a guest can see is not here */
  periods: Period[];
  /** an interest with at least one work the guest can see. A partly visible interest keeps its name. */
  interests: Interest[];
  /** 最爱 whose work the guest can open (a public essay stays; the sample and 只给自己 do not) */
  favorites: Favorite[];
  /** period ids left out of `periods`, for the route guard */
  hiddenPeriods: string[];
  /** interest ids left out of `interests`, for the route guard */
  hiddenInterests: string[];
}

/** interests that still have a member among these works (essays never count) */
export function visibleInterests(interests: readonly Interest[], visibleWorks: readonly Work[]): Interest[] {
  return interests.filter((i) => interestMembers(i, [...visibleWorks]).length > 0);
}

/** the other interests: nothing here a guest can see, so the name is not shown either */
export function hiddenInterests(interests: readonly Interest[], visibleWorks: readonly Work[]): string[] {
  const keep = new Set(visibleInterests(interests, visibleWorks).map((i) => i.id));
  return interests.filter((i) => !keep.has(i.id)).map((i) => i.id);
}

/** essays stay (a guest may open one); 只给自己 and the sample do not */
export function shownLibrary(library: readonly Work[], onlyMe: readonly string[]): Work[] {
  return library.filter(shownTo([...onlyMe]));
}

/**
 * The library and the index built only from it: people, years and genres a guest may be offered.
 * Search uses this while 给人看. The owner keeps the store's own index, unchanged.
 */
export function shownIndex(
  library: readonly Work[],
  onlyMe: readonly string[],
  settings: Settings,
  promoted: readonly string[],
  doing: readonly Work[] = [],
): { library: Work[]; d: Derived } {
  const visible = shownLibrary(library, onlyMe);
  const keep = shownTo([...onlyMe]);
  return { library: visible, d: derive(visible, settings, new Set(promoted), doing.filter(keep)) };
}

/** the guest's view of one library. Pure: the same inputs, the same view. */
export function outwardView(library: readonly Work[], me: MeData, today: string): OutwardView {
  const visible = shownLibrary(library, me.onlyMe);
  const works = visible.filter((w) => w.kind !== 'essay');
  const ids = new Set(visible.map((w) => w.id));
  const periods = shownPeriods(chapterOrder(me.periods), works, today);
  const kept = new Set(periods.map((p) => p.id));
  return {
    works,
    periods,
    interests: visibleInterests(me.interests, works),
    favorites: me.favorites.filter((f) => ids.has(f.id)),
    hiddenPeriods: me.periods.filter((p) => !kept.has(p.id)).map((p) => p.id),
    hiddenInterests: hiddenInterests(me.interests, works),
  };
}

export interface DocTitleInput {
  pathname: string;
  /** the library's name; '' when it has none */
  libraryTitle: string;
  /** passed in: this module does not reach into the native shell */
  appName: string;
  /** 给人看 is on: a 只给自己 work is not named */
  show: boolean;
  onlyMe: readonly string[];
  /** interests and periods this title may name — outwardView()'s, while 给人看 */
  interests: readonly { id: string; name: string }[];
  periods: readonly { id: string; name: string }[];
  /** set only when this person may be named; absent → 「人物」 */
  personName?: string;
  /** the entry or essay, when it may be named */
  work?: { title: string; kind: string };
}

/**
 * The window title (VOICE v0.1 §3): home is the library's name, every other page is 「页面名 · 存目」.
 * A hidden interest, period, person or work does not lend its name — the plain word stands in.
 */
export function docTitle(input: DocTitleInput): string {
  const [, a, b, c] = input.pathname.split('/').map(decodePart);
  let name = input.libraryTitle;
  const hiddenWork = input.show && (a === 'entry' || a === 'essay') && input.onlyMe.includes(b);
  if (!hiddenWork && (a === 'entry' || a === 'essay')) {
    const w = input.work;
    if (w) name = w.kind === 'essay' ? (w.title || '随笔') : `《${w.title}》`;
  } else if (a === 'year') name = c ? `${b} · ${cnMonth(Number(c))}` : b;
  else if (a === 'person') name = input.personName ?? '人物';
  else if (a === 'kind') name = KIND_LABEL[b as Kind] ?? '分类';
  else if (a === 'index') name = '索引';
  else if (a === 'search') name = '搜索';
  else if (a === 'wall') name = '整面墙';
  else if (a === 'doing') name = '在看';
  else if (a === 'unknown') name = '时间未知';
  else if (a === 'write') name = '写';
  else if (a === 'writing') name = '随笔';
  else if (a === 'me') name = b === 'removed' ? '移出的作品' : b === 'organize' ? '整理方式' : '设置';
  else if (a === 'settings') name = '设置';
  else if (a === 'all') name = '全部';
  else if (a === 'interest') name = input.interests.find((i) => i.id === b)?.name ?? '兴趣';
  else if (a === 'period') name = input.periods.find((p) => p.id === b)?.name ?? '时期';
  return name ? `${name} · ${input.appName}` : input.appName;
}
