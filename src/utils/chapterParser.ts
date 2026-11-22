import {
  FIELD_LIMITS,
  type Chapter,
  type GlossaryCategory,
  type GlossaryTerm,
  type Novel,
  type Segment,
} from '../types';

export interface ParsedChapterResult {
  title: string;
  paragraphs: string[];
}

export interface ParsedMultiChapterItem {
  titleSource: string;
  paragraphs: string[];
  order: number;
}

const MAX_PARAGRAPH_CHARS = 1200;

function splitLongParagraph(paragraph: string): string[] {
  const trimmed = paragraph.trim();
  if (trimmed.length <= MAX_PARAGRAPH_CHARS) {
    return trimmed ? [trimmed] : [];
  }

  // Split by sentence punctuation (Chinese/Japanese/Latin) while keeping delimiters attached
  const sentences = trimmed.match(/[^。！？.!?\n]+[。！？.!?\n]*/g) || [trimmed];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_PARAGRAPH_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Safety slice if a single sentence has no punctuation and exceeds limit
  return chunks.flatMap((chunk) => {
    if (chunk.length <= FIELD_LIMITS.SEGMENT_SOURCE_MAX) return [chunk];
    const hardParts: string[] = [];
    for (let i = 0; i < chunk.length; i += MAX_PARAGRAPH_CHARS) {
      hardParts.push(chunk.slice(i, i + MAX_PARAGRAPH_CHARS));
    }
    return hardParts;
  });
}

function splitBodyIntoParagraphs(rawBody: string): string[] {
  const trimmed = rawBody.trim();
  if (!trimmed) return [];
  const rawParagraphs = trimmed
    .split(/\n{2,}|\n(?=\s*[^\s])/)
    .map((p) => p.replace(/^[\u3000\s]+|[\u3000\s]+$/g, ''))
    .filter((p) => p.length > 0);
  return rawParagraphs.flatMap(splitLongParagraph).slice(0, 5000);
}

export function isChapterHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  const cleaned = trimmed.replace(/^#{1,4}\s+/, '').trim();
  if (!cleaned) return false;

  if (/^#{1,3}\s+/.test(trimmed)) return true;
  if (/^第[零一二三四五六七八九十百千万两0-9]+[章节回卷集篇部]\b/.test(cleaned)) return true;
  if (/^第[零一二三四五六七八九十百千万两0-9]+[章节回卷集篇部](\s|$|[:：\-—])/.test(cleaned)) return true;
  if (/^(Chapter|Ch\.|Chương|Hồi|Quyển|Tiết)\s+[0-9IVXivx]+(\b|[:：.\-—]|$)/i.test(cleaned)) {
    return true;
  }
  if (/^(Phiên ngoại|Lời mở đầu|Mở đầu|Vĩ thanh|Ngoại truyện|番外|楔子|序章|尾声)/i.test(cleaned)) {
    return true;
  }
  return false;
}

export function parseChapterText(rawText: string, fallbackTitle = 'Chương mới'): ParsedChapterResult {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return { title: fallbackTitle, paragraphs: [] };
  }

  const lines = normalized.split('\n');
  let detectedTitle = fallbackTitle;
  let bodyLines = lines;

  // Detect chapter title on first non-empty line if it looks like a heading or markdown header
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmptyIdx !== -1) {
    const firstLine = lines[firstNonEmptyIdx].trim();
    const cleanedMdHeading = firstLine.replace(/^#{1,4}\s+/, '').trim();
    const looksLikeChapterHeading =
      isChapterHeadingLine(firstLine) ||
      (cleanedMdHeading.length <= 80 && lines.length > 1 && lines[firstNonEmptyIdx + 1]?.trim() === '');

    if (looksLikeChapterHeading && cleanedMdHeading) {
      detectedTitle = cleanedMdHeading.slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX);
      bodyLines = lines.slice(firstNonEmptyIdx + 1);
    }
  }

  const paragraphs = splitBodyIntoParagraphs(bodyLines.join('\n'));
  return {
    title: detectedTitle.slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX),
    paragraphs,
  };
}

