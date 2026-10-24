/**
 * computeTaste: same works, same today, same result. It does not read the clock or your switches.
 * A sentence that fails the voice check is left out. Length can fall back to a shorter variant;
 * anything else is a bad template (caught when copy.ts loads) or data that must not be said.
 */
import { plain } from '../lead';
import { longCalc } from './calc/long';
import { metCalc } from './calc/met';
import { COPY } from './copy';
import { byTime, buildFacts, capWorks, toTasteWorks } from './facts';
import { GATES, ORDER } from './gates';
import { headlineH2 } from './headline';
import { lintSentence } from './lint';
import { numbersInCn } from './num';
import type { Dim, Evidence, Hit, Sentence, TasteInput, TasteResult, TemplateId } from './types';

const STAR = new Set<TemplateId>(['L1', 'L2', 'L4', 'M1', 'M2', 'M3']);

const EMPTY_ROWS = (): TasteResult['rows'] => ({ long: [], stay: [], met: [], turn: [] });

function hitOf(dim: Dim, tid: TemplateId, facts: ReturnType<typeof buildFacts>): Hit | null {
  if (dim === 'long' && tid in longCalc) return longCalc[tid as keyof typeof longCalc](facts);
  if (dim === 'met' && tid in metCalc) return metCalc[tid as keyof typeof metCalc](facts);
  return null;
}

function variantsFor(tid: TemplateId, preferred: string): string[] {
  const out = [preferred];
  if (preferred !== 'short' && COPY[tid].short) out.push('short');
  if (preferred !== 'noTitle' && COPY[tid].noTitle) out.push('noTitle');
  return out;
}

function materialize(tid: TemplateId, variant: string, hit: Hit): { text: string; segs: Sentence['segs'] } | null {
  if (hit.segs && variant === hit.variant) return { segs: hit.segs, text: plain(hit.segs) };
  const tpl = COPY[tid][variant];
  if (!tpl) return null;
  const text = tpl.replace(/\{(\w+)\}/g, (_, key: string) => (hit.slots[key] == null ? '' : String(hit.slots[key])));
  return { text, segs: [{ text }] };
}

function evidenceOf(works: Hit['evidence']): Evidence[] {
  return capWorks(works).sort(byTime).map((w) => ({ id: w.id, title: w.title, year: w.year }));
}

function realize(tid: TemplateId, dim: Dim, hit: Hit): Sentence | null {
  let hard = false;
  for (const variant of variantsFor(tid, hit.variant)) {
    const built = materialize(tid, variant, hit);
    if (!built) continue;
    const problems = lintSentence(built.text);
    if (problems.length === 0) {
      const shortTpl = COPY[tid].short;
      let short: string | undefined;
      if (variant === 'short') short = built.text;
      else if (shortTpl) {
        const s = shortTpl.replace(/\{(\w+)\}/g, (_, key: string) => (hit.slots[key] == null ? '' : String(hit.slots[key])));
        if (lintSentence(s).length === 0) short = s;
      }
      return {
        tid, dim, segs: built.segs, text: built.text,
        evidence: evidenceOf(hit.evidence),
        nums: numbersInCn(built.text),
        slots: hit.slots,
        variant,
        star: STAR.has(tid),
        ...(short ? { short } : null),
        ...(hit.names?.length ? { names: hit.names } : null),
      };
    }
    if (problems.some((p) => p !== 'length')) hard = true;
  }
  if (hard && process.env.NODE_ENV === 'production') console.debug(`taste drop ${tid}`);
  return null;
}

export function computeTaste(input: TasteInput): TasteResult {
  void input.periods;
  const ws = toTasteWorks(input.works, input.today);
  const trusted = ws.reduce((n, w) => n + (w.year != null ? 1 : 0), 0);
  const gate = { trusted, need: GATES.total.trustedWorks, ok: trusted >= GATES.total.trustedWorks };
  if (!gate.ok) return { gate, rows: EMPTY_ROWS(), headlines: [], hollow: null, missing: {} };

  const facts = buildFacts(ws, input.today, input.people);
  const rows = EMPTY_ROWS();
  for (const dim of ['long', 'stay', 'met', 'turn'] as const) {
    for (const tid of ORDER[dim]) {
      const hit = hitOf(dim, tid, facts);
      if (!hit) continue;
      const sentence = realize(tid, dim, hit);
      if (sentence) rows[dim].push(sentence);
    }
  }

  const missing: TasteResult['missing'] = {};
  if (!rows.long.length) missing.long = facts.topics.size === 0 ? 'noTags' : 'none';
  if (!ws.some((w) => (w.minutes ?? 0) >= 1)) missing.stay = 'noSteam';
  if (!rows.met.length) {
    if (input.people.state === 'loading') missing.met = 'peopleLoading';
    else if (input.people.state === 'blocked') missing.met = 'peopleBlocked';
    else if (facts.creators.length === 0) missing.met = 'noPeople';
    else missing.met = 'none';
  }

  const headlines: TasteResult['headlines'] = [];
  const m3 = rows.met.find((s) => s.tid === 'M3');
  if (m3) {
    const h2 = headlineH2(m3);
    if (h2) headlines.push({ id: 'H2', sentence: h2 });
  }

  return { gate, rows, headlines, hollow: null, missing };
}
