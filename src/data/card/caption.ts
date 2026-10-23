/**
 * The words copied with the card. A missing part is left out, and so is its separator.
 * No address and no tag. Names come from the line, not from splitting its text.
 */
import type { CardModel } from './model';

export function buildCaption(m: CardModel, byline?: string | null): string {
  const parts: string[] = [];
  if (m.top.since != null) parts.push(`始于 ${m.top.since}`);
  const names = m.lines.find((l) => l.dim === 'met')?.names?.filter(Boolean).slice(0, 2) ?? [];
  if (names.length) parts.push(`常遇见 ${names.join('、')}`);
  const loved = m.favs.slice(0, 3).map((f) => `《${f.title}》`).join('');
  if (loved) parts.push(`此生最爱 ${loved}`);
  const body = parts.join(' ｜ ');
  const name = (byline ?? m.top.byline)?.trim();
  if (name && body) return `${name} ｜ ${body}`;
  if (name) return name;
  return body;
}
