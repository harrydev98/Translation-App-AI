import type { Chapter, GlossaryTerm, Novel, Segment } from '../types';
import { findMatchingGlossaryTerms } from './glossaryHighlight';

export type ReviewSeverity = 'error' | 'warning';

export type ReviewIssueCode =
  | 'title_untranslated'
  | 'title_glossary'
  | 'empty_translation'
  | 'glossary_mismatch'
  | 'leftover_source_script'
  | 'prompt_leak'
  | 'forbidden_term'
  | 'unbalanced_quotes'
  | 'length_anomaly'
  | 'unreviewed_segment';

export interface ReviewIssue {
  id: string;
  segmentId: string | null; // null means chapter title
  segmentIndex: number | null; // 0-based
  severity: ReviewSeverity;
  code: ReviewIssueCode;
  title: string;
  detail: string;
  suggestion?: string;
  missingTerms?: GlossaryTerm[];
}

export interface ReviewRulesConfig {
  checkGlossary: boolean;
  checkSourceLeak: boolean;
  checkQuotes: boolean;
  checkLength: boolean;
  requireAllReviewed: boolean;
  forbiddenTerms: string[];
}

export const DEFAULT_REVIEW_RULES: ReviewRulesConfig = {
  checkGlossary: true,
  checkSourceLeak: true,
  checkQuotes: true,
  checkLength: true,
  requireAllReviewed: false,
  forbiddenTerms: [],
};

export interface ChapterAuditReport {
  checkedAt: number;
  totalSegments: number;
  translatedSegments: number;
  reviewedSegments: number;
  passedSegments: number;
  errorCount: number;
  warningCount: number;
  issues: ReviewIssue[];
  fixableSegmentIds: string[];
}

const CJK_SOURCE_LANGS = new Set(['zh', 'zh-CN', 'zh-TW', 'ja', 'ko', 'auto']);
const LATIN_TARGET_LANGS = new Set(['vi', 'en', 'fr', 'de', 'es', 'id']);

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectLeftoverSourceChars(text: string, sourceLang: string, targetLang: string): string | null {
  if (!CJK_SOURCE_LANGS.has(sourceLang) || !LATIN_TARGET_LANGS.has(targetLang)) {
    return null;
  }
  const matches = text.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]+/g);
  if (!matches || matches.length === 0) return null;
  return Array.from(new Set(matches)).slice(0, 5).join(', ');
}

function detectPromptOrTagLeak(text: string): string | null {
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /<\/?think>/i, label: 'Thẻ <think>' },
    { regex: /【源文】|【约束要求】|只输出译文/, label: 'Từ khóa prompt nội bộ' },
    { regex: /\[Chưa dịch đoạn #\d+\]/i, label: 'Đoạn đánh dấu chưa dịch' },
  ];
  for (const p of patterns) {
    if (p.regex.test(text)) return p.label;
  }
  return null;
}

