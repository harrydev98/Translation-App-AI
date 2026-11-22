import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  BookA,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  FilePlus2,
  GitCompare,
  Languages,
  Layers,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getLanguageLabel,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
  TRANSLATION_GENRES,
} from '../constants/languages';
import { translateOnce, translateStream } from '../services/translateClient';
import {
  FIELD_LIMITS,
  type Chapter,
  type ChapterStatus,
  type GlossaryCategory,
  type GlossaryTerm,
  type Novel,
  type Segment,
  type StudioViewMode,
  type TranslationQueueState,
  type UserSettings,
} from '../types';
import {
  formatChapterExport,
  formatWholeNovelExport,
  triggerFileDownload,
  type ParsedMultiChapterItem,
} from '../utils/chapterParser';
import { exportChapterToEpub, exportNovelToEpub } from '../utils/epubExporter';
import {
  findMatchingGlossaryTerms,
  splitTextWithGlossaryHighlights,
} from '../utils/glossaryHighlight';
import {
  findMemoryMatches,
  findMatchingPronounRules,
  formatPronounInstruction,
  getPronounRules,
  upsertTranslationMemory,
  type PronounRule,
  type TranslationMemoryMatch,
} from '../utils/translationMemory';
import {
  auditChapterTranslation,
  DEFAULT_REVIEW_RULES,
  type ReviewIssue,
  type ReviewRulesConfig,
} from '../utils/translationReviewer';
import { ImportChapterModal } from './ImportChapterModal';
import { ReviewPanel } from './ReviewPanel';

type ChapterTranslationStrategy = 'segment' | 'whole_35b' | 'two_pass';

const GLOSSARY_CATEGORY_SHORT: Record<GlossaryCategory, string> = {
  character: 'Nhân vật',
  location: 'Địa danh',
  skill: 'Công pháp',
  other: 'Khác',
};

interface StudioViewProps {
  novel: Novel | null;
  chapters: Chapter[];
  chaptersLoading: boolean;
  activeChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  segments: Segment[];
  segmentsLoading: boolean;
  glossary: GlossaryTerm[];
  settings: UserSettings;
  sessionApiKey: string;
  onCreateChapter: (input: {
    titleSource: string;
    paragraphs: string[];
    order: number;
  }) => Promise<string>;
  onCreateMultipleChapters?: (items: ParsedMultiChapterItem[]) => Promise<string[]>;
  onUpdateChapterMeta: (
    chapterId: string,
    fields: { titleTranslated?: string; status?: ChapterStatus; translatedCount?: number }
  ) => Promise<void>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  onUpdateSegmentTranslation: (segmentId: string, translatedText: string) => Promise<void>;
  onBatchUpdateSegments?: (
    chapterId: string,
    updates: Array<{ segmentId: string; translatedText: string }>,
    meta?: { titleTranslated?: string; status?: ChapterStatus; translatedCount?: number }
  ) => Promise<void>;
  onFetchChapterSegments?: (chapterId: string) => Promise<Segment[]>;
  onFetchNovelExportData?: () => Promise<Array<{ chapter: Chapter; segments: Segment[] }>>;
  onUpdateSegmentReviewed: (segmentId: string, isReviewed: boolean) => Promise<void>;
  onUpdateSegmentNote: (segmentId: string, note: string) => Promise<void>;
  onAddGlossaryTerm: (input: {
    sourceTerm: string;
    targetTerm: string;
    category: GlossaryCategory;
  }) => Promise<void>;
  onGoToLibrary: () => void;
}

interface SegmentRowProps {
  novelId: string;
  segment: Segment;
  glossary: GlossaryTerm[];
  issues: ReviewIssue[];
  isHighlighted: boolean;
  isFocusedSegment: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  registerInsertHandler: (segmentId: string, handler: ((text: string) => void) | null) => void;
  onFocusSegment: (segmentId: string) => void;
  isStreamingThis: boolean;
  streamingText: string;
  disabledQueue: boolean;
  tmMatch: TranslationMemoryMatch | null;
  onSaveTranslation: (segmentId: string, text: string) => Promise<void>;
  onTranslateSingle: (segment: Segment) => Promise<void>;
  onBackTranslate: (segment: Segment, translatedText: string) => Promise<string>;
  onCompareModels: (segment: Segment) => Promise<{ model9b: string; model35b: string }>;
  onToggleReviewed: (segmentId: string, nextVal: boolean) => Promise<void>;
  onSaveNote: (segmentId: string, note: string) => Promise<void>;
}