export function parseMultiChapterBook(
  rawText: string,
  startOrder = 1
): ParsedMultiChapterItem[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const sections: Array<{ title: string; bodyLines: string[] }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isChapterHeadingLine(line)) {
      if (currentLines.some((l) => l.trim().length > 0)) {
        sections.push({
          title: currentTitle || `Chương ${sections.length + startOrder}`,
          bodyLines: currentLines,
        });
      }
      currentTitle = line
        .trim()
        .replace(/^#{1,4}\s+/, '')
        .trim()
        .slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX);
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.some((l) => l.trim().length > 0)) {
    sections.push({
      title: currentTitle || `Chương ${sections.length + startOrder}`,
      bodyLines: currentLines,
    });
  }

  // Fallback to single chapter if no chapter heading boundaries found
  if (sections.length === 0) {
    const single = parseChapterText(normalized, `Chương ${startOrder}`);
    if (single.paragraphs.length === 0) return [];
    return [{ titleSource: single.title, paragraphs: single.paragraphs, order: startOrder }];
  }

  const results: ParsedMultiChapterItem[] = [];
  let orderCursor = Math.max(1, startOrder);
  for (const sec of sections) {
    const paragraphs = splitBodyIntoParagraphs(sec.bodyLines.join('\n'));
    if (paragraphs.length === 0) continue;
    results.push({
      titleSource: sec.title.slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX),
      paragraphs,
      order: orderCursor++,
    });
  }

  return results;
}

export function formatChapterExport(
  chapter: Chapter,
  segments: Segment[],
  format: 'txt' | 'md',
  includeSource = false
): string {
  const title = (chapter.titleTranslated || chapter.titleSource).trim();
  const sorted = [...segments].sort((a, b) => a.index - b.index);

  if (format === 'md') {
    const lines: string[] = [`# ${title}`, ''];
    if (includeSource && chapter.titleTranslated.trim() && chapter.titleSource.trim()) {
      lines.push(`*Nguyên tác: ${chapter.titleSource.trim()}*`, '');
    }
    for (const seg of sorted) {
      const target = seg.translatedText.trim();
      if (includeSource) {
        lines.push(`> ${seg.sourceText.trim()}`, '');
      }
      lines.push(target || `[Chưa dịch đoạn #${seg.index + 1}]`, '');
    }
    return lines.join('\n').trim() + '\n';
  }

  const lines: string[] = [title, ''];
  if (includeSource && chapter.titleTranslated.trim() && chapter.titleSource.trim()) {
    lines.push(`[Nguyên tác] ${chapter.titleSource.trim()}`, '');
  }
  for (const seg of sorted) {
    const target = seg.translatedText.trim();
    if (includeSource) {
      lines.push(seg.sourceText.trim());
    }
    lines.push(target || `[Chưa dịch đoạn #${seg.index + 1}]`, '');
  }
  return lines.join('\n').trim() + '\n';
}

