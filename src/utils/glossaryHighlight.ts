import type { GlossaryTerm } from '../types';

export interface TextSpan {
  text: string;
  term?: GlossaryTerm;
}

export function findMatchingGlossaryTerms(text: string, glossary: GlossaryTerm[]): GlossaryTerm[] {
  if (!text || glossary.length === 0) return [];
  return glossary.filter((g) => g.enabled && g.sourceTerm && text.includes(g.sourceTerm));
}

export function splitTextWithGlossaryHighlights(
  text: string,
  glossary: GlossaryTerm[]
): TextSpan[] {
  const matches = findMatchingGlossaryTerms(text, glossary);
  if (matches.length === 0) {
    return [{ text }];
  }

  // Sort longer terms first so compound names match before substrings
  const sortedTerms = [...matches].sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);
  const escaped = sortedTerms.map((t) => t.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'g');

  const parts = text.split(regex);
  const termMap = new Map(sortedTerms.map((t) => [t.sourceTerm, t]));

  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const matched = termMap.get(part);
      return matched ? { text: part, term: matched } : { text: part };
    });
}
