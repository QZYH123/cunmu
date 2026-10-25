/**
 * computeTaste: same works, same today, same result. It does not read the clock or your switches.
 * A sentence that fails the voice check is left out. Length can fall back to a shorter variant;
 * anything else is a bad template (caught when copy.ts loads) or data that must not be said.
 */
import { plain } from '../lead';
import { longCalc } from './calc/long';
import { metCalc } from './calc/met';
import { turnCalc, type TurnCtx } from './calc/turn';
import { COPY } from './copy';
import { byTime, buildFacts, capWorks, toTasteWorks } from './facts';
import { GATES, ORDER } from './gates';
import { headlineH1, headlineH2, headlineH4 } from './headline';
import { lintSentence } from './lint';
import { numbersInCn } from './num';
import type { Dim, Evidence, Hit, Sentence, TasteInput, TasteResult, TemplateId } from './types';

const STAR = new Set<TemplateId>(['L1', 'L2', 'L4', 'M1', 'M2', 'M3', 'Z1', 'Z1b', 'Z2', 'Z4', 'Z6']);

const EMPTY_ROWS = (): TasteResult['rows'] => ({ long: [], stay: [], met: [], turn: [] });

function hitOf(dim: Dim, tid: TemplateId, facts: ReturnType<typeof buildFacts>, ctx: TurnCtx): Hit | null {
  if (dim === 'long' && tid in longCalc) return longCalc[tid as keyof typeof longCalc](facts);
  if (dim === 'met' && tid in metCalc) return metCalc[tid as keyof typeof metCalc](facts);
  if (dim === 'turn' && tid === 'Z2') return turnCalc.Z2(facts, ctx);
  if (dim === 'turn' && tid === 'Z1') return turnCalc.Z1(facts);
  if (dim === 'turn' && tid === 'Z1b') return turnCalc.Z1b(facts);
  if (dim === 'turn' && tid === 'Z3') return turnCalc.Z3(facts);
  if (dim === 'turn' && tid === 'Z4') return turnCalc.Z4(facts);
  if (dim === 'turn' && tid === 'Z5') return turnCalc.Z5(facts);
  if (dim === 'turn' && tid === 'Z6') return turnCalc.Z6(facts);
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
        ...(hit.head ? { head: hit.head } : null),
      };
    }
    if (problems.some((p) => p !== 'length')) hard = true;
  }
  if (hard && process.env.NODE_ENV === 'production') console.debug(`taste drop ${tid}`);
  return null;
}

export function computeTaste(input: TasteInput): TasteResult {
  const ws = toTasteWorks(input.works, input.today);
  const trusted = ws.reduce((n, w) => n + (w.year != null ? 1 : 0), 0);
  const gate = { trusted, need: GATES.total.trustedWorks, ok: trusted >= GATES.total.trustedWorks };
  if (!gate.ok) return { gate, rows: EMPTY_ROWS(), headlines: [], hollow: null, missing: {} };

  const facts = buildFacts(ws, input.today, input.people);
  const ctx: TurnCtx = { periods: input.periods, works: input.works, today: input.today };
  const rows = EMPTY_ROWS();
  for (const dim of ['long', 'stay', 'met', 'turn'] as const) {
    for (const tid of ORDER[dim]) {
      const hit = hitOf(dim, tid, facts, ctx);
      if (!hit) continue;
      const sentence = realize(tid, dim, hit);
      if (sentence) rows[dim].push(sentence);
    }
  }
  const hollowHit = turnCalc.Z7(facts);
  const hollow = hollowHit ? realize('Z7', 'turn', hollowHit) : null;

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
  const z1 = rows.turn.find((s) => s.tid === 'Z1');
  if (z1) {
    const h1 = headlineH1(z1, facts);
    if (h1) headlines.push({ id: 'H1', sentence: h1 });
  }
  const m3 = rows.met.find((s) => s.tid === 'M3');
  if (m3) {
    const h2 = headlineH2(m3);
    if (h2) headlines.push({ id: 'H2', sentence: h2 });
  }
  const gameTurn = rows.turn.some((s) => (s.tid === 'Z1' || s.tid === 'Z1b') && s.slots.kindLate === 'game');
  if (gameTurn) {
    for (const src of rows.long) {
      if (src.tid !== 'L1' && src.tid !== 'L3') continue;
      const h4 = headlineH4(src, facts);
      if (h4) headlines.push({ id: 'H4', sentence: h4 });
    }
  }

  return { gate, rows, headlines, hollow, missing };
}
