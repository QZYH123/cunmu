/** what leaving the essay editor should do */
export type EssayPlan = 'save' | 'drop' | 'skip';

/**
 * A picture is enough to keep. A new essay with no title, no words and no picture is not created.
 * An existing one saved empty is removed (the editor offers undo).
 */
export function essayPlan(input: { existing: boolean; title: string; paragraphs: string[]; photo: boolean }): EssayPlan {
  const kept = !!input.title.trim() || input.paragraphs.length > 0 || input.photo;
  if (kept) return 'save';
  return input.existing ? 'drop' : 'skip';
}

/** words stay as written; a title with no words is copied into the body; a picture alone leaves the body empty */
export function essayBody(title: string, paragraphs: string[]): string[] {
  if (paragraphs.length) return paragraphs;
  const t = title.trim();
  return t ? [t] : [];
}
