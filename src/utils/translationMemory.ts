import type { GlossaryTerm } from '../types';

export interface TranslationMemoryEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  updatedAt: number;
}

export interface TranslationMemoryMatch {
  entry: TranslationMemoryEntry;
  score: number; // 0..1
  isExact: boolean;
}

export interface PronounRule {
  id: string;
  speaker: string;
  listener: string;
  selfPronoun: string;
  otherPronoun: string;
  note: string;
}

const TM_PREFIX = 'mac_van_tm_';
const PRONOUN_PREFIX = 'mac_van_pronouns_';
const MAX_TM_ENTRIES = 600;

function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function getBigrams(text: string): Set<string> {
  const cleaned = normalizeText(text).toLowerCase();
  const set = new Set<string>();
  if (cleaned.length < 2) {
    if (cleaned) set.add(cleaned);
    return set;
  }
  for (let i = 0; i < cleaned.length - 1; i++) {
    set.add(cleaned.slice(i, i + 2));
  }
  return set;
}

function computeSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const minLen = Math.min(na.length, nb.length);
  const maxLen = Math.max(na.length, nb.length);
  if (minLen / maxLen < 0.35) return 0;

  const setA = getBigrams(na);
  const setB = getBigrams(nb);
  let intersection = 0;
  for (const bg of setA) {
    if (setB.has(bg)) intersection++;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

export function getTranslationMemory(novelId: string): TranslationMemoryEntry[] {
  if (typeof window === 'undefined' || !novelId) return [];
  try {
    const raw = window.localStorage.getItem(`${TM_PREFIX}${novelId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTranslationMemory(novelId: string, entries: TranslationMemoryEntry[]): void {
  if (typeof window === 'undefined' || !novelId) return;
  const trimmed = [...entries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TM_ENTRIES);
  window.localStorage.setItem(`${TM_PREFIX}${novelId}`, JSON.stringify(trimmed));
}

export function upsertTranslationMemory(
  novelId: string,
  items: Array<{ sourceText: string; translatedText: string }>
): TranslationMemoryEntry[] {
  if (!novelId || items.length === 0) return getTranslationMemory(novelId);
  const existing = getTranslationMemory(novelId);
  const bySource = new Map<string, TranslationMemoryEntry>(
    existing.map((e) => [normalizeText(e.sourceText), e])
  );

  const now = Date.now();
  for (const item of items) {
    const src = normalizeText(item.sourceText);
    const tgt = item.translatedText.trim();
    if (!src || !tgt || src.length > 1500) continue;
    const prev = bySource.get(src);
    bySource.set(src, {
      id: prev?.id || `tm_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      sourceText: item.sourceText.trim(),
      translatedText: tgt,
      updatedAt: now,
    });
  }

  const next = Array.from(bySource.values());
  saveTranslationMemory(novelId, next);
  return next;
}

export function deleteTranslationMemoryEntry(novelId: string, entryId: string): TranslationMemoryEntry[] {
  const next = getTranslationMemory(novelId).filter((e) => e.id !== entryId);
  saveTranslationMemory(novelId, next);
  return next;
}

export function clearTranslationMemory(novelId: string): void {
  if (typeof window === 'undefined' || !novelId) return;
  window.localStorage.removeItem(`${TM_PREFIX}${novelId}`);
}

export function findMemoryMatches(
  sourceText: string,
  novelId: string,
  minScore = 0.55
): TranslationMemoryMatch[] {
  const query = normalizeText(sourceText);
  if (!query || query.length < 4) return [];

  const entries = getTranslationMemory(novelId);
  const matches: TranslationMemoryMatch[] = [];

  for (const entry of entries) {
    const entryNorm = normalizeText(entry.sourceText);
    if (entryNorm === query) {
      matches.push({ entry, score: 1, isExact: true });
      continue;
    }
    const score = computeSimilarity(query, entryNorm);
    if (score >= minScore) {
      matches.push({ entry, score, isExact: false });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

// --- Character Pronoun Matrix ---

export function getPronounRules(novelId: string): PronounRule[] {
  if (typeof window === 'undefined' || !novelId) return [];
  try {
    const raw = window.localStorage.getItem(`${PRONOUN_PREFIX}${novelId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePronounRules(novelId: string, rules: PronounRule[]): void {
  if (typeof window === 'undefined' || !novelId) return;
  window.localStorage.setItem(`${PRONOUN_PREFIX}${novelId}`, JSON.stringify(rules));
}

function characterAppearsInSource(
  characterName: string,
  sourceText: string,
  glossary: GlossaryTerm[]
): boolean {
  const clean = characterName.trim();
  if (!clean) return false;
  if (sourceText.includes(clean)) return true;

  // Also check if glossary maps a source term to this character's target name
  const lower = clean.toLowerCase();
  for (const g of glossary) {
    if (!g.enabled) continue;
    if (g.targetTerm.trim().toLowerCase() === lower && sourceText.includes(g.sourceTerm)) {
      return true;
    }
  }
  return false;
}

export function findMatchingPronounRules(
  sourceText: string,
  rules: PronounRule[],
  glossary: GlossaryTerm[]
): PronounRule[] {
  if (!sourceText || rules.length === 0) return [];
  return rules.filter(
    (rule) =>
      characterAppearsInSource(rule.speaker, sourceText, glossary) &&
      characterAppearsInSource(rule.listener, sourceText, glossary)
  );
}

export function formatPronounInstruction(rules: PronounRule[]): string {
  if (rules.length === 0) return '';
  const items = rules.map((r) => {
    const notePart = r.note.trim() ? ` (${r.note.trim()})` : '';
    return `${r.speaker} khi nói với ${r.listener} xưng "${r.selfPronoun}" và gọi "${r.otherPronoun}"${notePart}`;
  });
  return `Quy tắc xưng hô nhân vật bắt buộc: ${items.join('; ')}.`;
}