export function formatWholeNovelExport(
  novel: Novel,
  chaptersWithSegments: Array<{ chapter: Chapter; segments: Segment[] }>,
  format: 'txt' | 'md',
  includeSource = false
): string {
  const sortedChapters = [...chaptersWithSegments].sort((a, b) => a.chapter.order - b.chapter.order);

  if (format === 'md') {
    const lines: string[] = [`# ${novel.title}`];
    if (novel.author.trim()) {
      lines.push(`*Tác giả: ${novel.author.trim()}*`);
    }
    lines.push('', '---', '');
    for (const item of sortedChapters) {
      const chTitle = (item.chapter.titleTranslated || item.chapter.titleSource).trim();
      lines.push(`## ${chTitle}`, '');
      if (includeSource && item.chapter.titleTranslated.trim() && item.chapter.titleSource.trim()) {
        lines.push(`*Nguyên tác: ${item.chapter.titleSource.trim()}*`, '');
      }
      const sortedSegs = [...item.segments].sort((a, b) => a.index - b.index);
      for (const seg of sortedSegs) {
        if (includeSource) {
          lines.push(`> ${seg.sourceText.trim()}`, '');
        }
        lines.push(seg.translatedText.trim() || `[Chưa dịch đoạn #${seg.index + 1}]`, '');
      }
      lines.push('');
    }
    return lines.join('\n').trim() + '\n';
  }

  const lines: string[] = [novel.title];
  if (novel.author.trim()) {
    lines.push(`Tác giả: ${novel.author.trim()}`);
  }
  lines.push('========================================', '');

  for (const item of sortedChapters) {
    const chTitle = (item.chapter.titleTranslated || item.chapter.titleSource).trim();
    lines.push(chTitle, '');
    if (includeSource && item.chapter.titleTranslated.trim() && item.chapter.titleSource.trim()) {
      lines.push(`[Nguyên tác] ${item.chapter.titleSource.trim()}`, '');
    }
    const sortedSegs = [...item.segments].sort((a, b) => a.index - b.index);
    for (const seg of sortedSegs) {
      if (includeSource) {
        lines.push(seg.sourceText.trim());
      }
      lines.push(seg.translatedText.trim() || `[Chưa dịch đoạn #${seg.index + 1}]`, '');
    }
    lines.push('----------------------------------------', '');
  }

  return lines.join('\n').trim() + '\n';
}

export function triggerFileDownload(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  triggerBlobDownload(filename, blob);
}

export function triggerBlobDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export interface ParsedGlossaryEntry {
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
}

const VALID_CATEGORIES = new Set<GlossaryCategory>(['character', 'location', 'skill', 'other']);

export function parseGlossaryJson(raw: string): ParsedGlossaryEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const entries: ParsedGlossaryEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (src: unknown, tgt: unknown, cat?: unknown) => {
    const sourceTerm = String(src || '').trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX);
    const targetTerm = String(tgt || '').trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX);
    if (!sourceTerm || !targetTerm || seen.has(sourceTerm)) return;
    seen.add(sourceTerm);
    const category: GlossaryCategory =
      typeof cat === 'string' && VALID_CATEGORIES.has(cat as GlossaryCategory)
        ? (cat as GlossaryCategory)
        : 'other';
    entries.push({ sourceTerm, targetTerm, category });
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        pushEntry(
          obj.sourceTerm ?? obj.source ?? obj.src ?? obj.key,
          obj.targetTerm ?? obj.target ?? obj.tgt ?? obj.value,
          obj.category
        );
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') {
        pushEntry(k, v, 'other');
      } else if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>;
        pushEntry(k, obj.targetTerm ?? obj.target ?? obj.value, obj.category);
      }
    }
  }

  return entries;
}

export function exportGlossaryJson(terms: GlossaryTerm[]): string {
  const payload = terms.map((t) => ({
    sourceTerm: t.sourceTerm,
    targetTerm: t.targetTerm,
    category: t.category,
    enabled: t.enabled,
  }));
  return JSON.stringify(payload, null, 2) + '\n';
}

export function parseBulkGlossaryText(input: string): ParsedGlossaryEntry[] {
  const trimmed = input.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const jsonEntries = parseGlossaryJson(trimmed);
      if (jsonEntries.length > 0) return jsonEntries;
    } catch {
      // Fallback to line-based parsing below
    }
  }

  const entries: ParsedGlossaryEntry[] = [];
  const seen = new Set<string>();

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Support formats: "A→B", "A->B", "A:B", "A=B" (same spirit as call_api.py)
    const match = line.match(/^(.+?)\s*(?:→|->|:|=|\t)\s*(.+)$/);
    if (!match) continue;

    const sourceTerm = match[1].trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX);
    const targetTerm = match[2].trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX);
    if (!sourceTerm || !targetTerm || seen.has(sourceTerm)) continue;

    seen.add(sourceTerm);
    entries.push({ sourceTerm, targetTerm, category: 'other' });
  }

  return entries;
}