function SegmentRow({
  segment,
  glossary,
  issues,
  isHighlighted,
  isFocusedSegment,
  registerRef,
  registerInsertHandler,
  onFocusSegment,
  isStreamingThis,
  streamingText,
  disabledQueue,
  tmMatch,
  onSaveTranslation,
  onTranslateSingle,
  onBackTranslate,
  onCompareModels,
  onToggleReviewed,
  onSaveNote,
}: SegmentRowProps) {
  const [draft, setDraft] = useState(segment.translatedText);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(segment.note);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Back-translation & A/B Compare inline states
  const [backTransLoading, setBackTransLoading] = useState(false);
  const [backTransResult, setBackTransResult] = useState<string | null>(null);
  const [abLoading, setAbLoading] = useState(false);
  const [abResult, setAbResult] = useState<{ model9b: string; model35b: string } | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const draftRef = useRef(draft);
  const onSaveRef = useRef(onSaveTranslation);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onSaveRef.current = onSaveTranslation;
  }, [onSaveTranslation]);

  useEffect(() => {
    setDraft(segment.translatedText);
  }, [segment.translatedText]);

  useEffect(() => {
    setNoteDraft(segment.note);
  }, [segment.note]);

  const syncSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    selectionRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  };

  useEffect(() => {
    const handler = (termText: string) => {
      if (isStreamingThis) return;
      const currentText = draftRef.current;
      const el = textareaRef.current;
      const sel =
        el && document.activeElement === el
          ? {
              start: el.selectionStart ?? currentText.length,
              end: el.selectionEnd ?? currentText.length,
            }
          : selectionRef.current ?? {
              start: currentText.length,
              end: currentText.length,
            };

      const start = Math.max(0, Math.min(sel.start, currentText.length));
      const end = Math.max(start, Math.min(sel.end, currentText.length));
      const before = currentText.slice(0, start);
      const after = currentText.slice(end);

      const needsLeadingSpace = before.length > 0 && !/[\s(\["'“‘«—-]$/.test(before);
      const needsTrailingSpace = after.length > 0 && !/^[\s.,!?;:)\]"'”’»—-]/.test(after);

      const inserted = `${needsLeadingSpace ? ' ' : ''}${termText}${needsTrailingSpace ? ' ' : ''}`;
      const nextVal = `${before}${inserted}${after}`;
      const nextCaret = before.length + (needsLeadingSpace ? 1 : 0) + termText.length;

      setDraft(nextVal);
      draftRef.current = nextVal;
      selectionRef.current = { start: nextCaret, end: nextCaret };

      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setSaveState('saving');
      void onSaveRef.current(segment.id, nextVal).then(() => {
        setSaveState('saved');
        window.setTimeout(() => setSaveState('idle'), 1200);
      });

      window.requestAnimationFrame(() => {
        const targetEl = textareaRef.current;
        if (targetEl) {
          targetEl.focus();
          targetEl.setSelectionRange(nextCaret, nextCaret);
        }
      });
    };

    registerInsertHandler(segment.id, handler);
    return () => {
      registerInsertHandler(segment.id, null);
    };
  }, [segment.id, isStreamingThis, registerInsertHandler]);

  const displayValue = isStreamingThis ? streamingText : draft;
  const spans = useMemo(
    () => splitTextWithGlossaryHighlights(segment.sourceText, glossary),
    [segment.sourceText, glossary]
  );

  const handleChange = (nextVal: string) => {
    setDraft(nextVal);
    setSaveState('saving');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await onSaveTranslation(segment.id, nextVal);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    }, 650);
  };

  const handleBlur = async () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (draft !== segment.translatedText) {
      setSaveState('saving');
      await onSaveTranslation(segment.id, draft);
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    }
  };

  const handleCopy = async () => {
    if (!displayValue.trim()) return;
    await navigator.clipboard.writeText(displayValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleApplyText = async (nextText: string) => {
    setDraft(nextText);
    setSaveState('saving');
    await onSaveTranslation(segment.id, nextText);
    setSaveState('saved');
    window.setTimeout(() => setSaveState('idle'), 1200);
  };

  const handleRunBackTranslation = async () => {
    const text = displayValue.trim();
    if (!text || backTransLoading) return;
    setBackTransLoading(true);
    setToolError(null);
    try {
      const res = await onBackTranslate(segment, text);
      setBackTransResult(res);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Không thể dịch ngược.');
    } finally {
      setBackTransLoading(false);
    }
  };

  const handleRunAbCompare = async () => {
    if (abLoading) return;
    setAbLoading(true);
    setToolError(null);
    try {
      const res = await onCompareModels(segment);
      setAbResult(res);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : 'Không thể so sánh 2 mô hình.');
    } finally {
      setAbLoading(false);
    }
  };

  return (
    <div
      ref={registerRef}
      onClick={() => onFocusSegment(segment.id)}
      className={`py-6 border-b border-[#E4DDD0] dark:border-[#2E2924] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start transition-colors duration-200 ${
        isHighlighted
          ? 'bg-[#B45309]/8 dark:bg-[#D97706]/10 -mx-3 px-3 rounded-lg'
          : isFocusedSegment
            ? 'bg-[#F3EFE6]/45 dark:bg-[#1C1917]/55 -mx-3 px-3 rounded-lg'
            : ''
      }`}
    >
      {/* Left: Source Text */}
      <div className="lg:col-span-5 space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-[#6B6257] dark:text-[#A89F91]">
          <span className="font-mono-tabular">
            Đoạn #{String(segment.index + 1).padStart(2, '0')}
          </span>
          <span className="font-mono-tabular">{segment.sourceText.length} ký tự</span>
        </div>

        <p className="font-literary-prose text-[#1F1C18] dark:text-[#EDE8DF] whitespace-pre-wrap select-text">
          {spans.map((span, i) =>
            span.term ? (
              <span
                key={i}
                title={`${span.term.sourceTerm} → ${span.term.targetTerm}`}
                className="underline decoration-[#B45309]/70 dark:decoration-[#D97706]/80 decoration-dotted decoration-2 underline-offset-4 cursor-help"
              >
                {span.text}
              </span>
            ) : (
              <span key={i}>{span.text}</span>
            )
          )}
        </p>

        {tmMatch && !draft.trim() && !isStreamingThis && (
          <div className="pt-1 flex items-start justify-between gap-2 text-xs text-[#6B6257] dark:text-[#A89F91] border-t border-dashed border-[#E4DDD0] dark:border-[#2E2924]">
            <p className="line-clamp-2">
              Gợi ý Bộ nhớ dịch ({Math.round(tmMatch.score * 100)}%):{' '}
              <span className="text-[#1F1C18] dark:text-[#EDE8DF]">
                {tmMatch.entry.translatedText}
              </span>
            </p>
            <button
              type="button"
              onClick={() => handleApplyText(tmMatch.entry.translatedText)}
              className="text-[#B45309] dark:text-[#D97706] font-semibold hover:underline shrink-0 cursor-pointer"
            >
              Áp dụng
            </button>
          </div>
        )}
      </div>

      {/* Right: Editable Translation */}
      <div className="lg:col-span-7 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6257] dark:text-[#A89F91]">
          <div className="flex items-center gap-3">
            <span>
              {isStreamingThis
                ? 'Đang dịch trực tiếp...'
                : saveState === 'saving'
                  ? 'Đang lưu...'
                  : saveState === 'saved'
                    ? 'Đã đồng bộ'
                    : segment.isReviewed
                      ? 'Đã duyệt'
                      : draft.trim()
                        ? 'Bản nháp'
                        : 'Chưa dịch'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={disabledQueue}
              onClick={() => onTranslateSingle(segment)}
              title="Dịch hoặc dịch lại đoạn này"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-[#B45309] dark:text-[#D97706] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isStreamingThis ? 'animate-spin' : ''}`} />
              {draft.trim() ? 'Dịch lại' : 'Dịch đoạn'}
            </button>

            <button
              type="button"
              disabled={disabledQueue || abLoading}
              onClick={handleRunAbCompare}
              title="So sánh bản dịch của Index-Translate-9B và 35B-A3B"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <GitCompare className="w-3.5 h-3.5" />
              {abLoading ? 'Đang so...' : '9B vs 35B'}
            </button>

            <button
              type="button"
              disabled={!displayValue.trim() || backTransLoading}
              onClick={handleRunBackTranslation}
              title="Dịch ngược lại ngôn ngữ gốc để kiểm tra sai nghĩa"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              {backTransLoading ? 'Đang kiểm...' : 'Dịch ngược'}
            </button>

            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              title="Ghi chú / chỉ dẫn riêng cho đoạn"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer whitespace-nowrap ${
                segment.note.trim() || noteOpen
                  ? 'text-[#1F1C18] dark:text-[#EDE8DF] bg-[#F3EFE6] dark:bg-[#1C1917]'
                  : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Ghi chú
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!displayValue.trim()}
              title="Sao chép bản dịch"
              className="p-1.5 rounded-md text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer disabled:opacity-30"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => onToggleReviewed(segment.id, !segment.isReviewed)}
              title={segment.isReviewed ? 'Bỏ đánh dấu đã duyệt' : 'Đánh dấu đã duyệt'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                segment.isReviewed
                  ? 'text-[#15803D] dark:text-[#4ADE80] bg-[#15803D]/10 dark:bg-[#4ADE80]/10'
                  : 'text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF]'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              Duyệt
            </button>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          rows={Math.max(2, Math.min(12, Math.ceil((displayValue.length || segment.sourceText.length * 1.4) / 68)))}
          value={displayValue}
          readOnly={isStreamingThis}
          onFocus={() => {
            onFocusSegment(segment.id);
            syncSelection();
          }}
          onSelect={syncSelection}
          onClick={syncSelection}
          onKeyUp={syncSelection}
          onChange={(e) => {
            handleChange(e.target.value);
            syncSelection();
          }}
          onBlur={handleBlur}
          placeholder="Bản dịch sẽ xuất hiện tại đây..."
          className={`w-full px-3.5 py-3 font-literary-prose rounded-lg border transition-colors resize-y focus:outline-none ${
            isStreamingThis
              ? 'border-[#B45309] dark:border-[#D97706] bg-[#F3EFE6]/70 dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]'
              : 'border-[#E4DDD0] dark:border-[#2E2924] bg-white/85 dark:bg-[#181512] text-[#1F1C18] dark:text-[#EDE8DF] focus:border-[#B45309] dark:focus:border-[#D97706]'
          }`}
        />

        {toolError && (
          <p className="text-xs text-[#DC2626] dark:text-[#F87171]">{toolError}</p>
        )}

        {/* Inline Back-Translation Box */}
        {backTransResult !== null && (
          <div className="p-3 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/50 dark:bg-[#1C1917]/60 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2 text-[#6B6257] dark:text-[#A89F91]">
              <span className="font-medium">Kết quả dịch ngược để kiểm nghĩa:</span>
              <button
                type="button"
                onClick={() => setBackTransResult(null)}
                className="p-0.5 hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-literary text-sm text-[#1F1C18] dark:text-[#EDE8DF] leading-relaxed">
              {backTransResult}
            </p>
          </div>
        )}

        {/* Inline A/B Model Comparison Box */}
        {abResult && (
          <div className="p-3.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/50 dark:bg-[#1C1917]/70 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                So sánh đối chiếu 9B vs 35B-A3B
              </span>
              <button
                type="button"
                onClick={() => setAbResult(null)}
                className="p-0.5 text-[#6B6257] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular font-semibold text-[#6B6257] dark:text-[#A89F91]">
                    Index-Translate-9B
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleApplyText(abResult.model9b);
                      setAbResult(null);
                    }}
                    className="text-[#B45309] dark:text-[#D97706] font-semibold hover:underline cursor-pointer"
                  >
                    Chọn bản 9B
                  </button>
                </div>
                <p className="font-literary text-sm text-[#1F1C18] dark:text-[#EDE8DF] leading-relaxed">
                  {abResult.model9b}
                </p>
              </div>

              <div className="p-3 rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-tabular font-semibold text-[#B45309] dark:text-[#D97706]">
                    Index-Translate-35B-A3B
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleApplyText(abResult.model35b);
                      setAbResult(null);
                    }}
                    className="text-[#B45309] dark:text-[#D97706] font-semibold hover:underline cursor-pointer"
                  >
                    Chọn bản 35B
                  </button>
                </div>
                <p className="font-literary text-sm text-[#1F1C18] dark:text-[#EDE8DF] leading-relaxed">
                  {abResult.model35b}
                </p>
              </div>
            </div>
          </div>
        )}

        {issues.length > 0 && !isStreamingThis && (
          <div className="space-y-1 pt-0.5">
            {issues.map((issue) => (
              <p
                key={issue.id}
                className={`text-xs ${
                  issue.severity === 'error'
                    ? 'text-[#DC2626] dark:text-[#F87171]'
                    : 'text-[#B45309] dark:text-[#D97706]'
                }`}
              >
                {issue.severity === 'error' ? 'Lỗi' : 'Lưu ý'}: {issue.title}
                {issue.missingTerms && issue.missingTerms.length > 0
                  ? ` (${issue.missingTerms.map((t) => `${t.sourceTerm}→${t.targetTerm}`).join(', ')})`
                  : ''}
              </p>
            ))}
          </div>
        )}

        {noteOpen && (
          <div className="pt-1 flex items-center gap-2">
            <input
              type="text"
              maxLength={FIELD_LIMITS.SEGMENT_NOTE_MAX}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={() => {
                if (noteDraft !== segment.note) {
                  onSaveNote(segment.id, noteDraft);
                }
              }}
              placeholder="Ghi chú biên tập hoặc chỉ dẫn riêng khi dịch lại đoạn này (VD: dùng ngôi xưng ta - ngươi)..."
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
            />
            <button
              type="button"
              onClick={() => onSaveNote(segment.id, noteDraft)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
            >
              Lưu ghi chú
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseNumberedBlockSegments(rawOutput: string, expectedCount: number): string[] {
  const results = new Array<string>(expectedCount).fill('');
  const regex = /\[\[(\d+)\]\]\s*([\s\S]*?)(?=\[\[\d+\]\]|$)/g;
  let matchedAny = false;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawOutput)) !== null) {
    matchedAny = true;
    const num = Number(match[1]);
    if (num >= 1 && num <= expectedCount) {
      results[num - 1] = match[2].trim();
    }
  }
  if (!matchedAny && expectedCount === 1) {
    results[0] = rawOutput.trim();
  }
  return results;
}