function hasUnbalancedQuotes(text: string): boolean {
  const straightDouble = (text.match(/"/g) || []).length;
  if (straightDouble % 2 !== 0) return true;
  const leftCurly = (text.match(/“/g) || []).length;
  const rightCurly = (text.match(/”/g) || []).length;
  if (leftCurly !== rightCurly) return true;
  return false;
}

export function auditChapterTranslation(params: {
  novel: Novel;
  chapter: Chapter;
  segments: Segment[];
  glossary: GlossaryTerm[];
  sourceLang: string;
  targetLang: string;
  rules: ReviewRulesConfig;
}): ChapterAuditReport {
  const { chapter, segments, glossary, sourceLang, targetLang, rules } = params;
  const issues: ReviewIssue[] = [];
  const segmentHasIssue = new Set<string>();
  const fixableIds = new Set<string>();

  // 1. Check Chapter Title
  const titleTranslated = chapter.titleTranslated.trim();
  if (!titleTranslated) {
    issues.push({
      id: 'title_empty',
      segmentId: null,
      segmentIndex: null,
      severity: 'error',
      code: 'title_untranslated',
      title: 'Tiêu đề chương chưa được dịch',
      detail: `Tiêu đề gốc “${chapter.titleSource}” vẫn đang để trống phần bản dịch.`,
      suggestion: 'Nhập tiêu đề tiếng Việt hoặc chạy dịch tự động chương.',
    });
  } else {
    const leakedTitle = rules.checkSourceLeak
      ? detectLeftoverSourceChars(titleTranslated, sourceLang, targetLang)
      : null;
    if (leakedTitle) {
      issues.push({
        id: 'title_leak',
        segmentId: null,
        segmentIndex: null,
        severity: 'error',
        code: 'leftover_source_script',
        title: 'Tiêu đề chương còn sót chữ gốc',
        detail: `Phát hiện ký tự gốc (${leakedTitle}) trong tiêu đề “${titleTranslated}”.`,
      });
    }

    if (rules.checkGlossary) {
      const titleTerms = findMatchingGlossaryTerms(chapter.titleSource, glossary);
      const normTitle = normalizeForMatch(titleTranslated);
      const missedTitleTerms = titleTerms.filter(
        (t) => !normTitle.includes(normalizeForMatch(t.targetTerm))
      );
      if (missedTitleTerms.length > 0) {
        issues.push({
          id: 'title_glossary',
          segmentId: null,
          segmentIndex: null,
          severity: 'warning',
          code: 'title_glossary',
          title: 'Tiêu đề chương lệch thuật ngữ Glossary',
          detail: missedTitleTerms.map((t) => `${t.sourceTerm} → ${t.targetTerm}`).join('; '),
          missingTerms: missedTitleTerms,
        });
      }
    }
  }

  // 2. Check Each Segment
  const sorted = [...segments].sort((a, b) => a.index - b.index);
  let translatedSegments = 0;
  let reviewedSegments = 0;

  for (const seg of sorted) {
    const src = seg.sourceText.trim();
    const tgt = seg.translatedText.trim();
    const segNum = seg.index + 1;

    if (tgt.length > 0) translatedSegments++;
    if (seg.isReviewed) reviewedSegments++;

    // Empty translation
    if (!tgt) {
      segmentHasIssue.add(seg.id);
      fixableIds.add(seg.id);
      issues.push({
        id: `${seg.id}_empty`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        severity: 'error',
        code: 'empty_translation',
        title: `Đoạn #${segNum} chưa được dịch`,
        detail: `Nguyên tác (${src.length} ký tự): “${src.slice(0, 90)}${src.length > 90 ? '…' : ''}”`,
        suggestion: 'Chạy dịch lại đoạn này trước khi chốt hoàn thành.',
      });
      continue;
    }

    // Prompt / think tag leak
    const leakLabel = detectPromptOrTagLeak(tgt);
    if (leakLabel) {
      segmentHasIssue.add(seg.id);
      fixableIds.add(seg.id);
      issues.push({
        id: `${seg.id}_leak`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        severity: 'error',
        code: 'prompt_leak',
        title: `Đoạn #${segNum} lẫn thẻ hoặc chỉ dẫn hệ thống`,
        detail: `Phát hiện “${leakLabel}” trong bản dịch.`,
        suggestion: 'Xóa bỏ phần thẻ thừa hoặc bấm Dịch lại đoạn.',
      });
    }

    // Source script leakage
    if (rules.checkSourceLeak) {
      const leaked = detectLeftoverSourceChars(tgt, sourceLang, targetLang);
      if (leaked) {
        segmentHasIssue.add(seg.id);
        fixableIds.add(seg.id);
        issues.push({
          id: `${seg.id}_cjk`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          severity: 'error',
          code: 'leftover_source_script',
          title: `Đoạn #${segNum} còn sót chữ nguyên tác`,
          detail: `Bản dịch vẫn chứa ký tự chưa chuyển ngữ: ${leaked}`,
          suggestion: 'Kiểm tra lại hoặc dịch lại đoạn để chuyển ngữ hoàn toàn.',
        });
      }
    }

    // Glossary compliance
    if (rules.checkGlossary) {
      const expectedTerms = findMatchingGlossaryTerms(src, glossary);
      if (expectedTerms.length > 0) {
        const normTgt = normalizeForMatch(tgt);
        const missing = expectedTerms.filter(
          (term) => !normTgt.includes(normalizeForMatch(term.targetTerm))
        );
        if (missing.length > 0) {
          segmentHasIssue.add(seg.id);
          fixableIds.add(seg.id);
          issues.push({
            id: `${seg.id}_glossary`,
            segmentId: seg.id,
            segmentIndex: seg.index,
            severity: 'error',
            code: 'glossary_mismatch',
            title: `Đoạn #${segNum} sai hoặc thiếu thuật ngữ (${missing.length})`,
            detail: `Yêu cầu bắt buộc: ${missing
              .map((t) => `${t.sourceTerm} → ${t.targetTerm}`)
              .join(' · ')}`,
            suggestion: 'Chỉnh sửa câu chữ theo thuật ngữ chuẩn hoặc bấm Dịch lại chuẩn thuật ngữ.',
            missingTerms: missing,
          });
        }
      }
    }

    // Custom forbidden terms rule
    if (rules.forbiddenTerms.length > 0) {
      const normTgt = normalizeForMatch(tgt);
      const foundForbidden = rules.forbiddenTerms.filter((word) => {
        const clean = normalizeForMatch(word);
        return clean.length > 0 && normTgt.includes(clean);
      });
      if (foundForbidden.length > 0) {
        segmentHasIssue.add(seg.id);
        issues.push({
          id: `${seg.id}_forbidden`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          severity: 'warning',
          code: 'forbidden_term',
          title: `Đoạn #${segNum} chứa cụm từ cần tránh`,
          detail: `Phát hiện từ nằm trong danh sách quy định cấm: ${foundForbidden.join(', ')}`,
          suggestion: 'Biên tập lại câu văn để thay thế cụm từ chưa phù hợp.',
        });
      }
    }

    // Unbalanced quotes
    if (rules.checkQuotes && hasUnbalancedQuotes(tgt)) {
      segmentHasIssue.add(seg.id);
      issues.push({
        id: `${seg.id}_quotes`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        severity: 'warning',
        code: 'unbalanced_quotes',
        title: `Đoạn #${segNum} lệch dấu ngoặc kép đối thoại`,
        detail: 'Số lượng dấu ngoặc mở và đóng không khớp nhau.',
        suggestion: 'Kiểm tra lại cặp ngoặc kép trong lời thoại nhân vật.',
      });
    }

    // Length anomaly check (tuned for CJK -> Latin expansion vs truncation)
    if (rules.checkLength && src.length >= 15) {
      const isCjkToLatin = CJK_SOURCE_LANGS.has(sourceLang) && LATIN_TARGET_LANGS.has(targetLang);
      const minRatio = isCjkToLatin ? 0.6 : 0.35;
      const maxRatio = isCjkToLatin ? 6.5 : 3.2;
      const ratio = tgt.length / src.length;

      if (ratio < minRatio) {
        segmentHasIssue.add(seg.id);
        issues.push({
          id: `${seg.id}_short`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          severity: 'warning',
          code: 'length_anomaly',
          title: `Đoạn #${segNum} có dấu hiệu dịch thiếu ý`,
          detail: `Nguyên tác ${src.length} ký tự nhưng bản dịch chỉ có ${tgt.length} ký tự.`,
          suggestion: 'Đối chiếu lại xem mô hình có bỏ sót vế câu nào không.',
        });
      } else if (ratio > maxRatio) {
        segmentHasIssue.add(seg.id);
        issues.push({
          id: `${seg.id}_long`,
          segmentId: seg.id,
          segmentIndex: seg.index,
          severity: 'warning',
          code: 'length_anomaly',
          title: `Đoạn #${segNum} dài bất thường`,
          detail: `Nguyên tác ${src.length} ký tự nhưng bản dịch dài tới ${tgt.length} ký tự.`,
          suggestion: 'Kiểm tra xem mô hình có lặp chữ hoặc thêm giải thích thừa không.',
        });
      }
    }

    // Optional strict rule: require all segments reviewed
    if (rules.requireAllReviewed && !seg.isReviewed) {
      segmentHasIssue.add(seg.id);
      issues.push({
        id: `${seg.id}_unreviewed`,
        segmentId: seg.id,
        segmentIndex: seg.index,
        severity: 'warning',
        code: 'unreviewed_segment',
        title: `Đoạn #${segNum} chưa được đánh dấu "Duyệt"`,
        detail: 'Quy định yêu cầu xác nhận duyệt từng đoạn trước khi hoàn tất chương.',
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const passedSegments = Math.max(0, sorted.length - segmentHasIssue.size);

  return {
    checkedAt: Date.now(),
    totalSegments: sorted.length,
    translatedSegments,
    reviewedSegments,
    passedSegments,
    errorCount,
    warningCount,
    issues,
    fixableSegmentIds: Array.from(fixableIds),
  };
}
