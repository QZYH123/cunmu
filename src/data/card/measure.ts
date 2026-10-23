/**
 * A stand-in for the middle's height, used only by tests.
 * CJK is 1em, letters and digits about 0.55em, and 。，、 do not start a line.
 * The real card measures itself in the browser.
 */
import type { CardModel } from './model';
import {
  AFTER_HEAD, HEAD_TOP, INNER_W, LEAD_EM, LEAD_LH, LINE_MAX, PERIOD_BEFORE, PERIOD_EM, PERIOD_GAP, PERIOD_LH,
  ROW_GAP, TEXT_W, TITLE_EM, TITLE_LH,
} from './metrics';

const PUNCT = new Set(['。', '，', '、']);

function wrapped(text: string, width: number, em: number): number {
  if (!text) return 0;
  let lines = 1;
  let w = 0;
  for (const ch of text) {
    const cw = /[A-Za-z0-9]/.test(ch) ? em * 0.55 : em;
    if (w > 0 && w + cw > width && !PUNCT.has(ch)) { lines += 1; w = cw; }
    else w += cw;
  }
  return Math.min(LINE_MAX, lines);
}

export function estimateMiddleHeight(m: Pick<CardModel, 'headline' | 'lines' | 'lead' | 'periods'>): number {
  let h = 0;
  const head = m.headline ? wrapped(m.headline, INNER_W, TITLE_EM) : 0;
  if (head) h += HEAD_TOP + head * TITLE_LH;
  const bodies = m.lines.length ? m.lines.map((l) => l.text) : m.lead ? [m.lead] : [];
  if (bodies.length) {
    if (head) h += AFTER_HEAD;
    const width = m.lines.length ? TEXT_W : INNER_W;
    bodies.forEach((text, i) => {
      if (i) h += ROW_GAP;
      h += wrapped(text, width, LEAD_EM) * LEAD_LH;
    });
  }
  if (m.periods.length) {
    h += PERIOD_BEFORE;
    m.periods.forEach((p, i) => {
      if (i) h += PERIOD_GAP;
      h += wrapped(p.text, INNER_W, PERIOD_EM) * PERIOD_LH;
    });
  }
  return h;
}