export function StudioView({
  novel,
  chapters,
  chaptersLoading,
  activeChapterId,
  onSelectChapter,
  segments,
  segmentsLoading,
  glossary,
  settings,
  sessionApiKey,
  onCreateChapter,
  onCreateMultipleChapters,
  onUpdateChapterMeta,
  onDeleteChapter,
  onUpdateSegmentTranslation,
  onBatchUpdateSegments,
  onFetchChapterSegments,
  onFetchNovelExportData,
  onUpdateSegmentReviewed,
  onUpdateSegmentNote,
  onAddGlossaryTerm,
  onGoToLibrary,
}: StudioViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [matchedSidebarOpen, setMatchedSidebarOpen] = useState(true);
  const [glossaryDrawerOpen, setGlossaryDrawerOpen] = useState(false);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [selectedBatchChapterIds, setSelectedBatchChapterIds] = useState<string[]>([]);
  const [batchChapterProgress, setBatchChapterProgress] = useState<{
    chapterIdx: number;
    chapterTotal: number;
    chapterTitle: string;
  } | null>(null);

  const [viewMode, setViewMode] = useState<StudioViewMode>('bilingual');
  const [chapterSearch, setChapterSearch] = useState('');
  const [confirmDeleteChapId, setConfirmDeleteChapId] = useState<string | null>(null);
  const [copiedChapter, setCopiedChapter] = useState(false);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [focusedSegmentId, setFocusedSegmentId] = useState<string | null>(null);
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const insertHandlersRef = useRef<Map<string, (text: string) => void>>(new Map());
  const [reviewRules, setReviewRules] = useState<ReviewRulesConfig>(DEFAULT_REVIEW_RULES);
  const [pronounRules, setPronounRules] = useState<PronounRule[]>([]);

  // Per-session language/instruction/strategy override
  const [overrideSourceLang, setOverrideSourceLang] = useState(novel?.sourceLang || 'zh');
  const [overrideTargetLang, setOverrideTargetLang] = useState(novel?.targetLang || 'vi');
  const [overrideGenre, setOverrideGenre] = useState('小说');
  const [useSlidingContext, setUseSlidingContext] = useState(true);
  const [strategy, setStrategy] = useState<ChapterTranslationStrategy>('segment');
  const [showLangConfig, setShowLangConfig] = useState(false);
  const [strategyStatusNote, setStrategyStatusNote] = useState<string | null>(null);

  // Quick add glossary inside drawer
  const [quickSrc, setQuickSrc] = useState('');
  const [quickTgt, setQuickTgt] = useState('');

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) || null,
    [chapters, activeChapterId]
  );
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (novel) {
      setOverrideSourceLang(novel.sourceLang);
      setOverrideTargetLang(novel.targetLang);
      setPronounRules(getPronounRules(novel.id));
      try {
        const stored = window.localStorage.getItem(`mac_van_review_rules_${novel.id}`);
        if (stored) {
          setReviewRules({ ...DEFAULT_REVIEW_RULES, ...JSON.parse(stored) });
        } else {
          setReviewRules(DEFAULT_REVIEW_RULES);
        }
      } catch {
        setReviewRules(DEFAULT_REVIEW_RULES);
      }
    }
  }, [novel?.id, novel?.sourceLang, novel?.targetLang]);

  const handleUpdateReviewRules = (next: ReviewRulesConfig) => {
    setReviewRules(next);
    if (novel) {
      window.localStorage.setItem(`mac_van_review_rules_${novel.id}`, JSON.stringify(next));
    }
  };

  useEffect(() => {
    setTitleDraft(activeChapter?.titleTranslated || '');
  }, [activeChapter?.id, activeChapter?.titleTranslated]);

  useEffect(() => {
    setFocusedSegmentId(null);
  }, [activeChapterId]);

  const [queue, setQueue] = useState<TranslationQueueState>({
    isRunning: false,
    activeSegmentId: null,
    streamingText: '',
    completedInRun: 0,
    totalInRun: 0,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const filteredChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(
      (c) =>
        c.titleSource.toLowerCase().includes(q) ||
        c.titleTranslated.toLowerCase().includes(q)
    );
  }, [chapters, chapterSearch]);

  const translatedCount = useMemo(
    () => segments.filter((s) => s.translatedText.trim().length > 0).length,
    [segments]
  );

  const totalSourceChars = useMemo(
    () => segments.reduce((sum, s) => sum + s.sourceText.length, 0),
    [segments]
  );

  const tmMatchesBySegment = useMemo(() => {
    const map = new Map<string, TranslationMemoryMatch | null>();
    if (!novel) return map;
    for (const seg of segments) {
      if (!seg.translatedText.trim()) {
        const matches = findMemoryMatches(seg.sourceText, novel.id, 0.62);
        map.set(seg.id, matches[0] || null);
      }
    }
    return map;
  }, [novel?.id, segments]);

  const auditReport = useMemo(() => {
    if (!novel || !activeChapter) return null;
    return auditChapterTranslation({
      novel,
      chapter: activeChapter,
      segments,
      glossary,
      sourceLang: overrideSourceLang,
      targetLang: overrideTargetLang,
      rules: reviewRules,
    });
  }, [novel, activeChapter, segments, glossary, overrideSourceLang, overrideTargetLang, reviewRules]);

  const issuesBySegment = useMemo(() => {
    const map = new Map<string, ReviewIssue[]>();
    if (!auditReport) return map;
    for (const issue of auditReport.issues) {
      if (!issue.segmentId) continue;
      const list = map.get(issue.segmentId) || [];
      list.push(issue);
      map.set(issue.segmentId, list);
    }
    return map;
  }, [auditReport]);

  const activeSegment = useMemo(() => {
    if (segments.length === 0) return null;
    if (focusedSegmentId) {
      const found = segments.find((s) => s.id === focusedSegmentId);
      if (found) return found;
    }
    if (queue.activeSegmentId) {
      const found = segments.find((s) => s.id === queue.activeSegmentId);
      if (found) return found;
    }
    if (highlightedSegmentId) {
      const found = segments.find((s) => s.id === highlightedSegmentId);
      if (found) return found;
    }
    return segments.find((s) => !s.translatedText.trim()) || segments[0];
  }, [segments, focusedSegmentId, queue.activeSegmentId, highlightedSegmentId]);

  const matchedTermsForActiveSegment = useMemo(() => {
    if (!activeSegment) return [];
    const matched = findMatchingGlossaryTerms(activeSegment.sourceText, glossary);
    return [...matched].sort((a, b) => {
      const idxA = activeSegment.sourceText.indexOf(a.sourceTerm);
      const idxB = activeSegment.sourceText.indexOf(b.sourceTerm);
      if (idxA !== idxB) return idxA - idxB;
      return b.sourceTerm.length - a.sourceTerm.length;
    });
  }, [activeSegment, glossary]);

  const registerSegmentInsertHandler = useMemo(
    () => (segmentId: string, handler: ((text: string) => void) | null) => {
      if (handler) insertHandlersRef.current.set(segmentId, handler);
      else insertHandlersRef.current.delete(segmentId);
    },
    []
  );

  const handleQuickInsertTerm = (targetTerm: string) => {
    if (!activeSegment) return;
    setFocusedSegmentId(activeSegment.id);
    const handler = insertHandlersRef.current.get(activeSegment.id);
    if (handler) {
      handler(targetTerm);
      return;
    }
    const existing = activeSegment.translatedText;
    const spacer = existing.length > 0 && !/\s$/.test(existing) ? ' ' : '';
    void onUpdateSegmentTranslation(activeSegment.id, `${existing}${spacer}${targetTerm}`);
  };

  if (!novel) {
    return (
      <main className="max-w-[1440px] mx-auto px-6 py-16 text-center">
        <BookOpen className="w-9 h-9 mx-auto text-[#B45309] dark:text-[#D97706] mb-4" />
        <h1 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mb-2">
          Chưa chọn tiểu thuyết để biên tập
        </h1>
        <p className="text-sm text-[#6B6257] dark:text-[#A89F91] mb-6">
          Hãy chọn hoặc tạo một dự án tiểu thuyết trong Thư viện trước khi mở phòng biên tập.
        </p>
        <button
          type="button"
          onClick={onGoToLibrary}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer"
        >
          Về Thư viện
        </button>
      </main>
    );
  }

  const buildCombinedInstruction = (
    sourceText: string,
    segNote = '',
    extraNote = ''
  ): string => {
    const genrePreset = TRANSLATION_GENRES.find((g) => g.id === overrideGenre);
    const matchedPronouns = findMatchingPronounRules(sourceText, pronounRules, glossary);
    const pronounText = formatPronounInstruction(matchedPronouns);
    return [
      novel.styleInstruction,
      genrePreset?.defaultInstruction || '',
      pronounText,
      segNote,
      extraNote,
    ]
      .filter((part) => part && part.trim().length > 0)
      .join(' ');
  };

  const translateSingleSegmentInternal = async (
    seg: Segment,
    allChapterSegments: Segment[],
    controller: AbortController,
    modelOverride?: string,
    extraNote = ''
  ): Promise<string> => {
    const matchingGlossary = findMatchingGlossaryTerms(seg.sourceText, glossary).map((t) => ({
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
    }));

    let previousContext = '';
    if (useSlidingContext && seg.index > 0) {
      const prevSeg = allChapterSegments.find((s) => s.index === seg.index - 1);
      if (prevSeg) {
        previousContext = prevSeg.sourceText.slice(-300);
      }
    }

    const combinedInstruction = buildCombinedInstruction(seg.sourceText, seg.note, extraNote);

    return translateStream(
      {
        text: seg.sourceText,
        sourceLang: overrideSourceLang,
        targetLang: overrideTargetLang,
        glossary: matchingGlossary,
        instruction: combinedInstruction,
        genre: overrideGenre,
        previousContext,
        model: modelOverride || settings.apiModel,
        baseUrl: settings.apiBaseUrl,
        apiKey: sessionApiKey,
      },
      {
        signal: controller.signal,
        onDelta: (acc) => {
          setQueue((prev) => ({ ...prev, streamingText: acc }));
        },
      }
    );
  };

  const handleToggleSegmentReviewed = async (segmentId: string, nextVal: boolean) => {
    await onUpdateSegmentReviewed(segmentId, nextVal);
    if (nextVal) {
      const seg = segments.find((s) => s.id === segmentId);
      if (seg && seg.translatedText.trim()) {
        upsertTranslationMemory(novel.id, [
          { sourceText: seg.sourceText, translatedText: seg.translatedText },
        ]);
      }
    }
  };

  const handleBackTranslate = async (_seg: Segment, translatedText: string): Promise<string> => {
    const res = await translateOnce({
      text: translatedText,
      sourceLang: overrideTargetLang,
      targetLang: overrideSourceLang === 'auto' ? 'zh' : overrideSourceLang,
      genre: '文本',
      instruction: 'Dịch sát nghĩa đen để người biên tập đối chiếu độ chính xác.',
      model: settings.apiModel,
      baseUrl: settings.apiBaseUrl,
      apiKey: sessionApiKey,
    });
    return res.text;
  };

  const handleCompareModels = async (
    seg: Segment
  ): Promise<{ model9b: string; model35b: string }> => {
    const matchingGlossary = findMatchingGlossaryTerms(seg.sourceText, glossary).map((t) => ({
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
    }));
    const instruction = buildCombinedInstruction(seg.sourceText, seg.note);
    const prevSeg =
      useSlidingContext && seg.index > 0
        ? segments.find((s) => s.index === seg.index - 1)
        : undefined;
    const previousContext = prevSeg ? prevSeg.sourceText.slice(-300) : '';

    const [res9b, res35b] = await Promise.all([
      translateOnce({
        text: seg.sourceText,
        sourceLang: overrideSourceLang,
        targetLang: overrideTargetLang,
        glossary: matchingGlossary,
        instruction,
        genre: overrideGenre,
        previousContext,
        model: 'Index-Translate-9B',
        baseUrl: settings.apiBaseUrl,
        apiKey: sessionApiKey,
      }),
      translateOnce({
        text: seg.sourceText,
        sourceLang: overrideSourceLang,
        targetLang: overrideTargetLang,
        glossary: matchingGlossary,
        instruction,
        genre: overrideGenre,
        previousContext,
        model: 'Index-Translate-35B-A3B',
        baseUrl: settings.apiBaseUrl,
        apiKey: sessionApiKey,
      }),
    ]);

    return { model9b: res9b.text, model35b: res35b.text };
  };

  const handleTranslateSingle = async (seg: Segment) => {
    if (queue.isRunning || !activeChapter) return;
    const controller = new AbortController();
    abortRef.current = controller;

    setQueue({
      isRunning: true,
      activeSegmentId: seg.id,
      streamingText: '',
      completedInRun: 0,
      totalInRun: 1,
      error: null,
    });
    setStrategyStatusNote(null);

    try {
      const translated = await translateSingleSegmentInternal(seg, segments, controller);
      await onUpdateSegmentTranslation(seg.id, translated);
      const nextDoneCount = seg.translatedText.trim()
        ? translatedCount
        : Math.min(segments.length, translatedCount + 1);
      await onUpdateChapterMeta(activeChapter.id, {
        translatedCount: nextDoneCount,
        status: nextDoneCount >= segments.length ? 'translated' : 'translating',
      });
      setQueue({
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
        completedInRun: 1,
        totalInRun: 1,
        error: null,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      setQueue({
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
        completedInRun: 0,
        totalInRun: 1,
        error: aborted
          ? null
          : error instanceof Error
            ? error.message
            : 'Không thể dịch đoạn văn.',
      });
    }
  };

  const ensureChapterTitleTranslated = async (
    chap: Chapter,
    controller: AbortController,
    updateLocalDraft = true
  ): Promise<string> => {
    if (chap.titleTranslated.trim() || !chap.titleSource.trim()) {
      return chap.titleTranslated;
    }
    const titleGlossary = findMatchingGlossaryTerms(chap.titleSource, glossary).map((t) => ({
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
    }));
    const translatedTitle = await translateStream(
      {
        text: chap.titleSource,
        sourceLang: overrideSourceLang,
        targetLang: overrideTargetLang,
        glossary: titleGlossary,
        instruction: 'Chỉ dịch tiêu đề chương tiểu thuyết ngắn gọn, tự nhiên.',
        genre: '小说',
        model: settings.apiModel,
        baseUrl: settings.apiBaseUrl,
        apiKey: sessionApiKey,
      },
      { signal: controller.signal, onDelta: () => {} }
    );
    if (translatedTitle) {
      const clean = translatedTitle.slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX);
      if (updateLocalDraft && chap.id === activeChapterId) {
        setTitleDraft(clean);
      }
      await onUpdateChapterMeta(chap.id, { titleTranslated: clean });
      return clean;
    }
    return chap.titleTranslated;
  };

  // Strategy 2: Whole-chapter single-pass using 35B-A3B & [[N]] segment markers
  const translateWholeChapterSinglePass = async (
    chap: Chapter,
    chapSegments: Segment[],
    onlyUntranslated: boolean,
    controller: AbortController
  ) => {
    const targets = onlyUntranslated
      ? chapSegments.filter((s) => !s.translatedText.trim())
      : chapSegments;
    if (targets.length === 0) return;

    const BATCH_MAX_SEGS = 28;
    const BATCH_MAX_CHARS = 9500;
    const chunks: Segment[][] = [];
    let currentChunk: Segment[] = [];
    let currentChars = 0;

    for (const seg of targets) {
      if (
        currentChunk.length >= BATCH_MAX_SEGS ||
        (currentChunk.length > 0 && currentChars + seg.sourceText.length > BATCH_MAX_CHARS)
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentChars = 0;
      }
      currentChunk.push(seg);
      currentChars += seg.sourceText.length;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    let doneTotal = 0;
    const updatedMap = new Map<string, string>(
      chapSegments.map((s) => [s.id, s.translatedText])
    );

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      if (controller.signal.aborted) break;
      const chunk = chunks[cIdx];
      setStrategyStatusNote(
        `Chế độ Nguyên chương (35B-A3B): Đang dịch khối ${cIdx + 1}/${chunks.length} (${chunk.length} đoạn)...`
      );
      setQueue((prev) => ({
        ...prev,
        activeSegmentId: chunk[0].id,
        streamingText: '',
      }));

      const joinedSource = chunk.map((s, idx) => `[[${idx + 1}]] ${s.sourceText}`).join('\n\n');
      const matchingGlossary = findMatchingGlossaryTerms(joinedSource, glossary).map((t) => ({
        sourceTerm: t.sourceTerm,
        targetTerm: t.targetTerm,
      }));
      const markerConstraint =
        'Bắt buộc giữ nguyên các thẻ đánh số [[1]], [[2]],... ở đầu mỗi đoạn tương ứng và dịch toàn bộ nội dung giữa chúng.';
      const instruction = buildCombinedInstruction(joinedSource, '', markerConstraint);

      const rawResult = await translateStream(
        {
          text: joinedSource,
          sourceLang: overrideSourceLang,
          targetLang: overrideTargetLang,
          glossary: matchingGlossary,
          instruction,
          genre: overrideGenre,
          model: 'Index-Translate-35B-A3B',
          baseUrl: settings.apiBaseUrl,
          apiKey: sessionApiKey,
        },
        {
          signal: controller.signal,
          onDelta: (acc) => setQueue((prev) => ({ ...prev, streamingText: acc })),
        }
      );

      const parsedBlocks = parseNumberedBlockSegments(rawResult, chunk.length);
      const batchUpdates: Array<{ segmentId: string; translatedText: string }> = [];

      for (let i = 0; i < chunk.length; i++) {
        const seg = chunk[i];
        let textVal = parsedBlocks[i];
        // Fallback per-segment if the model dropped a marker
        if (!textVal && !controller.signal.aborted) {
          textVal = await translateSingleSegmentInternal(
            seg,
            chapSegments,
            controller,
            'Index-Translate-35B-A3B'
          );
        }
        if (textVal) {
          updatedMap.set(seg.id, textVal);
          batchUpdates.push({ segmentId: seg.id, translatedText: textVal });
        }
      }

      const nextDoneCount = Array.from(updatedMap.values()).filter((t) => t.trim().length > 0).length;
      if (onBatchUpdateSegments && batchUpdates.length > 0) {
        await onBatchUpdateSegments(chap.id, batchUpdates, {
          translatedCount: nextDoneCount,
          status: nextDoneCount >= chapSegments.length ? 'translated' : 'translating',
        });
      } else {
        for (const u of batchUpdates) {
          await onUpdateSegmentTranslation(u.segmentId, u.translatedText);
        }
      }

      doneTotal += chunk.length;
      setQueue((prev) => ({ ...prev, completedInRun: doneTotal }));
    }
  };

  // Strategy 3: Two-Pass Draft (2B) -> Audit -> Polish Flagged (35B-A3B)
  const translateChapterTwoPass = async (
    chap: Chapter,
    chapSegments: Segment[],
    onlyUntranslated: boolean,
    controller: AbortController
  ) => {
    const draftTargets = onlyUntranslated
      ? chapSegments.filter((s) => !s.translatedText.trim())
      : chapSegments;

    const workingSegments = chapSegments.map((s) => ({ ...s }));
    const workingMap = new Map(workingSegments.map((s) => [s.id, s]));
    let completed = 0;

    setStrategyStatusNote('Vòng 1/2: Đang dịch nháp nhanh bằng Index-Translate-2B...');
    for (const seg of draftTargets) {
      if (controller.signal.aborted) break;
      setQueue((prev) => ({ ...prev, activeSegmentId: seg.id, streamingText: '' }));
      const drafted = await translateSingleSegmentInternal(
        seg,
        workingSegments,
        controller,
        'Index-Translate-2B'
      );
      const local = workingMap.get(seg.id);
      if (local) local.translatedText = drafted;
      await onUpdateSegmentTranslation(seg.id, drafted);
      completed++;
      const currentTranslated = workingSegments.filter((s) => s.translatedText.trim()).length;
      await onUpdateChapterMeta(chap.id, {
        translatedCount: currentTranslated,
        status: currentTranslated >= workingSegments.length ? 'translated' : 'translating',
      });
      setQueue((prev) => ({ ...prev, completedInRun: completed }));
    }

    if (controller.signal.aborted) return;

    // Audit pass
    const audit = auditChapterTranslation({
      novel,
      chapter: chap,
      segments: workingSegments,
      glossary,
      sourceLang: overrideSourceLang,
      targetLang: overrideTargetLang,
      rules: reviewRules,
    });

    const flaggedIds = audit.fixableSegmentIds;
    if (flaggedIds.length === 0) {
      setStrategyStatusNote('Vòng 2/2: Bản nháp 2B đạt chuẩn 100%, không cần tinh chỉnh lại.');
      return;
    }

    const flaggedSet = new Set(flaggedIds);
    const polishTargets = workingSegments.filter((s) => flaggedSet.has(s.id));
    setStrategyStatusNote(
      `Vòng 2/2: Đang tinh chỉnh ${polishTargets.length} đoạn lỗi/lệch thuật ngữ bằng Index-Translate-35B-A3B...`
    );
    setQueue((prev) => ({
      ...prev,
      totalInRun: draftTargets.length + polishTargets.length,
    }));

    for (const seg of polishTargets) {
      if (controller.signal.aborted) break;
      setQueue((prev) => ({ ...prev, activeSegmentId: seg.id, streamingText: '' }));
      const matchingGlossary = findMatchingGlossaryTerms(seg.sourceText, glossary);
      const strictHint =
        matchingGlossary.length > 0
          ? `Bắt buộc giữ chính xác thuật ngữ: ${matchingGlossary
              .map((g) => `${g.sourceTerm}→${g.targetTerm}`)
              .join(', ')}.`
          : '';
      const polished = await translateSingleSegmentInternal(
        seg,
        workingSegments,
        controller,
        'Index-Translate-35B-A3B',
        strictHint
      );
      await onUpdateSegmentTranslation(seg.id, polished);
      completed++;
      setQueue((prev) => ({ ...prev, completedInRun: completed }));
    }
  };

  const handleTranslateChapter = async (onlyUntranslated: boolean) => {
    if (queue.isRunning || !activeChapter || segments.length === 0) return;

    const targets = onlyUntranslated
      ? segments.filter((s) => !s.translatedText.trim())
      : segments;
    if (targets.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setQueue({
      isRunning: true,
      activeSegmentId: targets[0].id,
      streamingText: '',
      completedInRun: 0,
      totalInRun: targets.length,
      error: null,
    });
    setStrategyStatusNote(null);

    let runningTranslatedCount = translatedCount;

    try {
      await onUpdateChapterMeta(activeChapter.id, {
        status: 'translating',
        translatedCount: runningTranslatedCount,
      });

      const nextTitleTranslated = await ensureChapterTitleTranslated(activeChapter, controller);

      if (strategy === 'whole_35b') {
        await translateWholeChapterSinglePass(activeChapter, segments, onlyUntranslated, controller);
      } else if (strategy === 'two_pass') {
        await translateChapterTwoPass(activeChapter, segments, onlyUntranslated, controller);
      } else {
        for (let i = 0; i < targets.length; i++) {
          if (controller.signal.aborted) break;
          const seg = targets[i];

          setQueue((prev) => ({
            ...prev,
            activeSegmentId: seg.id,
            streamingText: '',
          }));

          const translated = await translateSingleSegmentInternal(seg, segments, controller);
          await onUpdateSegmentTranslation(seg.id, translated);

          if (!seg.translatedText.trim() && translated.trim()) {
            runningTranslatedCount = Math.min(segments.length, runningTranslatedCount + 1);
          }

          await onUpdateChapterMeta(activeChapter.id, {
            titleTranslated: nextTitleTranslated,
            translatedCount: runningTranslatedCount,
            status: runningTranslatedCount >= segments.length ? 'translated' : 'translating',
          });

          setQueue((prev) => ({
            ...prev,
            completedInRun: i + 1,
          }));
        }
      }

      setQueue((prev) => ({
        ...prev,
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
      }));
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      await onUpdateChapterMeta(activeChapter.id, {
        status: runningTranslatedCount >= segments.length ? 'translated' : 'draft',
        translatedCount: runningTranslatedCount,
      }).catch(() => {});

      setQueue((prev) => ({
        ...prev,
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
        error: aborted
          ? null
          : error instanceof Error
            ? error.message
            : 'Quá trình dịch chương bị gián đoạn.',
      }));
    }
  };

  // Batch Multi-Chapter Queue Runner
  const handleRunBatchChapters = async () => {
    if (queue.isRunning || !onFetchChapterSegments || selectedBatchChapterIds.length === 0) return;

    const targetChapters = chapters.filter((c) => selectedBatchChapterIds.includes(c.id));
    if (targetChapters.length === 0) return;

    setBatchModalOpen(false);
    const controller = new AbortController();
    abortRef.current = controller;

    setQueue({
      isRunning: true,
      activeSegmentId: null,
      streamingText: '',
      completedInRun: 0,
      totalInRun: targetChapters.length,
      error: null,
    });

    try {
      for (let cIdx = 0; cIdx < targetChapters.length; cIdx++) {
        if (controller.signal.aborted) break;
        const chap = targetChapters[cIdx];
        onSelectChapter(chap.id);
        setBatchChapterProgress({
          chapterIdx: cIdx + 1,
          chapterTotal: targetChapters.length,
          chapterTitle: chap.titleTranslated || chap.titleSource,
        });

        const chapSegs = await onFetchChapterSegments(chap.id);
        await ensureChapterTitleTranslated(chap, controller, false);

        if (strategy === 'whole_35b') {
          await translateWholeChapterSinglePass(chap, chapSegs, true, controller);
        } else {
          const untranslated = chapSegs.filter((s) => !s.translatedText.trim());
          let doneCount = chapSegs.length - untranslated.length;
          for (const seg of untranslated) {
            if (controller.signal.aborted) break;
            setQueue((prev) => ({ ...prev, activeSegmentId: seg.id, streamingText: '' }));
            const translated = await translateSingleSegmentInternal(seg, chapSegs, controller);
            if (onBatchUpdateSegments) {
              await onBatchUpdateSegments(chap.id, [{ segmentId: seg.id, translatedText: translated }]);
            }
            if (translated.trim()) doneCount = Math.min(chapSegs.length, doneCount + 1);
            await onUpdateChapterMeta(chap.id, {
              translatedCount: doneCount,
              status: doneCount >= chapSegs.length ? 'translated' : 'translating',
            });
          }
        }
      }
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (!aborted) {
        setQueue((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Lỗi khi dịch hàng loạt chương.',
        }));
      }
    } finally {
      setBatchChapterProgress(null);
      setStrategyStatusNote(null);
      setQueue((prev) => ({
        ...prev,
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
      }));
    }
  };

  const handleStopQueue = () => {
    abortRef.current?.abort();
  };

  const handleFixSpecificSegments = async (segmentIds: string[]) => {
    if (queue.isRunning || !activeChapter || segmentIds.length === 0) return;
    const idSet = new Set(segmentIds);
    const targets = segments.filter((s) => idSet.has(s.id));
    if (targets.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setQueue({
      isRunning: true,
      activeSegmentId: targets[0].id,
      streamingText: '',
      completedInRun: 0,
      totalInRun: targets.length,
      error: null,
    });

    let runningTranslatedCount = translatedCount;

    try {
      for (let i = 0; i < targets.length; i++) {
        if (controller.signal.aborted) break;
        const seg = targets[i];
        setQueue((prev) => ({
          ...prev,
          activeSegmentId: seg.id,
          streamingText: '',
        }));

        const matchingGlossary = findMatchingGlossaryTerms(seg.sourceText, glossary).map((t) => ({
          sourceTerm: t.sourceTerm,
          targetTerm: t.targetTerm,
        }));
        const strictGlossaryNote =
          matchingGlossary.length > 0
            ? `Bắt buộc giữ nguyên chính xác các thuật ngữ: ${matchingGlossary
                .map((g) => `${g.sourceTerm}→${g.targetTerm}`)
                .join(', ')}. Dịch toàn bộ sang ${getLanguageLabel(overrideTargetLang)}, không để sót chữ gốc.`
            : `Dịch toàn bộ sang ${getLanguageLabel(overrideTargetLang)}, không để sót chữ gốc.`;

        const combinedInstruction = buildCombinedInstruction(
          seg.sourceText,
          seg.note,
          strictGlossaryNote
        );

        const translated = await translateStream(
          {
            text: seg.sourceText,
            sourceLang: overrideSourceLang,
            targetLang: overrideTargetLang,
            glossary: matchingGlossary,
            instruction: combinedInstruction,
            genre: '小说',
            model: settings.apiModel,
            baseUrl: settings.apiBaseUrl,
            apiKey: sessionApiKey,
          },
          {
            signal: controller.signal,
            onDelta: (acc) => setQueue((prev) => ({ ...prev, streamingText: acc })),
          }
        );

        await onUpdateSegmentTranslation(seg.id, translated);
        if (!seg.translatedText.trim() && translated.trim()) {
          runningTranslatedCount = Math.min(segments.length, runningTranslatedCount + 1);
        }
        setQueue((prev) => ({ ...prev, completedInRun: i + 1 }));
      }

      await onUpdateChapterMeta(activeChapter.id, {
        translatedCount: runningTranslatedCount,
        status: runningTranslatedCount >= segments.length ? 'translated' : 'translating',
      });

      setQueue((prev) => ({
        ...prev,
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
      }));
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      setQueue((prev) => ({
        ...prev,
        isRunning: false,
        activeSegmentId: null,
        streamingText: '',
        error: aborted
          ? null
          : error instanceof Error
            ? error.message
            : 'Không thể dịch lại các đoạn lỗi.',
      }));
    }
  };

  const handleMarkAllReviewed = async () => {
    const unreviewed = segments.filter((s) => !s.isReviewed && s.translatedText.trim());
    for (const seg of unreviewed) {
      await onUpdateSegmentReviewed(seg.id, true);
    }
    const reviewedPairs = segments
      .filter((s) => s.translatedText.trim())
      .map((s) => ({ sourceText: s.sourceText, translatedText: s.translatedText }));
    upsertTranslationMemory(novel.id, reviewedPairs);
  };

  const handleFinalizeChapter = async () => {
    if (!activeChapter) return;
    await handleMarkAllReviewed();
    await onUpdateChapterMeta(activeChapter.id, {
      status: 'reviewed',
      translatedCount,
    });
    setReviewPanelOpen(false);
  };

  const handleJumpToSegment = (segmentId: string) => {
    setViewMode('bilingual');
    setFocusedSegmentId(segmentId);
    setHighlightedSegmentId(segmentId);
    window.setTimeout(() => {
      const el = segmentRefs.current.get(segmentId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    window.setTimeout(() => {
      setHighlightedSegmentId((curr) => (curr === segmentId ? null : curr));
    }, 2800);
  };

  const handleExportChapter = async (format: 'txt' | 'md' | 'epub', bilingual = false) => {
    if (!activeChapter) return;
    setExportMenuOpen(false);
    if (format === 'epub') {
      await exportChapterToEpub(novel, activeChapter, segments, bilingual);
      return;
    }
    const content = formatChapterExport(activeChapter, segments, format, bilingual);
    const baseName = (activeChapter.titleTranslated || activeChapter.titleSource || 'chuong')
      .replace(/[^\p{L}\p{N}_-]+/gu, '_')
      .slice(0, 60);
    const suffix = bilingual ? '_song_ngu' : '';
    triggerFileDownload(`${baseName}${suffix}.${format}`, content);
  };

  const handleExportWholeBook = async (format: 'epub' | 'md' | 'txt', bilingual = false) => {
    if (!onFetchNovelExportData) return;
    setExportMenuOpen(false);
    const allChapters = await onFetchNovelExportData();
    if (allChapters.length === 0) return;
    if (format === 'epub') {
      await exportNovelToEpub(novel, allChapters, bilingual);
      return;
    }
    const content = formatWholeNovelExport(novel, allChapters, format, bilingual);
    const baseName = novel.title.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'truyen';
    const suffix = bilingual ? '_song_ngu' : '';
    triggerFileDownload(`${baseName}${suffix}.${format}`, content);
  };

  const handleCopyFullChapter = async () => {
    if (!activeChapter) return;
    const content = formatChapterExport(activeChapter, segments, 'txt');
    await navigator.clipboard.writeText(content);
    setCopiedChapter(true);
    window.setTimeout(() => setCopiedChapter(false), 1500);
  };

  const handleQuickAddGlossary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSrc.trim() || !quickTgt.trim()) return;
    await onAddGlossaryTerm({
      sourceTerm: quickSrc.trim(),
      targetTerm: quickTgt.trim(),
      category: 'character',
    });
    setQuickSrc('');
    setQuickTgt('');
  };

  const untranslatedCount = Math.max(0, segments.length - translatedCount);

  return (
    <div className="w-full flex min-h-[calc(100vh-3.5rem)]">
      {/* Left Sidebar: Chapters */}
      {sidebarOpen && (
        <aside className="w-60 xl:w-64 shrink-0 border-r border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/45 dark:bg-[#181512] flex flex-col">
          <div className="p-4 border-b border-[#E4DDD0] dark:border-[#2E2924] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-[#1F1C18] dark:text-[#EDE8DF] truncate">
                  {novel.title}
                </h2>
                <p className="text-xs text-[#6B6257] dark:text-[#A89F91] mt-0.5">
                  {getLanguageLabel(overrideSourceLang)} → {getLanguageLabel(overrideTargetLang)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                title="Nhập chương mới hoặc tách nhiều chương"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Nhập
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6B6257] dark:text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                placeholder="Tìm chương..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
              />
            </div>

            {chapters.length > 1 && onFetchChapterSegments && (
              <button
                type="button"
                disabled={queue.isRunning}
                onClick={() => {
                  const incompleteIds = chapters
                    .filter((c) => c.translatedCount < c.segmentCount)
                    .map((c) => c.id);
                  setSelectedBatchChapterIds(
                    incompleteIds.length > 0 ? incompleteIds : chapters.map((c) => c.id)
                  );
                  setBatchModalOpen(true);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-white dark:hover:bg-[#1C1917] transition-colors cursor-pointer disabled:opacity-40"
              >
                <Layers className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
                Dịch hàng loạt nhiều chương
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#E4DDD0]/70 dark:divide-[#2E2924]/70">
            {chaptersLoading ? (
              <div className="p-4 text-xs text-[#6B6257] dark:text-[#A89F91]">
                Đang tải mục lục...
              </div>
            ) : filteredChapters.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6B6257] dark:text-[#A89F91]">
                {chapters.length === 0
                  ? 'Chưa có chương nào. Nhấn "Nhập" để tải tệp TXT/MD hoặc tách bộ truyện.'
                  : 'Không tìm thấy chương khớp từ khóa.'}
              </div>
            ) : (
              filteredChapters.map((chap) => {
                const isActive = chap.id === activeChapterId;
                return (
                  <div
                    key={chap.id}
                    className={`group px-4 py-3 transition-colors ${
                      isActive
                        ? 'bg-[#FAF7F2] dark:bg-[#221E1A]'
                        : 'hover:bg-[#FAF7F2]/60 dark:hover:bg-[#1C1917]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectChapter(chap.id)}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <p
                          className={`text-sm font-medium truncate ${
                            isActive
                              ? 'text-[#B45309] dark:text-[#D97706]'
                              : 'text-[#1F1C18] dark:text-[#EDE8DF]'
                          }`}
                        >
                          {chap.titleTranslated || chap.titleSource}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-[#6B6257] dark:text-[#A89F91]">
                          <span className="font-mono-tabular">
                            {chap.translatedCount}/{chap.segmentCount} đoạn
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {chap.status === 'reviewed'
                              ? 'Đã duyệt'
                              : chap.status === 'translated'
                                ? 'Đã dịch'
                                : chap.status === 'translating'
                                  ? 'Đang dịch'
                                  : 'Bản nháp'}
                          </span>
                        </div>
                      </button>

                      {confirmDeleteChapId === chap.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteChapter(chap.id);
                              setConfirmDeleteChapId(null);
                            }}
                            className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#DC2626] text-white cursor-pointer"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteChapId(null)}
                            className="px-1.5 py-0.5 text-[11px] text-[#6B6257] cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteChapId(chap.id)}
                          title="Xóa chương"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#6B6257] hover:text-[#DC2626] transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Workspace Toolbar */}
        <div className="px-6 py-4 border-b border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#141210] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                title={sidebarOpen ? 'Thu gọn mục lục' : 'Mở mục lục chương'}
                className="p-2 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer shrink-0"
              >
                <PanelLeft className="w-4 h-4" />
              </button>

              {activeChapter ? (
                <div className="min-w-0">
                  <input
                    type="text"
                    value={titleDraft}
                    maxLength={FIELD_LIMITS.CHAPTER_TITLE_MAX}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={() => {
                      if (titleDraft !== activeChapter.titleTranslated) {
                        onUpdateChapterMeta(activeChapter.id, { titleTranslated: titleDraft });
                      }
                    }}
                    placeholder={activeChapter.titleSource}
                    className="font-display text-lg sm:text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] bg-transparent border-b border-transparent hover:border-[#E4DDD0] focus:border-[#B45309] focus:outline-none w-full max-w-md truncate"
                  />
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#6B6257] dark:text-[#A89F91] mt-0.5">
                    <span className="truncate max-w-[260px]">{activeChapter.titleSource}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {translatedCount}/{segments.length} đoạn
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {totalSourceChars.toLocaleString('vi-VN')} ký tự gốc
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                    {novel.title}
                  </h1>
                  <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                    Chọn hoặc nhập chương để bắt đầu dịch
                  </p>
                </div>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F3EFE6] dark:bg-[#1C1917] border border-[#E4DDD0] dark:border-[#2E2924]">
                <button
                  type="button"
                  onClick={() => setViewMode('bilingual')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === 'bilingual'
                      ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                      : 'text-[#6B6257] dark:text-[#A89F91]'
                  }`}
                >
                  Song ngữ
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('reader')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === 'reader'
                      ? 'bg-white dark:bg-[#2A2520] text-[#1F1C18] dark:text-[#EDE8DF]'
                      : 'text-[#6B6257] dark:text-[#A89F91]'
                  }`}
                >
                  Đọc liền mạch
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowLangConfig((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
              >
                <Languages className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
                {overrideSourceLang.toUpperCase()} → {overrideTargetLang.toUpperCase()}
              </button>

              {activeChapter && viewMode === 'bilingual' && (
                <button
                  type="button"
                  onClick={() => {
                    setGlossaryDrawerOpen(false);
                    setMatchedSidebarOpen((v) => !v);
                  }}
                  title="Hiện/ẩn sidebar thuật ngữ khớp với đoạn đang dịch"
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    matchedSidebarOpen && !glossaryDrawerOpen
                      ? 'border-[#B45309]/60 dark:border-[#D97706]/60 bg-[#F3EFE6] dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]'
                      : 'border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917]'
                  }`}
                >
                  <PanelRight className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
                  Khớp đoạn ({matchedTermsForActiveSegment.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setGlossaryDrawerOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
              >
                <BookA className="w-3.5 h-3.5 text-[#B45309] dark:text-[#D97706]" />
                Thuật ngữ ({glossary.filter((g) => g.enabled).length})
              </button>

              {activeChapter && segments.length > 0 && (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917] cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Xuất tệp
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {exportMenuOpen && (
                      <div className="absolute right-0 mt-1.5 z-30 w-56 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#1C1917] shadow-lg py-1.5 text-xs">
                        <p className="px-3 py-1 text-[11px] font-medium text-[#6B6257] dark:text-[#A89F91]">
                          Xuất chương hiện tại
                        </p>
                        <button
                          type="button"
                          onClick={() => handleExportChapter('txt', false)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                        >
                          TXT (Chỉ bản dịch)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportChapter('md', false)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                        >
                          Markdown (.md)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportChapter('md', true)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                        >
                          Markdown Song ngữ (.md)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportChapter('epub', false)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                        >
                          EPUB Chương này (.epub)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExportChapter('epub', true)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                        >
                          EPUB Chương Song ngữ (.epub)
                        </button>

                        {onFetchNovelExportData && chapters.length > 0 && (
                          <>
                            <div className="my-1 border-t border-[#E4DDD0] dark:border-[#2E2924]" />
                            <p className="px-3 py-1 text-[11px] font-medium text-[#6B6257] dark:text-[#A89F91]">
                              Xuất cả bộ ({chapters.length} chương)
                            </p>
                            <button
                              type="button"
                              onClick={() => handleExportWholeBook('epub', false)}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer font-medium text-[#B45309] dark:text-[#D97706]"
                            >
                              EPUB Toàn bộ truyện
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportWholeBook('epub', true)}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                            >
                              EPUB Toàn bộ Song ngữ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExportWholeBook('md', true)}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#EAE3D5] dark:hover:bg-[#2A2520] cursor-pointer"
                            >
                              Markdown Toàn bộ Song ngữ
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyFullChapter}
                    title="Sao chép toàn bộ chương đã dịch"
                    className="p-2 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] dark:text-[#A89F91] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
                  >
                    {copiedChapter ? (
                      <Check className="w-4 h-4 text-[#15803D]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewPanelOpen(true)}
                    title="Kiểm duyệt thuật ngữ và quy định trước khi hoàn thành"
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      activeChapter.status === 'reviewed'
                        ? 'border-[#15803D]/50 text-[#15803D] dark:text-[#4ADE80] bg-[#15803D]/10'
                        : auditReport && auditReport.errorCount > 0
                          ? 'border-[#DC2626]/50 text-[#DC2626] dark:text-[#F87171] hover:bg-[#DC2626]/10'
                          : 'border-[#E4DDD0] dark:border-[#2E2924] text-[#1F1C18] dark:text-[#EDE8DF] hover:bg-[#F3EFE6] dark:hover:bg-[#1C1917]'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {activeChapter.status === 'reviewed'
                      ? 'Đã kiểm duyệt'
                      : auditReport && auditReport.issues.length > 0
                        ? `Kiểm duyệt (${auditReport.issues.length})`
                        : 'Kiểm duyệt'}
                  </button>

                  {queue.isRunning ? (
                    <button
                      type="button"
                      onClick={handleStopQueue}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      {batchChapterProgress
                        ? `Dừng (Ch.${batchChapterProgress.chapterIdx}/${batchChapterProgress.chapterTotal})`
                        : `Tạm dừng (${queue.completedInRun}/${queue.totalInRun})`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        handleTranslateChapter(
                          untranslatedCount > 0 && untranslatedCount < segments.length
                        )
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {untranslatedCount > 0 && untranslatedCount < segments.length
                        ? `Dịch tiếp (${untranslatedCount} đoạn)`
                        : untranslatedCount === 0
                          ? 'Dịch lại toàn chương'
                          : 'Dịch toàn chương'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Language, Strategy & Genre override bar */}
          {showLangConfig && (
            <div className="pt-3 border-t border-[#E4DDD0] dark:border-[#2E2924] flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[#6B6257] dark:text-[#A89F91]">Nguồn:</span>
                <select
                  value={overrideSourceLang}
                  onChange={(e) => setOverrideSourceLang(e.target.value)}
                  className="px-2.5 py-1 rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]"
                >
                  {SOURCE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6257] dark:text-[#A89F91]">Đích:</span>
                <select
                  value={overrideTargetLang}
                  onChange={(e) => setOverrideTargetLang(e.target.value)}
                  className="px-2.5 py-1 rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6257] dark:text-[#A89F91]">Thể loại:</span>
                <select
                  value={overrideGenre}
                  onChange={(e) => setOverrideGenre(e.target.value)}
                  className="px-2.5 py-1 rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]"
                >
                  {TRANSLATION_GENRES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#6B6257] dark:text-[#A89F91]">Chiến lược dịch:</span>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as ChapterTranslationStrategy)}
                  className="px-2.5 py-1 rounded-md border border-[#B45309]/50 dark:border-[#D97706]/50 bg-white dark:bg-[#1C1917] text-[#1F1C18] dark:text-[#EDE8DF]"
                >
                  <option value="segment">Từng đoạn (Streaming · {settings.apiModel})</option>
                  <option value="whole_35b">Nguyên chương 1 lượt (35B-A3B)</option>
                  <option value="two_pass">Dịch 2 vòng (Nháp 2B → Tinh chỉnh 35B)</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[#1F1C18] dark:text-[#EDE8DF]">
                <input
                  type="checkbox"
                  checked={useSlidingContext}
                  onChange={(e) => setUseSlidingContext(e.target.checked)}
                  className="accent-[#B45309]"
                />
                <span>Giữ ngữ cảnh đoạn trước</span>
              </label>
            </div>
          )}

          {/* Strategy / Batch Status */}
          {(strategyStatusNote || batchChapterProgress) && (
            <div className="flex items-center gap-2 text-xs text-[#B45309] dark:text-[#D97706]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                {batchChapterProgress
                  ? `Hàng đợi chương (${batchChapterProgress.chapterIdx}/${batchChapterProgress.chapterTotal}): ${batchChapterProgress.chapterTitle}. `
                  : ''}
                {strategyStatusNote || ''}
              </span>
            </div>
          )}

          {/* Translation progress bar */}
          {activeChapter && segments.length > 0 && (
            <div className="h-1 w-full bg-[#E4DDD0] dark:bg-[#2E2924] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#B45309] dark:bg-[#D97706] transition-all duration-300"
                style={{
                  width: `${Math.round((translatedCount / segments.length) * 100)}%`,
                }}
              />
            </div>
          )}

          {queue.error && (
            <div className="p-3 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 text-xs text-[#DC2626] dark:text-[#F87171] flex items-center justify-between gap-3">
              <span>{queue.error}</span>
              <button
                type="button"
                onClick={() => setQueue((prev) => ({ ...prev, error: null }))}
                className="p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Workspace Body + Optional Quick Glossary Drawer */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 min-w-0 px-6 py-4 overflow-y-auto">
            {!activeChapter ? (
              <div className="max-w-lg mx-auto py-20 text-center">
                <FilePlus2 className="w-9 h-9 mx-auto text-[#B45309] dark:text-[#D97706] mb-3" />
                <h2 className="font-display text-2xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] mb-2">
                  Nhập chương đầu tiên cho “{novel.title}”
                </h2>
                <p className="text-sm text-[#6B6257] dark:text-[#A89F91] mb-6">
                  Tải lên tệp .txt / .md (1 chương hoặc nguyên bộ nhiều chương) để tự động tách đoạn
                  và dịch bằng Index-Translate.
                </p>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Nhập chương mới
                </button>
              </div>
            ) : segmentsLoading ? (
              <div className="py-12 space-y-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-lg bg-[#F3EFE6]/60 dark:bg-[#1C1917]/60 animate-pulse"
                  />
                ))}
              </div>
            ) : viewMode === 'reader' ? (
              <article className="max-w-[68ch] mx-auto py-8">
                <h2 className="font-display text-3xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF] text-balance mb-8">
                  {activeChapter.titleTranslated || activeChapter.titleSource}
                </h2>
                <div className="space-y-6 font-literary-reader text-[#1F1C18] dark:text-[#EDE8DF]">
                  {segments.map((seg) => {
                    const isStreamingThis =
                      queue.isRunning && queue.activeSegmentId === seg.id;
                    const text = isStreamingThis ? queue.streamingText : seg.translatedText;
                    return (
                      <p key={seg.id}>
                        {text.trim() ? (
                          text
                        ) : (
                          <span className="text-[#6B6257] dark:text-[#A89F91] italic text-base">
                            [Đoạn #{seg.index + 1} chưa được dịch: {seg.sourceText}]
                          </span>
                        )}
                      </p>
                    );
                  })}
                </div>
              </article>
            ) : (
              <div>
                {/* Compact matched glossary strip for mobile/tablet (< lg) */}
                {matchedSidebarOpen && !glossaryDrawerOpen && activeSegment && (
                  <div className="lg:hidden mb-4 p-3 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/55 dark:bg-[#181512]">
                    <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                      <span className="font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                        Thuật ngữ khớp · Đoạn #{String(activeSegment.index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[#6B6257] dark:text-[#A89F91]">
                        Chạm để chèn nhanh
                      </span>
                    </div>
                    {matchedTermsForActiveSegment.length === 0 ? (
                      <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                        Không có thuật ngữ nào khớp trong đoạn này.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {matchedTermsForActiveSegment.map((term) => (
                          <button
                            key={term.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleQuickInsertTerm(term.targetTerm)}
                            disabled={queue.isRunning && queue.activeSegmentId === activeSegment.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] hover:border-[#B45309] dark:hover:border-[#D97706] cursor-pointer disabled:opacity-50"
                          >
                            <span className="text-[#6B6257] dark:text-[#A89F91]">{term.sourceTerm}</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-medium text-[#B45309] dark:text-[#D97706]">
                              {term.targetTerm}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="hidden lg:grid grid-cols-12 gap-6 pb-3 border-b border-[#E4DDD0] dark:border-[#2E2924] text-xs font-medium text-[#6B6257] dark:text-[#A89F91]">
                  <div className="col-span-5">Nguyên tác ({getLanguageLabel(overrideSourceLang)})</div>
                  <div className="col-span-7">Bản dịch biên tập ({getLanguageLabel(overrideTargetLang)})</div>
                </div>

                {segments.map((seg) => (
                  <SegmentRow
                    key={seg.id}
                    novelId={novel.id}
                    segment={seg}
                    glossary={glossary}
                    issues={issuesBySegment.get(seg.id) || []}
                    isHighlighted={highlightedSegmentId === seg.id}
                    isFocusedSegment={activeSegment?.id === seg.id}
                    registerRef={(el) => {
                      if (el) segmentRefs.current.set(seg.id, el);
                      else segmentRefs.current.delete(seg.id);
                    }}
                    registerInsertHandler={registerSegmentInsertHandler}
                    onFocusSegment={setFocusedSegmentId}
                    isStreamingThis={queue.isRunning && queue.activeSegmentId === seg.id}
                    streamingText={queue.streamingText}
                    disabledQueue={queue.isRunning}
                    tmMatch={tmMatchesBySegment.get(seg.id) || null}
                    onSaveTranslation={onUpdateSegmentTranslation}
                    onTranslateSingle={handleTranslateSingle}
                    onBackTranslate={handleBackTranslate}
                    onCompareModels={handleCompareModels}
                    onToggleReviewed={handleToggleSegmentReviewed}
                    onSaveNote={onUpdateSegmentNote}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Compact Right Sidebar: Matched Glossary Terms for Active Segment */}
          {activeChapter && viewMode === 'bilingual' && matchedSidebarOpen && !glossaryDrawerOpen && (
            <aside className="hidden lg:flex w-60 xl:w-64 shrink-0 border-l border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/35 dark:bg-[#181512] flex-col">
              <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] flex flex-col p-4">
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#E4DDD0] dark:border-[#2E2924]">
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                      Thuật ngữ trong đoạn
                    </h3>
                    <p className="text-[11px] text-[#6B6257] dark:text-[#A89F91] mt-0.5 truncate">
                      {activeSegment
                        ? `Đoạn #${String(activeSegment.index + 1).padStart(2, '0')} · ${matchedTermsForActiveSegment.length} khớp`
                        : 'Chưa có đoạn văn'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMatchedSidebarOpen(false)}
                    title="Thu gọn sidebar thuật ngữ khớp"
                    className="p-1 text-[#6B6257] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {activeSegment && (
                  <p className="mt-2.5 pb-2.5 border-b border-[#E4DDD0]/70 dark:border-[#2E2924]/70 font-literary text-xs text-[#6B6257] dark:text-[#A89F91] line-clamp-2 leading-relaxed">
                    “{activeSegment.sourceText}”
                  </p>
                )}

                <div className="mt-2.5 flex-1 overflow-y-auto space-y-2 pr-0.5">
                  {!activeSegment ? (
                    <p className="text-xs text-[#6B6257] dark:text-[#A89F91] py-6 text-center">
                      Chọn một đoạn văn để xem thuật ngữ khớp.
                    </p>
                  ) : glossary.length === 0 ? (
                    <div className="py-6 text-center space-y-2.5">
                      <p className="text-xs text-[#6B6257] dark:text-[#A89F91]">
                        Truyện chưa có từ điển thuật ngữ.
                      </p>
                      <button
                        type="button"
                        onClick={() => setGlossaryDrawerOpen(true)}
                        className="text-xs font-medium text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer"
                      >
                        + Thêm thuật ngữ nhanh
                      </button>
                    </div>
                  ) : matchedTermsForActiveSegment.length === 0 ? (
                    <div className="py-6 text-center space-y-2">
                      <p className="text-xs text-[#6B6257] dark:text-[#A89F91] leading-relaxed">
                        Không có từ khóa từ điển nào xuất hiện trong đoạn #
                        {String(activeSegment.index + 1).padStart(2, '0')}.
                      </p>
                      <button
                        type="button"
                        onClick={() => setGlossaryDrawerOpen(true)}
                        className="text-xs font-medium text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer"
                      >
                        Mở toàn bộ từ điển ({glossary.filter((g) => g.enabled).length})
                      </button>
                    </div>
                  ) : (
                    matchedTermsForActiveSegment.map((term) => {
                      const alreadyInTranslation = activeSegment.translatedText
                        .toLowerCase()
                        .includes(term.targetTerm.toLowerCase());
                      const isStreamingActive =
                        queue.isRunning && queue.activeSegmentId === activeSegment.id;

                      return (
                        <button
                          key={term.id}
                          type="button"
                          disabled={isStreamingActive}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleQuickInsertTerm(term.targetTerm)}
                          title={`Click để chèn “${term.targetTerm}” vào đoạn #${activeSegment.index + 1}`}
                          className="group w-full text-left p-2.5 rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white/80 dark:bg-[#141210] hover:border-[#B45309] dark:hover:border-[#D97706] transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-literary text-xs text-[#6B6257] dark:text-[#A89F91] break-words">
                              {term.sourceTerm}
                            </span>
                            <span className="text-[11px] text-[#6B6257] dark:text-[#A89F91] shrink-0">
                              {GLOSSARY_CATEGORY_SHORT[term.category]}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="font-literary text-sm font-semibold text-[#B45309] dark:text-[#D97706] break-words">
                              {term.targetTerm}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium shrink-0 text-[#6B6257] dark:text-[#A89F91] group-hover:text-[#B45309] dark:group-hover:text-[#D97706]">
                              {alreadyInTranslation ? (
                                <>
                                  <Check className="w-3 h-3 text-[#15803D] dark:text-[#4ADE80]" />
                                  <span className="text-[#15803D] dark:text-[#4ADE80]">Đã có</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3" />
                                  <span>Chèn</span>
                                </>
                              )}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 mt-3 border-t border-[#E4DDD0] dark:border-[#2E2924] flex items-center justify-between text-[11px] text-[#6B6257] dark:text-[#A89F91]">
                  <span>Click thuật ngữ để chèn</span>
                  <button
                    type="button"
                    onClick={() => setGlossaryDrawerOpen(true)}
                    className="font-medium text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer"
                  >
                    Thêm nhanh
                  </button>
                </div>
              </div>
            </aside>
          )}

          {/* Quick Glossary Side Drawer */}
          {glossaryDrawerOpen && (
            <aside className="w-80 shrink-0 border-l border-[#E4DDD0] dark:border-[#2E2924] bg-[#F3EFE6]/45 dark:bg-[#181512] p-4 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[#E4DDD0] dark:border-[#2E2924]">
                <h3 className="font-display text-base font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                  Thuật ngữ nhanh
                </h3>
                <button
                  type="button"
                  onClick={() => setGlossaryDrawerOpen(false)}
                  className="p-1 text-[#6B6257] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleQuickAddGlossary} className="mt-3 space-y-2 pb-4 border-b border-[#E4DDD0] dark:border-[#2E2924]">
                <input
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.GLOSSARY_TERM_MAX}
                  value={quickSrc}
                  onChange={(e) => setQuickSrc(e.target.value)}
                  placeholder="Từ gốc (VD: 青霜剑)"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
                <input
                  type="text"
                  required
                  maxLength={FIELD_LIMITS.GLOSSARY_TERM_MAX}
                  value={quickTgt}
                  onChange={(e) => setQuickTgt(e.target.value)}
                  placeholder="Nghĩa dịch (VD: Thanh Sương Kiếm)"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] bg-white dark:bg-[#141210] text-[#1F1C18] dark:text-[#EDE8DF] focus:outline-none focus:border-[#B45309]"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer"
                >
                  Thêm thuật ngữ
                </button>
              </form>

              <div className="mt-3 flex-1 overflow-y-auto divide-y divide-[#E4DDD0]/70 dark:divide-[#2E2924]/70">
                {glossary.length === 0 ? (
                  <p className="text-xs text-[#6B6257] dark:text-[#A89F91] py-4 text-center">
                    Chưa có thuật ngữ nào cho truyện này.
                  </p>
                ) : (
                  glossary.map((term) => (
                    <div key={term.id} className="py-2.5 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-literary font-medium text-[#1F1C18] dark:text-[#EDE8DF] truncate">
                        {term.sourceTerm}
                      </span>
                      <span className="font-literary text-[#B45309] dark:text-[#D97706] truncate text-right">
                        {term.targetTerm}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {importModalOpen && (
        <ImportChapterModal
          nextOrder={chapters.length + 1}
          onClose={() => setImportModalOpen(false)}
          onImport={async (input) => {
            await onCreateChapter(input);
          }}
          onImportMultiple={
            onCreateMultipleChapters
              ? async (items) => {
                  await onCreateMultipleChapters(items);
                }
              : undefined
          }
        />
      )}

      {/* Batch Multi-Chapter Selection Modal */}
      {batchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#E4DDD0] dark:border-[#2E2924] bg-[#FAF7F2] dark:bg-[#1C1917] p-6 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-[#E4DDD0] dark:border-[#2E2924]">
              <h2 className="font-display text-xl font-semibold text-[#1F1C18] dark:text-[#EDE8DF]">
                Dịch hàng loạt nhiều chương
              </h2>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="p-2 rounded-lg text-[#6B6257] hover:text-[#1F1C18] dark:hover:text-[#EDE8DF] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-[#6B6257] dark:text-[#A89F91]">
                Đã chọn {selectedBatchChapterIds.length}/{chapters.length} chương
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedBatchChapterIds(
                      chapters
                        .filter((c) => c.translatedCount < c.segmentCount)
                        .map((c) => c.id)
                    )
                  }
                  className="text-[#B45309] dark:text-[#D97706] hover:underline cursor-pointer"
                >
                  Chỉ chương chưa xong
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBatchChapterIds(chapters.map((c) => c.id))}
                  className="text-[#6B6257] hover:underline cursor-pointer"
                >
                  Chọn hết
                </button>
              </div>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] divide-y divide-[#E4DDD0]/70 dark:divide-[#2E2924]/70">
              {chapters.map((chap) => {
                const checked = selectedBatchChapterIds.includes(chap.id);
                return (
                  <label
                    key={chap.id}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer hover:bg-[#F3EFE6]/60 dark:hover:bg-[#141210]/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedBatchChapterIds((prev) =>
                            checked ? prev.filter((id) => id !== chap.id) : [...prev, chap.id]
                          )
                        }
                        className="accent-[#B45309]"
                      />
                      <span className="truncate font-medium text-[#1F1C18] dark:text-[#EDE8DF]">
                        {chap.titleTranslated || chap.titleSource}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-[#6B6257] dark:text-[#A89F91] shrink-0">
                      {chap.translatedCount}/{chap.segmentCount} đoạn
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-[#E4DDD0] dark:border-[#2E2924] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[#E4DDD0] dark:border-[#2E2924] text-[#6B6257] cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={selectedBatchChapterIds.length === 0}
                onClick={handleRunBatchChapters}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#B45309] hover:bg-[#92400E] dark:bg-[#D97706] text-white cursor-pointer disabled:opacity-40"
              >
                Bắt đầu dịch {selectedBatchChapterIds.length} chương
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewPanelOpen && activeChapter && auditReport && (
        <ReviewPanel
          novel={novel}
          chapter={activeChapter}
          segments={segments}
          report={auditReport}
          rules={reviewRules}
          isQueueRunning={queue.isRunning}
          onUpdateRules={handleUpdateReviewRules}
          onJumpToSegment={handleJumpToSegment}
          onRetranslateSegment={handleTranslateSingle}
          onFixAllErrors={handleFixSpecificSegments}
          onMarkAllReviewed={handleMarkAllReviewed}
          onFinalizeChapter={handleFinalizeChapter}
          onClose={() => setReviewPanelOpen(false)}
        />
      )}
    </div>
  );
}
